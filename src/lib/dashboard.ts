import "server-only";
import { prisma } from "./db";
import { connectors } from "./connectors";
import { OPEX_PCT, FIXED_WEEKLY, STUBBED_COSTS, type CostComponent } from "./costModel";
import { qboStatus } from "./qbo";
import type { AccountType, SalesChannel, SourceSystem } from "@prisma/client";

const n = (v: unknown): number | null =>
  v == null ? null : Number(v as never);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface PeriodComparison {
  label: string;
  currentLabel: string;
  priorLabel: string;
  /** Rows are per-week AVERAGES: months differ in week count (and in how many
   *  weeks have labor recorded), so raw totals compare 5 weeks against 4 and
   *  can read directionally backwards. */
  sales: { current: number | null; prior: number | null; deltaPct: number | null };
  labor: { current: number | null; prior: number | null; deltaPct: number | null };
  laborPct: { current: number | null; prior: number | null };
}

export type PeriodKey = "day" | "week" | "month" | "quarter" | "ytd" | "custom";

export interface PeriodKpis {
  period: PeriodKey;
  /** Human label of the current window, e.g. "Jul 13–19" or "July 2026 (MTD)". */
  label: string;
  /** Human label of the comparison window, e.g. "Jul 6–12" or "June 2026". */
  priorLabel: string;
  /** Noun for spark captions: "day" | "week" | "month" | ... */
  sparkUnit: string;
  from: string | null;
  to: string | null;
  netSales: number;
  netSalesPrev: number | null;
  laborCost: number;
  laborPct: number | null;
  laborPctPrev: number | null;
  hours: number;
  hoursPrev: number | null;
  food: number;
  foodPrev: number | null;
  cash: number | null;
  cashPrev: number | null;
  /** How much of the requested window the daily data actually covers. */
  coverage: { daysWithData: number; daysExpected: number; dataFrom: string | null };
  spark: { net: number[]; laborPct: number[]; hours: number[]; food: number[]; cash: number[] };
}

export interface DayPoint {
  date: string;
  netSales: number | null;
  tax: number | null;
  laborCost: number | null;
  laborHours: number | null;
  laborPct: number | null;
  foodPurchases: number | null;
}

