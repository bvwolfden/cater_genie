"use client";

import { useState } from "react";
import { Sparkles, RefreshCw, AlertTriangle, Info, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/cn";

type Alert = { severity: "info" | "warn" | "alert"; title: string; detail: string };
export interface Insight {
  headline: string;
  body: string;
  alerts: Alert[];
  model: string;
  generatedAt: string;
  cached: boolean;
}

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

  const isLLM = insight.model.startsWith("claude");

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
                {isLLM ? `Claude · ${insight.model}` : "Rules engine (set ANTHROPIC_API_KEY for LLM)"}
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
