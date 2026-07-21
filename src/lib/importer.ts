import "server-only";
import { llmComplete, type LlmPart } from "./llm";
import * as XLSX from "xlsx";
import { prisma } from "./db";
import { saveDailyEntry, type DailyEntryInput } from "./entry";

// The AI-parsed drop zone. Kevin drops whatever export a source system gives
// him; parsed rows wait in ImportBatch for review, then commit into the same
// tables the manual walkthrough writes. Numbers never get re-typed by hand.
//
// Spreadsheets/CSVs use a two-step design: the LLM sees a compact PREVIEW of
// each sheet and returns a column MAPPING (which sheet(s), which header row,
// which column feeds which field); code then applies that mapping to every
// row deterministically. This scales to any row count (a 619-row timesheet
// overflowed the old emit-every-row approach) and the numbers come straight
// from the file, not through the model. PDFs/images still use direct
// extraction — they're bounded and have no grid to map.

export interface ParsedDay extends DailyEntryInput {}
export interface ParsedLabor {
  date: string;
  firstName?: string | null;
  lastName?: string | null;
  employeeId?: string | null;
  department?: string | null;
  position?: string | null;
  regularHours?: number | null;
  otHours?: number | null;
  hourlyRate?: number | null;
  paidTotal?: number | null;
}
export interface ParsedBooking {
  eventDate: string;
  name?: string | null;
  status?: string | null;
  guests?: number | null;
  revenue?: number | null;
  eventTime?: string | null; // "11:30 AM" — serve/delivery start when the export has one
}
export interface ParsedShift {
  date: string;
  department?: string | null;
  position?: string | null;
  employeeId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  unpaidBreak?: number | null;
  scheduledHours?: number | null;
  hourlyRate?: number | null;
  laborCost?: number | null;
  status?: string | null;
}
export interface ParsedShiftEvent {
  date: string; // shift Start Date
  occurredAt?: string | null; // when the change was made
  reason?: string | null;
  updatedFields?: string | null;
  department?: string | null;
  prevDepartment?: string | null;
  assignee?: string | null;
  employeeId?: string | null;
  prevDate?: string | null;
  length?: number | null;
  prevLength?: number | null;
  position?: string | null;
}
export interface ParsedImport {
  kind: string; // daily_metrics | timesheet | wiw_schedule | wiw_shift_history | catertrax_sales | caterease_bookings | unsupported | unknown
  summary: string;
  days: ParsedDay[];
  labor: ParsedLabor[];
  bookings: ParsedBooking[];
  shifts?: ParsedShift[]; // optional: batches parsed before schedules existed lack it
  shiftEvents?: ParsedShiftEvent[];
}

// --- Coercion helpers --------------------------------------------------------
const isIso = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

function coerceDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "string") {
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      const yr = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      const mo = String(m[1]).padStart(2, "0");
      const da = String(m[2]).padStart(2, "0");
      return `${yr}-${mo}-${da}`;
    }
  }
  return null;
}

function coerceNum(v: unknown): number | null {
  if (typeof v === "number") return isNaN(v) ? null : v;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.startsWith("#")) return null; // #DIV/0! and friends
  const n = Number(s.replace(/[$,%\s]/g, ""));
  return isNaN(n) ? null : n;
}

const coerceText = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
};

// Shift times land as strings ("5:00 am"), Excel time fractions, or Dates
// depending on how the export was saved — normalize all three for display.
function coerceTime(v: unknown): string | null {
  const fmt = (h: number, m: number) => {
    const ampm = h >= 12 ? "pm" : "am";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  };
  if (v instanceof Date && !isNaN(v.getTime())) return fmt(v.getUTCHours(), v.getUTCMinutes());
  if (typeof v === "number" && v >= 0 && v < 1) {
    const mins = Math.round(v * 24 * 60);
    return fmt(Math.floor(mins / 60) % 24, mins % 60);
  }
  return coerceText(v);
}

// --- Sheet previews for the mapping call -------------------------------------
type Aoa = unknown[][];

function sheetAoa(ws: XLSX.WorkSheet): Aoa {
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: false }) as Aoa;
}