export interface Dashboard {
  generatedAt: string;
  latestDate: string | null;
  selectedDate: string | null;
  availableDates: string[];
  series: DayPoint[];
  range: {
    from: string | null;
    to: string | null;
    netSales: number;
    laborCost: number;
    laborPct: number | null;
    hours: number;
    days: number;
  };
  rangeSeries: DayPoint[];
  comparisons: { mom: PeriodComparison; yoy: PeriodComparison };
  kpis: {
    netSales: number | null;
    netSalesPrev: number | null;
    laborCost: number | null;
    laborPct: number | null;
    laborHours: number | null;
    foodPurchases: number | null;
    mtdNetSales: number | null;
    mtdNetSalesPrevSpan: number | null;
    mtdPriorLabel: string | null;
    mtdLaborCost: number | null;
    mtdLaborPct: number | null;
    mtdAvgDailySales: number | null;
    mtdHours: number | null;
    cashPosition: number | null;
    cashPositionPrev: number | null;
    cashSeries: number[];
    laborPctPrev: number | null;
    laborHoursPrev: number | null;
    foodPurchasesPrev: number | null;
    monthLabel: string | null;
  };
  periodKpis: PeriodKpis;
  forwardDays: DayPoint[];
  balances: Array<{
    account: AccountType;
    balance: number;
    prev: number | null;
    date: string;
  }>;
  laborByDept: Array<{ department: string; hours: number; cost: number; headcount: number }>;
  channelMix: Array<{ channel: SalesChannel; actual: number; projected: number }>;
  channelMixRange: { from: string | null; to: string | null; weeks: number };
  weekly: Array<{
    weekStart: string;
    total: number | null;
    priorYear: number | null;
    projected: number | null;
    laborPct: number | null;
  }>;
  sources: Array<{
    system: SourceSystem;
    label: string;
    category: string;
    method: string;
    configured: boolean;
    readiness: string;
    connectHref: string | null;
    lastStatus: string | null;
    lastMessage: string | null;
    lastRunAt: string | null;
  }>;
}

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const ymLabel = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const prevYm = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};
const pctChange = (cur: number | null, prior: number | null) =>
  cur == null || prior == null || prior === 0 ? null : (cur - prior) / Math.abs(prior);

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const fmtShort = (isoDt: string) =>
  new Date(`${isoDt}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const monthName = (isoDt: string) =>
  new Date(`${isoDt}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const lastOfMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/** Resolve a reporting period anchored at `sd` into current + comparison
 *  windows with human labels. Calendar periods are cut off at the anchor
 *  ("to date") and compared to the same span of the prior calendar period;
 *  YTD compares to the same span last year. */
function resolvePeriod(
  period: PeriodKey,
  sd: string,
  custom?: { from?: string | null; to?: string | null }
): { from: string; to: string; priorFrom: string; priorTo: string; label: string; priorLabel: string; sparkUnit: string } {
  const yr = sd.slice(0, 4);
  switch (period) {
    case "day":
      return {
        from: sd, to: sd, priorFrom: addDays(sd, -1), priorTo: addDays(sd, -1),
        label: fmtShort(sd), priorLabel: `prior day (${fmtShort(addDays(sd, -1))})`, sparkUnit: "day",
      };
    case "month": {
      const start = `${sd.slice(0, 7)}-01`;
      const prevStart = `${prevYm(sd.slice(0, 7))}-01`;
      const offset = daysBetween(start, sd);
      const priorTo = [addDays(prevStart, offset), lastOfMonth(prevStart.slice(0, 7))].sort()[0];
      const partial = sd < lastOfMonth(sd.slice(0, 7));
      return {
        from: start, to: sd, priorFrom: prevStart, priorTo,
        label: `${monthName(sd)}${partial ? " (MTD)" : ""}`, priorLabel: monthName(prevStart), sparkUnit: "month",
      };
    }
    case "quarter": {
      const q = Math.floor((Number(sd.slice(5, 7)) - 1) / 3); // 0-3
      const start = `${yr}-${String(q * 3 + 1).padStart(2, "0")}-01`;
      const pq = q === 0 ? 3 : q - 1;
      const pYr = q === 0 ? String(Number(yr) - 1) : yr;
      const prevStart = `${pYr}-${String(pq * 3 + 1).padStart(2, "0")}-01`;
      const prevEndYm = `${pYr}-${String(pq * 3 + 3).padStart(2, "0")}`;
      const offset = daysBetween(start, sd);
      const priorTo = [addDays(prevStart, offset), lastOfMonth(prevEndYm)].sort()[0];
      return {
        from: start, to: sd, priorFrom: prevStart, priorTo,
        label: `Q${q + 1} ${yr} (QTD)`, priorLabel: `Q${pq + 1} ${pYr}`, sparkUnit: "quarter",
      };
    }
    case "ytd": {
      const md = sd.slice(5) === "02-29" ? "02-28" : sd.slice(5);
      const pYr = String(Number(yr) - 1);
      return {
        from: `${yr}-01-01`, to: sd, priorFrom: `${pYr}-01-01`, priorTo: `${pYr}-${md}`,
        label: `${yr} YTD (thru ${fmtShort(sd)})`, priorLabel: `${pYr} same period`, sparkUnit: "month",
      };
    }
    case "custom": {
      const to = custom?.to || sd;
      const from = custom?.from && custom.from <= to ? custom.from : addDays(to, -6);
      const len = daysBetween(from, to) + 1;
      return {
        from, to, priorFrom: addDays(from, -len), priorTo: addDays(from, -1),
        label: `${fmtShort(from)} – ${fmtShort(to)}`,
        priorLabel: `prior ${len} days (${fmtShort(addDays(from, -len))} – ${fmtShort(addDays(from, -1))})`,
        sparkUnit: `${len}-day`,
      };
    }
    case "week":
    default:
      return {
        from: addDays(sd, -6), to: sd, priorFrom: addDays(sd, -13), priorTo: addDays(sd, -7),
        label: `Week ${fmtShort(addDays(sd, -6))} – ${fmtShort(sd)}`,
        priorLabel: `week ${fmtShort(addDays(sd, -13))} – ${fmtShort(addDays(sd, -7))}`, sparkUnit: "week",
      };
  }
}

// Monthly aggregation of weekly rollups (2026 calendar months only).
type MonthAgg = {
  s26: number; s25: number; l26: number; l25: number; l24: number;
  weeks: number; // 2026 weeks with revenue
  weeks25: number; // weeks with prior-year revenue
  laborWeeks: number; // 2026 weeks with labor actually recorded
  laborWeeks25: number;
  s26L: number; // 2026 revenue within labor-covered weeks (labor % denominator)
  s25L: number;
};
const emptyMonth = (): MonthAgg => ({ s26: 0, s25: 0, l26: 0, l25: 0, l24: 0, weeks: 0, weeks25: 0, laborWeeks: 0, laborWeeks25: 0, s26L: 0, s25L: 0 });

function monthlyBuckets(
  rows: { weekStart: Date; totalRevenue: unknown; revenuePrev1: unknown; laborCost: unknown; laborPrev1: unknown; laborPrev2: unknown }[]
): Map<string, MonthAgg> {
  const m = new Map<string, MonthAgg>();
  for (const r of rows) {
    const ym = iso(r.weekStart).slice(0, 7);
    if (!ym.startsWith("2026")) continue;
    const a = m.get(ym) ?? emptyMonth();
    const rev = n(r.totalRevenue) ?? 0;
    const rev25 = n(r.revenuePrev1) ?? 0;
    const lab = n(r.laborCost) ?? 0;
    const lab25 = n(r.laborPrev1) ?? 0;
    a.s26 += rev;
    a.s25 += rev25;
    a.l24 += n(r.laborPrev2) ?? 0;
    if (rev > 0) a.weeks += 1;
    if (rev25 > 0) a.weeks25 += 1;
    // laborCost 0 on a revenue week means "not recorded", not free labor —
    // keep such weeks out of the sum, the week count, and the % denominator.
    if (lab > 0) { a.l26 += lab; a.laborWeeks += 1; a.s26L += rev; }
    if (lab25 > 0) { a.l25 += lab25; a.laborWeeks25 += 1; a.s25L += rev25; }
    m.set(ym, a);
  }
  return m;
}

/** MoM/YoY comparison panels from monthly buckets. Values are per-week
 *  averages and labor % is computed only over labor-covered weeks, so a
 *  5-week month vs a 4-week month (or a month with 3 of 4 labor weeks
 *  recorded) can't read as a fake 25–50% swing. */
function buildComparisons(monthly: Map<string, MonthAgg>): { mom: PeriodComparison; yoy: PeriodComparison } {
  const selYm = latestCompleteMonth(monthly);
  const prevKey = prevYm(selYm);
  const c = monthly.get(selYm) ?? emptyMonth();
  const p = monthly.get(prevKey) ?? emptyMonth();
  const perWk = (v: number, w: number) => (w > 0 ? v / w : null);
  const wkTag = (w: number) => (w ? ` (${w} wk${w === 1 ? "" : "s"})` : "");
  const priorYm = `${Number(selYm.slice(0, 4)) - 1}-${selYm.slice(5, 7)}`;
  const mom: PeriodComparison = {
    label: "Month over Month",
    currentLabel: `${ymLabel(selYm)}${wkTag(c.weeks)}`,
    priorLabel: `${ymLabel(prevKey)}${wkTag(p.weeks)}`,
    sales: { current: perWk(c.s26, c.weeks), prior: perWk(p.s26, p.weeks), deltaPct: pctChange(perWk(c.s26, c.weeks), perWk(p.s26, p.weeks)) },
    labor: { current: perWk(c.l26, c.laborWeeks), prior: perWk(p.l26, p.laborWeeks), deltaPct: pctChange(perWk(c.l26, c.laborWeeks), perWk(p.l26, p.laborWeeks)) },
    laborPct: { current: c.s26L ? c.l26 / c.s26L : null, prior: p.s26L ? p.l26 / p.s26L : null },
  };
  const yoy: PeriodComparison = {
    label: "Year over Year",
    currentLabel: `${ymLabel(selYm)}${wkTag(c.weeks)}`,
    priorLabel: `${ymLabel(priorYm)}${wkTag(c.weeks25)}`,
    sales: { current: perWk(c.s26, c.weeks), prior: perWk(c.s25, c.weeks25), deltaPct: pctChange(perWk(c.s26, c.weeks), perWk(c.s25, c.weeks25)) },
    labor: { current: perWk(c.l26, c.laborWeeks), prior: perWk(c.l25, c.laborWeeks25), deltaPct: pctChange(perWk(c.l26, c.laborWeeks), perWk(c.l25, c.laborWeeks25)) },
    laborPct: { current: c.s26L ? c.l26 / c.s26L : null, prior: c.s25L ? c.l25 / c.s25L : null },
  };
  return { mom, yoy };
}

/** Latest month with ≥4 weeks of data; falls back to latest month with any. */
function latestCompleteMonth(m: Map<string, MonthAgg>): string {
  const complete = [...m.keys()].filter((k) => m.get(k)!.weeks >= 4).sort();
  if (complete.length) return complete[complete.length - 1];
  const any = [...m.keys()].filter((k) => m.get(k)!.s26 > 0 || m.get(k)!.l26 > 0).sort();
  return any[any.length - 1] ?? "";
}

export async function getDashboard(opts?: {
  date?: string;
  from?: string;
  to?: string;
  period?: string;
}): Promise<Dashboard> {
  const targetDate = opts?.date;
  const periodKey: PeriodKey = (["day", "week", "month", "quarter", "ytd", "custom"] as const).includes(
    opts?.period as PeriodKey
  )
    ? (opts?.period as PeriodKey)
    : "week";
  // "Latest timesheet week" cards must aggregate exactly one week — without a
  // date filter they silently sum every imported week (5+ already).
  const laborEdge = await prisma.laborEntry.aggregate({ _max: { date: true } });
  const laborWeekWhere = laborEdge._max.date
    ? { date: { gte: new Date(laborEdge._max.date.getTime() - 6 * 86400000) } }
    : {};
  const [metrics, balanceRows, deptGroups, channelRows, rollupRows, deptEmp] =
    await Promise.all([
      prisma.dailyMetric.findMany({ orderBy: { date: "asc" } }),
      prisma.accountBalance.findMany({ orderBy: { date: "asc" } }),
      prisma.laborEntry.groupBy({
        by: ["department"],
        where: laborWeekWhere,
        _sum: { regularHours: true, otHours: true, paidTotal: true },
      }),
      prisma.weeklyChannelRevenue.findMany({ orderBy: { weekStart: "asc" } }),
      prisma.weeklyRollup.findMany({ orderBy: { weekStart: "asc" } }),
      prisma.laborEntry.groupBy({ by: ["department", "employeeId"], where: laborWeekWhere }),
    ]);
  const deptHeadcount = new Map<string, number>();
  for (const r of deptEmp) if (r.department) deptHeadcount.set(r.department, (deptHeadcount.get(r.department) ?? 0) + 1);

  const series: DayPoint[] = metrics.map((m) => ({
    date: iso(m.date),
    netSales: n(m.netSales),
    tax: n(m.tax),
    laborCost: n(m.laborCost),
    laborHours: n(m.laborHours),
    laborPct: n(m.laborPct),
    foodPurchases: n(m.foodPurchases),
  }));

  const withSales = series.filter((d) => d.netSales != null);
  const availableDates = withSales.map((d) => d.date);
  const overallLatest = withSales[withSales.length - 1] ?? null;
  // Anchor the "reporting day" to targetDate (latest day on/before it) or to
  // the most recent day with data. A custom period anchors to its end date.
  const effTarget = targetDate || (periodKey === "custom" ? opts?.to : undefined);
  let anchorIdx = withSales.length - 1;
  if (effTarget) {
    anchorIdx = -1;
    for (let i = 0; i < withSales.length; i++) {
      if (withSales[i].date <= effTarget) anchorIdx = i;
    }
    if (anchorIdx < 0) anchorIdx = withSales.length - 1;
  }
  const latest = withSales[anchorIdx] ?? overallLatest;
  const prev = anchorIdx > 0 ? withSales[anchorIdx - 1] : null;
  const latestDate = overallLatest?.date ?? null;
  const selectedDate = latest?.date ?? null;
  // Reporting period (KPIs + default chart window) anchored at the selected day.
  const per = selectedDate
    ? resolvePeriod(periodKey, selectedDate, { from: opts?.from, to: opts?.to })
    : null;

  // Month-to-date relative to the selected reporting day.
  let mtd = { net: 0, labor: 0, hours: 0, count: 0 };
  let monthLabel: string | null = null;
  if (selectedDate) {
    const ld = new Date(`${selectedDate}T00:00:00Z`);
    monthLabel = ld.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    for (const d of series) {
      const dt = new Date(`${d.date}T00:00:00Z`);
      if (
        dt.getUTCFullYear() === ld.getUTCFullYear() &&
        dt.getUTCMonth() === ld.getUTCMonth() &&
        d.date <= selectedDate
      ) {
        if (d.netSales != null) { mtd.net += d.netSales; mtd.count++; }
        if (d.laborCost != null) mtd.labor += d.laborCost;
        if (d.laborHours != null) mtd.hours += d.laborHours;
      }
    }
  }

  // Latest + previous balance per account.
  const byAccount = new Map<AccountType, { date: string; balance: number }[]>();
  for (const b of balanceRows) {
    const bd = iso(b.date);
    if (selectedDate && bd > selectedDate) continue; // as-of the reporting day
    const list = byAccount.get(b.account) ?? [];
    list.push({ date: bd, balance: Number(b.balance) });
    byAccount.set(b.account, list);
  }
  const balances = [...byAccount.entries()].map(([account, list]) => ({
    account,
    balance: list[list.length - 1].balance,
    prev: list.length > 1 ? list[list.length - 2].balance : null,
    date: list[list.length - 1].date,
  }));
  const cashPosition = balances.reduce((s, b) => s + b.balance, 0);
  const cashPositionPrev = balances.reduce((s, b) => s + (b.prev ?? b.balance), 0);
  const cashDates = [
    ...new Set(balanceRows.filter((b) => !selectedDate || iso(b.date) <= selectedDate).map((b) => iso(b.date))),
  ].sort();
  const cashSeries = cashDates.map((dt) => {
    let sum = 0;
    for (const [, list] of byAccount) {
      let v: number | null = null;
      for (const e of list) {
        if (e.date <= dt) v = e.balance;
        else break;
      }
      if (v != null) sum += v;
    }
    return sum;
  });

  const laborByDept = deptGroups
    .filter((g) => g.department)
    .map((g) => ({
      department: g.department as string,
      hours: (n(g._sum.regularHours) ?? 0) + (n(g._sum.otHours) ?? 0),
      cost: n(g._sum.paidTotal) ?? 0,
      headcount: deptHeadcount.get(g.department as string) ?? 0,
    }))
    .sort((a, b) => b.cost - a.cost);

  // Channel mix: sum actuals over the most recent 8 weeks that have data.
  const recentWeeks = [...new Set(channelRows.map((c) => iso(c.weekStart)))].slice(-8);
  const mix = new Map<SalesChannel, { actual: number; projected: number }>();
  for (const c of channelRows) {
    if (!recentWeeks.includes(iso(c.weekStart))) continue;
    const e = mix.get(c.channel) ?? { actual: 0, projected: 0 };
    e.actual += n(c.actual) ?? 0;
    e.projected += n(c.projected) ?? 0;
    mix.set(c.channel, e);
  }
  const channelMix = [...mix.entries()]
    .map(([channel, v]) => ({ channel, ...v }))
    .filter((c) => c.actual > 0 || c.projected > 0)
    .sort((a, b) => b.actual - a.actual);

  // Weekly revenue: actuals + prior year, with a forward projection that begins
  // at the last actual week (prior-year weekly shape × current YoY pace — same
  // model as the Pulse; run-rate fallback when prior year is missing).
  // `projected` is null for history so the dashed line only spans the future;
  // the boundary week carries both values so the two segments connect.
  const wkAll = rollupRows
    .filter((r) => iso(r.weekStart).startsWith("2026"))
    .map((r) => ({
      weekStart: iso(r.weekStart),
      total: n(r.totalRevenue),
      priorYear: n(r.revenuePrev1),
      laborPct: n(r.laborPct),
    }))
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
  const wkActuals = wkAll.filter((w) => (w.total ?? 0) > 0);
  const lastActualWk = wkActuals.length ? wkActuals[wkActuals.length - 1].weekStart : null;
  // YoY pace from the trailing 8 matched weeks — a full-year blended pace
  // (currently ~1.21×) badly overshoots when the recent regime shifts
  // (July 2026 is running well under July 2025).
  const wkMatched = wkActuals.filter((w) => (w.priorYear ?? 0) > 0);
  const wkPaceSet = wkMatched.length >= 3 ? wkMatched.slice(-8) : wkMatched;
  let wkPaceNum = 0, wkPaceDen = 0;
  for (const w of wkPaceSet) { wkPaceNum += w.total!; wkPaceDen += w.priorYear!; }
  const wkPace = wkPaceDen > 0 ? wkPaceNum / wkPaceDen : 1;
  const wkRunRate = wkActuals.length
    ? wkActuals.slice(-4).reduce((s, w) => s + w.total!, 0) / Math.min(4, wkActuals.length)
    : 0;
  const weekly: Dashboard["weekly"] = [];
  let futureWks = 0;
  for (const w of wkAll) {
    if (lastActualWk == null || w.weekStart <= lastActualWk) {
      if (w.total == null && w.priorYear == null) continue;
      weekly.push({ ...w, projected: w.weekStart === lastActualWk ? w.total : null });
    } else if (futureWks < 4) {
      futureWks++;
      const f = (w.priorYear ?? 0) > 0 ? w.priorYear! * wkPace : wkRunRate;
      weekly.push({ weekStart: w.weekStart, total: null, priorYear: w.priorYear, projected: Math.round(f), laborPct: null });
    }
  }

  // Source/connector status + latest sync run per source.
  const lastRuns = await prisma.syncRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
  });
  const latestRunBySource = new Map<SourceSystem, (typeof lastRuns)[number]>();
  for (const r of lastRuns) {
    if (!latestRunBySource.has(r.source)) latestRunBySource.set(r.source, r);
  }
  const qbo = await qboStatus();
  const sources = connectors.map((c) => {
    const s = c.status();
    const run = latestRunBySource.get(s.system);
    const isQbo = s.system === "QUICKBOOKS";
    const configured = isQbo ? qbo.connected : s.configured;
    const readiness = isQbo
      ? qbo.connected
        ? `Connected — company realm ${qbo.realmId}. Account balances pull live.`
        : qbo.configured
          ? "App configured — click Connect to authorize your QuickBooks company."
          : s.readiness
      : s.readiness;
    return {
      system: s.system,
      label: s.label,
      category: s.category,
      method: s.method,
      configured,
      readiness,
      connectHref: isQbo && qbo.configured && !qbo.connected ? "/api/qbo/connect" : null,
      lastStatus: run?.status ?? null,
      lastMessage: run?.message ?? null,
      lastRunAt: run ? run.startedAt.toISOString() : null,
    };
  });

  // --- Date range (sales & labor chart) -----------------------------------
  // Explicit from/to (RangePicker) wins; otherwise calendar periods drive the
  // chart window, and day/week fall back to 30 days of context.
  const periodDrivesChart = per && ["month", "quarter", "ytd", "custom"].includes(per ? periodKey : "");
  let rangeTo = opts?.to || per?.to || selectedDate || latestDate;
  let rangeFrom =
    opts?.from || (periodDrivesChart ? per!.from : rangeTo ? addDays(rangeTo, -29) : null);
  if (rangeFrom && rangeTo && rangeFrom > rangeTo) [rangeFrom, rangeTo] = [rangeTo, rangeFrom];
  const rangeSeries = series.filter(
    (d) => (!rangeFrom || d.date >= rangeFrom) && (!rangeTo || d.date <= rangeTo)
  );
  const rNet = rangeSeries.reduce((s, d) => s + (d.netSales ?? 0), 0);
  const rLabor = rangeSeries.reduce((s, d) => s + (d.laborCost ?? 0), 0);
  const rHours = rangeSeries.reduce((s, d) => s + (d.laborHours ?? 0), 0);
  const rDays = rangeSeries.filter((d) => d.netSales != null).length;
  const range = {
    from: rangeFrom,
    to: rangeTo,
    netSales: rNet,
    laborCost: rLabor,
    laborPct: rNet ? rLabor / rNet : null,
    hours: rHours,
    days: rDays,
  };

  // --- Week-over-week KPIs (trailing 7-day windows, apples to apples) ------
  const sumRange = (fromIso: string, toIso: string, pick: (d: DayPoint) => number | null) =>
    series.reduce((s, d) => (d.date >= fromIso && d.date <= toIso ? s + (pick(d) ?? 0) : s), 0);
  const cashAsOf = (isoDt: string) => {
    let v: number | null = null;
    for (let i = 0; i < cashDates.length; i++) {
      if (cashDates[i] <= isoDt) v = cashSeries[i];
      else break;
    }
    return v;
  };
  let periodKpis: PeriodKpis;
  const dataFrom = withSales[0]?.date ?? null;
  if (per) {
    // Clamp the window to the daily-data edge: `sumRange` reads a missing day
    // as $0, so an unclamped "YTD" quietly drops every day before the first
    // import and shows it as a revenue collapse.
    const tFrom = dataFrom && per.from < dataFrom ? dataFrom : per.from;
    const tTo = per.to;
    const clamped = tFrom !== per.from;
    const { priorFrom: lFrom, priorTo: lTo } = per;
    // The prior window only yields a fair comparison if daily data fully
    // covers it — a half-covered window deflates the baseline.
    const priorCovered = dataFrom != null && lFrom >= dataFrom;
    const net = sumRange(tFrom, tTo, (d) => d.netSales);
    const netP = priorCovered ? sumRange(lFrom, lTo, (d) => d.netSales) : null;
    const lab = sumRange(tFrom, tTo, (d) => d.laborCost);
    const labP = priorCovered ? sumRange(lFrom, lTo, (d) => d.laborCost) : null;
    const daysExpected = daysBetween(tFrom, tTo) + 1;
    const daysWithData = series.filter((d) => d.date >= tFrom && d.date <= tTo && d.netSales != null).length;
    // Sparklines: trailing windows of the period's length ending at `to`,
    // skipping windows that reach past the data edge (no fabricated $0 dips).
    const winLen = daysBetween(tFrom, tTo) + 1;
    const sparkOf = (pick: (d: DayPoint) => number | null) => {
      const out: number[] = [];
      for (let w = 7; w >= 0; w--) {
        const to = addDays(tTo, -winLen * w);
        const from = addDays(to, -(winLen - 1));
        if (dataFrom && from < dataFrom) continue;
        out.push(sumRange(from, to, pick));
      }
      return out;
    };
    const laborPctSpark: number[] = [];
    const cashSpark: number[] = [];
    for (let w = 7; w >= 0; w--) {
      const to = addDays(tTo, -winLen * w);
      const from = addDays(to, -(winLen - 1));
      if (dataFrom && from < dataFrom) continue;
      const s = sumRange(from, to, (d) => d.netSales);
      const l = sumRange(from, to, (d) => d.laborCost);
      if (s) laborPctSpark.push(l / s);
      const cv = cashAsOf(to);
      if (cv != null) cashSpark.push(cv);
    }
    periodKpis = {
      period: periodKey,
      label: clamped && dataFrom ? `${per.label} · data since ${fmtShort(dataFrom)}` : per.label,
      priorLabel: priorCovered ? per.priorLabel : `${per.priorLabel} — no daily data`,
      sparkUnit: per.sparkUnit,
      from: tFrom, to: tTo,
      netSales: net, netSalesPrev: netP,
      laborCost: lab,
      laborPct: net ? lab / net : null,
      laborPctPrev: netP ? labP! / netP : null,
      hours: sumRange(tFrom, tTo, (d) => d.laborHours),
      hoursPrev: priorCovered ? sumRange(lFrom, lTo, (d) => d.laborHours) : null,
      food: sumRange(tFrom, tTo, (d) => d.foodPurchases),
      foodPrev: priorCovered ? sumRange(lFrom, lTo, (d) => d.foodPurchases) : null,
      cash: cashAsOf(tTo),
      cashPrev: cashAsOf(lTo),
      coverage: { daysWithData, daysExpected, dataFrom },
      spark: { net: sparkOf((d) => d.netSales), laborPct: laborPctSpark, hours: sparkOf((d) => d.laborHours), food: sparkOf((d) => d.foodPurchases), cash: cashSpark },
    };
  } else {
    periodKpis = { period: periodKey, label: "", priorLabel: "", sparkUnit: "week", from: null, to: null, netSales: 0, netSalesPrev: null, laborCost: 0, laborPct: null, laborPctPrev: null, hours: 0, hoursPrev: null, food: 0, foodPrev: null, cash: null, cashPrev: null, coverage: { daysWithData: 0, daysExpected: 0, dataFrom: null }, spark: { net: [], laborPct: [], hours: [], food: [], cash: [] } };
  }

  // MTD card comparison: same day-span of the prior month (not last month's
  // full total vs a partial current month).
  let mtdNetSalesPrevSpan: number | null = null;
  let mtdPriorLabel: string | null = null;
  if (selectedDate) {
    const mp = resolvePeriod("month", selectedDate);
    // Only compare when daily data fully covers the prior-month span —
    // a half-covered span deflates the baseline and fakes growth.
    if (dataFrom && mp.priorFrom >= dataFrom) {
      mtdNetSalesPrevSpan = sumRange(mp.priorFrom, mp.priorTo, (d) => d.netSales);
      mtdPriorLabel = `${mp.priorLabel} (same days)`;
    } else {
      mtdPriorLabel = `${mp.priorLabel} — no daily data`;
    }
  }

  // --- Forward Daily Ledger: project next 10 days from weekday seasonality --
  const forwardDays: DayPoint[] = [];
  if (latestDate) {
    const lookback = addDays(latestDate, -27);
    const recentDays = series.filter((d) => d.date > lookback && d.date <= latestDate && d.netSales != null);
    // Per-weekday averages for sales, labor $, and hours. Labor is mostly a
    // scheduled/fixed cost per weekday (a slow Monday still staffs the kitchen),
    // so it is projected from weekday labor history — NOT as a % of sales.
    const byDow = new Map<number, number[]>();
    const byDowLabor = new Map<number, number[]>();
    const byDowHours = new Map<number, number[]>();
    const push = (m: Map<number, number[]>, k: number, v: number) => {
      const arr = m.get(k);
      if (arr) arr.push(v);
      else m.set(k, [v]);
    };
    for (const d of recentDays) {
      const dow = new Date(`${d.date}T00:00:00Z`).getUTCDay();
      push(byDow, dow, d.netSales!);
      if (d.laborCost != null) push(byDowLabor, dow, d.laborCost);
      if (d.laborHours != null) push(byDowHours, dow, d.laborHours);
    }
    // Median, not mean: a holiday week inside the 28-day lookback (July 4)
    // drags every weekday mean for the next 10 projected days.
    const med = (m: Map<number, number[]>, k: number): number | null => {
      const arr = m.get(k);
      if (!arr?.length) return null;
      const s = [...arr].sort((a, b) => a - b);
      return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    };
    // Blended ratio only as a fallback for weekdays with no labor history.
    let lp = 0, ls = 0;
    for (const d of recentDays) if (d.laborCost != null && d.netSales) { lp += d.laborCost; ls += d.netSales; }
    const dailyLaborPct = ls ? lp / ls : 0.2;
    for (let i = 1; i <= 10; i++) {
      const dt = addDays(latestDate, i);
      const dow = new Date(`${dt}T00:00:00Z`).getUTCDay();
      const nsAvg = med(byDow, dow);
      const ns = nsAvg != null ? Math.round(nsAvg) : null;
      const lcAvg = med(byDowLabor, dow);
      const lc = lcAvg != null ? Math.round(lcAvg) : ns != null ? Math.round(ns * dailyLaborPct) : null;
      const lhAvg = med(byDowHours, dow);
      forwardDays.push({
        date: dt,
        netSales: ns,
        tax: null,
        laborCost: lc,
        laborHours: lhAvg != null ? Math.round(lhAvg * 10) / 10 : null,
        laborPct: ns && lc != null ? lc / ns : null,
        foodPurchases: null,
      });
    }
  }

  // --- MoM / YoY comparisons (from weekly rollups: has both years) ---------
  // Anchored to the latest COMPLETE month; per-week averages via buildComparisons.
  const comparisons = buildComparisons(monthlyBuckets(rollupRows));

  return {
    generatedAt: new Date().toISOString(),
    latestDate,
    selectedDate,
    availableDates,
    series,
    range,
    rangeSeries,
    comparisons,
    kpis: {
      netSales: latest?.netSales ?? null,
      netSalesPrev: prev?.netSales ?? null,
      laborCost: latest?.laborCost ?? null,
      laborPct: latest?.laborPct ?? null,
      laborHours: latest?.laborHours ?? null,
      foodPurchases: latest?.foodPurchases ?? null,
      mtdNetSales: mtd.count ? mtd.net : null,
      mtdNetSalesPrevSpan,
      mtdPriorLabel,
      mtdLaborCost: mtd.count ? mtd.labor : null,
      mtdLaborPct: mtd.net ? mtd.labor / mtd.net : null,
      mtdAvgDailySales: mtd.count ? mtd.net / mtd.count : null,
      mtdHours: mtd.count ? mtd.hours : null,
      cashPosition: balances.length ? cashPosition : null,
      cashPositionPrev: balances.length ? cashPositionPrev : null,
      cashSeries,
      laborPctPrev: prev?.laborPct ?? null,
      laborHoursPrev: prev?.laborHours ?? null,
      foodPurchasesPrev: prev?.foodPurchases ?? null,
      monthLabel,
    },
    periodKpis,
    forwardDays,
    balances,
    laborByDept,
    channelMix,
    channelMixRange: { from: recentWeeks[0] ?? null, to: recentWeeks[recentWeeks.length - 1] ?? null, weeks: recentWeeks.length },
    weekly,
    sources,
  };
}

