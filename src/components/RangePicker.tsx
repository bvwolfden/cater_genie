"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function RangePicker({
  from,
  to,
  availableDates,
}: {
  from: string | null;
  to: string | null;
  availableDates: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const anchor = to || availableDates[availableDates.length - 1];
  const first = availableDates[0];

  function apply(f: string | null, t: string | null) {
    const q = new URLSearchParams(params.toString());
    if (f) q.set("from", f);
    else q.delete("from");
    if (t) q.set("to", t);
    else q.delete("to");
    const qs = q.toString();
    router.push(qs ? `/?${qs}` : "/");
  }

  const presets: { key: string; label: string; from: string }[] = anchor
    ? [
        { key: "14d", label: "14d", from: addDays(anchor, -13) },
        { key: "30d", label: "30d", from: addDays(anchor, -29) },
        { key: "90d", label: "90d", from: addDays(anchor, -89) },
        { key: "mtd", label: "MTD", from: `${anchor.slice(0, 7)}-01` },
        { key: "ytd", label: "YTD", from: `${anchor.slice(0, 4)}-01-01` },
        { key: "all", label: "All", from: first },
      ]
    : [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-lg border border-line bg-canvas-700 p-0.5">
        {presets.map((p) => {
          const active = from === p.from;
          return (
            <button
              key={p.key}
              onClick={() => apply(p.from, anchor)}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium transition",
                active ? "bg-brand text-white" : "text-ink-2 hover:bg-canvas-600 hover:text-ink"
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1 text-xs text-ink-2">
        <input
          type="date"
          value={from ?? ""}
          min={first}
          max={anchor}
          onChange={(e) => apply(e.target.value || null, anchor)}
          className="rounded-md border border-line bg-white px-2 py-1 text-ink outline-none focus:border-brand/50"
        />
        <span>→</span>
        <input
          type="date"
          value={to ?? ""}
          min={first}
          max={availableDates[availableDates.length - 1]}
          onChange={(e) => apply(from, e.target.value || null)}
          className="rounded-md border border-line bg-white px-2 py-1 text-ink outline-none focus:border-brand/50"
        />
      </div>
    </div>
  );
}
