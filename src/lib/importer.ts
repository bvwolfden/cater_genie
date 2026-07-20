import "server-only";
import { llmComplete, type LlmPart } from "./llm";
import * as XLSX from "xlsx";
import { prisma } from "./db";
import { saveDailyEntry, type DailyEntryInput } from "./entry";

// The AI-parsed drop zone. Kevin drops whatever export a source system gives
// him (XLSX/CSV/PDF/screenshot); Claude classifies it and extracts typed rows;
// the rows wait in ImportBatch for review, then commit into the same tables the
// manual walkthrough writes. Numbers never get re-typed by hand.

const MAX_TEXT = 60_000; // cap sheet text sent to the model

export interface ParsedDay extends DailyEntryInput {}
export interface ParsedLabor {
  date: string;
  firstName?: string | null;
  lastName?: string | null;
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
}
export interface ParsedImport {
  kind: string; // daily_metrics | timesheet | catertrax_sales | caterease_bookings | unknown
  summary: string;
  days: ParsedDay[];
  labor: ParsedLabor[];
  bookings: ParsedBooking[];
}

const SYSTEM = `You extract structured data from operational exports for a restaurant/catering business ("Bistro To Go"-style operations). Input is a report file: a daily sales tracker, a When I Work timesheet export, a CaterTrax sales/orders report, or a Caterease event bookings/query export.

Classify the file and extract EVERY data row. Dates must be ISO (YYYY-MM-DD). Dollar values as plain numbers (no $ or commas). Never invent values — omit fields you cannot see. If a total row duplicates detail rows, extract only the detail rows.

Business channel mapping for daily sales: cafe/retail/Clover -> cafeSales; CaterTrax/corporate delivery -> cateringSales; Caterease/events -> eventsSales.

Respond with ONLY a JSON object (no markdown fences):
{
  "kind": "daily_metrics" | "timesheet" | "catertrax_sales" | "caterease_bookings" | "unknown",
  "summary": string (<=140 chars, what the file is + row count + date range),
  "days": [{ "date": string, "cafeSales"?: number, "cateringSales"?: number, "eventsSales"?: number, "tax"?: number, "laborHours"?: number, "laborCost"?: number, "foodPurchases"?: number, "operating"?: number, "payroll"?: number, "merchant"?: number, "savings"?: number, "holding"?: number, "ccProcessing"?: number, "notes"?: string }],
  "labor": [{ "date": string, "firstName"?: string, "lastName"?: string, "department"?: string, "position"?: string, "regularHours"?: number, "otHours"?: number, "hourlyRate"?: number, "paidTotal"?: number }],
  "bookings": [{ "eventDate": string, "name"?: string, "status"?: string, "guests"?: number, "revenue"?: number }]
}
Use "days" for daily sales/metrics reports (a CaterTrax daily sales report becomes days rows with cateringSales). IMPORTANT: "days" must contain exactly ONE row per calendar date — if the file lists multiple orders/line items on the same day, SUM them into that day's row. Use "labor" for timesheet exports. Use "bookings" for event/bookings exports. Leave unused arrays empty.`;

/** Convert a spreadsheet buffer into readable CSV text (all sheets). */
function sheetToText(buf: Buffer): string {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false, dateNF: "yyyy-mm-dd" });
    if (csv.trim()) parts.push(`=== Sheet: ${name} ===\n${csv}`);
  }
  return parts.join("\n\n").slice(0, MAX_TEXT);
}

