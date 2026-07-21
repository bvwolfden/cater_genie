"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { PhoneCall, Search, CircleCheck, CircleX, UserPlus, X, CalendarPlus } from "lucide-react";

interface Verdict {
  driverKey: string;
  driverName: string;
  feasible: boolean;
  reason: string;
}
interface Suggestion {
  timeLabel: string;
  driverKey: string;
  driverName: string;
  reason: string;
}
interface Result {
  locationNote: string;
  timeMin: number | null;
  modeledKeys: string[];
  atRequested: Verdict[];
  alternatives: Suggestion[];
  blockers: string[];
}

export interface RosterDriver {
  key: string;
  name: string;
  defaultStart: string;
  defaultEnd: string;
}

/**
 * The phone-call flow: business name + day (+ optional asked-for time) →
 * which windows we can offer, with the reasoning spelled out. Companies come
 * from booking history (server-provided) — free-typing a new name still works,
 * it just falls back to the flat spacing rule. Roster drivers not on the day's
 * schedule can be added as WHAT-IF lanes ("what if Alex worked Thursday?") —
 * modeled in the math only, never written to the schedule.
 */
export function SlotFinder({
  date,
  companies,
  roster,
  dayDriverKeys,
}: {
  date: string;
  companies: string[];
  roster: RosterDriver[];
  dayDriverKeys: string[];
}) {
  const router = useRouter();
  const [company, setCompany] = useState("");
  const [time, setTime] = useState("");
  const [extra, setExtra] = useState<RosterDriver[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<string | null>(null);
  const [pendingSlot, setPendingSlot] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const addable = roster.filter((r) => !dayDriverKeys.includes(r.key) && !extra.some((e) => e.key === r.key));

  const search = (extraNow: RosterDriver[] = extra) => {
    setError(null);
    setBooked(null);
    startTransition(async () => {
      const r = await fetch("/api/delivery/feasibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          company: company || undefined,
          time: time || undefined,
          extraDrivers: extraNow.map((e) => ({ key: e.key, name: e.name, start: e.defaultStart, end: e.defaultEnd })),
        }),
      }).catch(() => null);
      if (!r?.ok) {
        setError("Couldn't check availability — try again.");
        return;
      }
      setResult((await r.json()) as Result);
    });
  };

  const addDriver = (key: string) => {
    const d = roster.find((r) => r.key === key);
    if (!d) return;
    const next = [...extra, d];
    setExtra(next);
    if (result) search(next); // refresh an existing answer with the new lane
  };
  const removeDriver = (key: string) => {
    const next = extra.filter((e) => e.key !== key);
    setExtra(next);
    if (result) search(next);
  };

  /** Click a window → pencil the drop onto the board with that driver assigned. */
  const pencilIn = (s: Suggestion) => {
    if (!company.trim()) {
      setError("Type the business name first — the drop needs a name on the board.");
      return;
    }
    setError(null);
    setPendingSlot(`${s.timeLabel}·${s.driverKey}`);
    startTransition(async () => {
      const r = await fetch("/api/delivery/pencil", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, company: company.trim(), time: s.timeLabel, driverKey: s.driverKey }),
      }).catch(() => null);
      setPendingSlot(null);
      if (!r?.ok) {
        setError("Couldn't pencil that in — try again.");
        return;
      }
      setBooked(
        `${company.trim()} penciled in at ${s.timeLabel} under ${s.driverName} — it's on the board below and will clear automatically when the real CaterTrax order syncs in.`
      );
      setResult(null);
      router.refresh();
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
          onClick={() => search()}
          disabled={pending}
          className={cn(
            "flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-600",
            pending && "opacity-60"
          )}
        >
          <Search className="h-3.5 w-3.5" />
          {pending ? "Checking…" : "Find windows"}
        </button>

        {/* What-if drivers: model someone from the roster onto this day */}
        <label className="flex flex-col gap-1">
          <span className="stat-label flex items-center gap-1"><UserPlus className="h-3 w-3" /> What if we add a driver?</span>
          <select
            value=""
            onChange={(e) => e.target.value && addDriver(e.target.value)}
            className="rounded-lg border border-line bg-white px-2 py-1.5 text-[12px] text-ink-2 outline-none transition hover:border-brand/40"
          >
            <option value="">{addable.length ? "pick from roster…" : "everyone's already on this day"}</option>
            {addable.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name} (usually {r.defaultStart}–{r.defaultEnd})
              </option>
            ))}
          </select>
        </label>
      </div>

      {extra.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {extra.map((e) => (
            <span key={e.key} className="pill border border-amber/40 bg-amber/10 px-2 py-1 text-[11px] font-medium text-amber">
              {e.name} · {e.defaultStart}–{e.defaultEnd} · what-if
              <button onClick={() => removeDriver(e.key)} className="ml-1 hover:text-ink" title="Remove">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <span className="text-[11px] text-ink-3">modeled only — nothing is added to the real schedule</span>
        </div>
      )}

      {error && <p className="mt-2 text-[12px] text-rose">{error}</p>}
      {booked && (
        <p className="mt-2 flex items-start gap-1.5 text-[12px] text-mint">
          <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {booked}
        </p>
      )}

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
                {result.alternatives.map((s, i) => {
                  const whatIf = result.modeledKeys?.includes(s.driverKey);
                  if (whatIf) {
                    return (
                      <span
                        key={i}
                        title={`${s.reason} (only if ${s.driverName} gets a shift that day — can't be booked yet)`}
                        className="pill border border-amber/40 bg-amber/10 px-2.5 py-1 text-[12px] font-medium text-amber"
                      >
                        {s.timeLabel} · {s.driverName} · what-if
                      </span>
                    );
                  }
                  const busy = pendingSlot === `${s.timeLabel}·${s.driverKey}`;
                  return (
                    <button
                      key={i}
                      onClick={() => pencilIn(s)}
                      disabled={pending}
                      title={`${s.reason} Click to pencil this drop onto the board under ${s.driverName}.`}
                      className={cn(
                        "pill border border-mint/40 bg-mint/10 px-2.5 py-1 text-[12px] font-medium text-mint transition hover:border-mint hover:bg-mint/20",
                        busy && "opacity-60"
                      )}
                    >
                      <CalendarPlus className="h-3 w-3" />
                      {busy ? "Penciling…" : `${s.timeLabel} · ${s.driverName}`}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-[13px] text-ink-2">
                No open windows this day — every driver is committed. Try the &ldquo;what if we add a driver?&rdquo; picker or another day.
              </p>
            )}
            {result.alternatives.length > 0 && (
              <p className="mt-1.5 text-[11px] text-ink-3">
                Hover a window for the why (which drops it fits between). Click one to pencil the drop onto the board with that driver assigned.
                {result.modeledKeys?.length ? " Amber windows exist only if the what-if driver actually gets scheduled." : ""}
              </p>
            )}
          </div>
        </div>
      )}
      {!result && !booked && (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-3">
          <PhoneCall className="h-3.5 w-3.5" />
          Someone on the phone? Type their business, pick the day above, and see what you can promise.
        </p>
      )}
    </div>
  );
}
