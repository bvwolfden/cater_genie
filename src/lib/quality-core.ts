import { prisma } from "./db";

// Data-quality flags: until live source feeds provide ground truth, the
// dashboard flags numbers that look inconsistent or unusual instead of
// silently trusting them. Kevin's spreadsheet is an input, not the truth —
// catching human transcription mistakes is part of the product.
//
// Two categories of checks:
//   "entry"          — the original per-day sanity checks (sheet vs timesheets,
//                      outliers, copy-paste smells).
//   "reconciliation" — cross-source reconciliation rules encoded from the
//                      production DB audit: daily↔weekly, imports↔tables,
//                      balances, channels. Each flag carries concrete evidence
//                      (dates, dollar deltas) so Kevin can act on it.
//
// This module is deliberately free of "server-only" so the same checks run
// both in the dashboard (via ./quality) and in `npm run validate:data`.

export type QualitySeverity = "critical" | "warn" | "info";
export type QualityCategory = "entry" | "reconciliation";

export interface QualityFlag {
  date: string;
  severity: QualitySeverity;
  category: QualityCategory;
  title: string;
  detail: string;
  kind: string; // labor_mismatch | weekly_revenue_recon | import_integrity | ...
}

export interface DataQuality {
  flags: QualityFlag[];
  checkedDays: number;
  checkedWeeks: number;
  generatedAt: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const n = (v: unknown): number | null => (v == null ? null : Number(v as never));
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const usd = (v: number) => "$" + Math.round(v).toLocaleString("en-US");
const addDaysIso = (isoDate: string, days: number) =>
  iso(new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * 86_400_000));

const SEV_RANK: Record<QualitySeverity, number> = { critical: 0, warn: 1, info: 2 };

interface DayRow {
  date: string;
  net: number | null;
  tax: number | null;
  laborCost: number | null;
  laborHours: number | null;
  laborPct: number | null;
}

interface WeekRow {
  start: string;
  end: string | null;
  revenue: number | null;
  laborCost: number | null;
  hoursPaid: number | null;
  revenuePrev1: number | null;
  laborPrev1: number | null;
}

// ---------------------------------------------------------------------------
// Entry checks (the original per-day sanity suite)
// ---------------------------------------------------------------------------

