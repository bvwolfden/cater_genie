/**
 * COMPILOT-style backtest of the AI forecast loop.
 *
 * Walks one simulated "morning" at a time from June 1 forward. On each morning D
 * the model only sees data up to and including D (no leakage) and forecasts the
 * next operating day D+1 (and the next 7 days). We then reveal the real actual
 * we already have and score it. Three arms are compared:
 *
 *   1. llm-loop      — the closed loop: each morning the model is shown how its
 *                      OWN past forecasts compared to reality (the feedback).
 *   2. llm-nofeedback— ablation: identical context, but never told its track
 *                      record (the paper's "Without Feedback" baseline).
 *   3. baseline      — the product's current deterministic projection
 *                      (weekday-average over the trailing 28 days).
 *
 * Run:  npx tsx scripts/backtest-insights.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { llmComplete, llmModelName, hasLlmKey } from "../src/lib/llm";

const prisma = new PrismaClient();
const MODEL = llmModelName();

const START = process.env.BACKTEST_START || "2026-06-01";

// --- date / number helpers -------------------------------------------------
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dowIdx = (s: string) => new Date(`${s}T00:00:00Z`).getUTCDay();
const dowOf = (s: string) => DOW[dowIdx(s)];
const num = (v: unknown): number | null => (v == null ? null : Number(v as never));
const usd = (v: number | null | undefined) => (v == null ? "—" : "$" + Math.round(v).toLocaleString("en-US"));
const sErr = (v: number | null | undefined) => (v == null ? "    —" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%`);
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const pad = (s: string, w: number) => s.padEnd(w);
const padL = (s: string, w: number) => s.padStart(w);

type Day = { date: string; netSales: number | null; laborCost: number | null; laborPct: number | null };
type Track = { targetDate: string; predicted: number | null; actual: number | null; errorPct: number | null };

const SYSTEM =
  "You are the operations analyst for a restaurant/catering company. You forecast the next operating day's net sales and labor %. Use the day-of-week pattern in recentDays, the recent trend, and — critically — `yourRecentForecasts`, which shows how your own past calls compared to the actuals. Learn from those errors: if you have been consistently high or low, correct. A simple weekday-average baseline is provided; only deviate from it when the data justifies it (e.g. an obvious event spike or a trend). Respond with ONLY the requested JSON.";

async function ask(ctx: unknown, targetDate: string, baselineNet: number | null) {
  const prompt =
    "As-of snapshot (you may ONLY use this — it is everything known so far):\n\n" +
    JSON.stringify(ctx, null, 2) +
    `\n\nForecast the next operating day ${targetDate} (${dowOf(targetDate)}). ` +
    `A naive weekday-average baseline predicts ${baselineNet == null ? "n/a" : Math.round(baselineNet)} net sales.\n\n` +
    'Respond with ONLY this JSON (no fences): { "nextDayNetSales": number, "nextDayLaborPct": number, "nextWeekNetSales": number, "rationale": string (<=160 chars) }';
  const { text } = await llmComplete({ system: SYSTEM, parts: [{ type: "text", text: prompt }], maxTokens: 600 });
  try {
    const clean = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const j = JSON.parse(clean);
    return { net: num(j.nextDayNetSales), laborPct: num(j.nextDayLaborPct), week: num(j.nextWeekNetSales), rationale: (j.rationale ?? null) as string | null };
  } catch {
    return { net: null, laborPct: null, week: null, rationale: text.slice(0, 120) };
  }
}

async function main() {
  if (!hasLlmKey()) throw new Error("No API key for the active LLM provider (set ANTHROPIC_API_KEY or OPENAI_API_KEY / LLM_PROVIDER)");

  const metricsRaw = await prisma.dailyMetric.findMany({ orderBy: { date: "asc" } });
  const days: Day[] = metricsRaw.map((m) => ({
    date: iso(m.date),
    netSales: num(m.netSales),
    laborCost: num(m.laborCost),
    laborPct: num(m.laborPct),
  }));
  const withSales = days.filter((d) => d.netSales != null);
  const byDate = new Map(withSales.map((d) => [d.date, d]));
  const actualNet = (s: string) => byDate.get(s)?.netSales ?? null;
  const lastActual = withSales[withSales.length - 1].date;

  const weeklyRaw = await prisma.weeklyRollup.findMany({ orderBy: { weekStart: "asc" } });
  const weeks = weeklyRaw.map((r) => ({
    weekStart: iso(r.weekStart),
    weekEnd: r.weekEnd ? iso(r.weekEnd) : null,
    total: num(r.totalRevenue),
    priorYear: num(r.revenuePrev1),
    laborPct: num(r.laborPct),
  }));

  // Mornings to simulate: D such that D+1 has an actual we can score against.
  const mornings: string[] = [];
  for (let d = START; addDays(d, 1) <= lastActual; d = addDays(d, 1)) {
    if (byDate.has(d)) mornings.push(d); // only mornings that are themselves real days
  }

  console.log(`\nBacktest window: mornings ${mornings[0]} → ${mornings[mornings.length - 1]} (forecasting ${addDays(mornings[0], 1)} → ${lastActual})`);
  console.log(`Data available: ${withSales[0].date} → ${lastActual}  ·  model: ${MODEL}\n`);

  // Leak-safe as-of context for morning D.
  function asOfContext(D: string, track: Track[]) {
    const upto = withSales.filter((d) => d.date <= D);
    const today = upto[upto.length - 1];
    const prev = upto[upto.length - 2] ?? null;
    const recentDays = upto.slice(-14).map((d) => ({ date: d.date, dow: dowOf(d.date), netSales: Math.round(d.netSales!), laborPct: d.laborPct }));
    const ym = D.slice(0, 7);
    const mtdDays = upto.filter((d) => d.date.slice(0, 7) === ym);
    const mtdNet = mtdDays.reduce((s, d) => s + (d.netSales ?? 0), 0);
    const mtdLabor = mtdDays.reduce((s, d) => s + (d.laborCost ?? 0), 0);
    // Past-only weeks (no future leakage): the week must have fully elapsed by D.
    const recentWeeks = weeks
      .filter((w) => w.total != null && (w.weekEnd ? w.weekEnd <= D : w.weekStart <= addDays(D, -6)))
      .slice(-6)
      .map((w) => ({ week: w.weekStart, revenue: Math.round(w.total!), priorYear: w.priorYear, laborPct: w.laborPct }));
    return {
      asOf: D,
      today: { date: today.date, dow: dowOf(today.date), netSales: today.netSales, laborPct: today.laborPct },
      prevDay: prev ? { date: prev.date, netSales: prev.netSales } : null,
      monthToDate: { netSales: Math.round(mtdNet), laborPct: mtdNet ? mtdLabor / mtdNet : null, days: mtdDays.length },
      recentDays,
      recentWeeks,
      yourRecentForecasts: track.slice(-7),
    };
  }

  // Deterministic baseline = product's forwardDays logic, as-of D.
  function baseline(D: string) {
    const win = withSales.filter((d) => d.date <= D && d.date > addDays(D, -28));
    const all = win.map((d) => d.netSales!);
    const allAvg = all.length ? all.reduce((a, b) => a + b, 0) / all.length : null;
    const dowAvg = (target: string) => {
      const same = win.filter((d) => dowIdx(d.date) === dowIdx(target)).map((d) => d.netSales!);
      return same.length ? same.reduce((a, b) => a + b, 0) / same.length : allAvg;
    };
    let lp = 0, ls = 0;
    for (const d of win) if (d.laborCost != null && d.netSales) { lp += d.laborCost; ls += d.netSales; }
    let week = 0;
    for (let i = 1; i <= 7; i++) week += dowAvg(addDays(D, i)) ?? 0;
    return { net: dowAvg(addDays(D, 1)), laborPct: ls ? lp / ls : null, week };
  }

  const weekActual = (start: string): number | null => {
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      const v = actualNet(addDays(start, i));
      if (v == null) return null; // window incomplete
      sum += v;
    }
    return sum;
  };

  const e = (p: number | null, actual: number | null) => (p == null || actual == null || actual === 0 ? null : (p - actual) / actual);

  type Row = {
    target: string; dow: string; actual: number | null;
    loop: number | null; loopErr: number | null;
    nofb: number | null; nofbErr: number | null;
    base: number | null; baseErr: number | null;
    weekActual: number | null; loopWeek: number | null; loopWeekErr: number | null; baseWeek: number | null; baseWeekErr: number | null;
    rationale: string | null;
  };

  const rows: Row[] = [];
  const loopTrack: Track[] = [];

  for (const D of mornings) {
    const target = addDays(D, 1);
    const actual = actualNet(target);
    const base = baseline(D);
    const [loop, nofb] = await Promise.all([
      ask(asOfContext(D, loopTrack), target, base.net),
      ask(asOfContext(D, []), target, base.net),
    ]);

    const wkA = weekActual(target);
    const row: Row = {
      target, dow: dowOf(target), actual,
      loop: loop.net, loopErr: e(loop.net, actual),
      nofb: nofb.net, nofbErr: e(nofb.net, actual),
      base: base.net, baseErr: e(base.net, actual),
      weekActual: wkA,
      loopWeek: loop.week, loopWeekErr: e(loop.week, wkA),
      baseWeek: base.week, baseWeekErr: e(base.week, wkA),
      rationale: loop.rationale,
    };
    rows.push(row);
    loopTrack.push({ targetDate: target, predicted: loop.net, actual, errorPct: row.loopErr });

    // Persist the loop arm for inspection in the app (mode=backtest).
    const tDate = new Date(`${target}T00:00:00Z`);
    const mDate = new Date(`${D}T00:00:00Z`);
    await prisma.forecast.upsert({
      where: { madeOnDate_horizon_mode: { madeOnDate: mDate, horizon: "next_day", mode: "backtest" } },
      create: { madeOnDate: mDate, targetDate: tDate, horizon: "next_day", mode: "backtest", model: MODEL,
        predNetSales: loop.net, predLaborPct: loop.laborPct, baselineNetSales: base.net, rationale: loop.rationale,
        actualNetSales: actual, errorPct: row.loopErr, absErrorPct: row.loopErr == null ? null : Math.abs(row.loopErr),
        baselineErrorPct: row.baseErr, scoredAt: new Date() },
      update: { targetDate: tDate, model: MODEL, predNetSales: loop.net, predLaborPct: loop.laborPct, baselineNetSales: base.net,
        rationale: loop.rationale, actualNetSales: actual, errorPct: row.loopErr, absErrorPct: row.loopErr == null ? null : Math.abs(row.loopErr),
        baselineErrorPct: row.baseErr, scoredAt: new Date() },
    });

    console.log(
      `${pad(target + " " + row.dow, 15)} actual ${padL(usd(actual), 9)}  ` +
      `loop ${padL(usd(loop.net), 9)} ${padL(sErr(row.loopErr), 5)}  ` +
      `noFB ${padL(usd(nofb.net), 9)} ${padL(sErr(row.nofbErr), 5)}  ` +
      `base ${padL(usd(base.net), 9)} ${padL(sErr(row.baseErr), 5)}`
    );
  }

  // --- Metrics ---------------------------------------------------------------
  const abs = (xs: (number | null)[]) => xs.filter((v): v is number => v != null).map(Math.abs);
  const mape = (xs: (number | null)[]) => { const m = mean(abs(xs)); return m == null ? null : m; };
  const fmtP = (v: number | null) => (v == null ? "—" : (v * 100).toFixed(1) + "%");

  const loopMape = mape(rows.map((r) => r.loopErr));
  const nofbMape = mape(rows.map((r) => r.nofbErr));
  const baseMape = mape(rows.map((r) => r.baseErr));

  const half = Math.floor(rows.length / 2);
  const loopEarly = mape(rows.slice(0, half).map((r) => r.loopErr));
  const loopLate = mape(rows.slice(half).map((r) => r.loopErr));
  const baseEarly = mape(rows.slice(0, half).map((r) => r.baseErr));
  const baseLate = mape(rows.slice(half).map((r) => r.baseErr));

  const wkRows = rows.filter((r) => r.weekActual != null);
  const loopWeekMape = mape(wkRows.map((r) => r.loopWeekErr));
  const baseWeekMape = mape(wkRows.map((r) => r.baseWeekErr));

  console.log("\n" + "=".repeat(72));
  console.log("NEXT-DAY net-sales accuracy (MAPE — lower is better)");
  console.log("-".repeat(72));
  console.log(`  llm-loop (feedback)     ${fmtP(loopMape)}   over ${rows.length} days`);
  console.log(`  llm-nofeedback          ${fmtP(nofbMape)}`);
  console.log(`  deterministic baseline  ${fmtP(baseMape)}`);
  console.log("");
  console.log("Learning over time (does feedback help as the loop accumulates?)");
  console.log(`  loop  first half ${fmtP(loopEarly)}  →  second half ${fmtP(loopLate)}`);
  console.log(`  base  first half ${fmtP(baseEarly)}  →  second half ${fmtP(baseLate)}`);
  console.log("");
  console.log(`NEXT-WEEK (7-day total) accuracy over ${wkRows.length} complete windows`);
  console.log(`  llm-loop   ${fmtP(loopWeekMape)}`);
  console.log(`  baseline   ${fmtP(baseWeekMape)}`);

  // Spotlight the event-spike day if it's in range.
  const spike = rows.find((r) => r.actual != null && r.actual > 60000);
  if (spike) {
    console.log("\n" + "-".repeat(72));
    console.log(`EVENT SPIKE — ${spike.target} (${spike.dow}) actual ${usd(spike.actual)}`);
    console.log(`  loop ${usd(spike.loop)} (${sErr(spike.loopErr).trim()})  ·  noFB ${usd(spike.nofb)} (${sErr(spike.nofbErr).trim()})  ·  baseline ${usd(spike.base)} (${sErr(spike.baseErr).trim()})`);
    if (spike.rationale) console.log(`  loop rationale: ${spike.rationale}`);
  }

  // A couple of sample rationales to show the reasoning.
  console.log("\n" + "-".repeat(72));
  console.log("Sample loop rationales:");
  for (const r of rows.slice(-4)) console.log(`  ${r.target}: ${r.rationale ?? "—"}`);

  console.log("\nDone. Loop forecasts persisted to Forecast (mode=backtest).\n");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
