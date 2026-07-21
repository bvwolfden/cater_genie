import type { Connector, ConnectorStatus, PullResult } from "./types";
import { ConnectorUnavailableError } from "./types";

// CaterTrax — corporate delivery. No public API (Volaris-owned), but the admin
// portal is classic server-rendered ASP with a plain login (username/password
// + CSRF token, no CAPTCHA) and a Sales report that exports to Excel. We drive
// that programmatically: log in, then POST the Sales-over-orders report for a
// single day and read the Grand Total. Reverse-engineered live July 2026 —
// endpoint shopa_multireport.asp, ~2,240 delivery orders in 2026.

const CREDS = () => ({
  user: process.env.CATERTRAX_USERNAME || "",
  pass: process.env.CATERTRAX_PASSWORD || "",
});

function host(): string {
  const raw = process.env.CATERTRAX_URL || "bistrotogo.catertrax.com/shopcatertrax.asp";
  return `https://${raw.replace(/^https?:\/\//, "").split("/")[0]}`;
}

const REPORT_QS =
  "table=orders&fieldsconfig=xrpt_db_fields&namesconfig=xrpt_db_names&opsconfig=xrpt_db_ops";

const mmddyyyy = (d: Date) =>
  `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const money = (s: string): number | null => {
  const n = Number(s.replace(/[$,\s]/g, ""));
  return isNaN(n) ? null : n;
};

// Merge Set-Cookie headers into a single Cookie request header (latest wins).
function mergeCookies(prev: string, res: Response): string {
  const jar = new Map<string, string>();
  for (const pair of prev.split("; ").filter(Boolean)) {
    const i = pair.indexOf("=");
    if (i > 0) jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const first = c.split(";")[0];
    const i = first.indexOf("=");
    if (i > 0) jar.set(first.slice(0, i), first.slice(i + 1));
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

let sessionCookie: string | null = null;

async function login(): Promise<string> {
  const { user, pass } = CREDS();
  if (!user || !pass) {
    throw new ConnectorUnavailableError("CATERTRAX", "CaterTrax username/password not set.");
  }
  const loginUrl = `${host()}/shopcatertrax.asp`;
  const g = await fetch(loginUrl);
  const html = await g.text();
  let cookie = mergeCookies("", g);
  const csrf = html.match(/name="CSRFToken"[^>]*value="([^"]*)"/i)?.[1];
  if (!csrf) throw new ConnectorUnavailableError("CATERTRAX", "Login CSRF token not found (portal layout changed?).");

  const body = new URLSearchParams({ CSRFToken: csrf, Username: user, password: pass, submit: "Sign In" });
  const p = await fetch(loginUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
    body,
    redirect: "manual",
  });
  cookie = mergeCookies(cookie, p);
  if (p.status !== 302 && p.status !== 200) {
    throw new ConnectorUnavailableError("CATERTRAX", `Login failed (HTTP ${p.status}).`);
  }
  return cookie;
}

async function ensureSession(force = false): Promise<string> {
  if (!sessionCookie || force) sessionCookie = await login();
  return sessionCookie;
}

/** One day's delivery revenue from the Sales report Grand Total. */
async function reportDay(cookie: string, mdY: string): Promise<{ orderCount: number | null; total: number | null; ok: boolean }> {
  const body = new URLSearchParams();
  body.set("datefield", "opromisedshipdate"); // delivery/event date
  body.set("fromdate", mdY);
  body.set("todate", mdY);
  body.append("displayfields", "orderid|Order ID|count");
  body.append("displayfields", "orderamount|Total|SumCurrency");
  body.set("nocancelled", "Cancel"); // exclude cancelled orders
  body.set("excel", "excel");
  body.set("Details", "Build");

  const r = await fetch(`${host()}/shopa_multireport.asp?${REPORT_QS}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
    body,
  });
  const html = await r.text();
  if (!/Grand Totals/i.test(html)) return { orderCount: null, total: null, ok: false }; // session likely expired

  const cells = [...html.matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gis)]
    .map((m) => m[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim())
    .filter(Boolean);
  const total = money(cells[cells.length - 1] ?? "");
  const count = parseInt((cells[cells.length - 2] ?? "").replace(/[^0-9]/g, ""), 10);
  return { orderCount: isNaN(count) ? null : count, total, ok: true };
}

