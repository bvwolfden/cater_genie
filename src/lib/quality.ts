import "server-only";
import { prisma } from "./db";

// Data-quality flags: until live source feeds provide ground truth, the
// dashboard flags numbers that look inconsistent or unusual instead of
// silently trusting them. Kevin's spreadsheet is an input, not the truth —
// catching human transcription mistakes is part of the product.

export type QualitySeverity = "warn" | "info";

export interface QualityFlag {
  date: string;
  severity: QualitySeverity;
  title: string;
  detail: string;
  kind: string; // labor_mismatch | hours_mismatch | sales_outlier | labor_pct | repeated_value | missing_days
}

export interface DataQuality {
  flags: QualityFlag[];
  checkedDays: number;
  generatedAt: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const n = (v: unknown): number | null => (v == null ? null : Number(v as never));
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const usd = (v: number) => "$" + Math.round(v).toLocaleString("en-US");

export async function getDataQuality(): Promise<DataQuality> {
  const [metrics, punchSums] = await Promise.all([
    prisma.dailyMetric.findMany({ orderBy: { date: "asc" } }),
    prisma.laborEntry.groupBy({
      by: ["date"],
      _sum: { paidTotal: true, regularHours: true, otHours: true },
    }),
  ]);

  const punches = new Map(
    punchSums.map((p) => [
      iso(p.date),
      { paid: n(p._sum.paidTotal) ?? 0, hours: (n(p._sum.regularHours) ?? 0) + (n(p._sum.otHours) ?? 0) },
    ])
  );

  const days = metrics.map((m) => ({
    date: iso(m.date),
    net: n(m.netSales),
    laborCost: n(m.laborCost),
    laborHours: n(m.laborHours),
    laborPct: n(m.laborPct),
  }));
  const withSales = days.filter((d) => d.net != null);

  const flags: QualityFlag[] = [];

  // 1+2. Cross-check the daily sheet against timesheet punches — two
  // independent sources for the same fact. Disagreement = someone's wrong.
  for (const d of days) {
    const p = punches.get(d.date);
    if (!p) continue;
    if (d.laborCost != null && p.paid > 0) {
      const diff = Math.abs(d.laborCost - p.paid);
      if (diff > Math.max(150, 0.08 * p.paid)) {
        flags.push({
          date: d.date, severity: "warn", kind: "labor_mismatch",
          title: "Labor $ disagrees with timesheets",
          detail: `Daily sheet says ${usd(d.laborCost)}; punches total ${usd(p.paid)} (${usd(diff)} apart). One of them is wrong.`,
        });
      }
    }
    if (d.laborHours != null && p.hours > 0) {
      const diff = Math.abs(d.laborHours - p.hours);
      if (diff > Math.max(6, 0.08 * p.hours)) {
        flags.push({
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
      flags.push({
        date: d.date, severity: "info", kind: "sales_outlier",
        title: `Unusually high for a ${DOW[dow]}`,
        detail: `${usd(d.net!)} vs ~${usd(median)} typical. Likely an event — or a typo. Verify which.`,
      });
    } else if (ratio <= 0.33 && d.net! < 3000) {
      flags.push({
        date: d.date, severity: "info", kind: "sales_outlier",
        title: `Unusually low for a ${DOW[dow]}`,
        detail: `${usd(d.net!)} vs ~${usd(median)} typical. Closed day, missing entry, or partial data?`,
      });
    }
  }

  // 4. Labor share implausibly high.
  for (const d of withSales) {
    if (d.laborPct != null && d.laborPct >= 0.9 && d.net! > 1000) {
      flags.push({
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
      flags.push({
        date: c.date, severity: "warn", kind: "repeated_value",
        title: "Same sales figure 3+ days running",
        detail: `${usd(a.net!)} repeated ${a.date} → ${c.date} — looks copy-pasted.`,
      });
      break; // one flag per streak is enough
    }
  }

  // 6. Gaps in the daily series.
  if (withSales.length > 1) {
    const have = new Set(withSales.map((d) => d.date));
    let missing = 0;
    const start = new Date(`${withSales[0].date}T00:00:00Z`);
    const end = new Date(`${withSales[withSales.length - 1].date}T00:00:00Z`);
    for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
      if (!have.has(new Date(t).toISOString().slice(0, 10))) missing++;
    }
    if (missing > 0) {
      flags.push({
        date: withSales[withSales.length - 1].date, severity: "info", kind: "missing_days",
        title: `${missing} day${missing > 1 ? "s" : ""} missing in the series`,
        detail: `Between ${withSales[0].date} and ${withSales[withSales.length - 1].date} — closed days are fine; missed entries aren't.`,
      });
    }
  }

  // Warnings first, most recent first, capped.
  flags.sort((a, b) => (a.severity === b.severity ? (a.date < b.date ? 1 : -1) : a.severity === "warn" ? -1 : 1));
  return { flags: flags.slice(0, 12), checkedDays: withSales.length, generatedAt: new Date().toISOString() };
}