/** Parse an uploaded file into structured rows via the configured LLM. */
export async function parseImportFile(filename: string, buf: Buffer, mime: string): Promise<ParsedImport> {
  const lower = filename.toLowerCase();

  let parts: LlmPart[];
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv") || mime.includes("spreadsheet") || mime.includes("csv")) {
    const text = lower.endsWith(".csv") ? buf.toString("utf8").slice(0, MAX_TEXT) : sheetToText(buf);
    parts = [{ type: "text", text: `File: ${filename}\n\n${text}` }];
  } else if (lower.endsWith(".pdf") || mime === "application/pdf") {
    parts = [
      { type: "pdf", filename, base64: buf.toString("base64") },
      { type: "text", text: `File: ${filename}. Extract per the system instructions.` },
    ];
  } else if (mime.startsWith("image/")) {
    parts = [
      { type: "image", mediaType: mime, base64: buf.toString("base64") },
      { type: "text", text: `File: ${filename}. Extract per the system instructions.` },
    ];
  } else {
    // Fall back to treating it as text (e.g. .txt/.tsv exports).
    parts = [{ type: "text", text: `File: ${filename}\n\n${buf.toString("utf8").slice(0, MAX_TEXT)}` }];
  }

  const { text } = await llmComplete({ system: SYSTEM, parts, maxTokens: 16_000 });
  const clean = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const j = JSON.parse(clean) as Partial<ParsedImport>;

  const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  return {
    kind: typeof j.kind === "string" ? j.kind : "unknown",
    summary: typeof j.summary === "string" ? j.summary : "Parsed file",
    days: mergeDays((Array.isArray(j.days) ? j.days : []).filter((d) => isDate(d?.date))),
    labor: (Array.isArray(j.labor) ? j.labor : []).filter((l) => isDate(l?.date)),
    bookings: (Array.isArray(j.bookings) ? j.bookings : []).filter((b) => isDate(b?.eventDate)),
  };
}

// Defensive: commits upsert one row per date, so duplicate dates (e.g. an
// orders report with several orders per day) would silently overwrite each
// other. Sum flow fields; keep the last snapshot for balances.
const SUM_FIELDS = ["cafeSales", "cateringSales", "eventsSales", "tax", "laborHours", "laborCost", "foodPurchases"] as const;
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

/** Create a pending batch from an uploaded file. */
export async function createImportBatch(filename: string, buf: Buffer, mime: string) {
  try {
    const parsed = await parseImportFile(filename, buf, mime);
    const empty = !parsed.days.length && !parsed.labor.length && !parsed.bookings.length;
    return prisma.importBatch.create({
      data: {
        filename,
        kind: parsed.kind,
        status: empty ? "FAILED" : "PENDING",
        summary: parsed.summary,
        parsed: parsed as unknown as object,
        error: empty ? "No recognizable rows found in the file." : null,
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

  // Daily rows reuse the walkthrough's save path — including forecast scoring,
  // so an imported day closes the AI feedback loop exactly like a manual one.
  for (const day of parsed.days) {
    const r = await saveDailyEntry(day);
    rows += r.rows;
  }

  // Labor: replace-then-insert per date so re-imports don't duplicate.
  if (parsed.labor.length) {
    const dates = [...new Set(parsed.labor.map((l) => l.date))];
    await prisma.laborEntry.deleteMany({
      where: { source: "MANUAL", date: { in: dates.map((d) => new Date(`${d}T00:00:00Z`)) } },
    });
    await prisma.laborEntry.createMany({
      data: parsed.labor.map((l) => ({
        date: new Date(`${l.date}T00:00:00Z`),
        firstName: l.firstName ?? null,
        lastName: l.lastName ?? null,
        department: l.department ?? null,
        position: l.position ?? null,
        regularHours: l.regularHours ?? null,
        otHours: l.otHours ?? null,
        hourlyRate: l.hourlyRate ?? null,
        paidTotal: l.paidTotal ?? null,
        source: "MANUAL",
      })),
    });
    rows += parsed.labor.length;
  }

  // Bookings: upsert on (eventDate, name).
  for (const b of parsed.bookings) {
    const eventDate = new Date(`${b.eventDate}T00:00:00Z`);
    const name = b.name ?? "(unnamed event)";
    await prisma.eventBooking.upsert({
      where: { eventDate_name: { eventDate, name } },
      create: { eventDate, name, status: b.status ?? null, guests: b.guests ?? null, revenue: b.revenue ?? null, source: "MANUAL" },
      update: { status: b.status ?? null, guests: b.guests ?? null, revenue: b.revenue ?? null },
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