// --- Forward bookings (future orders) ---------------------------------------
// The same shopa_multireport.asp endpoint happily reports on future
// opromisedshipdate ranges (year picker runs through 2030). Adding the
// `detail` flag returns one row per order: Order ID | Event Date | Department
// | First Name | Last Name | Status | Guest Count | Total. Verified live
// July 2026 (76 orders over the next 14 days).

export interface CaterTraxOrder {
  orderId: string;
  dateISO: string;
  name: string; // "<Department or First Last> (#<orderId>)" — stable upsert key
  company: string | null; // customer/company without the order id — building proxy
  status: string | null;
  guests: number | null;
  revenue: number | null;
}

const mdyToISO = (s: string): string | null => {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
};

/** Row-level orders report over a date range (one POST, detail rows). */
async function reportOrders(cookie: string, fromMdY: string, toMdY: string): Promise<{ orders: CaterTraxOrder[]; ok: boolean }> {
  const body = new URLSearchParams();
  body.set("datefield", "opromisedshipdate"); // delivery/event date
  body.set("fromdate", fromMdY);
  body.set("todate", toMdY);
  body.append("displayfields", "orderid|Order ID|count");
  body.append("displayfields", "opromisedshipdate|Event Date|hide");
  body.append("displayfields", "ocompany|Department|hide");
  body.append("displayfields", "ofirstname|First Name|hide");
  body.append("displayfields", "olastname|Last Name|hide");
  body.append("displayfields", "ostatus|Status|hide");
  body.append("displayfields", "oguestcount|Guest Count|sum");
  body.append("displayfields", "orderamount|Total|SumCurrency");
  body.set("nocancelled", "Cancel"); // exclude cancelled orders
  body.set("detail", "detail"); // one row per order instead of totals only
  body.set("Details", "Build");

  const r = await fetch(`${host()}/shopa_multireport.asp?${REPORT_QS}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
    body,
  });
  const html = await r.text();
  if (!/Grand Totals/i.test(html)) return { orders: [], ok: false }; // session likely expired

  const orders: CaterTraxOrder[] = [];
  for (const tr of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
      c[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim()
    );
    if (cells.length < 8 || !/^\d+$/.test(cells[0])) continue; // header/subtotal/grand-total rows
    const dateISO = mdyToISO(cells[1]);
    if (!dateISO) continue;
    const [orderId, , company, first, last, status, guestsRaw, totalRaw] = cells;
    const junk = (s: string) => !s || s === "-" || s === "0";
    const person = [first, last].filter((s) => !junk(s)).join(" ");
    const customer = (!junk(company) ? company : person) || "CaterTrax order";
    const guests = parseInt(guestsRaw.replace(/[^0-9]/g, ""), 10);
    orders.push({
      orderId,
      dateISO,
      name: `${customer} (#${orderId})`,
      company: customer,
      status: status ? status.toLowerCase() : null,
      guests: isNaN(guests) ? null : guests,
      revenue: money(totalRaw),
    });
  }
  return { orders, ok: true };
}

// --- Delivery start times ----------------------------------------------------
// The orders report has no time field, but the portal's saved "Day Report"
// (linked from the day-view calendar) returns one row per order with a
// Start Time column, grouped by delivery slot. Kevin spaces these windows by
// hand so drivers can drop one order and reach the next — surfacing them is
// what makes the schedule/booking pressure visible. Verified live July 2026.
const TIME_RE = /^\d{1,2}:\d{2}\s*[AP]M$/i;

/**
 * Coversheet scrape: the driver/kitchen sheet (coversheet.asp) carries per
 * order what no report exposes — Delivery Time, street Address, City, Zip,
 * Building name, Floor. One GET covers a whole date range; each order is a
 * `basiccoverorw` block keyed by a `class="orderid"` span. Verified live
 * July 2026. Powers the /delivery scheduler (drops, geocoding, grouping).
 */
export interface CoversheetStop {
  orderId: string;
  deliveryTime: string | null; // "11:00 AM"
  address: string | null; // "501 Grant Street Suite 200"
  city: string | null;
  zip: string | null;
  building: string | null; // "Union Trust Building"
}

const spanOf = (block: string, cls: string): string | null => {
  const m = block.match(new RegExp(`class="${cls}"[^>]*>([^<]*)<`, "i"));
  const v = m?.[1].replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return v || null;
};

