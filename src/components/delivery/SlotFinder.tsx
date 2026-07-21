"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { PhoneCall, Search, CircleCheck, CircleX } from "lucide-react";

interface Verdict {
  driverName: string;
  feasible: boolean;
  reason: string;
}
interface Suggestion {
  timeLabel: string;
  driverName: string;
  reason: string;
}
interface Result {
  locationNote: string;
  timeMin: number | null;
  atRequested: Verdict[];
  alternatives: Suggestion[];
  blockers: string[];
}

/**
 * The phone-call flow: business name + day (+ optional asked-for time) →
 * which windows we can offer, with the reasoning spelled out. Companies come
 * from booking history (server-provided) — free-typing a new name still works,
 * it just falls back to the flat spacing rule.
 */
export function SlotFinder({ date, companies }: { date: string; companies: string[] }) {
  const [company, setCompany] = useState("");
  const [time, setTime] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const search = () => {
    setError(null);
    startTransition(async () => {
      const r = await fetch("/api/delivery/feasibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, company: company || undefined, time: time || undefined }),
      }).catch(() => null);
      if (!r?.ok) {
        setError("Couldn't check availability — try again.");
        return;
      }
      setResult((await r.json()) as Result);
    });
  };

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-xs">
          <span className="stat-label">Business</span>
          <input
            list="slotfinder-companies"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="who's calling? (or leave blank)"
            className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink outline-none transition focus:border-brand/50"
          />
          <datalist id="slotfinder-companies">
            {companies.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1">
          <span className="stat-label">They want (optional)</span>
          <input
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="e.g. 11:30 AM"
            className="w-28 rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink outline-none transition focus:border-brand/50"
          />
        </label>
        <button
          onClick={search}
          disabled={pending}
          className={cn(
            "flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-600",
            pending && "opacity-60"
          )}
        >
          <Search className="h-3.5 w-3.5" />
          {pending ? "Checking…" : "Find windows"}
        </button>
      </div>

      {error && <p className="mt-2 text-[12px] text-rose">{error}</p>}

      {result && (
        <div className="mt-3 space-y-3">
          <p className="text-[12px] text-ink-3">{result.locationNote}</p>
          {result.blockers.map((b, i) => (
            <p key={i} className="text-[12px] text-amber">{b}</p>
          ))}

          {result.atRequested.length > 0 && (
            <div>
              <div className="mb-1 text-[12px] font-semibold text-ink">At the time they asked for:</div>
              <ul className="space-y-1">
                {result.atRequested.map((v, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[13px] text-ink-2">
                    {v.feasible ? (
                      <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mint" />
                    ) : (
                      <CircleX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose" />
                    )}
                    <span><b className="text-ink">{v.driverName}</b> — {v.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div className="mb-1 text-[12px] font-semibold text-ink">
              {result.timeMin != null ? "Windows we can offer (nearest their ask first):" : "Windows we can offer:"}
            </div>
            {result.alternatives.length ? (
              <div className="flex flex-wrap gap-1.5">
                {result.alternatives.map((s, i) => (
                  <span key={i} title={s.reason} className="pill border border-mint/40 bg-mint/10 px-2.5 py-1 text-[12px] font-medium text-mint">
                    {s.timeLabel} · {s.driverName}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-ink-2">No open windows this day — every driver is committed. Consider another day or adding a driver shift.</p>
            )}
            {result.alternatives.length > 0 && (
              <p className="mt-1.5 text-[11px] text-ink-3">Hover a window for the why (which drops it fits between).</p>
            )}
          </div>
        </div>
      )}
      {!result && (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-3">
          <PhoneCall className="h-3.5 w-3.5" />
          Someone on the phone? Type their business, pick the day above, and see what you can promise.
        </p>
      )}
    </div>
  );
}