function fmtRow(row: unknown[], rowNum: number): string {
  // Wide enough for WIW's Shift History export (Start Date is column 27,
  // Length column 37) — the mapper can only map headers it can see.
  const cells = row.slice(0, 48).map((c) => {
    if (c instanceof Date) return c.toISOString().slice(0, 10);
    const s = c == null ? "" : String(c);
    return s.length > 18 ? s.slice(0, 18) + "…" : s;
  });
  return `r${rowNum}: ${cells.join(" | ")}`.slice(0, 1000);
}

function buildPreview(wb: XLSX.WorkBook): string {
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const aoa = sheetAoa(wb.Sheets[name]);
    if (!aoa.length) continue;
    let minD: string | null = null, maxD: string | null = null;
    for (const row of aoa) {
      for (const c of row) {
        const d = c instanceof Date ? c.toISOString().slice(0, 10) : null;
        if (d) {
          if (!minD || d < minD) minD = d;
          if (!maxD || d > maxD) maxD = d;
        }
      }
    }
    const head = aoa.slice(0, 8).map((r, i) => fmtRow(r, i + 1));
    const tail = aoa.length > 12 ? aoa.slice(-4).map((r, i) => fmtRow(r, aoa.length - 3 + i)) : [];
    parts.push(
      `### Sheet "${name}" — ${aoa.length} rows` +
        (minD ? `, dates ${minD} → ${maxD}` : "") +
        `\n${head.join("\n")}` +
        (tail.length ? `\n...\n${tail.join("\n")}` : "")
    );
  }
  return parts.join("\n\n").slice(0, 20_000);
}

// --- Mapping schema -----------------------------------------------------------
interface ColumnMapping {
  kind: string;
  summary: string;
  reason?: string;
  target: "days" | "labor" | "bookings" | "shifts" | "shiftEvents";
  sheets: string[];
  headerRow: number; // 1-based
  departmentFromSheetName?: boolean;
  columns: Record<string, string>; // field -> exact header text
}

const MAPPING_SYSTEM = `You classify an operational spreadsheet for a restaurant/catering business and return a COLUMN MAPPING — you do NOT extract rows. Code will apply your mapping to every row.

You see a preview of each sheet: name, row count, detected date range, first rows (r1, r2, ... are 1-based row numbers), and last rows. Workbooks often contain abandoned copies of a sheet — prefer the sheet whose data extends to the MOST RECENT date and has the most rows. Header rows are not always row 1.

Kinds and their target + allowed fields (map only columns that exist; header text must match the preview EXACTLY):
- "daily_metrics" (one row per business day) -> target "days": date, netSalesTotal, cafeSales, cateringSales, eventsSales, tax, laborCost, laborHours, foodPurchases, operating, payroll, merchant, savings, holding, ccProcessing, notes
  (map the day's total net sales to netSalesTotal; account balance columns like "Op Acct" -> operating, "Payroll Acct" -> payroll, etc.)
- "catertrax_sales" (per-order delivery report) -> target "days": date, cateringSales (the order total column; code sums orders per day)
- "timesheet" (per-employee punches, possibly one sheet per department) -> target "labor": date, firstName, lastName, employeeId, department, position, regularHours, otHours, hourlyRate, paidTotal
  (if sheets are per-department with no department column, list ALL department sheets in "sheets" and set departmentFromSheetName=true; skip summary/breaks sheets)
- "wiw_schedule" (When I Work SCHEDULE export — FUTURE shifts, filename like "Schedule for <dates>"; workbook pairs a "Hourly - X" pivot sheet with a per-shift "Schedules - X" sheet per department) -> target "shifts": date (the "Shift Start Date" column), department (the "Schedule" column), position, firstName, lastName, employeeId, startTime ("Shift Start Time"), endTime ("Shift End Time"), unpaidBreak, scheduledHours, hourlyRate, laborCost, status
  (list ALL "Schedules - *" sheets in "sheets"; SKIP the "Hourly - *" pivot sheets — they have one column per calendar day, not per-shift rows)
- "wiw_shift_history" (When I Work SHIFT HISTORY / audit-log export — one row per schedule CHANGE event, sheet usually named "Shift History", ~68 columns with Previous-value pairs) -> target "shiftEvents": date ("Start Date"), occurredAt ("Occurred At"), reason ("Update Reason"), updatedFields ("Updated Fields"), department ("Schedule Name"), prevDepartment ("Previous Schedule Name"), assignee ("Assignee Name"), employeeId ("Assignee Employee ID"), prevDate ("Previous Start Date"), length ("Length"), prevLength ("Previous Length"), position ("Position Name")
- "caterease_bookings" (event bookings/query export) -> target "bookings": eventDate, name, status, guests, revenue, eventTime (a serve/start/delivery time column, when present)
- "unsupported": anything else (weekly rollups/comps, projections, unrecognizable). Give a short "reason".

Respond with ONLY JSON (no fences):
{ "kind": "...", "summary": string (<=140 chars: what the file is, chosen sheet(s), date range), "reason"?: string, "target": "days"|"labor"|"bookings"|"shifts"|"shiftEvents", "sheets": [string], "headerRow": number (1-based row containing the column headers), "departmentFromSheetName"?: boolean, "columns": { "<field>": "<exact header text>" } }`;