async function reportCoversheets(cookie: string, fromMdY: string, toMdY: string): Promise<Map<string, CoversheetStop>> {
  const stops = new Map<string, CoversheetStop>();
  const r = await fetch(
    `${host()}/coversheet.asp?startdate=${encodeURIComponent(fromMdY)}&enddate=${encodeURIComponent(toMdY)}`,
    { headers: { Cookie: cookie } }
  );
  if (!r.ok) return stops;
  const html = await r.text();
  for (const block of html.split(/<div class="basiccoverorw">/i).slice(1)) {
    const orderId = spanOf(block, "orderid");
    if (!orderId || !/^\d+$/.test(orderId)) continue;
    // Building sits in a covercell6 label pair: <span class="shipinfolabel">Building: </span><span class="shipinfolabel">NAME</span>
    const bldg = block.match(/Building:\s*<\/span><span[^>]*>([^<]*)</i)?.[1].replace(/\s+/g, " ").trim() || null;
    stops.set(orderId, {
      orderId,
      deliveryTime: spanOf(block, "shiptime1"),
      address: spanOf(block, "shipaddress"),
      city: spanOf(block, "shipcity"),
      zip: spanOf(block, "shipzip"),
      building: bldg,
    });
  }
  return stops;
}

/** Per-order delivery start times for one day: orderId → "11:30 AM". */
async function reportDayTimes(cookie: string, mdY: string): Promise<Map<string, string>> {
  const times = new Map<string, string>();
  const r = await fetch(
    `${host()}/shopa_multireport.asp?saved_report=day&detail=yes&fromdate=${encodeURIComponent(mdY)}&todate=${encodeURIComponent(mdY)}`,
    { headers: { Cookie: cookie } }
  );
  if (!r.ok) return times;
  const html = await r.text();
  for (const tr of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
      c[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim()
    );
    if (cells.length < 6 || !/^\d+$/.test(cells[0])) continue;
    const t = cells.find((c) => TIME_RE.test(c));
    if (t) times.set(cells[0], t.toUpperCase().replace(/\s+/, " "));
  }
  return times;
}

/**
 * Pull forward bookings (future orders) for [tomorrow, tomorrow+daysAhead] and
 * upsert them into EventBooking (source CATERTRAX) so the staffing outlook
 * sees committed catering demand. Never deletes rows — Caterease bookings
 * share the table, and stale CaterTrax rows are simply re-upserted next run.
 */
