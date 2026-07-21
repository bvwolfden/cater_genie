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
  sales: { current: number | null; prior: number | null; deltaPct: number | null };
  labor: { current: number | null; prior: number | null; deltaPct: number | null };
  laborPct: { current: number | null; prior: number | null };
}

export interface WeeklyKpis {
  from: string | null;
  to: string | null;
  netSales: number;
  netSalesPrev: number;
  laborCost: number;
  laborPct: number | null;
  laborPctPrev: number | null;
  hours: number;
  hoursPrev: number;
  food: number;
  foodPrev: number;
  cash: number | null;
  cashPrev: number | null;
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
  weeklyKpis: WeeklyKpis;
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

// Monthly aggregation of weekly rollups (2026 calendar months only).
type MonthAgg = { s26: number; s25: number; l26: number; l25: number; l24: number; weeks: number };
const emptyMonth = (): MonthAgg => ({ s26: 0, s25: 0, l26: 0, l25: 0, l24: 0, weeks: 0 });

function monthlyBuckets(
  rows: { weekStart: Date; totalRevenue: unknown; revenuePrev1: unknown; laborCost: unknown; laborPrev1: unknown; laborPrev2: unknown }[]
): Map<string, MonthAgg> {
  const m = new Map<string, MonthAgg>();
  for (const r of rows) {
    const ym = iso(r.weekStart).slice(0, 7);
    if (!ym.startsWith("2026")) continue;
    const a = m.get(ym) ?? emptyMonth();
    const rev = n(r.totalRevenue) ?? 0;
    a.s26 += rev;
    a.s25 += n(r.revenuePrev1) ?? 0;
    a.l26 += n(r.laborCost) ?? 0;
    a.l25 += n(r.laborPrev1) ?? 0;
    a.l24 += n(r.laborPrev2) ?? 0;
    if (rev > 0) a.weeks += 1;
    m.set(ym, a);
  }
  return m;
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
}): Promise<Dashboard> {
  const targetDate = opts?.date;
  const [metrics, balanceRows, deptGroups, channelRows, rollupRows, deptEmp] =
    await Promise.all([
      prisma.dailyMetric.findMany({ orderBy: { date: "asc" } }),
      prisma.accountBalance.findMany({ orderBy: { date: "asc" } }),
      prisma.laborEntry.groupBy({
        by: ["department"],
        _sum: { regularHours: true, otHours: true, paidTotal: true },
      }),
      prisma.weeklyChannelRevenue.findMany({ orderBy: { weekStart: "asc" } }),
      prisma.weeklyRollup.findMany({ orderBy: { weekStart: "asc" } }),
      prisma.laborEntry.groupBy({ by: ["department", "employeeId"] }),
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
  // the most recent day with data.
  let anchorIdx = withSales.length - 1;
  if (targetDate) {
    anchorIdx = -1;
    for (let i = 0; i < withSales.length; i++) {
      if (withSales[i].date <= targetDate) anchorIdx = i;
    }
    if (anchorIdx < 0) anchorIdx = withSales.length - 1;
  }
  const latest = withSales[anchorIdx] ?? overallLatest;
  const prev = anchorIdx > 0 ? withSales[anchorIdx - 1] : null;
  const latestDate = overallLatest?.date ?? null;
  const selectedDate = latest?.date ?? null;

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
  let wkPaceNum = 0, wkPaceDen = 0;
  for (const w of wkActuals) if ((w.priorYear ?? 0) > 0) { wkPaceNum += w.total!; wkPaceDen += w.priorYear!; }
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

  // --- Date range (sales & labor) -----------------------------------------
  let rangeTo = opts?.to || selectedDate || latestDate;
  let rangeFrom = opts?.from || (rangeTo ? addDays(rangeTo, -29) : null);
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
  const sd = selectedDate;
  let weeklyKpis: WeeklyKpis;
  if (sd) {
    const tFrom = addDays(sd, -6), tTo = sd;
    const lFrom = addDays(sd, -13), lTo = addDays(sd, -7);
    const net = sumRange(tFrom, tTo, (d) => d.netSales);
    const netP = sumRange(lFrom, lTo, (d) => d.netSales);
    const lab = sumRange(tFrom, tTo, (d) => d.laborCost);
    const labP = sumRange(lFrom, lTo, (d) => d.laborCost);
    const weekSpark = (pick: (d: DayPoint) => number | null) => {
      const out: number[] = [];
      for (let w = 7; w >= 0; w--) {
        const to = addDays(sd, -7 * w);
        out.push(sumRange(addDays(to, -6), to, pick));
      }
      return out;
    };
    const laborPctSpark: number[] = [];
    const cashSpark: number[] = [];
    for (let w = 7; w >= 0; w--) {
      const to = addDays(sd, -7 * w);
      const s = sumRange(addDays(to, -6), to, (d) => d.netSales);
      const l = sumRange(addDays(to, -6), to, (d) => d.laborCost);
      laborPctSpark.push(s ? l / s : 0);
      cashSpark.push(cashAsOf(to) ?? 0);
    }
    weeklyKpis = {
      from: tFrom, to: tTo,
      netSales: net, netSalesPrev: netP,
      laborCost: lab,
      laborPct: net ? lab / net : null,
      laborPctPrev: netP ? labP / netP : null,
      hours: sumRange(tFrom, tTo, (d) => d.laborHours),
      hoursPrev: sumRange(lFrom, lTo, (d) => d.laborHours),
      food: sumRange(tFrom, tTo, (d) => d.foodPurchases),
      foodPrev: sumRange(lFrom, lTo, (d) => d.foodPurchases),
      cash: cashAsOf(tTo),
      cashPrev: cashAsOf(lTo),
      spark: { net: weekSpark((d) => d.netSales), laborPct: laborPctSpark, hours: weekSpark((d) => d.laborHours), food: weekSpark((d) => d.foodPurchases), cash: cashSpark },
    };
  } else {
    weeklyKpis = { from: null, to: null, netSales: 0, netSalesPrev: 0, laborCost: 0, laborPct: null, laborPctPrev: null, hours: 0, hoursPrev: 0, food: 0, foodPrev: 0, cash: null, cashPrev: null, spark: { net: [], laborPct: [], hours: [], food: [], cash: [] } };
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
    const avg = (m: Map<number, number[]>, k: number): number | null => {
      const arr = m.get(k);
      return arr?.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    };
    // Blended ratio only as a fallback for weekdays with no labor history.
    let lp = 0, ls = 0;
    for (const d of recentDays) if (d.laborCost != null && d.netSales) { lp += d.laborCost; ls += d.netSales; }
    const dailyLaborPct = ls ? lp / ls : 0.2;
    for (let i = 1; i <= 10; i++) {
      const dt = addDays(latestDate, i);
      const dow = new Date(`${dt}T00:00:00Z`).getUTCDay();
      const nsAvg = avg(byDow, dow);
      const ns = nsAvg != null ? Math.round(nsAvg) : null;
      const lcAvg = avg(byDowLabor, dow);
      const lc = lcAvg != null ? Math.round(lcAvg) : ns != null ? Math.round(ns * dailyLaborPct) : null;
      const lhAvg = avg(byDowHours, dow);
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
  const monthly = monthlyBuckets(rollupRows);
  // Anchor MoM/YoY to the latest COMPLETE month (≥4 weeks of data) so a
  // partial current month doesn't distort the comparison.
  const selYm = latestCompleteMonth(monthly);
  const prevKey = prevYm(selYm);
  const curMonth = monthly.get(selYm) ?? emptyMonth();
  const prevMonth = monthly.get(prevKey) ?? emptyMonth();

  const mom: PeriodComparison = {
    label: "Month over Month",
    currentLabel: ymLabel(selYm),
    priorLabel: ymLabel(prevKey),
    sales: { current: curMonth.s26 || null, prior: prevMonth.s26 || null, deltaPct: pctChange(curMonth.s26 || null, prevMonth.s26 || null) },
    labor: { current: curMonth.l26 || null, prior: prevMonth.l26 || null, deltaPct: pctChange(curMonth.l26 || null, prevMonth.l26 || null) },
    laborPct: { current: curMonth.s26 ? curMonth.l26 / curMonth.s26 : null, prior: prevMonth.s26 ? prevMonth.l26 / prevMonth.s26 : null },
  };
  const yoy: PeriodComparison = {
    label: "Year over Year",
    currentLabel: ymLabel(selYm),
    priorLabel: `${Number(selYm.slice(0, 4)) - 1}`,
    sales: { current: curMonth.s26 || null, prior: curMonth.s25 || null, deltaPct: pctChange(curMonth.s26 || null, curMonth.s25 || null) },
    labor: { current: curMonth.l26 || null, prior: curMonth.l25 || null, deltaPct: pctChange(curMonth.l26 || null, curMonth.l25 || null) },
    laborPct: { current: curMonth.s26 ? curMonth.l26 / curMonth.s26 : null, prior: curMonth.s25 ? curMonth.l25 / curMonth.s25 : null },
  };

  return {
    generatedAt: new Date().toISOString(),
    latestDate,
    selectedDate,
    availableDates,
    series,
    range,
    rangeSeries,
    comparisons: { mom, yoy },
    kpis: {
      netSales: latest?.netSales ?? null,
      netSalesPrev: prev?.netSales ?? null,
      laborCost: latest?.laborCost ?? null,
      laborPct: latest?.laborPct ?? null,
      laborHours: latest?.laborHours ?? null,
      foodPurchases: latest?.foodPurchases ?? null,
      mtdNetSales: mtd.count ? mtd.net : null,
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
    weeklyKpis,
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
  assumptions: { yoyGrowthPct: number; laborPct: number; foodPct: number };
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

  // YoY pace: 2026 vs 2025 over the SAME matched weeks (drives the seasonal scale).
  let yoyA = 0, yoyB = 0;
  for (const w of actualWeeks) if (w.rev25 > 0) { yoyA += w.rev; yoyB += w.rev25; }
  const yoyGrowth = yoyB > 0 ? yoyA / yoyB - 1 : 0;
  const g = 1 + yoyGrowth;
  const recentBase = actualWeeks.length ? actualWeeks.slice(-4).reduce((s, w) => s + w.rev, 0) / Math.min(4, actualWeeks.length) : 0;

  const weekly = (rev: number, actualLabor: number | null) => {
    const wl = actualLabor && actualLabor > 0 ? actualLabor : laborPct * rev;
    const food = foodPct * rev;
    const gross = rev - wl - food; // gross margin: after labor + food
    const cost = wl + food + OPEX_PCT * rev + FIXED_WEEKLY; // + stubbed opex/debt/interest
    return { gross, cost };
  };

  const points: PulsePoint[] = [];
  let cumRev = 0, cumCost = 0, cumProfit = 0, cumGross = 0, cumPrior = 0;
  let pRev = 0, pCost = 0, pProfit = 0, pGross = 0;
  let crossed = false;
  for (const w of yr) {
    cumPrior += w.rev25;
    const isActual = lastWeek != null && w.week <= lastWeek;
    if (isActual) {
      const { gross, cost } = weekly(w.rev, w.labor);
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
      const { gross, cost } = weekly(fr, null);
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
    assumptions: { yoyGrowthPct: yoyGrowth, laborPct, foodPct },
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

  // MoM / YoY (labor-focused) from weekly rollups — anchored to last complete month.
  const monthly = monthlyBuckets(rollups);
  const selYm = latestCompleteMonth(monthly);
  const prevKey = prevYm(selYm);
  const c = monthly.get(selYm) ?? emptyMonth();
  const p = monthly.get(prevKey) ?? emptyMonth();
  const mom: PeriodComparison = {
    label: "Month over Month",
    currentLabel: ymLabel(selYm),
    priorLabel: ymLabel(prevKey),
    sales: { current: c.s26 || null, prior: p.s26 || null, deltaPct: pctChange(c.s26 || null, p.s26 || null) },
    labor: { current: c.l26 || null, prior: p.l26 || null, deltaPct: pctChange(c.l26 || null, p.l26 || null) },
    laborPct: { current: c.s26 ? c.l26 / c.s26 : null, prior: p.s26 ? p.l26 / p.s26 : null },
  };
  const yoy: PeriodComparison = {
    label: "Year over Year",
    currentLabel: ymLabel(selYm),
    priorLabel: `${Number(selYm.slice(0, 4)) - 1}`,
    sales: { current: c.s26 || null, prior: c.s25 || null, deltaPct: pctChange(c.s26 || null, c.s25 || null) },
    labor: { current: c.l26 || null, prior: c.l25 || null, deltaPct: pctChange(c.l26 || null, c.l25 || null) },
    laborPct: { current: c.s26 ? c.l26 / c.s26 : null, prior: c.s25 ? c.l25 / c.s25 : null },
  };

  return {
    availableDates: weekStarts,
    range,
    weekly,
    ytdLabor,
    projectedYearEndLabor: projTotal,
    assumptions: { weeklyGrowthPct: weeklyGrowth, laborPct: blendedLaborPct },
    comparisons: { mom, yoy },
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
    scheduledHours: number; // STUB until When I Work schedule is connected
    cost: number;
    avgRate: number | null;
  }>;
}

export async function getLaborDetail(department?: string): Promise<LaborDetail> {
  const where = department && department !== "all" ? { department } : {};
  const [rows, allDepts] = await Promise.all([
    prisma.laborEntry.findMany({ where, orderBy: { date: "asc" } }),
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
      regularHours: 0, otHours: 0, hours: 0, scheduledHours: 0, cost: 0, avgRate: null, rateSum: 0, rateN: 0,
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
    .map((e) => ({ ...e, avgRate: e.rateN ? e.rateSum / e.rateN : null, scheduledHours: Math.round(e.hours) }))
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

  // Weekly baseline hours + headcount + avg rate per department (timesheet week).
  const dept = new Map<string, { hours: number; cost: number; emps: Set<string>; rate: number; rateN: number }>();
  const emp = new Map<string, { name: string; dept: string; hours: number; ot: number; rate: number | null; cost: number }>();
  for (const r of entries) {
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
  let yA = 0, yB = 0;
  for (const w of actual) if (w.rev25 > 0) { yA += w.rev; yB += w.rev25; }
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