// --- Direct extraction (PDF / image only) ------------------------------------
const EXTRACT_SYSTEM = `You extract structured data from an operational report (PDF or screenshot) for a restaurant/catering business. Classify and extract EVERY data row. Dates ISO YYYY-MM-DD; dollar values plain numbers. Never invent values. If a total row duplicates detail rows, extract only detail rows.

Respond with ONLY JSON (no fences):
{ "kind": "daily_metrics"|"timesheet"|"catertrax_sales"|"caterease_bookings"|"unknown", "summary": string (<=140 chars), "days": [{ "date": string, "netSalesTotal"?: number, "cafeSales"?: number, "cateringSales"?: number, "eventsSales"?: number, "tax"?: number, "laborHours"?: number, "laborCost"?: number, "foodPurchases"?: number, "operating"?: number, "payroll"?: number, "merchant"?: number, "savings"?: number, "holding"?: number, "ccProcessing"?: number, "notes"?: string }], "labor": [{ "date": string, "firstName"?: string, "lastName"?: string, "department"?: string, "position"?: string, "regularHours"?: number, "otHours"?: number, "hourlyRate"?: number, "paidTotal"?: number }], "bookings": [{ "eventDate": string, "name"?: string, "status"?: string, "guests"?: number, "revenue"?: number }] }
"days" must contain exactly ONE row per calendar date — sum multiple orders on the same day. Leave unused arrays empty.`;

// --- Mapping application ------------------------------------------------------
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const TEXT_FIELDS = new Set(["notes", "firstName", "lastName", "employeeId", "department", "position", "name", "status", "reason", "updatedFields", "assignee", "prevDepartment"]);
const TIME_FIELDS = new Set(["startTime", "endTime", "eventTime"]);
const DATE_FIELDS = new Set(["occurredAt", "prevDate"]); // secondary dates (the row anchor date is handled separately)

function applyMapping(wb: XLSX.WorkBook, m: ColumnMapping): ParsedImport {
  const out: ParsedImport = { kind: m.kind, summary: m.summary, days: [], labor: [], bookings: [], shifts: [], shiftEvents: [] };
  const dateField = m.target === "bookings" ? "eventDate" : "date";

  for (const sheetName of m.sheets) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const aoa = sheetAoa(ws);
    const headerIdx = Math.max(0, (m.headerRow ?? 1) - 1);
    const header = (aoa[headerIdx] ?? []).map(norm);
    // field -> column index
    const cols = new Map<string, number>();
    for (const [field, headerText] of Object.entries(m.columns ?? {})) {
      const idx = header.indexOf(norm(headerText));
      if (idx >= 0) cols.set(field, idx);
    }
    if (!cols.has(dateField)) continue;

    for (let r = 0; r < aoa.length; r++) {
      if (r === headerIdx) continue;
      const row = aoa[r];
      if (!row?.length) continue;
      const date = coerceDate(row[cols.get(dateField)!]);
      if (!date) continue;

      const rec: Record<string, unknown> = { [dateField]: date };
      for (const [field, idx] of cols) {
        if (field === dateField) continue;
        const v = row[idx];
        if (TEXT_FIELDS.has(field)) {
          rec[field] = coerceText(v);
        } else if (TIME_FIELDS.has(field)) {
          rec[field] = coerceTime(v);
        } else if (DATE_FIELDS.has(field)) {
          rec[field] = coerceDate(v);
        } else if (field === "guests") {
          const n = coerceNum(v);
          rec[field] = n == null ? null : Math.round(n);
        } else {
          rec[field] = coerceNum(v);
        }
      }
      if ((m.target === "labor" || m.target === "shifts") && m.departmentFromSheetName) rec.department = rec.department ?? sheetName;

      // Skip rows that carry no values beyond the date.
      const hasValue = Object.entries(rec).some(([k, v]) => k !== dateField && k !== "department" && v != null);
      if (!hasValue) continue;

      if (m.target === "days") out.days.push(rec as unknown as ParsedDay);
      else if (m.target === "labor") out.labor.push(rec as unknown as ParsedLabor);
      else if (m.target === "shifts") out.shifts!.push(rec as unknown as ParsedShift);
      else if (m.target === "shiftEvents") out.shiftEvents!.push(rec as unknown as ParsedShiftEvent);
      else out.bookings.push(rec as unknown as ParsedBooking);
    }
  }
  out.days = mergeDays(out.days);
  return out;
}

