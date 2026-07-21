"use client";

import { useState } from "react";
import { Sparkles, RefreshCw, AlertTriangle, Info, OctagonAlert, Target } from "lucide-react";
import { ProjBadge } from "./primitives";
import { cn } from "@/lib/cn";

type Alert = { severity: "info" | "warn" | "alert"; title: string; detail: string };
type Forecast = {
  targetDate: string;
  netSales: number | null;
  laborPct: number | null;
  weekNetSales: number | null;
  rationale: string | null;
  baselineNetSales: number | null;
};
type Accuracy = {
  n: number;
  mapePct: number | null;
  baselineMapePct: number | null;
  last: { targetDate: string; predNetSales: number | null; actualNetSales: number | null; errorPct: number | null }[];
};
export interface Insight {
  headline: string;
  body: string;
  alerts: Alert[];
  model: string;
  generatedAt: string;
  cached: boolean;
  forecast?: Forecast | null;
  accuracy?: Accuracy | null;
}

const usd = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

// Tiny markdown: paragraphs + **bold**.
function renderBody(body: string) {
  return body.split(/\n\n+/).map((para, i) => {
    const parts = para.split(/(\*\*[^*]+\*\*)/g).map((seg, j) =>
      seg.startsWith("**") && seg.endsWith("**") ? (
        <strong key={j} className="font-semibold text-ink">
          {seg.slice(2, -2)}
        </strong>
      ) : (
        <span key={j}>{seg}</span>
      )
    );
    return (
      <p key={i} className="text-sm leading-relaxed text-ink-2">
        {parts}
      </p>
    );
  });
}

const sevStyle: Record<Alert["severity"], { icon: typeof Info; cls: string; iconCls: string }> = {
  info: { icon: Info, cls: "border-cyan/20 bg-cyan/5", iconCls: "text-cyan" },
  warn: { icon: AlertTriangle, cls: "border-amber/30 bg-amber/10", iconCls: "text-amber" },
  alert: { icon: OctagonAlert, cls: "border-rose/20 bg-rose/5", iconCls: "text-rose" },
};

export function InsightsPanel({ initial }: { initial: Insight }) {
  const [insight, setInsight] = useState<Insight>(initial);
  const [loading, setLoading] = useState(false);

  async function regenerate() {
    setLoading(true);
    try {
      const res = await fetch("/api/insights", { method: "POST" });
      if (res.ok) setInsight(await res.json());
    } finally {
      setLoading(false);
    }
  }

  const isLLM = insight.model !== "rules-engine" && insight.model !== "cache";
  const acc = insight.accuracy;
  const fc = {
    accChip:
      acc && acc.n > 0 && acc.mapePct != null
        ? `±${(acc.mapePct * 100).toFixed(0)}% over ${acc.n}d` +
          (acc.baselineMapePct != null ? ` · base ±${(acc.baselineMapePct * 100).toFixed(0)}%` : "")
        : null,
  };

  return (
    <div className="card card-pad relative overflow-hidden">
      <div className="pointer-events-none absolute -right-20 -top-20 h-44 w-44 rounded-full bg-brand/10 blur-3xl" />
      <div className="relative">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand/10 text-brand">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <div className="text-sm font-semibold text-ink">AI Insights</div>
              <div className="text-[11px] text-ink-3">
                {isLLM ? `AI · ${insight.model}` : "Rules engine (set an LLM API key)"}
              </div>
            </div>
          </div>
          <button
            onClick={regenerate}
            disabled={loading}
            className="pill border border-line bg-white text-ink-2 transition hover:border-brand/40 hover:text-brand disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
            {loading ? "Thinking…" : "Regenerate"}
          </button>
        </div>

        <h3 className="mb-3 text-base font-semibold leading-snug text-ink">{insight.headline}</h3>

        <div className="space-y-2.5">{renderBody(insight.body)}</div>

        {insight.forecast && insight.forecast.netSales != null && (
          <div className="mt-4 rounded-xl border border-brand/20 bg-brand/5 px-3 py-2.5">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-brand" />
              <span className="text-xs font-semibold text-ink">
                Forecast · {shortDate(insight.forecast.targetDate)}
              </span>
              <ProjBadge />
              {fc.accChip && (
                <span className="ml-auto rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-ink-2">
                  {fc.accChip}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <div>
                <span className="text-lg font-semibold text-ink">{usd(insight.forecast.netSales)}</span>
                <span className="ml-1 text-[11px] text-ink-3">net sales</span>
              </div>
              {insight.forecast.laborPct != null && (
                <div className="text-xs text-ink-2">labor {pct(insight.forecast.laborPct)}</div>
              )}
              {insight.forecast.weekNetSales != null && (
                <div className="text-xs text-ink-2">next 7d {usd(insight.forecast.weekNetSales)}</div>
              )}
              {insight.forecast.baselineNetSales != null && (
                <div className="text-[11px] text-ink-3">vs baseline {usd(insight.forecast.baselineNetSales)}</div>
              )}
            </div>
            {insight.forecast.rationale && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">{insight.forecast.rationale}</p>
            )}
          </div>
        )}

        {insight.alerts.length > 0 && (
          <div className="mt-4 space-y-2">
            {insight.alerts.map((a, i) => {
              const { icon: Icon, cls, iconCls } = sevStyle[a.severity] ?? sevStyle.info;
              return (
                <div key={i} className={cn("flex gap-2.5 rounded-xl border px-3 py-2", cls)}>
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconCls)} />
                  <div>
                    <div className="text-xs font-semibold text-ink">{a.title}</div>
                    <div className="text-xs text-ink-2">{a.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
