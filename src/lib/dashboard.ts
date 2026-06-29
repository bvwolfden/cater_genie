import "server-only";
import { prisma } from "./db";
import { connectors } from "./connectors";
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
  balances: Array<{
    account: AccountType;
    balance: number;
    prev: number | null;
    date: string;
  }>;
  laborByDept: Array<{ department: string; hours: number; cost: number }>;
  channelMix: Array<{ channel: SalesChannel; actual: number; projected: number }>;
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

export async function getDashboard(opts?: {
  date?: string;
  from?: string;
  to?: string;
}): Promise<Dashboard> {
  const targetDate = opts?.date;
  const [metrics, balanceRows, deptGroups, channelRows, rollupRows] =
    await Promise.all([
      prisma.dailyMetric.findMany({ orderBy: { date: "asc" } }),
      prisma.accountBalance.findMany({ orderBy: { date: "asc" } }),
      prisma.laborEntry.groupBy({
        by: ["department"],
        _sum: { regularHours: true, otHours: true, paidTotal: true },
      }),
      prisma.weeklyChannelRevenue.findMany({ orderBy: { weekStart: "asc" } }),
      prisma.weeklyRollup.findMany({ orderBy: { weekStart: "asc" } }),
    ]);

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

  const weekly = rollupRows
    .filter((r) => r.totalRevenue != null || r.projectedTotal != null)
    .map((r) => ({
      weekStart: iso(r.weekStart),
      total: n(r.totalRevenue),
      priorYear: n(r.revenuePrev1),
      projected: n(r.projectedTotal),
      laborPct: n(r.laborPct),
    }));

  // Source/connector status + latest sync run per source.
  const lastRuns = await prisma.syncRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
  });
  const latestRunBySource = new Map<SourceSystem, (typeof lastRuns)[number]>();
  for (const r of lastRuns) {
    if (!latestRunBySource.has(r.source)) latestRunBySource.set(r.source, r);
  }
  const sources = connectors.map((c) => {
    const s = c.status();
    const run = latestRunBySource.get(s.system);
    return {
      system: s.system,
      label: s.label,
      category: s.category,
      method: s.method,
      configured: s.configured,
      readiness: s.readiness,
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

  // --- MoM / YoY comparisons (from weekly rollups: has both years) ---------
  const ZERO = { s26: 0, s25: 0, l26: 0, l25: 0, l24: 0 };
  const monthly = new Map<string, typeof ZERO>();
  for (const r of rollupRows) {
    const ym = iso(r.weekStart).slice(0, 7);
    const m = monthly.get(ym) ?? { ...ZERO };
    m.s26 += n(r.totalRevenue) ?? 0;
    m.s25 += n(r.revenuePrev1) ?? 0;
    m.l26 += n(r.laborCost) ?? 0;
    m.l25 += n(r.laborPrev1) ?? 0;
    m.l24 += n(r.laborPrev2) ?? 0;
    monthly.set(ym, m);
  }
  const monthKeys = [...monthly.keys()].filter((key) => { const m = monthly.get(key)!; return m.s26 > 0 || m.l26 > 0; }).sort();
  let selYm = (selectedDate ?? latestDate ?? "").slice(0, 7);
  if (!monthly.has(selYm) && monthKeys.length) selYm = monthKeys[monthKeys.length - 1];
  const prevKey = prevYm(selYm);
  const curMonth = monthly.get(selYm) ?? { ...ZERO };
  const prevMonth = monthly.get(prevKey) ?? { ...ZERO };

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
    balances,
    laborByDept,
    channelMix,
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
}

export interface Pulse {
  points: PulsePoint[]; // cumulative across the year
  assumptions: { weeklyGrowthPct: number; laborPct: number; foodPct: number; overheadPct: number };
  ytd: { revenue: number; cost: number; profit: number; marginPct: number | null; throughWeek: string | null };
  projectedYearEnd: { revenue: number; cost: number; profit: number; marginPct: number | null };
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

  const weeks = rollups
    .filter((r) => n(r.totalRevenue) != null)
    .map((r) => ({ week: iso(r.weekStart), revenue: n(r.totalRevenue) ?? 0, labor: n(r.laborCost) ?? 0 }));

  const totRev = weeks.reduce((s, w) => s + w.revenue, 0);
  const totLabor = weeks.reduce((s, w) => s + w.labor, 0);
  const laborPct = totRev ? totLabor / totRev : 0.3;

  let foodSum = 0, foodRev = 0;
  for (const m of metrics) {
    const f = n(m.foodPurchases), s = n(m.netSales);
    if (f != null && s != null) { foodSum += f; foodRev += s; }
  }
  const foodPct = foodRev ? Math.min(0.6, foodSum / foodRev) : 0.3;
  const overheadPct = 0.08; // gas / utilities / other — tunable assumption

  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const rev = weeks.map((w) => w.revenue);
  const recent = avg(rev.slice(-4));
  const earlier = avg(rev.slice(-8, -4));
  let weeklyGrowth = earlier > 0 ? Math.pow(recent / earlier, 1 / 4) - 1 : 0;
  // Keep the forecast believable: cap sustained weekly growth tightly.
  weeklyGrowth = Math.max(-0.01, Math.min(0.01, weeklyGrowth));

  const points: PulsePoint[] = [];
  let cumRev = 0, cumCost = 0, cumProfit = 0;
  for (const w of weeks) {
    const cost = w.labor + foodPct * w.revenue + overheadPct * w.revenue;
    cumRev += w.revenue; cumCost += cost; cumProfit += w.revenue - cost;
    points.push({
      week: w.week,
      actualRevenue: cumRev, actualCost: cumCost, actualProfit: cumProfit,
      projRevenue: null, projCost: null, projProfit: null,
    });
  }

  const lastWeek = weeks.length ? weeks[weeks.length - 1].week : null;
  const ytd = {
    revenue: cumRev, cost: cumCost, profit: cumProfit,
    marginPct: cumRev ? cumProfit / cumRev : null, throughWeek: lastWeek,
  };

  // Connect the projection line to the actual line at the boundary.
  if (points.length) {
    const last = points[points.length - 1];
    last.projRevenue = last.actualRevenue;
    last.projCost = last.actualCost;
    last.projProfit = last.actualProfit;
  }

  let pRev = cumRev, pCost = cumCost, pProfit = cumProfit;
  const base = recent > 0 ? recent : rev.length ? rev[rev.length - 1] : 0;
  if (lastWeek) {
    const yearEnd = `${lastWeek.slice(0, 4)}-12-31`;
    let wk = lastWeek, k = 1;
    while (true) {
      wk = addDays(wk, 7);
      if (wk > yearEnd) break;
      const fr = base * Math.pow(1 + weeklyGrowth, k);
      const fc = laborPct * fr + foodPct * fr + overheadPct * fr;
      pRev += fr; pCost += fc; pProfit += fr - fc;
      points.push({
        week: wk,
        actualRevenue: null, actualCost: null, actualProfit: null,
        projRevenue: pRev, projCost: pCost, projProfit: pProfit,
      });
      k++;
    }
  }

  return {
    points,
    assumptions: { weeklyGrowthPct: weeklyGrowth, laborPct, foodPct, overheadPct },
    ytd,
    projectedYearEnd: { revenue: pRev, cost: pCost, profit: pProfit, marginPct: pRev ? pProfit / pRev : null },
  };
}

// ---------------------------------------------------------------------------
// Labor analysis — period/range, weekly trend + projection, MoM, YoY
// ---------------------------------------------------------------------------
export interface LaborAnalysis {
  availableDates: string[];
  range: { from: string | null; to: string | null; laborCost: number; hours: number; laborPct: number | null; days: number };
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

  // Range summary from daily labor (daily granularity available May–Jun).
  const dseries = metrics.map((m) => ({ date: iso(m.date), labor: n(m.laborCost), hours: n(m.laborHours), sales: n(m.netSales) }));
  const laborDates = dseries.filter((d) => d.labor != null).map((d) => d.date);
  const to = opts?.to || laborDates[laborDates.length - 1] || null;
  const from = opts?.from || laborDates[0] || null;
  const inRange = dseries.filter((d) => (!from || d.date >= from) && (!to || d.date <= to));
  const rLabor = inRange.reduce((s, d) => s + (d.labor ?? 0), 0);
  const rHours = inRange.reduce((s, d) => s + (d.hours ?? 0), 0);
  const rSales = inRange.reduce((s, d) => s + (d.sales ?? 0), 0);
  const range = { from, to, laborCost: rLabor, hours: rHours, laborPct: rSales ? rLabor / rSales : null, days: inRange.filter((d) => d.labor != null).length };

  // Weekly labor trend (2026 actual) + projection to year-end.
  const wk = rollups
    .filter((r) => n(r.laborCost) != null)
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

  // MoM / YoY (labor-focused) from weekly rollups.
  const ZERO = { s26: 0, s25: 0, l26: 0, l25: 0, l24: 0 };
  const monthly = new Map<string, typeof ZERO>();
  for (const r of rollups) {
    const ym = iso(r.weekStart).slice(0, 7);
    const m = monthly.get(ym) ?? { ...ZERO };
    m.s26 += n(r.totalRevenue) ?? 0;
    m.s25 += n(r.revenuePrev1) ?? 0;
    m.l26 += n(r.laborCost) ?? 0;
    m.l25 += n(r.laborPrev1) ?? 0;
    m.l24 += n(r.laborPrev2) ?? 0;
    monthly.set(ym, m);
  }
  const keys = [...monthly.keys()].filter((key) => { const m = monthly.get(key)!; return m.s26 > 0 || m.l26 > 0; }).sort();
  const selYm = keys[keys.length - 1] ?? "";
  const prevKey = prevYm(selYm);
  const c = monthly.get(selYm) ?? { ...ZERO };
  const p = monthly.get(prevKey) ?? { ...ZERO };
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
    availableDates: laborDates,
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