// ---------------------------------------------------------------------------
// "Pulse of the business" — revenue / cost / profit to date + projection
// ---------------------------------------------------------------------------
export interface PulsePoint {
  week: string;
  actualRevenue: number | null;
  actualCost: number | null;
  actualProfit: number | null;
  projRevenue: number | null;
  projCost: number | null;
  projProfit: number | null;
  priorYearRevenue: number | null; // 2025 cumulative — history reference
}

export interface Pulse {
  points: PulsePoint[]; // cumulative across the year
  assumptions: {
    yoyGrowthPct: number;
    laborPct: number;
    foodPct: number;
    /** Weeks inside the "actual" region whose labor/food had to be imputed —
     *  the solid lines are only as real as these counts are low. */
    imputedLaborWeeks: number;
    imputedFoodWeeks: number;
    actualWeeks: number;
  };
  stubbedCosts: CostComponent[];
  ytd: { revenue: number; cost: number; profit: number; grossProfit: number; marginPct: number | null; grossMarginPct: number | null; throughWeek: string | null };
  projectedYearEnd: { revenue: number; cost: number; profit: number; grossProfit: number; marginPct: number | null; grossMarginPct: number | null };
}

/**
 * Cumulative revenue/cost/profit to date, then a dotted projection to year-end.
 * Cost model = actual labor + modeled food + modeled overhead (gas/utilities/
 * other). Projection = recent run-rate compounded by a derived weekly growth
 * rate, with cost ratios held to their blended actuals. Assumptions are
 * returned so the UI can show (and later let the user tune) them.
 */
