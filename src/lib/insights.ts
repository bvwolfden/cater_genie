import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./db";
import type { Dashboard } from "./dashboard";
import { money, percent } from "./format";
import { channelLabelOf } from "./labels";

export type AlertSeverity = "info" | "warn" | "alert";

export interface InsightResult {
  headline: string;
  body: string; // markdown
  alerts: { severity: AlertSeverity; title: string; detail: string }[];
  model: string;
  generatedAt: string;
  cached: boolean;
}

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

/** Compact, numeric snapshot handed to the model (or the rules engine). */
function buildContext(d: Dashboard) {
  const k = d.kpis;
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
    recentWeeks: d.weekly.slice(-6).map((w) => ({
      week: w.weekStart,
      revenue: w.total,
      priorYear: w.priorYear,
      projected: w.projected,
      laborPct: w.laborPct,
    })),
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

  // Projection variance on the most recent week with data.
  const lastWeek = d.weekly.filter((w) => w.total != null && w.projected != null).slice(-1)[0];
  if (lastWeek && lastWeek.projected) {
    const variance = (lastWeek.total! - lastWeek.projected) / lastWeek.projected;
    alerts.push({
      severity: variance < -0.1 ? "warn" : "info",
      title: variance >= 0 ? "Ahead of projection" : "Behind projection",
      detail: `Week of ${lastWeek.weekStart}: ${money(lastWeek.total)} vs projected ${money(lastWeek.projected)} (${percent(variance)}).`,
    });
  }

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
async function llmInsight(d: Dashboard): Promise<InsightResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const ctx = buildContext(d);

  const system =
    "You are the operations analyst for a restaurant/catering company. You read a daily metrics snapshot and produce sharp, specific, numeric insights a GM can act on this morning. Be concise. Prefer concrete numbers and dollar figures over generic advice. Flag real risks: labor % above ~35% of sales, negative cash/operating balances, weeks tracking behind projection. Never invent data not present.";

  const prompt =
    "Here is today's snapshot as JSON:\n\n" +
    JSON.stringify(ctx, null, 2) +
    '\n\nRespond with ONLY a JSON object (no markdown fences) of shape:\n' +
    '{ "headline": string (<=90 chars), "body": string (markdown, 3-5 short paragraphs or bullets), "alerts": [{ "severity": "info"|"warn"|"alert", "title": string, "detail": string }] }';

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system,
    messages: [{ role: "user", content: prompt }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  let parsed: Partial<InsightResult> = {};
  try {
    const clean = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    parsed = JSON.parse(clean);
  } catch {
    parsed = { headline: "Daily insights", body: text, alerts: [] };
  }

  return {
    headline: parsed.headline || "Daily insights",
    body: parsed.body || "",
    alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
    model: MODEL,
    generatedAt: new Date().toISOString(),
    cached: false,
  };
}

/** Get insight for the latest day, using cache unless `force`. */
export async function getInsight(d: Dashboard, opts: { force?: boolean } = {}): Promise<InsightResult> {
  const scopeISO = d.selectedDate ?? d.latestDate;
  const scopeDate = scopeISO ? new Date(`${scopeISO}T00:00:00Z`) : null;
  const k = d.kpis;
  // Signature so the cache auto-invalidates when the day's numbers change.
  const sig = `${scopeISO}|${Math.round(k.netSales ?? 0)}|${Math.round(k.laborCost ?? 0)}|${Math.round(k.cashPosition ?? 0)}`;

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
      };
    }
  }

  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  let result: InsightResult;
  try {
    result = hasKey ? await llmInsight(d) : rulesEngine(d);
  } catch (err) {
    // Fall back gracefully if the API call fails.
    result = rulesEngine(d);
    result.headline = result.headline + " (fallback)";
    console.error("AI insight failed, used rules engine:", err);
  }

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

  return result;
}
