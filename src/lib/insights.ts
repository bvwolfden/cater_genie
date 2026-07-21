import "server-only";
import { llmComplete, hasLlmKey } from "./llm";
import { SEASONALITY_CONTEXT } from "./seasonality";
import { getDataQuality } from "./quality";
import { prisma } from "./db";
import type { Dashboard } from "./dashboard";
import { money, percent } from "./format";
import { channelLabelOf } from "./labels";

export type AlertSeverity = "info" | "warn" | "alert";

/** A falsifiable next-day / next-week prediction the model commits to. */
export interface ForecastPrediction {
  targetDate: string; // the next operating day (or week-start) being predicted
  netSales: number | null;
  laborPct: number | null;
  weekNetSales: number | null; // predicted total net sales over the next 7 days
  rationale: string | null;
  baselineNetSales: number | null; // deterministic weekday-seasonality projection
}

/** Track record of past forecasts vs. what actually happened. */
export interface ForecastAccuracy {
  n: number; // number of scored forecasts
  mapePct: number | null; // mean absolute % error of the AI's net-sales calls
  baselineMapePct: number | null; // same metric for the deterministic baseline
  last: {
    targetDate: string;
    predNetSales: number | null;
    actualNetSales: number | null;
    errorPct: number | null;
  }[];
}