export async function getPulse(): Promise<Pulse> {
  const [rollups, metrics] = await Promise.all([
    prisma.weeklyRollup.findMany({ orderBy: { weekStart: "asc" } }),
    prisma.dailyMetric.findMany({ orderBy: { date: "asc" } }),
  ]);

  // Full-year 2026 weeks, each with prior-year (2025) revenue alongside.
  const yr = rollups
    .filter((r) => iso(r.weekStart).startsWith("2026"))
    .map((r) => ({ week: iso(r.weekStart), rev: n(r.totalRevenue) ?? 0, rev25: n(r.revenuePrev1) ?? 0, labor: n(r.laborCost) ?? 0 }))
    .sort((a, b) => (a.week < b.week ? -1 : 1));

  const actualWeeks = yr.filter((w) => w.rev > 0);
  const lastWeek = actualWeeks.length ? actualWeeks[actualWeeks.length - 1].week : null;

  // Blended labor % from weeks with labor recorded; food % from daily metrics.
  const lw = actualWeeks.filter((w) => w.labor > 0);
  const lwRev = lw.reduce((s, w) => s + w.rev, 0);
  const lwLab = lw.reduce((s, w) => s + w.labor, 0);
  const laborPct = lwRev ? lwLab / lwRev : 0.38;
  let foodSum = 0, foodRev = 0;
  for (const m of metrics) {
    const f = n(m.foodPurchases), s = n(m.netSales);
    if (f != null && s != null) { foodSum += f; foodRev += s; }
  }
  const foodPct = foodRev ? Math.min(0.6, foodSum / foodRev) : 0.3;

  // Actual food per week where the daily tracker covered ≥5 days of the week;
  // modeled % otherwise. (Weeks start Monday, matching the rollups.)
  const foodByWeek = new Map<string, { sum: number; days: number }>();
  for (const m of metrics) {
    const f = n(m.foodPurchases);
    if (f == null) continue;
    const d = iso(m.date);
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    const wkStart = addDays(d, -((dow + 6) % 7));
    const e = foodByWeek.get(wkStart) ?? { sum: 0, days: 0 };
    e.sum += f; e.days += 1;
    foodByWeek.set(wkStart, e);
  }
  const actualFood = (week: string): number | null => {
    const fw = foodByWeek.get(week);
    return fw && fw.days >= 5 ? fw.sum : null;
  };

  // YoY pace over the trailing 8 matched weeks — a full-year blended pace
  // overshoots the projection when the recent trend breaks from spring.
  const matchedWks = actualWeeks.filter((w) => w.rev25 > 0);
  const paceSet = matchedWks.length >= 3 ? matchedWks.slice(-8) : matchedWks;
  let yoyA = 0, yoyB = 0;
  for (const w of paceSet) { yoyA += w.rev; yoyB += w.rev25; }
  const yoyGrowth = yoyB > 0 ? yoyA / yoyB - 1 : 0;
  const g = 1 + yoyGrowth;
  const recentBase = actualWeeks.length ? actualWeeks.slice(-4).reduce((s, w) => s + w.rev, 0) / Math.min(4, actualWeeks.length) : 0;

  const weekly = (week: string, rev: number, actualLabor: number | null) => {
    const wl = actualLabor && actualLabor > 0 ? actualLabor : laborPct * rev;
    const food = actualFood(week) ?? foodPct * rev;
    const gross = rev - wl - food; // gross margin: after labor + food
    const cost = wl + food + OPEX_PCT * rev + FIXED_WEEKLY; // + stubbed opex/debt/interest
    return { gross, cost };
  };

  const points: PulsePoint[] = [];
  let cumRev = 0, cumCost = 0, cumProfit = 0, cumGross = 0, cumPrior = 0;
  let pRev = 0, pCost = 0, pProfit = 0, pGross = 0;
  let crossed = false;
  let imputedLaborWeeks = 0, imputedFoodWeeks = 0;
  for (const w of yr) {
    cumPrior += w.rev25;
    const isActual = lastWeek != null && w.week <= lastWeek;
    if (isActual) {
      if (!(w.labor > 0)) imputedLaborWeeks++;
      if (actualFood(w.week) == null) imputedFoodWeeks++;
      const { gross, cost } = weekly(w.week, w.rev, w.labor);
      cumRev += w.rev; cumCost += cost; cumProfit += w.rev - cost; cumGross += gross;
      points.push({ week: w.week, actualRevenue: cumRev, actualCost: cumCost, actualProfit: cumProfit, projRevenue: null, projCost: null, projProfit: null, priorYearRevenue: cumPrior });
    } else {
      if (!crossed) {
        pRev = cumRev; pCost = cumCost; pProfit = cumProfit; pGross = cumGross;
        if (points.length) { const lp = points[points.length - 1]; lp.projRevenue = lp.actualRevenue; lp.projCost = lp.actualCost; lp.projProfit = lp.actualProfit; }
        crossed = true;
      }
      // Seasonal: prior-year weekly shape × YoY pace (fallback to run-rate).
      const fr = w.rev25 > 0 ? w.rev25 * g : recentBase;
      const { gross, cost } = weekly(w.week, fr, null);
      pRev += fr; pCost += cost; pProfit += fr - cost; pGross += gross;
      points.push({ week: w.week, actualRevenue: null, actualCost: null, actualProfit: null, projRevenue: pRev, projCost: pCost, projProfit: pProfit, priorYearRevenue: cumPrior });
    }
  }

  const ytd = {
    revenue: cumRev, cost: cumCost, profit: cumProfit, grossProfit: cumGross,
    marginPct: cumRev ? cumProfit / cumRev : null,
    grossMarginPct: cumRev ? cumGross / cumRev : null,
    throughWeek: lastWeek,
  };
  const eRev = crossed ? pRev : cumRev, eCost = crossed ? pCost : cumCost, eProfit = crossed ? pProfit : cumProfit, eGross = crossed ? pGross : cumGross;

  return {
    points,
    assumptions: { yoyGrowthPct: yoyGrowth, laborPct, foodPct, imputedLaborWeeks, imputedFoodWeeks, actualWeeks: actualWeeks.length },
    stubbedCosts: STUBBED_COSTS,
    ytd,
    projectedYearEnd: { revenue: eRev, cost: eCost, profit: eProfit, grossProfit: eGross, marginPct: eRev ? eProfit / eRev : null, grossMarginPct: eRev ? eGross / eRev : null },
  };
}

