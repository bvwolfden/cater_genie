import "server-only";
import { prisma } from "./db";
import { connectors } from "./connectors";
import type { AccountType, SalesChannel, SourceSystem } from "@prisma/client";

const n = (v: unknown): number | null =>
  v == null ? null : Number(v as never);
const iso = (d: Date) => d.toISOString().slice(0, 10);

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

export async function getDashboard(targetDate?: string): Promise<Dashboard> {
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

  return {
    generatedAt: new Date().toISOString(),
    latestDate,
    selectedDate,
    availableDates,
    series,
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