// Defensive: commits upsert one row per date, so duplicate dates (e.g. an
// orders report with several orders per day) must sum, not overwrite.
const SUM_FIELDS = ["netSalesTotal", "cafeSales", "cateringSales", "eventsSales", "tax", "laborHours", "laborCost", "foodPurchases"] as const;
const SNAP_FIELDS = ["operating", "payroll", "merchant", "savings", "holding", "ccProcessing", "notes"] as const;

function mergeDays(days: ParsedDay[]): ParsedDay[] {
  const byDate = new Map<string, ParsedDay>();
  for (const d of days) {
    const cur = byDate.get(d.date);
    if (!cur) {
      byDate.set(d.date, { ...d });
      continue;
    }
    for (const f of SUM_FIELDS) {
      if (d[f] != null) cur[f] = (cur[f] ?? 0) + d[f]!;
    }
    for (const f of SNAP_FIELDS) {
      if (d[f] != null) (cur as unknown as Record<string, unknown>)[f] = d[f];
    }
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

function parseModelJson<T>(text: string): T {
  const clean = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  return JSON.parse(clean) as T;
}

// --- Entry points -------------------------------------------------------------
export async function parseImportFile(filename: string, buf: Buffer, mime: string): Promise<ParsedImport> {
  const lower = filename.toLowerCase();
  const isSheet =
    lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv") || lower.endsWith(".tsv") ||
    lower.endsWith(".txt") || mime.includes("spreadsheet") || mime.includes("csv") ||
    (!mime.startsWith("image/") && mime !== "application/pdf");

  if (isSheet) {
    const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
    const preview = buildPreview(wb);
    const { text } = await llmComplete({
      system: MAPPING_SYSTEM,
      parts: [{ type: "text", text: `File: ${filename}\n\n${preview}` }],
      maxTokens: 1500,
    });
    const mapping = parseModelJson<ColumnMapping>(text);
    if (mapping.kind === "unsupported" || !mapping.target || !mapping.sheets?.length) {
      return {
        kind: mapping.kind || "unsupported",
        summary: mapping.summary || "Unsupported file",
        days: [], labor: [], bookings: [],
        ...(mapping.reason ? { summary: `${mapping.summary} — ${mapping.reason}` } : {}),
      };
    }
    return applyMapping(wb, mapping);
  }

  // PDF / image: direct extraction (bounded content, no grid to map).
  const parts: LlmPart[] =
    mime === "application/pdf" || lower.endsWith(".pdf")
      ? [
          { type: "pdf", filename, base64: buf.toString("base64") },
          { type: "text", text: `File: ${filename}. Extract per the system instructions.` },
        ]
      : [
          { type: "image", mediaType: mime, base64: buf.toString("base64") },
          { type: "text", text: `File: ${filename}. Extract per the system instructions.` },
        ];
  const { text } = await llmComplete({ system: EXTRACT_SYSTEM, parts, maxTokens: 16_000 });
  const j = parseModelJson<Partial<ParsedImport>>(text);
  return {
    kind: typeof j.kind === "string" ? j.kind : "unknown",
    summary: typeof j.summary === "string" ? j.summary : "Parsed file",
    days: mergeDays((Array.isArray(j.days) ? j.days : []).filter((d) => isIso(d?.date))),
    labor: (Array.isArray(j.labor) ? j.labor : []).filter((l) => isIso(l?.date)),
    bookings: (Array.isArray(j.bookings) ? j.bookings : []).filter((b) => isIso(b?.eventDate)),
    shifts: [],
  };
}

/** Create a pending batch from an uploaded file. */
export async function createImportBatch(filename: string, buf: Buffer, mime: string) {
  try {
    const parsed = await parseImportFile(filename, buf, mime);
    const empty = !parsed.days.length && !parsed.labor.length && !parsed.bookings.length && !parsed.shifts?.length && !parsed.shiftEvents?.length;
    return prisma.importBatch.create({
      data: {
        filename,
        kind: parsed.kind,
        status: empty ? "FAILED" : "PENDING",
        summary: parsed.summary,
        parsed: parsed as unknown as object,
        error: empty
          ? parsed.kind === "unsupported"
            ? "This file type isn't importable (weekly comps/projections are seeded, not imported)."
            : "No recognizable rows found in the file."
          : null,
      },
    });
  } catch (err) {
    return prisma.importBatch.create({
      data: { filename, status: "FAILED", error: err instanceof Error ? err.message : String(err) },
    });
  }
}

/** Commit a reviewed batch into the real tables (idempotent per batch). */
export async function commitImportBatch(id: number): Promise<{ ok: boolean; rows: number; error?: string }> {
  const batch = await prisma.importBatch.findUnique({ where: { id } });
  if (!batch) return { ok: false, rows: 0, error: "Batch not found" };
  if (batch.status !== "PENDING") return { ok: false, rows: 0, error: `Batch is ${batch.status}` };
  const parsed = batch.parsed as unknown as ParsedImport | null;
  if (!parsed) return { ok: false, rows: 0, error: "No parsed data" };

  let rows = 0;

  if (batch.kind === "catertrax_sales") {
    // Channel-only feed: write the CATERTRAX line in DailySales WITHOUT touching
    // DailyMetric.netSales (Kevin's sheet total already includes all channels;
    // routing this through saveDailyEntry would clobber the day's real total).
    for (const day of parsed.days ?? []) {
      const amt = day.cateringSales ?? day.netSalesTotal;
      if (amt == null) continue;
      await prisma.dailySales.upsert({
        where: { date_channel: { date: new Date(`${day.date}T00:00:00Z`), channel: "CATERTRAX" } },
        create: { date: new Date(`${day.date}T00:00:00Z`), channel: "CATERTRAX", netSales: amt, source: "CATERTRAX" },
        update: { netSales: amt, source: "CATERTRAX" },
      });
      rows++;
    }
  } else {
    // Daily rows reuse the walkthrough's save path — including forecast scoring,
    // so an imported day closes the AI feedback loop exactly like a manual one.
    for (const day of parsed.days ?? []) {
      const r = await saveDailyEntry(day);
      rows += r.rows;
    }
  }

  // Labor: replace-then-insert per date so re-imports don't duplicate. All
  // sources are cleared for the covered dates — a timesheet import is the
  // authoritative record for those days (seeded WHENIWORK rows included;
  // filtering to MANUAL only double-counted every seeded day).
  const labor = parsed.labor ?? [];
  if (labor.length) {
    const dates = [...new Set(labor.map((l) => l.date))];
    await prisma.laborEntry.deleteMany({
      where: { date: { in: dates.map((d) => new Date(`${d}T00:00:00Z`)) } },
    });
    await prisma.laborEntry.createMany({
      data: labor.map((l) => ({
        date: new Date(`${l.date}T00:00:00Z`),
        firstName: l.firstName ?? null,
        lastName: l.lastName ?? null,
        employeeId: l.employeeId ?? null,
        department: l.department ?? null,
        position: l.position ?? null,
        regularHours: l.regularHours ?? null,
        otHours: l.otHours ?? null,
        hourlyRate: l.hourlyRate ?? null,
        paidTotal: l.paidTotal ?? null,
        source: "MANUAL",
      })),
    });
    rows += labor.length;
  }

  // Scheduled shifts: replace-then-insert per date so a re-exported week
  // (schedules change daily as Kevin adjusts staffing) fully supersedes the
  // old one instead of stacking duplicates.
  const shifts = parsed.shifts ?? [];
  if (shifts.length) {
    const dates = [...new Set(shifts.map((s) => s.date))];
    await prisma.scheduledShift.deleteMany({
      where: { date: { in: dates.map((d) => new Date(`${d}T00:00:00Z`)) } },
    });
    await prisma.scheduledShift.createMany({
      data: shifts.map((s) => ({
        date: new Date(`${s.date}T00:00:00Z`),
        department: s.department ?? null,
        position: s.position ?? null,
        employeeId: s.employeeId ?? null,
        firstName: s.firstName ?? null,
        lastName: s.lastName ?? null,
        startTime: s.startTime ?? null,
        endTime: s.endTime ?? null,
        unpaidBreak: s.unpaidBreak ?? null,
        hours: s.scheduledHours ?? null,
        hourlyRate: s.hourlyRate ?? null,
        laborCost: s.laborCost ?? (s.scheduledHours != null && s.hourlyRate != null ? s.scheduledHours * s.hourlyRate : null),
        status: s.status ?? null,
        source: "WHENIWORK",
      })),
    });
    rows += shifts.length;
  }

  // Shift-history events: the export is a rolling window of the audit log, so
  // replace any overlap by occurredAt range, then insert. Events are the raw
  // material for the schedule build-curve — never mutated, only re-imported.
  const shiftEvents = parsed.shiftEvents ?? [];
  if (shiftEvents.length) {
    const occs = shiftEvents.map((e) => e.occurredAt).filter(Boolean) as string[];
    if (occs.length) {
      const min = occs.reduce((a, b) => (a < b ? a : b));
      const max = occs.reduce((a, b) => (a > b ? a : b));
      await prisma.shiftEvent.deleteMany({
        where: { occurredAt: { gte: new Date(`${min}T00:00:00Z`), lte: new Date(`${max}T23:59:59Z`) } },
      });
    }
    await prisma.shiftEvent.createMany({
      data: shiftEvents.map((e) => ({
        occurredAt: new Date(`${e.occurredAt ?? e.date}T00:00:00Z`),
        reason: e.reason ?? "unknown",
        updatedFields: e.updatedFields ?? null,
        department: e.department ?? null,
        prevDepartment: e.prevDepartment ?? null,
        assignee: e.assignee ?? null,
        employeeId: e.employeeId ?? null,
        shiftDate: new Date(`${e.date}T00:00:00Z`),
        prevShiftDate: e.prevDate ? new Date(`${e.prevDate}T00:00:00Z`) : null,
        length: e.length ?? null,
        prevLength: e.prevLength ?? null,
        position: e.position ?? null,
        source: "WHENIWORK",
      })),
    });
    rows += shiftEvents.length;
  }

  // Bookings: upsert on (eventDate, name).
  for (const b of parsed.bookings ?? []) {
    const eventDate = new Date(`${b.eventDate}T00:00:00Z`);
    const name = b.name ?? "(unnamed event)";
    await prisma.eventBooking.upsert({
      where: { eventDate_name: { eventDate, name } },
      create: { eventDate, name, status: b.status ?? null, guests: b.guests ?? null, revenue: b.revenue ?? null, eventTime: b.eventTime ?? null, source: "MANUAL" },
      update: { status: b.status ?? null, guests: b.guests ?? null, revenue: b.revenue ?? null, ...(b.eventTime ? { eventTime: b.eventTime } : {}) },
    });
    rows++;
  }

  await prisma.importBatch.update({
    where: { id },
    data: { status: "COMMITTED", rowsWritten: rows, committedAt: new Date() },
  });
  await prisma.syncRun.create({
    data: { source: "MANUAL", status: "SUCCESS", rowsWritten: rows, finishedAt: new Date(), message: `Import: ${batch.filename} (${batch.kind ?? "unknown"})` },
  });
  return { ok: true, rows };
}