// ---------------------------------------------------------------------------
// Labor analysis — period/range, weekly trend + projection, MoM, YoY
// ---------------------------------------------------------------------------
export interface LaborAnalysis {
  availableDates: string[];
  range: { from: string | null; to: string | null; laborCost: number; laborPrev: number; hours: number; laborPct: number | null; laborPctPrev: number | null; weeks: number };
  weekly: { week: string; actualLabor: number | null; actualLaborPct: number | null; projLabor: number | null }[];
  ytdLabor: number;
  projectedYearEndLabor: number;
  assumptions: { weeklyGrowthPct: number; laborPct: number };
  comparisons: { mom: PeriodComparison; yoy: PeriodComparison };
}

export async function getLaborAnalysis(opts?: { from?: string; to?: string }): Promise<LaborAnalysis> {
  const [rollups, metrics] = await Promise.all([
    prisma.weeklyRollup.findMany({ orderBy: { weekStart: "asc" } }),
    prisma.dailyMetric.findMany({ orderBy: { date: "asc" } }),
  ]);

  // Range summary from weekly rollups (2026 + prior-year for same-period YoY).
  const wkAll = rollups
    .filter((r) => iso(r.weekStart).startsWith("2026") && (n(r.laborCost) ?? 0) > 0)
    .map((r) => ({ week: iso(r.weekStart), labor: n(r.laborCost) ?? 0, laborPrev: n(r.laborPrev1) ?? 0, hours: n(r.hoursPaid) ?? 0, rev: n(r.totalRevenue) ?? 0, revPrev: n(r.revenuePrev1) ?? 0 }))
    .sort((a, b) => (a.week < b.week ? -1 : 1));
  const weekStarts = wkAll.map((w) => w.week);
  const to = opts?.to || weekStarts[weekStarts.length - 1] || null;
  const from = opts?.from || weekStarts[0] || null;
  const inR = wkAll.filter((w) => (!from || w.week >= from) && (!to || w.week <= to));
  const rLabor = inR.reduce((s, w) => s + w.labor, 0);
  const rLaborPrev = inR.reduce((s, w) => s + w.laborPrev, 0);
  const rHours = inR.reduce((s, w) => s + w.hours, 0);
  const rRev = inR.reduce((s, w) => s + w.rev, 0);
  const rRevPrev = inR.reduce((s, w) => s + w.revPrev, 0);
  const range = { from, to, laborCost: rLabor, laborPrev: rLaborPrev, hours: rHours, laborPct: rRev ? rLabor / rRev : null, laborPctPrev: rRevPrev ? rLaborPrev / rRevPrev : null, weeks: inR.length };

  // Weekly labor trend (2026 actual) + projection to year-end.
  const wk = rollups
    .filter((r) => (n(r.laborCost) ?? 0) > 0)
    .map((r) => ({ week: iso(r.weekStart), labor: n(r.laborCost) ?? 0, pct: n(r.laborPct), revenue: n(r.totalRevenue) ?? 0 }));
  const totalRev = wk.reduce((s, w) => s + w.revenue, 0);
  const totalLab = wk.reduce((s, w) => s + w.labor, 0);
  const blendedLaborPct = totalRev ? totalLab / totalRev : 0.4;
  const labs = wk.map((w) => w.labor);
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const recent = avg(labs.slice(-4));
  const earlier = avg(labs.slice(-8, -4));
  let weeklyGrowth = earlier > 0 ? Math.pow(recent / earlier, 1 / 4) - 1 : 0;
  weeklyGrowth = Math.max(-0.01, Math.min(0.01, weeklyGrowth));

  const weekly: LaborAnalysis["weekly"] = wk.map((w) => ({ week: w.week, actualLabor: w.labor, actualLaborPct: w.pct, projLabor: null }));
  let ytdLabor = totalLab;
  let projTotal = totalLab;
  const lastWeek = wk.length ? wk[wk.length - 1].week : null;
  if (weekly.length) weekly[weekly.length - 1].projLabor = wk[wk.length - 1].labor;
  if (lastWeek) {
    const base = recent > 0 ? recent : labs[labs.length - 1] ?? 0;
    const yearEnd = `${lastWeek.slice(0, 4)}-12-31`;
    let cur = lastWeek, k = 1;
    while (true) {
      cur = addDays(cur, 7);
      if (cur > yearEnd) break;
      const fl = base * Math.pow(1 + weeklyGrowth, k);
      projTotal += fl;
      weekly.push({ week: cur, actualLabor: null, actualLaborPct: blendedLaborPct, projLabor: fl });
      k++;
    }
  }

  // MoM / YoY (labor-focused) from weekly rollups — anchored to last complete
  // month, per-week averages via buildComparisons.
  const comparisons = buildComparisons(monthlyBuckets(rollups));

  return {
    availableDates: weekStarts,
    range,
    weekly,
    ytdLabor,
    projectedYearEndLabor: projTotal,
    assumptions: { weeklyGrowthPct: weeklyGrowth, laborPct: blendedLaborPct },
    comparisons,
  };
}