function entryChecks(days: DayRow[], punches: Map<string, { paid: number; hours: number }>): QualityFlag[] {
  const withSales = days.filter((d) => d.net != null);
  const flags: QualityFlag[] = [];
  const push = (f: Omit<QualityFlag, "category">) => flags.push({ ...f, category: "entry" });

  // 1+2. Cross-check the daily sheet against timesheet punches — two
  // independent sources for the same fact. Disagreement = someone's wrong.
  for (const d of days) {
    const p = punches.get(d.date);
    if (!p) continue;
    if (d.laborCost != null && p.paid > 0) {
      const diff = Math.abs(d.laborCost - p.paid);
      if (diff > Math.max(150, 0.08 * p.paid)) {
        push({
          date: d.date, severity: "warn", kind: "labor_mismatch",
          title: "Labor $ disagrees with timesheets",
          detail: `Daily sheet says ${usd(d.laborCost)}; punches total ${usd(p.paid)} (${usd(diff)} apart). One of them is wrong.`,
        });
      }
    }
    if (d.laborHours != null && p.hours > 0) {
      const diff = Math.abs(d.laborHours - p.hours);
      if (diff > Math.max(6, 0.08 * p.hours)) {
        push({
          date: d.date, severity: "warn", kind: "hours_mismatch",
          title: "Hours disagree with timesheets",
          detail: `Daily sheet says ${d.laborHours.toFixed(1)}h; punches total ${p.hours.toFixed(1)}h.`,
        });
      }
    }
  }

  // 3. Weekday outliers — unusual for that day of week (could be an event or
  // a typo; either way worth a look while we lack a bookings feed).
  for (let i = 0; i < withSales.length; i++) {
    const d = withSales[i];
    const dow = new Date(`${d.date}T00:00:00Z`).getUTCDay();
    const peers = withSales
      .filter((x, j) => j !== i && Math.abs(j - i) <= 28 && new Date(`${x.date}T00:00:00Z`).getUTCDay() === dow)
      .map((x) => x.net!)
      .sort((a, b) => a - b);
    if (peers.length < 3) continue;
    const median = peers[Math.floor(peers.length / 2)];
    if (median <= 0) continue;
    const ratio = d.net! / median;
    if (ratio >= 3) {
      push({
        date: d.date, severity: "info", kind: "sales_outlier",
        title: `Unusually high for a ${DOW[dow]}`,
        detail: `${usd(d.net!)} vs ~${usd(median)} typical. Likely an event — or a typo. Verify which.`,
      });
    } else if (ratio <= 0.33 && d.net! < 3000) {
      push({
        date: d.date, severity: "info", kind: "sales_outlier",
        title: `Unusually low for a ${DOW[dow]}`,
        detail: `${usd(d.net!)} vs ~${usd(median)} typical. Closed day, missing entry, or partial data?`,
      });
    }
  }

  // 4. Labor share implausibly high.
  for (const d of withSales) {
    if (d.laborPct != null && d.laborPct >= 0.9 && d.net! > 1000) {
      push({
        date: d.date, severity: "warn", kind: "labor_pct",
        title: "Labor ≥ 90% of sales",
        detail: `Labor ${(d.laborPct * 100).toFixed(0)}% of ${usd(d.net!)} — check for a sales under-entry or labor double-count.`,
      });
    }
  }

  // 5. The same sales figure on 3+ consecutive days smells like a copy-paste.
  for (let i = 0; i + 2 < withSales.length; i++) {
    const [a, b, c] = [withSales[i], withSales[i + 1], withSales[i + 2]];
    if (a.net === b.net && b.net === c.net && a.net! > 0) {
      push({
        date: c.date, severity: "warn", kind: "repeated_value",
        title: "Same sales figure 3+ days running",
        detail: `${usd(a.net!)} repeated ${a.date} → ${c.date} — looks copy-pasted.`,
      });
      break; // one flag per streak is enough
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Reconciliation checks (encoded from the production DB audit)
// ---------------------------------------------------------------------------

/** Rule 1 — WeeklyRollup has revenue but $0/null labor. Weeks that predate the
 * daily labor era are a known historical gap (info); weeks where the daily
 * sheets DO have labor mean the weekly sheet missed an entry (warn). */
function checkWeeklyLaborPresence(weeks: WeekRow[], dayMap: Map<string, DayRow>): QualityFlag[] {
  const flags: QualityFlag[] = [];
  const preEra: { start: string; revenue: number }[] = [];
  for (const w of weeks) {
    if (w.revenue == null || w.revenue <= 0 || (w.laborCost ?? 0) > 0) continue;
    let dailyLabor = 0;
    let hasDailyLabor = false;
    for (let i = 0; i < 7; i++) {
      const d = dayMap.get(addDaysIso(w.start, i));
      if (d?.laborCost != null) { hasDailyLabor = true; dailyLabor += d.laborCost; }
    }
    if (hasDailyLabor) {
      flags.push({
        date: w.start, severity: "warn", category: "reconciliation", kind: "weekly_labor_missing",
        title: "Labor missing for revenue week",
        detail: `Week ${w.start}: ${usd(w.revenue)} revenue but weekly labor is $0, while daily sheets show ${usd(dailyLabor)} of labor — weekly sheet missed an entry.`,
      });
    } else {
      preEra.push({ start: w.start, revenue: w.revenue });
    }
  }
  if (preEra.length > 3) {
    const top = [...preEra].sort((a, b) => b.revenue - a.revenue).slice(0, 3);
    flags.push({
      date: preEra[preEra.length - 1].start, severity: "info", category: "reconciliation", kind: "weekly_labor_missing",
      title: `Labor missing for ${preEra.length} revenue weeks`,
      detail: `${preEra.length} weekly rollups ${preEra[0].start} → ${preEra[preEra.length - 1].start} report revenue with $0 labor — all predate the daily-sheet era, so likely never tracked. Largest: ${top.map((t) => `${t.start} (${usd(t.revenue)})`).join(", ")}.`,
    });
  } else {
    for (const w of preEra) {
      flags.push({
        date: w.start, severity: "info", category: "reconciliation", kind: "weekly_labor_missing",
        title: "Labor missing for revenue week",
        detail: `Week ${w.start}: ${usd(w.revenue)} revenue but no weekly labor recorded (pre-daily-data era).`,
      });
    }
  }
  return flags;
}

/** Rule 2 — daily net sales must sum to the weekly rollup, but only for weeks
 * every day of which has a daily entry (partial weeks can't reconcile). */
function checkWeeklyRevenueRecon(weeks: WeekRow[], dayMap: Map<string, DayRow>): QualityFlag[] {
  const flags: QualityFlag[] = [];
  for (const w of weeks) {
    if (w.revenue == null) continue;
    let sum = 0;
    let covered = 0;
    for (let i = 0; i < 7; i++) {
      const d = dayMap.get(addDaysIso(w.start, i));
      if (d?.net != null) { sum += d.net; covered++; }
    }
    if (covered < 7) continue; // only fully-covered weeks
    const delta = sum - w.revenue;
    if (Math.abs(delta) <= 50) continue;
    flags.push({
      date: w.start, severity: Math.abs(delta) > 1000 ? "critical" : "warn", category: "reconciliation", kind: "weekly_revenue_recon",
      title: "Daily and weekly revenue disagree",
      detail: `Week ${w.start}: daily sheets sum to ${usd(sum)} but the weekly rollup says ${usd(w.revenue)} — ${usd(Math.abs(delta))} ${delta > 0 ? "more" : "less"} in the dailies.`,
    });
  }
  return flags;
}

/** Rule 3 — where both exist, weekly-sheet labor vs summed daily labor. This
 * currently diverges ~2x on every week: they measure different things. */
function checkLaborDivergence(weeks: WeekRow[], dayMap: Map<string, DayRow>): QualityFlag[] {
  const flags: QualityFlag[] = [];
  for (const w of weeks) {
    if (w.laborCost == null || w.laborCost <= 0) continue;
    let daily = 0;
    for (let i = 0; i < 7; i++) daily += dayMap.get(addDaysIso(w.start, i))?.laborCost ?? 0;
    if (daily <= 0) continue;
    const ratio = w.laborCost / daily;
    if (ratio >= 0.95 && ratio <= 1.05) continue;
    flags.push({
      date: w.start, severity: "warn", category: "reconciliation", kind: "labor_divergence",
      title: "Weekly vs daily labor diverge",
      detail: `Week ${w.start}: weekly sheet labor ${usd(w.laborCost)} is ${ratio.toFixed(1)}x daily timesheet labor ${usd(daily)} — different definitions (loaded payroll vs wages?).`,
    });
  }
  return flags;
}

/** Rule 4 — implied hourly wage must land in $8–60/h at both grains. */
function checkImpliedWages(days: DayRow[], weeks: WeekRow[]): QualityFlag[] {
  const flags: QualityFlag[] = [];
  for (const d of days) {
    if (d.laborCost == null || d.laborHours == null || d.laborHours <= 0) continue;
    const rate = d.laborCost / d.laborHours;
    if (rate >= 8 && rate <= 60) continue;
    flags.push({
      date: d.date, severity: "warn", category: "reconciliation", kind: "implied_wage",
      title: `Implied wage $${rate.toFixed(2)}/h`,
      detail: `Daily sheet: ${usd(d.laborCost)} labor over ${d.laborHours.toFixed(1)}h = $${rate.toFixed(2)}/h — outside the plausible $8–60/h band.`,
    });
  }
  for (const w of weeks) {
    if (w.laborCost == null || w.laborCost <= 0 || w.hoursPaid == null || w.hoursPaid <= 0) continue;
    const rate = w.laborCost / w.hoursPaid;
    if (rate >= 8 && rate <= 60) continue;
    flags.push({
      date: w.start, severity: "warn", category: "reconciliation", kind: "implied_wage",
      title: `Implied weekly wage $${rate.toFixed(2)}/h`,
      detail: `Week ${w.start}: ${usd(w.laborCost)} labor over ${w.hoursPaid.toFixed(1)}h paid = $${rate.toFixed(2)}/h — outside the plausible $8–60/h band.`,
    });
  }
  return flags;
}

/** Rule 5 — every calendar date from the first daily entry to the data edge
 * must have a DailyMetric row; even a closed day should exist. */
function checkCalendarCompleteness(days: DayRow[]): QualityFlag[] {
  const flags: QualityFlag[] = [];
  if (days.length < 2) return flags;
  const have = new Set(days.map((d) => d.date));
  const edge = days[days.length - 1].date;
  for (let d = days[0].date; d < edge; d = addDaysIso(d, 1)) {
    if (have.has(d)) continue;
    const dow = DOW[new Date(`${d}T00:00:00Z`).getUTCDay()];
    flags.push({
      date: d, severity: "warn", category: "reconciliation", kind: "calendar_gap",
      title: "Missing day in the calendar",
      detail: `No daily entry for ${dow} ${d} — every date up to the data edge (${edge}) should exist, even closures.`,
    });
  }
  return flags;
}

/** Rule 6 — staffed day with near-zero sales: people punched in, so a closure
 * is unlikely; the sales import probably went missing. */
function checkNearZeroStaffedDays(days: DayRow[]): QualityFlag[] {
  const flags: QualityFlag[] = [];
  for (const d of days) {
    if (d.net == null || d.net >= 500 || d.laborHours == null || d.laborHours <= 4) continue;
    flags.push({
      date: d.date, severity: "warn", category: "reconciliation", kind: "near_zero_staffed",
      title: "Staffed day with near-zero sales",
      detail: `${usd(d.net)} net sales but ${d.laborHours.toFixed(1)}h of labor on the books — staffed but no sales points at a missing import, not a closure.`,
    });
  }
  return flags;
}

/** Rule 7 — tax should track Allegheny County's ~7%; a higher ratio means a
 * tax-included entry or refund-handling mistake. */
function checkTaxRatio(days: DayRow[]): QualityFlag[] {
  const flags: QualityFlag[] = [];
  for (const d of days) {
    if (d.net == null || d.net <= 0 || d.tax == null) continue;
    const ratio = d.tax / d.net;
    if (ratio <= 0.08) continue;
    flags.push({
      date: d.date, severity: "warn", category: "reconciliation", kind: "tax_ratio",
      title: `Tax is ${(ratio * 100).toFixed(1)}% of net`,
      detail: `Tax ${usd(d.tax)} on ${usd(d.net)} net = ${(ratio * 100).toFixed(1)}% — Allegheny County is ~7%. Check for tax-included sales or a misplaced figure.`,
    });
  }
  return flags;
}

/** Rule 8 — a week must span exactly 6 days start→end. The two calendar stub
 * weeks (Jan 1–4, Dec 28–31) are legitimate short weeks and exempt. */
function checkWeekIntegrity(weeks: WeekRow[]): QualityFlag[] {
  const flags: QualityFlag[] = [];
  for (const w of weeks) {
    if (w.end == null) continue;
    const isStub =
      (w.start.slice(5) === "01-01" && w.end.slice(5) === "01-04") ||
      (w.start.slice(5) === "12-28" && w.end.slice(5) === "12-31");
    if (isStub) continue;
    const span = Math.round(
      (new Date(`${w.end}T00:00:00Z`).getTime() - new Date(`${w.start}T00:00:00Z`).getTime()) / 86_400_000
    );
    if (span === 6) continue;
    flags.push({
      date: w.start, severity: "critical", category: "reconciliation", kind: "week_integrity",
      title: "Week start/end don't line up",
      detail: `Week ${w.start} has weekEnd ${w.end} — ${span} days apart instead of 6${span < 0 ? " (weekEnd year looks like a typo)" : ""}.`,
    });
  }
  return flags;
}

/** Rule 9 — prior-year labor above 80% of prior-year revenue is implausible;
 * usually a column-mapping mistake in the historical import. */
function checkPriorYearBalance(weeks: WeekRow[]): QualityFlag[] {
  const flags: QualityFlag[] = [];
  for (const w of weeks) {
    if (w.laborPrev1 == null || w.laborPrev1 <= 0 || w.revenuePrev1 == null || w.revenuePrev1 <= 0) continue;
    if (w.laborPrev1 <= 0.8 * w.revenuePrev1) continue;
    flags.push({
      date: w.start, severity: "warn", category: "reconciliation", kind: "prior_year_balance",
      title: "Prior-year labor implausible vs revenue",
      detail: `Week ${w.start}: prior-year labor ${usd(w.laborPrev1)} is ${((w.laborPrev1 / w.revenuePrev1) * 100).toFixed(0)}% of prior-year revenue ${usd(w.revenuePrev1)} — check the historical column mapping.`,
    });
  }
  return flags;
}

const IMPORT_TARGETS: Record<string, { table: string; count: (c: TableCounts) => number }> = {
  daily_metrics: { table: "DailyMetric", count: (c) => c.dailyMetrics },
  timesheet: { table: "LaborEntry", count: (c) => c.laborEntries },
  catertrax_sales: { table: "DailySales", count: (c) => c.dailySales },
  caterease_bookings: { table: "EventBooking", count: (c) => c.eventBookings },
};

interface TableCounts {
  dailyMetrics: number;
  laborEntries: number;
  dailySales: number;
  eventBookings: number;
}

/** Rule 10 — committed imports must still be in the DB: each COMMITTED
 * ImportBatch and each MANUAL SUCCESS SyncRun claims rowsWritten; the target
 * table must still hold at least that many rows. */
function checkImportIntegrity(
  batches: { id: number; kind: string | null; filename: string; rowsWritten: number; committedAt: Date | null; createdAt: Date }[],
  syncRuns: { id: number; rowsWritten: number; startedAt: Date; message: string | null }[],
  counts: TableCounts
): QualityFlag[] {
  const flags: QualityFlag[] = [];
  for (const b of batches) {
    const target = b.kind ? IMPORT_TARGETS[b.kind] : undefined;
    if (!target || b.rowsWritten <= 0) continue; // unknown kind — not checkable
    const have = target.count(counts);
    if (have >= b.rowsWritten) continue;
    flags.push({
      date: iso(b.committedAt ?? b.createdAt), severity: "critical", category: "reconciliation", kind: "import_integrity",
      title: "Committed import rows missing from DB",
      detail: `Import #${b.id} (${b.filename}) committed ${b.rowsWritten} ${b.kind} rows, but ${target.table} now holds only ${have}.`,
    });
  }
  for (const s of syncRuns) {
    const kind = s.message?.match(/\((daily_metrics|timesheet|catertrax_sales|caterease_bookings)\)/)?.[1];
    const target = kind ? IMPORT_TARGETS[kind] : undefined;
    if (!target) continue;
    const have = target.count(counts);
    if (have >= s.rowsWritten) continue;
    flags.push({
      date: iso(s.startedAt), severity: "critical", category: "reconciliation", kind: "import_integrity",
      title: "Committed import rows missing from DB",
      detail: `SyncRun #${s.id} logged ${s.rowsWritten} ${kind} rows written on ${iso(s.startedAt)}, but ${target.table} contains ${have === 0 ? "none of them" : `only ${have}`}.`,
    });
  }
  return flags;
}

/** Rule 11 — OPERATING/PAYROLL negative for >3 consecutive snapshots. One
 * summary flag per account (the streaks are long-running). */
function checkBalanceStreaks(balances: { date: Date; account: string; balance: unknown }[]): QualityFlag[] {
  const flags: QualityFlag[] = [];
  for (const account of ["OPERATING", "PAYROLL"]) {
    const rows = balances.filter((b) => b.account === account);
    if (rows.length === 0) continue;
    type Streak = { start: string; end: string; len: number; low: number };
    let run: Streak | null = null;
    let best: Streak | null = null;
    let negCount = 0;
    for (const r of rows) {
      const bal = n(r.balance)!;
      if (bal < 0) {
        negCount++;
        if (run) {
          run = { start: run.start, end: iso(r.date), len: run.len + 1, low: Math.min(run.low, bal) };
        } else {
          run = { start: iso(r.date), end: iso(r.date), len: 1, low: bal };
        }
        if (!best || run.len > best.len) best = run;
      } else {
        run = null;
      }
    }
    if (!best || best.len <= 3) continue;
    flags.push({
      date: best.end, severity: "warn", category: "reconciliation", kind: "balance_streak",
      title: `${account} balance persistently negative`,
      detail: `${account} negative in ${negCount} of ${rows.length} snapshots, incl. a ${best.len}-snapshot run ${best.start} → ${best.end} (low ${usd(best.low)}). Verify sign/mapping vs bank.`,
    });
  }
  return flags;
}

/** Rule 12 — a channel that had revenue in ≥3 of the prior 4 recorded weeks
 * suddenly shows $0/blank: probably a missing import, not a quiet week. */
function checkChannelGaps(rows: { weekStart: Date; channel: string; actual: unknown }[]): QualityFlag[] {
  const flags: QualityFlag[] = [];
  const byChannel = new Map<string, { week: string; actual: number | null }[]>();
  for (const r of rows) {
    const list = byChannel.get(r.channel) ?? [];
    list.push({ week: iso(r.weekStart), actual: n(r.actual) });
    byChannel.set(r.channel, list);
  }
  for (const [channel, list] of byChannel) {
    list.sort((a, b) => (a.week < b.week ? -1 : 1));
    for (let i = 0; i < list.length; i++) {
      const cur = list[i];
      if (cur.actual != null && cur.actual !== 0) continue;
      const prior = list.slice(Math.max(0, i - 4), i).filter((p) => (p.actual ?? 0) > 0);
      if (prior.length < 3) continue;
      const avg = prior.reduce((s, p) => s + p.actual!, 0) / prior.length;
      flags.push({
        date: cur.week, severity: "warn", category: "reconciliation", kind: "channel_gap",
        title: `${channel} revenue missing for week`,
        detail: `Week ${cur.week}: ${channel} actual is ${cur.actual == null ? "blank" : "$0"} but the channel averaged ${usd(avg)} over the prior ${prior.length} recorded weeks — likely a missing import.`,
      });
    }
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Noise control + assembly
// ---------------------------------------------------------------------------

/** If a single rule fires on >20 rows, collapse to one summary flag carrying
 * the count and the worst 3 examples — a wall of identical flags helps nobody. */
function collapseNoisy(flags: QualityFlag[], limit = 20): QualityFlag[] {
  const byKind = new Map<string, QualityFlag[]>();
  for (const f of flags) {
    const list = byKind.get(f.kind) ?? [];
    list.push(f);
    byKind.set(f.kind, list);
  }
  const out: QualityFlag[] = [];
  for (const group of byKind.values()) {
    if (group.length <= limit) {
      out.push(...group);
      continue;
    }
    const sorted = [...group].sort(
      (a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || (a.date < b.date ? 1 : -1)
    );
    const worst = sorted.slice(0, 3);
    out.push({
      date: sorted[0].date, severity: sorted[0].severity, category: sorted[0].category, kind: sorted[0].kind,
      title: `${sorted[0].title} — ${group.length} occurrences`,
      detail: `Fired on ${group.length} rows. Worst 3: ${worst.map((f) => `${f.date}: ${f.detail}`).join(" · ")}`,
    });
  }
  return out;
}

export async function getDataQuality(): Promise<DataQuality> {
  const [metrics, punchSums, rollups, channelRows, balanceRows, manualRuns, committedBatches, eventBookings, laborEntries, dailySales] =
    await Promise.all([
      prisma.dailyMetric.findMany({ orderBy: { date: "asc" } }),
      prisma.laborEntry.groupBy({
        by: ["date"],
        _sum: { paidTotal: true, regularHours: true, otHours: true },
      }),
      prisma.weeklyRollup.findMany({ orderBy: { weekStart: "asc" } }),
      prisma.weeklyChannelRevenue.findMany({ orderBy: { weekStart: "asc" } }),
      prisma.accountBalance.findMany({
        where: { account: { in: ["OPERATING", "PAYROLL"] } },
        orderBy: { date: "asc" },
      }),
      prisma.syncRun.findMany({ where: { source: "MANUAL", status: "SUCCESS", rowsWritten: { gt: 0 } } }),
      prisma.importBatch.findMany({ where: { status: "COMMITTED" } }),
      prisma.eventBooking.count(),
      prisma.laborEntry.count(),
      prisma.dailySales.count(),
    ]);

  const punches = new Map(
    punchSums.map((p) => [
      iso(p.date),
      { paid: n(p._sum.paidTotal) ?? 0, hours: (n(p._sum.regularHours) ?? 0) + (n(p._sum.otHours) ?? 0) },
    ])
  );

  const days: DayRow[] = metrics.map((m) => ({
    date: iso(m.date),
    net: n(m.netSales),
    tax: n(m.tax),
    laborCost: n(m.laborCost),
    laborHours: n(m.laborHours),
    laborPct: n(m.laborPct),
  }));
  const dayMap = new Map(days.map((d) => [d.date, d]));

  const weeks: WeekRow[] = rollups.map((w) => ({
    start: iso(w.weekStart),
    end: w.weekEnd ? iso(w.weekEnd) : null,
    revenue: n(w.totalRevenue),
    laborCost: n(w.laborCost),
    hoursPaid: n(w.hoursPaid),
    revenuePrev1: n(w.revenuePrev1),
    laborPrev1: n(w.laborPrev1),
  }));

  const counts: TableCounts = { dailyMetrics: metrics.length, laborEntries, dailySales, eventBookings };

  const flags = collapseNoisy([
    ...entryChecks(days, punches),
    ...checkWeeklyLaborPresence(weeks, dayMap),
    ...checkWeeklyRevenueRecon(weeks, dayMap),
    ...checkLaborDivergence(weeks, dayMap),
    ...checkImpliedWages(days, weeks),
    ...checkCalendarCompleteness(days),
    ...checkNearZeroStaffedDays(days),
    ...checkTaxRatio(days),
    ...checkWeekIntegrity(weeks),
    ...checkPriorYearBalance(weeks),
    ...checkImportIntegrity(committedBatches, manualRuns, counts),
    ...checkBalanceStreaks(balanceRows),
    ...checkChannelGaps(channelRows),
  ]);

  // Most severe first, most recent first within a severity.
  flags.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || (a.date < b.date ? 1 : -1));

  return {
    flags,
    checkedDays: days.filter((d) => d.net != null).length,
    checkedWeeks: weeks.filter((w) => w.revenue != null).length,
    generatedAt: new Date().toISOString(),
  };
}