export async function syncCaterTraxBookings(
  daysAhead = 14
): Promise<{ orders: number; written: number; fromISO: string; toISO: string; totalRevenue: number }> {
  const { prisma } = await import("../db");
  const from = new Date(Date.now() + 86_400_000); // tomorrow
  const to = new Date(from.getTime() + daysAhead * 86_400_000);
  const fromISO = isoDate(from);
  const toISO = isoDate(to);

  let cookie = await ensureSession();
  let res = await reportOrders(cookie, mmddyyyy(from), mmddyyyy(to));
  if (!res.ok) {
    cookie = await ensureSession(true); // re-login once and retry
    res = await reportOrders(cookie, mmddyyyy(from), mmddyyyy(to));
  }
  if (!res.ok) {
    await prisma.syncRun.create({
      data: { source: "CATERTRAX", status: "FAILED", rowsWritten: 0, finishedAt: new Date(), message: "CaterTrax bookings: report did not return data (session/report error)." },
    });
    throw new ConnectorUnavailableError("CATERTRAX", "Bookings report did not return data (session/report error).");
  }

  // Delivery start times: one saved-day-report fetch per date that has orders.
  // Non-fatal — a failed day just leaves eventTime null for that date.
  const timesByOrder = new Map<string, string>();
  const orderDates = [...new Set(res.orders.map((o) => o.dateISO))];
  for (const dISO of orderDates) {
    try {
      const t = await reportDayTimes(cookie, mmddyyyy(new Date(`${dISO}T00:00:00Z`)));
      for (const [id, time] of t) timesByOrder.set(id, time);
    } catch {
      // skip — times are enrichment, not the sync's spine
    }
  }

  let written = 0;
  let totalRevenue = 0;
  for (const o of res.orders) {
    const eventDate = new Date(`${o.dateISO}T00:00:00Z`);
    const eventTime = timesByOrder.get(o.orderId) ?? null;
    await prisma.eventBooking.upsert({
      where: { eventDate_name: { eventDate, name: o.name } },
      create: { eventDate, name: o.name, company: o.company, orderId: o.orderId, status: o.status, guests: o.guests, revenue: o.revenue, eventTime, source: "CATERTRAX" },
      update: { status: o.status, company: o.company, orderId: o.orderId, guests: o.guests, revenue: o.revenue, ...(eventTime ? { eventTime } : {}), source: "CATERTRAX" },
    });
    written++;
    totalRevenue += o.revenue ?? 0;
  }

  // Post-commit invariant: a committed import vanished from this DB once, so
  // re-count what we just wrote and refuse to report success if rows are gone.
  const persisted = await prisma.eventBooking.count({
    where: {
      source: "CATERTRAX",
      eventDate: { gte: new Date(`${fromISO}T00:00:00Z`), lte: new Date(`${toISO}T00:00:00Z`) },
    },
  });
  const ok = persisted >= written;
  const summary = `CaterTrax bookings: ${res.orders.length} orders over next ${daysAhead} days (${fromISO} → ${toISO}, $${Math.round(totalRevenue).toLocaleString()})`;
  await prisma.syncRun.create({
    data: {
      source: "CATERTRAX",
      status: ok ? "SUCCESS" : "FAILED",
      rowsWritten: written,
      finishedAt: new Date(),
      message: ok ? summary : `${summary} — INVARIANT FAILED: only ${persisted} of ${written} upserted rows found after commit.`,
    },
  });
  if (!ok) {
    throw new Error(`CaterTrax bookings post-commit check failed: wrote ${written} rows but only ${persisted} persisted.`);
  }
  return { orders: res.orders.length, written, fromISO, toISO, totalRevenue };
}

/**
 * Enrich forward CaterTrax orders into DeliveryStop rows (address, building,
 * delivery time from the coversheet) and geocode new addresses. Runs after the
 * bookings sync; failures here must NEVER fail the bookings sync — the
 * delivery board just degrades (drops without pins/times).
 *
 * Assignment fields (driverKey/assignedAt/assignedBy) are Kevin's system of
 * record: this sync never writes them, except clearing them when an order
 * MOVES to a different day (a moved drop must be re-planned).
 */
export async function syncDeliveryStops(
  daysAhead = 14
): Promise<{ stops: number; geocoded: number; missingAddress: number }> {
  const { prisma } = await import("../db");
  const { geocodeCached, normalizeAddressKey } = await import("../geocode");
  const from = new Date(); // include today — today's board is the one in use
  const to = new Date(from.getTime() + daysAhead * 86_400_000);

  let cookie = await ensureSession();
  let sheets = await reportCoversheets(cookie, mmddyyyy(from), mmddyyyy(to));
  if (!sheets.size) {
    cookie = await ensureSession(true);
    sheets = await reportCoversheets(cookie, mmddyyyy(from), mmddyyyy(to));
  }

  // Coversheets don't carry the event date per block reliably across page
  // styles — the orders report does. Join: orderId → date.
  const rep = await reportOrders(cookie, mmddyyyy(from), mmddyyyy(to));
  const dateByOrder = new Map(rep.orders.map((o) => [o.orderId, o.dateISO]));

  let stops = 0, missingAddress = 0;
  const rawByKey = new Map<string, string>(); // addressKey → full raw address for the geocoder
  for (const [orderId, cs] of sheets) {
    const dISO = dateByOrder.get(orderId);
    if (!dISO) continue; // cancelled or outside the window
    const date = new Date(`${dISO}T00:00:00Z`);
    const addressKey = cs.address ? normalizeAddressKey(`${cs.address}, ${cs.city ?? "Pittsburgh"} ${cs.zip ?? ""}`) : null;
    if (!cs.address) missingAddress++;
    if (addressKey && !rawByKey.has(addressKey)) {
      rawByKey.set(addressKey, `${cs.address}, ${cs.city ?? "Pittsburgh"}, PA ${cs.zip ?? ""}`.trim());
    }
    const existing = await prisma.deliveryStop.findUnique({ where: { orderId } });
    const moved = existing && isoDate(existing.date) !== dISO;
    await prisma.deliveryStop.upsert({
      where: { orderId },
      create: { orderId, date, deliveryTime: cs.deliveryTime, addressRaw: cs.address, city: cs.city, zip: cs.zip, building: cs.building, addressKey },
      update: {
        date,
        deliveryTime: cs.deliveryTime,
        addressRaw: cs.address,
        city: cs.city,
        zip: cs.zip,
        building: cs.building,
        addressKey,
        ...(moved ? { driverKey: null, assignedAt: null, assignedBy: null } : {}),
      },
    });
    stops++;
  }

  // Geocode a bounded batch of new addresses (Nominatim policy: sequential,
  // throttled, cached). The rest are picked up on subsequent runs.
  let geocoded = 0;
  for (const raw of [...rawByKey.values()].slice(0, 10)) {
    if (await geocodeCached(raw)) geocoded++;
  }

  await prisma.syncRun.create({
    data: {
      source: "CATERTRAX",
      status: "SUCCESS",
      rowsWritten: stops,
      finishedAt: new Date(),
      message: `CaterTrax delivery stops: ${stops} enriched (${missingAddress} without address, ${geocoded} newly geocoded).`,
    },
  });
  return { stops, geocoded, missingAddress };
}