// ---------------------------------------------------------------------------
// Labor drill-down (department → employee)
// ---------------------------------------------------------------------------
export interface LaborDetail {
  dateRange: { start: string | null; end: string | null };
  totals: { hours: number; cost: number; headcount: number };
  departments: { department: string }[];
  byDepartment: Array<{
    department: string;
    hours: number;
    otHours: number;
    cost: number;
    headcount: number;
    avgRate: number | null;
  }>;
  byEmployee: Array<{
    name: string;
    employeeId: string | null;
    department: string | null;
    regularHours: number;
    otHours: number;
    hours: number;
    cost: number;
    avgRate: number | null;
  }>;
}

export async function getLaborDetail(department?: string): Promise<LaborDetail> {
  const where = department && department !== "all" ? { department } : {};
  // "Latest Week Detail" means one week: clamp to the trailing 7 days of the
  // newest timesheet entry, or every re-import silently multiplies the table.
  const edge = await prisma.laborEntry.aggregate({ _max: { date: true } });
  const weekWhere = edge._max.date ? { date: { gte: new Date(edge._max.date.getTime() - 6 * 86400000) } } : {};
  const [rows, allDepts] = await Promise.all([
    prisma.laborEntry.findMany({ where: { ...where, ...weekWhere }, orderBy: { date: "asc" } }),
    prisma.laborEntry.findMany({ select: { department: true }, distinct: ["department"] }),
  ]);

  const empMap = new Map<string, LaborDetail["byEmployee"][number] & { rateSum: number; rateN: number }>();
  const deptMap = new Map<string, { hours: number; otHours: number; cost: number; emps: Set<string>; rateSum: number; rateN: number }>();
  let start: string | null = null;
  let end: string | null = null;

  for (const r of rows) {
    const dt = iso(r.date);
    if (!start || dt < start) start = dt;
    if (!end || dt > end) end = dt;

    const reg = n(r.regularHours) ?? 0;
    const ot = n(r.otHours) ?? 0;
    const cost = n(r.paidTotal) ?? 0;
    const rate = n(r.hourlyRate);
    const name = [r.firstName, r.lastName].filter(Boolean).join(" ") || r.employeeId || "Unknown";
    const key = r.employeeId || name;
    const dept = r.department ?? "—";

    const e = empMap.get(key) ?? {
      name, employeeId: r.employeeId ?? null, department: r.department ?? null,
      regularHours: 0, otHours: 0, hours: 0, cost: 0, avgRate: null, rateSum: 0, rateN: 0,
    };
    e.regularHours += reg; e.otHours += ot; e.hours += reg + ot; e.cost += cost;
    if (rate != null) { e.rateSum += rate; e.rateN++; }
    empMap.set(key, e);

    const d = deptMap.get(dept) ?? { hours: 0, otHours: 0, cost: 0, emps: new Set<string>(), rateSum: 0, rateN: 0 };
    d.hours += reg + ot; d.otHours += ot; d.cost += cost; d.emps.add(key);
    if (rate != null) { d.rateSum += rate; d.rateN++; }
    deptMap.set(dept, d);
  }

  const byEmployee = [...empMap.values()]
    .map((e) => ({ ...e, avgRate: e.rateN ? e.rateSum / e.rateN : null }))
    .map(({ rateSum, rateN, ...e }) => e)
    .sort((a, b) => b.cost - a.cost);

  const byDepartment = [...deptMap.entries()]
    .map(([department, d]) => ({
      department,
      hours: d.hours,
      otHours: d.otHours,
      cost: d.cost,
      headcount: d.emps.size,
      avgRate: d.rateN ? d.rateSum / d.rateN : null,
    }))
    .sort((a, b) => b.cost - a.cost);

  return {
    dateRange: { start, end },
    totals: {
      hours: byEmployee.reduce((s, e) => s + e.hours, 0),
      cost: byEmployee.reduce((s, e) => s + e.cost, 0),
      headcount: byEmployee.length,
    },
    departments: allDepts
      .map((d) => ({ department: d.department ?? "—" }))
      .filter((d) => d.department !== "—")
      .sort((a, b) => a.department.localeCompare(b.department)),
    byDepartment,
    byEmployee,
  };
}

// ---------------------------------------------------------------------------
// Forward planning — capacity vs demand, events, future capacity, anomalies.
// STUB until When I Work (schedule) + Caterease/CaterTrax (bookings) connect.
// Demand reflects that delivery is short-lead (1–2 wks) and catering is
// predictable; weddings land on weekends, corporate delivery on weekdays.
// ---------------------------------------------------------------------------
export interface ForwardPlanning {
  today: string | null;
  demandFactor: number; // next-2wk vs recent-2wk revenue (seasonal)
  coverage: {
    dept: string;
    scheduledHours: number;
    ptoHours: number;
    availableHours: number;
    demandHours: number;
    gapHours: number;
    status: "short" | "ok" | "over";
    recommendation: string;
  }[];
  events: {
    date: string;
    name: string;
    line: string;
    requiredHours: number;
    depts: string[];
    status: "short" | "tight" | "covered";
    recommendation: string;
  }[];
  capacityWeeks: { week: string; capacity: number; demand: number }[];
  pto: { name: string; dept: string; dates: string }[];
  anomalies: { employee: string; dept: string; severity: "warn" | "info"; title: string; detail: string }[];
}

// Demand sensitivity by department (catering/delivery spike; cafe/sales steady).
const DEMAND_SENSITIVE = /cater|event|artistry|delivery|cold|hot|steward/i;