export interface InsightResult {
  headline: string;
  body: string; // markdown
  alerts: { severity: AlertSeverity; title: string; detail: string }[];
  model: string;
  generatedAt: string;
  cached: boolean;
  forecast?: ForecastPrediction | null;
  accuracy?: ForecastAccuracy | null;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dowOf = (isoDate: string) => DOW[new Date(`${isoDate}T00:00:00Z`).getUTCDay()];
const addDays = (isoDate: string, days: number) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const num = (v: unknown): number | null => (v == null ? null : Number(v as never));
const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const mean = (a: number[]): number | null => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

/** Compact record the model sees of how its own recent forecasts panned out. */
type ForecastTrackRecord = {
  targetDate: string;
  predicted: number | null;
  actual: number | null;
  errorPct: number | null;
}[];

/** Compact, numeric snapshot handed to the model (or the rules engine). */
function buildContext(d: Dashboard, recentForecasts: ForecastTrackRecord = []) {
  const k = d.kpis;
  const sd = d.selectedDate;
  // Last 14 days of actuals, as-of the reporting day — gives the model the
  // weekday pattern and any recent spikes to forecast the next day from.
  const recentDays = d.series
    .filter((s) => s.netSales != null && (!sd || s.date <= sd))
    .slice(-14)
    .map((s) => ({
      date: s.date,
      dow: dowOf(s.date),
      netSales: Math.round(s.netSales!),
      laborPct: s.laborPct,
    }));
  return {
    latestDate: d.latestDate,
    month: k.monthLabel,
    today: {
      netSales: k.netSales,
      laborCost: k.laborCost,
      laborPct: k.laborPct,
      laborHours: k.laborHours,
      foodPurchases: k.foodPurchases,
      netSalesPrevDay: k.netSalesPrev,
    },
    monthToDate: {
      netSales: k.mtdNetSales,
      laborCost: k.mtdLaborCost,
      laborPct: k.mtdLaborPct,
      avgDailySales: k.mtdAvgDailySales,
      hours: k.mtdHours,
    },
    cashPosition: k.cashPosition,
    balances: d.balances.map((b) => ({ account: b.account, balance: b.balance })),
    laborByDept: d.laborByDept.slice(0, 6),
    revenueByBusiness: d.channelMix.map((c) => ({
      business: channelLabelOf(c.channel),
      actual: Math.round(c.actual),
      projected: Math.round(c.projected),
    })),
    recentDays,
    recentWeeks: d.weekly.slice(-6).map((w) => ({
      week: w.weekStart,
      revenue: w.total,
      priorYear: w.priorYear,
      projected: w.projected,
      laborPct: w.laborPct,
    })),
    // The feedback loop: how your own recent forecasts compared to reality.
    yourRecentForecasts: recentForecasts,
    // Days whose numbers look inconsistent or unusual (cross-source checks).
    dataQualityFlags: [] as { date: string; title: string; detail: string }[],
  };
}

// ---------------------------------------------------------------------------
// Rules engine — used when no ANTHROPIC_API_KEY is set. Deterministic and
// genuinely useful so the panel never looks empty.
// ---------------------------------------------------------------------------
function rulesEngine(d: Dashboard): InsightResult {
  const k = d.kpis;
  const alerts: InsightResult["alerts"] = [];

  if (k.laborPct != null) {
    if (k.laborPct >= 0.5)
      alerts.push({ severity: "alert", title: "Labor cost critical", detail: `Latest day labor ran ${percent(k.laborPct)} of net sales — well above target.` });
    else if (k.laborPct >= 0.35)
      alerts.push({ severity: "warn", title: "Labor cost elevated", detail: `Latest day labor at ${percent(k.laborPct)} of sales — watch staffing vs. demand.` });
    else
      alerts.push({ severity: "info", title: "Labor cost healthy", detail: `Latest day labor at ${percent(k.laborPct)} of sales.` });
  }

  const operating = d.balances.find((b) => b.account === "OPERATING");
  if (operating && operating.balance < 0)
    alerts.push({ severity: "alert", title: "Operating account negative", detail: `Operating balance is ${money(operating.balance)}. Review near-term cash needs.` });
  if (k.cashPosition != null)
    alerts.push({ severity: k.cashPosition < 0 ? "warn" : "info", title: "Cash position", detail: `Across tracked accounts: ${money(k.cashPosition)}.` });

  // (No "vs projection" alert here: `weekly` anchors projected == actual on
  // the boundary week by construction, so that variance is always 0. Real
  // forecast-vs-actual scoring lives in the Forecast table / accuracy chip.)

  // Best day in the series.
  const best = [...d.series].filter((s) => s.netSales != null).sort((a, b) => b.netSales! - a.netSales!)[0];

  const headline =
    k.netSales != null
      ? `${money(k.netSales)} net sales on ${d.latestDate} · labor ${percent(k.laborPct)}`
      : "Daily snapshot";

  const body = [
    `**Today (${d.latestDate}).** Net sales ${money(k.netSales)}, labor ${money(k.laborCost)} (${percent(k.laborPct)}), ${k.laborHours ?? "—"} hours.`,
    `**${k.monthLabel ?? "Month"} to date.** ${money(k.mtdNetSales)} net sales, avg ${money(k.mtdAvgDailySales)}/day, blended labor ${percent(k.mtdLaborPct)}.`,
    best ? `**Best day in range.** ${money(best.netSales)} on ${best.date}.` : "",
    d.channelMix.length
      ? `**Revenue by business (recent).** ${d.channelMix.map((c) => `${channelLabelOf(c.channel)} ${money(c.actual)}`).join(", ")}.`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    headline,
    body,
    alerts,
    model: "rules-engine",
    generatedAt: new Date().toISOString(),
    cached: false,
  };
}

// ---------------------------------------------------------------------------
// LLM narrative via Claude.
// ---------------------------------------------------------------------------
async function llmInsight(d: Dashboard, recentForecasts: ForecastTrackRecord = []): Promise<InsightResult> {
  const ctx = buildContext(d, recentForecasts);
  try {
    const q = await getDataQuality();
    ctx.dataQualityFlags = q.flags.map((f) => ({ date: f.date, title: f.title, detail: f.detail }));
  } catch {
    // quality checks are advisory — never block the insight
  }

  // Next operating day + the deterministic baseline projection for it, so we
  // can both prompt and later store the comparison.
  const targetDate = d.latestDate ? addDays(d.latestDate, 1) : null;
  const baselineNextDay = d.forwardDays.find((f) => f.date === targetDate)?.netSales ?? d.forwardDays[0]?.netSales ?? null;

  const system =
    "You are the operations analyst for a restaurant/catering company. You read a daily metrics snapshot and produce a short, calm morning briefing the owner scans in 10 seconds. Concrete numbers, never invented; round dollars ($1.4k, $270k).\n\n" +
    "The body must be EXACTLY these five lines, in this order, same shape every single day so it becomes familiar:\n" +
    "**Yesterday.** <one sentence: net sales vs that weekday's recent norm>\n" +
    "**Month so far.** <one sentence: MTD net sales and MTD labor %>\n" +
    "**Labor.** <one sentence: current labor picture>\n" +
    "**Cash.** <one sentence: overall position; name any account needing a transfer>\n" +
    "**Watch today.** <one sentence: the single most useful thing to check or do>\n" +
    "One idea per line, max ~20 words each, plain declarative sentences. No semicolons, no dashes chaining clauses, no parenthetical asides, at most one number comparison per line. Calm wording — never 'collapse', 'crisis', 'risk here is', or exclamation. A quiet Sunday is normal, not an event.\n\n" +
    "Flag real problems (labor % above ~35% of sales, negative operating balance, weeks tracking behind projection) in `alerts`, not by dramatizing the body. At most 2 alerts, only when something needs action today; `detail` is plain text — absolutely no markdown or asterisks inside alerts.\n\n" +
    "You must also commit to a falsifiable forecast for the NEXT operating day and the next 7 days. Use the day-of-week pattern in recentDays, recent trend, and — critically — `yourRecentForecasts`, which shows how your own past calls compared to the actuals. Learn from those errors: if you have been consistently high or low, correct. A simple weekday-average baseline is provided; only deviate from it when the data justifies it (e.g. an obvious event spike or a trend).\n\n" +
    "`dataQualityFlags` lists days whose numbers look inconsistent across sources or unusual. Treat those figures skeptically: do not build conclusions on a flagged number without noting the doubt, and if a flagged day matters to your analysis, say so plainly (e.g. 'if Tuesday's entry is right, ...'). The data comes from manual entry — part of your job is catching human mistakes, not laundering them into confident narrative.\n\n" +
    "Check the calendar around the forecast target: US holidays and holiday-adjacent days (July 4th week, Memorial Day, Labor Day, Thanksgiving, Christmas...) shift demand sharply — corporate delivery dies on office holidays while event/catering can spike. Adjust for them explicitly; a weekday-average baseline knows nothing about holidays.\n\n" +
    SEASONALITY_CONTEXT;

  const prompt =
    "Here is today's snapshot as JSON:\n\n" +
    JSON.stringify(ctx, null, 2) +
    `\n\nThe next operating day to forecast is ${targetDate ?? "(unknown)"}. ` +
    `A naive weekday-average baseline predicts net sales of ${baselineNextDay == null ? "n/a" : Math.round(baselineNextDay)} for that day.\n\n` +
    'Respond with ONLY a JSON object (no markdown fences) of shape:\n' +
    '{ "headline": string (<=60 chars, calm and factual, pattern "Tue $18.2k · labor 26% · <one short flag or steady>"), ' +
    '"body": string (markdown, EXACTLY the five **Yesterday/Month so far/Labor/Cash/Watch today** lines from the system prompt, newline-separated), ' +
    '"alerts": [{ "severity": "info"|"warn"|"alert", "title": string, "detail": string (plain text, no markdown) }] (max 2, only if action is needed today), ' +
    '"forecast": { "nextDayNetSales": number, "nextDayLaborPct": number (fraction, e.g. 0.30), "nextWeekNetSales": number, "rationale": string (<=140 chars, plain text) } }';

  const { text, model } = await llmComplete({
    system,
    parts: [{ type: "text", text: prompt }],
    maxTokens: 1400,
  });

  type Parsed = Partial<InsightResult> & {
    forecast?: { nextDayNetSales?: number; nextDayLaborPct?: number; nextWeekNetSales?: number; rationale?: string };
  };
  let parsed: Parsed = {};
  try {
    const clean = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    parsed = JSON.parse(clean);
  } catch {
    parsed = { headline: "Daily insights", body: text, alerts: [] };
  }

  const f = parsed.forecast;
  const forecast: ForecastPrediction | null =
    targetDate && f
      ? {
          targetDate,
          netSales: num(f.nextDayNetSales),
          laborPct: num(f.nextDayLaborPct),
          weekNetSales: num(f.nextWeekNetSales),
          rationale: f.rationale ?? null,
          baselineNetSales: baselineNextDay,
        }
      : null;

  return {
    headline: parsed.headline || "Daily insights",
    body: parsed.body || "",
    alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
    model,
    generatedAt: new Date().toISOString(),
    cached: false,
    forecast,
    accuracy: null,
  };
}

/**
 * Load the model's own forecast track record (scored live next-day calls) plus
 * the aggregate accuracy. This is the empirical feedback the loop runs on.
 */
async function loadForecastFeedback(): Promise<{ trackRecord: ForecastTrackRecord; accuracy: ForecastAccuracy }> {
  const rows = await prisma.forecast.findMany({
    where: { mode: "live", horizon: "next_day", scoredAt: { not: null } },
    orderBy: { targetDate: "desc" },
    take: 10,
  });
  const absVals = rows.map((r) => num(r.absErrorPct)).filter((v): v is number => v != null);
  const baseAbs = rows
    .map((r) => (r.baselineErrorPct == null ? null : Math.abs(Number(r.baselineErrorPct))))
    .filter((v): v is number => v != null);
  const trackRecord: ForecastTrackRecord = rows.slice(0, 7).map((r) => ({
    targetDate: isoOf(r.targetDate),
    predicted: num(r.predNetSales),
    actual: num(r.actualNetSales),
    errorPct: num(r.errorPct),
  }));
  return {
    trackRecord,
    accuracy: {
      n: rows.length,
      mapePct: mean(absVals),
      baselineMapePct: mean(baseAbs),
      last: trackRecord.map((t) => ({
        targetDate: t.targetDate,
        predNetSales: t.predicted,
        actualNetSales: t.actual,
        errorPct: t.errorPct,
      })),
    },
  };
}

/** Persist the live next-day & next-week forecasts so they can be scored later. */
async function persistForecast(scopeDate: Date, forecast: ForecastPrediction, d: Dashboard, model: string) {
  const targetDate = new Date(`${forecast.targetDate}T00:00:00Z`);
  const ctx = buildContext(d) as unknown as object; // audit snapshot of the inputs
  const baselineWeek = d.forwardDays.slice(0, 7).reduce<number | null>(
    (s, f) => (f.netSales == null ? s : (s ?? 0) + f.netSales), null);

  await prisma.forecast.upsert({
    where: { madeOnDate_horizon_mode: { madeOnDate: scopeDate, horizon: "next_day", mode: "live" } },
    create: {
      madeOnDate: scopeDate, targetDate, horizon: "next_day", mode: "live", model,
      predNetSales: forecast.netSales, predLaborPct: forecast.laborPct,
      baselineNetSales: forecast.baselineNetSales, rationale: forecast.rationale, context: ctx,
    },
    update: {
      targetDate, model, predNetSales: forecast.netSales, predLaborPct: forecast.laborPct,
      baselineNetSales: forecast.baselineNetSales, rationale: forecast.rationale, context: ctx,
      actualNetSales: null, actualLaborPct: null, errorPct: null, absErrorPct: null, baselineErrorPct: null, scoredAt: null,
    },
  });
  await prisma.forecast.upsert({
    where: { madeOnDate_horizon_mode: { madeOnDate: scopeDate, horizon: "next_week", mode: "live" } },
    create: {
      madeOnDate: scopeDate, targetDate, horizon: "next_week", mode: "live", model,
      predNetSales: forecast.weekNetSales, baselineNetSales: baselineWeek, rationale: forecast.rationale, context: ctx,
    },
    update: {
      targetDate, model, predNetSales: forecast.weekNetSales, baselineNetSales: baselineWeek, rationale: forecast.rationale, context: ctx,
      actualNetSales: null, errorPct: null, absErrorPct: null, baselineErrorPct: null, scoredAt: null,
    },
  });
}

/** Reconstruct the stored forecast for a reporting day (used on cache hits). */
async function loadStoredForecast(scopeDate: Date): Promise<ForecastPrediction | null> {
  const [day, week] = await Promise.all([
    prisma.forecast.findUnique({ where: { madeOnDate_horizon_mode: { madeOnDate: scopeDate, horizon: "next_day", mode: "live" } } }),
    prisma.forecast.findUnique({ where: { madeOnDate_horizon_mode: { madeOnDate: scopeDate, horizon: "next_week", mode: "live" } } }),
  ]);
  if (!day) return null;
  return {
    targetDate: isoOf(day.targetDate),
    netSales: num(day.predNetSales),
    laborPct: num(day.predLaborPct),
    weekNetSales: num(week?.predNetSales),
    rationale: day.rationale,
    baselineNetSales: num(day.baselineNetSales),
  };
}

/** Get insight for the latest day, using cache unless `force`. */
export async function getInsight(d: Dashboard, opts: { force?: boolean } = {}): Promise<InsightResult> {
  const scopeISO = d.selectedDate ?? d.latestDate;
  const scopeDate = scopeISO ? new Date(`${scopeISO}T00:00:00Z`) : null;
  const isLive = scopeISO != null && scopeISO === d.latestDate;
  const k = d.kpis;
  // Signature so the cache auto-invalidates when the day's numbers change.
  // The leading version tag busts the cache when the briefing format changes.
  const sig = `v2|${scopeISO}|${Math.round(k.netSales ?? 0)}|${Math.round(k.laborCost ?? 0)}|${Math.round(k.cashPosition ?? 0)}`;

  const feedback = await loadForecastFeedback();

  if (scopeDate && !opts.force) {
    const cached = await prisma.insight.findUnique({
      where: { scopeDate_scope: { scopeDate, scope: "daily" } },
    });
    const payload = (cached?.payload as { alerts?: InsightResult["alerts"]; sig?: string } | null) ?? null;
    if (cached?.body && payload?.sig === sig) {
      return {
        headline: cached.headline || "Daily insights",
        body: cached.body,
        alerts: payload.alerts ?? [],
        model: cached.model || "cache",
        generatedAt: cached.createdAt.toISOString(),
        cached: true,
        forecast: isLive ? await loadStoredForecast(scopeDate) : null,
        accuracy: feedback.accuracy,
      };
    }
  }

  const hasKey = hasLlmKey();
  let result: InsightResult;
  try {
    result = hasKey ? await llmInsight(d, feedback.trackRecord) : rulesEngine(d);
  } catch (err) {
    // Fall back gracefully if the API call fails.
    result = rulesEngine(d);
    result.headline = result.headline + " (fallback)";
    console.error("AI insight failed, used rules engine:", err);
  }
  result.accuracy = feedback.accuracy;

  if (scopeDate) {
    await prisma.insight.upsert({
      where: { scopeDate_scope: { scopeDate, scope: "daily" } },
      create: {
        scopeDate,
        scope: "daily",
        headline: result.headline,
        body: result.body,
        payload: { alerts: result.alerts, sig } as unknown as object,
        model: result.model,
      },
      update: {
        headline: result.headline,
        body: result.body,
        payload: { alerts: result.alerts, sig } as unknown as object,
        model: result.model,
        createdAt: new Date(),
      },
    });
  }

  // Close the loop: store the live forecast so the next day's check-in can score it.
  if (isLive && scopeDate && result.forecast) {
    await persistForecast(scopeDate, result.forecast, d, result.model);
  }

  return result;
}