export const caterTraxConnector: Connector = {
  status(): ConnectorStatus {
    const { user, pass } = CREDS();
    const configured = Boolean(user && pass);
    return {
      system: "CATERTRAX",
      label: "CaterTrax",
      category: "delivery",
      configured,
      method: "portal-export",
      readiness: configured
        ? "Ready — signs into the admin portal and pulls the daily Sales report (Excel export)."
        : "Set CATERTRAX_USERNAME + CATERTRAX_PASSWORD (admin login) to enable the portal export.",
    };
  },

  async pull(date: Date): Promise<PullResult> {
    let cookie = await ensureSession();
    const mdY = mmddyyyy(date);
    let res = await reportDay(cookie, mdY);
    if (!res.ok) {
      cookie = await ensureSession(true); // re-login once and retry
      res = await reportDay(cookie, mdY);
    }
    if (!res.ok) throw new ConnectorUnavailableError("CATERTRAX", "Report did not return data (session/report error).");
    return {
      sales: [{ date: isoDate(date), channel: "CATERTRAX", netSales: res.total ?? undefined, orderCount: res.orderCount ?? undefined }],
      note: `CaterTrax delivery — ${res.orderCount ?? 0} orders on ${isoDate(date)}.`,
    };
  },
};

/**
 * Pull a date range day-by-day and stage it as a pending import for review —
 * reuses the drop-zone commit path (→ DailySales CATERTRAX + DailyMetric).
 * Returns the created ImportBatch id, or throws.
 */
export async function syncCaterTrax(fromISO: string, toISO: string): Promise<{ batchId: number; days: number; total: number }> {
  const { prisma } = await import("../db");
  const cookie = await ensureSession(true);
  const days: { date: string; cateringSales: number }[] = [];
  let total = 0;

  for (let t = new Date(`${fromISO}T00:00:00Z`); isoDate(t) <= toISO; t.setUTCDate(t.getUTCDate() + 1)) {
    const d = new Date(t);
    const res = await reportDay(cookie, mmddyyyy(d));
    if (res.ok && res.total != null && res.total > 0) {
      days.push({ date: isoDate(d), cateringSales: res.total });
      total += res.total;
    }
  }

  const parsed = { kind: "catertrax_sales", summary: `CaterTrax delivery ${fromISO} → ${toISO}: ${days.length} days, $${Math.round(total).toLocaleString()}`, days, labor: [], bookings: [] };
  const batch = await prisma.importBatch.create({
    data: {
      filename: `CaterTrax portal sync ${fromISO}_${toISO}`,
      kind: "catertrax_sales",
      status: days.length ? "PENDING" : "FAILED",
      summary: parsed.summary,
      parsed: parsed as unknown as object,
      error: days.length ? null : "No delivery revenue found in range.",
    },
  });
  await prisma.syncRun.create({
    data: { source: "CATERTRAX", status: days.length ? "SUCCESS" : "FAILED", rowsWritten: days.length, finishedAt: new Date(), message: parsed.summary },
  });
  return { batchId: batch.id, days: days.length, total };
}