export async function getForwardPlanning(): Promise<ForwardPlanning> {
  const [entries, rollups, metrics] = await Promise.all([
    prisma.laborEntry.findMany({}),
    prisma.weeklyRollup.findMany({ orderBy: { weekStart: "asc" } }),
    prisma.dailyMetric.findMany({ orderBy: { date: "asc" } }),
  ]);

  const today = metrics.filter((m) => n(m.netSales) != null).map((m) => iso(m.date)).slice(-1)[0] ?? null;

  // Weekly baseline hours + headcount + avg rate per department, from the
  // LATEST timesheet week only — unfiltered entries would treat 5+ imported
  // weeks as one week's schedule and inflate every capacity number ~5×.
  const maxEntryDate = entries.reduce<Date | null>((mx, r) => (mx == null || r.date > mx ? r.date : mx), null);
  const weekEntries = maxEntryDate
    ? entries.filter((r) => r.date.getTime() > maxEntryDate.getTime() - 7 * 86400000)
    : entries;
  const dept = new Map<string, { hours: number; cost: number; emps: Set<string>; rate: number; rateN: number }>();
  const emp = new Map<string, { name: string; dept: string; hours: number; ot: number; rate: number | null; cost: number }>();
  for (const r of weekEntries) {
    const d = r.department ?? "—";
    const hrs = (n(r.regularHours) ?? 0) + (n(r.otHours) ?? 0);
    const rate = n(r.hourlyRate);
    const key = r.employeeId || [r.firstName, r.lastName].join(" ");
    const dd = dept.get(d) ?? { hours: 0, cost: 0, emps: new Set<string>(), rate: 0, rateN: 0 };
    dd.hours += hrs; dd.cost += n(r.paidTotal) ?? 0; dd.emps.add(key);
    if (rate != null) { dd.rate += rate; dd.rateN++; }
    dept.set(d, dd);
    const e = emp.get(key) ?? { name: [r.firstName, r.lastName].filter(Boolean).join(" ") || key, dept: d, hours: 0, ot: 0, rate, cost: 0 };
    e.hours += hrs; e.ot += n(r.otHours) ?? 0; e.cost += n(r.paidTotal) ?? 0;
    emp.set(key, e);
  }

  // Seasonal demand factor: next 2 weeks (prior-year shape × YoY) vs recent 2.
  const wk = rollups.filter((r) => iso(r.weekStart).startsWith("2026")).map((r) => ({ week: iso(r.weekStart), rev: n(r.totalRevenue) ?? 0, rev25: n(r.revenuePrev1) ?? 0 })).sort((a, b) => (a.week < b.week ? -1 : 1));
  const actual = wk.filter((w) => w.rev > 0);
  // Trailing-8 matched-week pace (see getPulse) — full-year pace overshoots.
  const matched = actual.filter((w) => w.rev25 > 0);
  const paceWks = matched.length >= 3 ? matched.slice(-8) : matched;
  let yA = 0, yB = 0;
  for (const w of paceWks) { yA += w.rev; yB += w.rev25; }
  const g = yB > 0 ? yA / yB : 1;
  const lastIdx = wk.findIndex((w) => w.week === (actual[actual.length - 1]?.week ?? ""));
  const recent2 = actual.slice(-2).reduce((s, w) => s + w.rev, 0) || 1;
  const next2 = wk.slice(lastIdx + 1, lastIdx + 3).reduce((s, w) => s + (w.rev25 > 0 ? w.rev25 * g : recent2 / 2), 0);
  const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
  // Clamp: irregular weekly buckets make the raw ratio noisy.
  const demandFactor = clamp(next2 / recent2, 0.95, 1.25);

  // Stubbed PTO next week — top employee in two demand-sensitive depts.
  const sortedEmps = [...emp.values()].sort((a, b) => b.hours - a.hours);
  const pto: ForwardPlanning["pto"] = [];
  const ptoByDept = new Map<string, number>();
  for (const e of sortedEmps) {
    if (pto.length >= 2) break;
    if (DEMAND_SENSITIVE.test(e.dept) && !pto.some((p) => p.dept === e.dept)) {
      pto.push({ name: e.name, dept: e.dept, dates: "next week" });
      ptoByDept.set(e.dept, (ptoByDept.get(e.dept) ?? 0) + e.hours);
    }
  }

  // Upcoming events (next 14 days) — stubbed bookings drive incremental demand.
  const events: ForwardPlanning["events"] = [];
  const eventBump = new Map<string, number>();
  if (today) {
    const dow = (iso2: string) => new Date(`${iso2}T00:00:00Z`).getUTCDay();
    const addBump = (depts: string[], hrs: number) => {
      const per = (hrs * 0.5) / depts.length; // ~half the event hours are incremental
      for (const d of depts) eventBump.set(d, (eventBump.get(d) ?? 0) + per);
    };
    for (let i = 1; i <= 14 && events.length < 6; i++) {
      const dt = addDays(today, i);
      const day = dow(dt);
      if (day === 6) { const depts = ["Cater Hot", "Cater Cold", "Event Staff", "Stewards"]; addBump(depts, 96); events.push({ date: dt, name: "Wedding reception", line: "Events / Catering", requiredHours: 96, depts, status: "short", recommendation: "Confirm event staff + stewards 2 days prior; add a shift" }); }
      else if (day === 0) { const depts = ["Cater Hot", "Event Staff"]; addBump(depts, 40); events.push({ date: dt, name: "Sunday brunch catering", line: "Catering", requiredHours: 40, depts, status: "tight", recommendation: "Verify a driver for delivery" }); }
      else if (day === 2 || day === 4) { const depts = ["Delivery", "Cater Hot"]; addBump(depts, 28); events.push({ date: dt, name: "Corporate lunch delivery", line: "Delivery", requiredHours: 28, depts, status: "tight", recommendation: "Short-lead: confirm 2 drivers by T-2 days; shift a Cafe hand if needed" }); }
    }
  }

  // Department coverage (next 2 weeks): available labor vs ongoing + event demand.
  const coverage: ForwardPlanning["coverage"] = [...dept.entries()]
    .filter(([d]) => d !== "—")
    .map(([d, v]) => {
      const scheduledHours = v.hours * 2; // two weeks at last week's level
      const ptoHours = ptoByDept.get(d) ?? 0;
      const availableHours = Math.max(0, scheduledHours - ptoHours);
      const demandHours = v.hours * 2 * demandFactor + (eventBump.get(d) ?? 0);
      const gapHours = availableHours - demandHours;
      const status: "short" | "ok" | "over" = gapHours < -4 ? "short" : gapHours > Math.max(8, demandHours * 0.15) ? "over" : "ok";
      const shifts = Math.max(1, Math.ceil(Math.abs(gapHours) / 8));
      const recommendation =
        status === "short"
          ? `Short ~${Math.round(Math.abs(gapHours))}h — add ~${shifts} shift${shifts > 1 ? "s" : ""}${eventBump.get(d) ? " (booked events)" : ""}${ptoByDept.get(d) ? " + cover PTO" : ""}`
          : status === "over"
            ? `~${Math.round(gapHours)}h slack — shift to prep or trim`
            : "Coverage adequate";
      return { dept: d, scheduledHours, ptoHours, availableHours, demandHours, gapHours, status, recommendation };
    })
    .sort((a, b) => a.gapHours - b.gapHours);

  // Tie each event's status to whether its departments are short.
  const shortDepts = new Set(coverage.filter((c) => c.status === "short").map((c) => c.dept));
  for (const e of events) {
    const anyShort = e.depts.some((d) => shortDepts.has(d));
    e.status = anyShort ? "short" : e.status === "covered" ? "covered" : "tight";
    if (anyShort) e.recommendation = `${e.depts.filter((d) => shortDepts.has(d)).join(", ")} short — pull from a lighter dept or add a shift`;
  }

  // Forward capacity vs demand — next 6 weeks (capacity dips for stubbed PTO).
  const totalBaseline = [...dept.values()].reduce((s, v) => s + v.hours, 0);
  const ptoTotal = [...ptoByDept.values()].reduce((s, v) => s + v, 0);
  const eventBumpTotal = [...eventBump.values()].reduce((s, v) => s + v, 0) / 2; // per-week avg
  const capacityWeeks: ForwardPlanning["capacityWeeks"] = [];
  if (today && lastIdx >= 0) {
    for (let w = 1; w <= 6; w++) {
      const wkRow = wk[lastIdx + w];
      const weekRev25 = wkRow?.rev25 ?? 0;
      const factor = clamp(weekRev25 > 0 ? (weekRev25 * g) / (recent2 / 2) : demandFactor, 0.9, 1.35);
      capacityWeeks.push({
        week: wkRow?.week ?? addDays(today, w * 7),
        capacity: Math.round(totalBaseline - (w === 1 ? ptoTotal : ptoTotal * 0.4)),
        demand: Math.round(totalBaseline * factor + eventBumpTotal),
      });
    }
  }

  // Anomalies from the timesheet week (cross-sectional; trends need history).
  const deptAvg = new Map<string, number>();
  for (const [d, v] of dept) deptAvg.set(d, v.emps.size ? v.hours / v.emps.size : 0);
  const anomalies: ForwardPlanning["anomalies"] = [];
  for (const e of sortedEmps) {
    const avg = deptAvg.get(e.dept) ?? 0;
    if (e.ot > 0) anomalies.push({ employee: e.name, dept: e.dept, severity: "warn", title: "Overtime logged", detail: `${e.ot.toFixed(1)}h OT this week` });
    else if (avg && e.hours > avg * 1.4) anomalies.push({ employee: e.name, dept: e.dept, severity: "warn", title: "High hours vs dept", detail: `${e.hours.toFixed(1)}h vs ${avg.toFixed(1)}h dept avg` });
    else if (avg && e.hours > 0 && e.hours < avg * 0.4) anomalies.push({ employee: e.name, dept: e.dept, severity: "info", title: "Low hours vs dept", detail: `${e.hours.toFixed(1)}h vs ${avg.toFixed(1)}h dept avg` });
  }
  anomalies.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "warn" ? -1 : 1));

  return { today, demandFactor, coverage, events, capacityWeeks, pto, anomalies: anomalies.slice(0, 8) };
}

// ---------------------------------------------------------------------------
// Staffing outlook — REAL scheduled shifts (When I Work schedule import) vs
// projected demand. Demand per day = per-weekday norms from the last 4 weeks
// of actuals, scaled up when bookings land on the day. This is the "are we
// over/under-staffed next week?" signal Kevin currently eyeballs by hand.
// ---------------------------------------------------------------------------
export interface StaffingDay {
  date: string;
  scheduledHours: number;
  scheduledCost: number;
  headcount: number;
  projectedSales: number | null;
  expectedHours: number | null; // weekday-typical hours × demand ratio
  gapHours: number | null; // scheduled − expected
  scheduledLaborPct: number | null; // scheduled cost ÷ projected sales
  status: "short" | "ok" | "over" | "unknown";
  events: { name: string; revenue: number | null; guests: number | null }[];
}

export interface StaffingDept {
  department: string;
  scheduledHours: number;
  scheduledCost: number;
  headcount: number;
  typicalHours: number | null; // avg weekly hours, recent timesheet weeks
  gapHours: number | null;
  status: "short" | "ok" | "over" | "unknown";
}

export interface StaffingOutlook {
  window: { from: string; to: string };
  totals: {
    scheduledHours: number;
    scheduledCost: number;
    headcount: number;
    projectedSales: number | null;
    scheduledLaborPct: number | null;
    benchmarkLaborPct: number | null; // recent actual daily labor %
  };
  days: StaffingDay[];
  byDepartment: StaffingDept[];
  callouts: { severity: "alert" | "warn" | "ok"; text: string }[];
}

const HOUR_TOLERANCE = 0.15; // ±15% of expected hours reads as "ok"

