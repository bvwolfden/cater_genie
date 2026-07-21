"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { cn } from "@/lib/cn";

type PeriodKey = "day" | "week" | "month" | "quarter" | "ytd" | "custom";

const PRESETS: { key: PeriodKey; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "quarter", label: "Qtr" },
  { key: "ytd", label: "YTD" },
  { key: "custom", label: "Custom" },
];

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function addMonths(iso: string, months: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function PeriodPicker({
  period,
  selected,
  latest,
  first,
  from,
  to,
}: {
  period: PeriodKey;
  selected: string | null; // anchor (reporting day)
  latest: string | null; // most recent day with data
  first: string | null; // earliest day with data
  from: string | null; // custom range
  to: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const anchor = selected ?? latest;

  function apply(next: { period?: PeriodKey; date?: string | null; from?: string | null; to?: string | null }) {
    const q = new URLSearchParams(params.toString());
    const p = next.period ?? period;
    if (p === "week") q.delete("period");
    else q.set("period", p);
    const d = next.date === undefined ? (p === "custom" ? null : anchor) : next.date;
    if (d && d !== latest) q.set("date", d);
    else q.delete("date");
    if (p === "custom") {
      const f = next.from === undefined ? from : next.from;
      const t = next.to === undefined ? to : next.to;
      if (f) q.set("from", f);
      else q.delete("from");
      if (t) q.set("to", t);
      else q.delete("to");
    } else {
      // from/to belong to the chart's RangePicker outside custom mode; a period
      // switch resets them so the chart follows the period.
      q.delete("from");
      q.delete("to");
    }
    const qs = q.toString();
    router.push(qs ? `/?${qs}` : "/");
    router.refresh();
  }

  function step(dir: 1 | -1) {
    if (!anchor) return;
    if (period === "custom") {
      if (!from || !to) return;
      const len = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
      apply({ from: addDays(from, dir * len), to: addDays(to, dir * len) });
      return;
    }
    const stepped =
      period === "day" ? addDays(anchor, dir)
      : period === "week" ? addDays(anchor, dir * 7)
      : period === "month" ? addMonths(anchor, dir)
      : period === "quarter" ? addMonths(anchor, dir * 3)
      : addMonths(anchor, dir * 12); // ytd
    apply({ date: stepped });
  }

  const canForward = Boolean(anchor && latest && anchor < latest) || period === "custom";
  const canBack = Boolean(anchor && first && anchor > first);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="stat-label hidden sm:block">Reporting period</span>
      <div className="flex items-center gap-0.5 rounded-lg border border-line bg-canvas-700 p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => apply({ period: p.key })}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium transition",
              period === p.key ? "bg-brand text-white" : "text-ink-2 hover:bg-canvas-600 hover:text-ink"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1 rounded-lg border border-line bg-canvas-700 p-1">
        <button
          onClick={() => step(-1)}
          disabled={!canBack}
          className="grid h-7 w-7 place-items-center rounded-md text-ink-2 hover:bg-canvas-600 hover:text-ink disabled:opacity-30"
          aria-label="Previous period"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {period === "custom" ? (
          <div className="flex items-center gap-1 px-1 text-xs">
            <input
              type="date"
              value={from ?? ""}
              min={first ?? undefined}
              max={to ?? latest ?? undefined}
              onChange={(e) => apply({ from: e.target.value || null })}
              className="rounded-md border border-line bg-white px-1.5 py-0.5 text-ink outline-none focus:border-brand/50"
            />
            <span className="text-ink-3">→</span>
            <input
              type="date"
              value={to ?? ""}
              min={from ?? first ?? undefined}
              max={latest ?? undefined}
              onChange={(e) => apply({ to: e.target.value || null })}
              className="rounded-md border border-line bg-white px-1.5 py-0.5 text-ink outline-none focus:border-brand/50"
            />
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-brand" />
            <input
              type="date"
              value={anchor ?? ""}
              min={first ?? undefined}
              max={latest ?? undefined}
              onChange={(e) => e.target.value && apply({ date: e.target.value })}
              className="bg-transparent text-sm font-semibold text-ink outline-none"
              aria-label="Anchor date"
            />
          </div>
        )}
        <button
          onClick={() => step(1)}
          disabled={!canForward}
          className="grid h-7 w-7 place-items-center rounded-md text-ink-2 hover:bg-canvas-600 hover:text-ink disabled:opacity-30"
          aria-label="Next period"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