export async function getStaffingOutlook(): Promise<StaffingOutlook | null> {
  const [shifts, metrics, laborEntries, bookings] = await Promise.all([
    prisma.scheduledShift.findMany({ orderBy: { date: "asc" } }),
    prisma.dailyMetric.findMany({ orderBy: { date: "asc" } }),
    prisma.laborEntry.findMany({}),
    prisma.eventBooking.findMany({}),
  ]);
  if (!shifts.length) return null;

  // Data edge: the last day with real sales. Shifts beyond it are "upcoming".
  const actualDays = metrics.filter((m) => n(m.netSales) != null);
  const latestDate = actualDays.length ? iso(actualDays[actualDays.length - 1].date) : null;
  const upcoming = shifts.filter((s) => !latestDate || iso(s.date) > latestDate);
  if (!upcoming.length) return null;

  // Per-weekday norms from the last 4 weeks of actuals (mirrors the forward
  // ledger: labor is scheduled per weekday, not a % of a slow Monday's sales).
  const lookback = latestDate ? addDays(latestDate, -27) : null;
  const recent = actualDays.filter((m) => !lookback || (iso(m.date) > lookback && iso(m.date) <= latestDate!));
  const salesByDow = new Map<number, number[]>();
  const push = (m: Map<number, number[]>, k: number, v: number) => {
    const arr = m.get(k);
    if (arr) arr.push(v);
    else m.set(k, [v]);
  };
  let recLabor = 0, recSales = 0;
  for (const m of recent) {
    const dow = m.date.getUTCDay();
    push(salesByDow, dow, n(m.netSales)!);
    const lc = n(m.laborCost);
    if (lc != null && n(m.netSales)) { recLabor += lc; recSales += n(m.netSales)!; }
  }

  // Typical hours per weekday come from the WIW TIMESHEET history — the same
  // universe of people the schedule export covers. (DailyMetric.laborHours
  // spans all payroll, which runs ~40% higher and over-flags "short".)
  // Averaged over the last 4 weeks of timesheet data, anchored to the
  // timesheet's own edge since it lags the sales feed.
  const hoursByDate = new Map<string, number>();
  for (const r of laborEntries) {
    const d = iso(r.date);
    hoursByDate.set(d, (hoursByDate.get(d) ?? 0) + (n(r.regularHours) ?? 0) + (n(r.otHours) ?? 0));
  }
  const leDates = [...hoursByDate.keys()].sort();
  const leEdge = leDates[leDates.length - 1] ?? null;
  const leLookback = leEdge ? addDays(leEdge, -27) : null;
  const hoursByDow = new Map<number, number[]>();
  for (const [d, h] of hoursByDate) {
    if (leLookback && d <= leLookback) continue;
    push(hoursByDow, new Date(`${d}T00:00:00Z`).getUTCDay(), h);
  }
  const avgOf = (m: Map<number, number[]>, k: number): number | null => {
    const arr = m.get(k);
    return arr?.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  };
  const benchmarkLaborPct = recSales ? recLabor / recSales : null;

  // Booked events by date (real bookings only — no stubs here).
  const eventsByDate = new Map<string, { name: string; revenue: number | null; guests: number | null }[]>();
  for (const b of bookings) {
    const d = iso(b.eventDate);
    const arr = eventsByDate.get(d) ?? [];
    arr.push({ name: b.name ?? "(unnamed event)", revenue: n(b.revenue), guests: b.guests ?? null });
    eventsByDate.set(d, arr);
  }

  // Group upcoming shifts per day.
  const byDay = new Map<string, { hours: number; cost: number; emps: Set<string> }>();
  const byDept = new Map<string, { hours: number; cost: number; emps: Set<string> }>();
  for (const s of upcoming) {
    const d = iso(s.date);
    const hrs = n(s.hours) ?? 0;
    const cost = n(s.laborCost) ?? (n(s.hours) != null && n(s.hourlyRate) != null ? n(s.hours)! * n(s.hourlyRate)! : 0);
    const key = s.employeeId || [s.firstName, s.lastName].join(" ");
    const dd = byDay.get(d) ?? { hours: 0, cost: 0, emps: new Set<string>() };
    dd.hours += hrs; dd.cost += cost; dd.emps.add(key);
    byDay.set(d, dd);
    const dept = s.department ?? "—";
    const dp = byDept.get(dept) ?? { hours: 0, cost: 0, emps: new Set<string>() };
    dp.hours += hrs; dp.cost += cost; dp.emps.add(key);
    byDept.set(dept, dp);
  }

  const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
  const shiftDates = [...byDay.keys()].sort();
  const from = shiftDates[0], to = shiftDates[shiftDates.length - 1];
  // Walk every day in the window — a zero-shift day with typical demand is
  // the worst staffing miss, and it wouldn't appear in the shift grouping.
  const dayDates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dayDates.push(d);

  const days: StaffingDay[] = dayDates.map((d) => {
    const v = byDay.get(d) ?? { hours: 0, cost: 0, emps: new Set<string>() };
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    const baseSales = avgOf(salesByDow, dow);
    const dayEvents = eventsByDate.get(d) ?? [];
    const eventRev = dayEvents.reduce((s, e) => s + (e.revenue ?? 0), 0);
    const projectedSales = baseSales != null ? Math.round(baseSales + eventRev) : eventRev || null;
    // Demand ratio scales weekday-typical hours when bookings add volume.
    const ratio = baseSales ? clamp((baseSales + eventRev) / baseSales, 1, 2) : 1;
    const typicalHours = avgOf(hoursByDow, dow);
    const expectedHours = typicalHours != null ? typicalHours * ratio : null;
    const gapHours = expectedHours != null ? v.hours - expectedHours : null;
    const status: StaffingDay["status"] =
      expectedHours == null || expectedHours === 0
        ? "unknown"
        : v.hours < expectedHours * (1 - HOUR_TOLERANCE)
          ? "short"
          : v.hours > expectedHours * (1 + HOUR_TOLERANCE)
            ? "over"
            : "ok";
    return {
      date: d,
      scheduledHours: Math.round(v.hours * 10) / 10,
      scheduledCost: Math.round(v.cost),
      headcount: v.emps.size,
      projectedSales,
      expectedHours: expectedHours != null ? Math.round(expectedHours * 10) / 10 : null,
      gapHours: gapHours != null ? Math.round(gapHours * 10) / 10 : null,
      scheduledLaborPct: projectedSales ? v.cost / projectedSales : null,
      status,
      events: dayEvents,
    };
  });

  // Department view: scheduled week vs avg weekly dept hours from recent
  // timesheet weeks (LaborEntry history).
  const deptWeekly = new Map<string, Map<string, number>>(); // dept -> week -> hours
  for (const r of laborEntries) {
    const dept = r.department ?? "—";
    const d = iso(r.date);
    const dowN = new Date(`${d}T00:00:00Z`).getUTCDay();
    const weekStart = addDays(d, -((dowN + 6) % 7)); // Monday
    const wk = deptWeekly.get(dept) ?? new Map<string, number>();
    wk.set(weekStart, (wk.get(weekStart) ?? 0) + (n(r.regularHours) ?? 0) + (n(r.otHours) ?? 0));
    deptWeekly.set(dept, wk);
  }
  const typicalDeptHours = (dept: string): number | null => {
    const wk = deptWeekly.get(dept);
    if (!wk?.size) return null;
    const weeks = [...wk.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-4);
    return weeks.reduce((s, [, h]) => s + h, 0) / weeks.length;
  };

  const byDepartment: StaffingDept[] = [...byDept.entries()]
    .map(([department, v]) => {
      const typical = typicalDeptHours(department);
      const gap = typical != null ? v.hours - typical : null;
      const status: StaffingDept["status"] =
        typical == null
          ? "unknown"
          : v.hours < typical * (1 - HOUR_TOLERANCE) - 2
            ? "short"
            : v.hours > typical * (1 + HOUR_TOLERANCE) + 2
              ? "over"
              : "ok";
      return {
        department,
        scheduledHours: Math.round(v.hours * 10) / 10,
        scheduledCost: Math.round(v.cost),
        headcount: v.emps.size,
        typicalHours: typical != null ? Math.round(typical * 10) / 10 : null,
        gapHours: gap != null ? Math.round(gap * 10) / 10 : null,
        status,
      };
    })
    .sort((a, b) => (a.gapHours ?? 0) - (b.gapHours ?? 0));

  const totalsHours = days.reduce((s, d) => s + d.scheduledHours, 0);
  const totalsCost = days.reduce((s, d) => s + d.scheduledCost, 0);
  const projTotal = days.every((d) => d.projectedSales == null) ? null : days.reduce((s, d) => s + (d.projectedSales ?? 0), 0);
  const headcount = new Set(upcoming.map((s) => s.employeeId || [s.firstName, s.lastName].join(" "))).size;

  // Callouts — the 1–3 things worth saying out loud on the main dashboard.
  const callouts: StaffingOutlook["callouts"] = [];
  const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const shortDays = days.filter((d) => d.status === "short").sort((a, b) => (a.gapHours ?? 0) - (b.gapHours ?? 0));
  const overDays = days.filter((d) => d.status === "over").sort((a, b) => (b.gapHours ?? 0) - (a.gapHours ?? 0));
  if (shortDays.length) {
    const w = shortDays[0];
    callouts.push({
      severity: "alert",
      text: `${fmtDay(w.date)} looks understaffed: ${w.scheduledHours}h scheduled vs ~${w.expectedHours}h typical${w.events.length ? ` with ${w.events.length} booked event${w.events.length > 1 ? "s" : ""}` : ""} — add ~${Math.ceil(Math.abs(w.gapHours ?? 0) / 8)} shift${Math.abs(w.gapHours ?? 0) > 8 ? "s" : ""}.`,
    });
  }
  if (overDays.length) {
    const w = overDays[0];
    callouts.push({
      severity: "warn",
      text: `${fmtDay(w.date)} looks overstaffed: ${w.scheduledHours}h vs ~${w.expectedHours}h typical (+${w.gapHours}h) — ~${money0(w.scheduledCost - Math.round((w.expectedHours ?? 0) * (w.scheduledHours ? w.scheduledCost / w.scheduledHours : 0)))} of trimmable labor.`,
    });
  }
  const worstDept = byDepartment.find((d) => d.status === "short");
  if (worstDept) {
    callouts.push({
      severity: "warn",
      text: `${worstDept.department} is scheduled ${Math.abs(worstDept.gapHours ?? 0)}h under its recent weekly average (${worstDept.scheduledHours}h vs ~${worstDept.typicalHours}h).`,
    });
  }
  if (!callouts.length) {
    callouts.push({ severity: "ok", text: `Schedule tracks recent staffing levels — ${Math.round(totalsHours)}h across ${headcount} people.` });
  }

  return {
    window: { from, to },
    totals: {
      scheduledHours: Math.round(totalsHours * 10) / 10,
      scheduledCost: Math.round(totalsCost),
      headcount,
      projectedSales: projTotal,
      scheduledLaborPct: projTotal ? totalsCost / projTotal : null,
      benchmarkLaborPct,
    },
    days,
    byDepartment,
    callouts: callouts.slice(0, 3),
  };
}

const money0 = (v: number) => `$${Math.round(Math.abs(v)).toLocaleString("en-US")}`;
