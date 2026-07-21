import Link from "next/link";
import type { StaffingOutlook } from "@/lib/dashboard";
import { money, percent, shortDate, weekdayDate } from "@/lib/format";
import { Card, EstBadge, SectionHeader } from "./primitives";
import { cn } from "@/lib/cn";
import { CalendarClock, UploadCloud } from "lucide-react";

const MODEL_NOTE =
  "modeled demand — “typical” staffing is the last 4 weeks of actuals scaled for booked events; real bookings/schedule data will replace this";

const PILL: Record<string, string> = {
  short: "bg-rose/10 text-rose",
  over: "bg-amber/10 text-amber",
  ok: "bg-mint/10 text-mint",
  unknown: "bg-ink-3/10 text-ink-3",
};

const STATUS_LABEL: Record<string, string> = {
  short: "short",
  over: "over",
  ok: "ok",
  unknown: "no baseline",
};

function gapText(gap: number | null): { text: string; cls: string } {
  if (gap == null) return { text: "—", cls: "text-ink-3" };
  const r = Math.round(gap);
  return { text: `${r >= 0 ? "+" : ""}${r}h`, cls: r < -4 ? "text-rose" : r > 4 ? "text-amber" : "text-ink-2" };
}

/** Labor page: full scheduled-vs-typical breakdown for the imported week. */
export function StaffingOutlookPanel({ so }: { so: StaffingOutlook | null }) {
  if (!so) {
    return (
      <Card className="card-pad">
        <SectionHeader
          title={
            <span className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-md bg-brand/10 text-brand">
                <CalendarClock className="h-3.5 w-3.5" />
              </span>
              Staffing Outlook — Scheduled vs Typical
            </span>
          }
          subtitle="Flags over/under-staffed days before the week starts"
        />
        <div className="grid place-items-center rounded-xl border border-dashed border-line px-6 py-8 text-center">
          <UploadCloud className="mb-2 h-6 w-6 text-ink-3" />
          <p className="text-sm text-ink-2">No upcoming schedule on file.</p>
          <p className="mt-1 max-w-md text-[12px] text-ink-3">
            Export the week&apos;s schedule from When I Work and drop it on the{" "}
            <Link href="/import" className="font-medium text-brand hover:underline">Import page</Link> — this panel fills in
            automatically. (Direct When I Work sync lands once API credentials arrive.)
          </p>
        </div>
      </Card>
    );
  }

  const t = so.totals;
  return (
    <Card className="card-pad">
      <SectionHeader
        title={
          <span className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-brand/10 text-brand">
              <CalendarClock className="h-3.5 w-3.5" />
            </span>
            Staffing Outlook · {shortDate(so.window.from)} – {shortDate(so.window.to)}
          </span>
        }
        subtitle="When I Work schedule vs typical staffing for each weekday (last 4 weeks of actuals, scaled for booked events)"
        right={<EstBadge note={MODEL_NOTE} />}
      />

      {/* Week totals */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-canvas-700 px-4 py-3">
          <div className="stat-label">Scheduled Hours</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-ink">{Math.round(t.scheduledHours)}h</div>
          <div className="mt-0.5 text-[11px] text-ink-3">{t.headcount} people</div>
        </div>
        <div className="rounded-xl border border-line bg-canvas-700 px-4 py-3">
          <div className="stat-label">Scheduled Labor $</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-ink">{money(t.scheduledCost)}</div>
          <div className="mt-0.5 text-[11px] text-ink-3">hours × scheduled rate</div>
        </div>
        <div className="rounded-xl border border-line bg-canvas-700 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="stat-label">Projected Sales</span>
            <EstBadge note={MODEL_NOTE} />
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-ink">{money(t.projectedSales)}</div>
          <div className="mt-0.5 text-[11px] text-ink-3">weekday norms + bookings</div>
        </div>
        <div className="rounded-xl border border-line bg-canvas-700 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="stat-label">Implied Labor %</span>
            <EstBadge note="scheduled labor $ over modeled projected sales" />
          </div>
          <div
            className={cn(
              "mt-1 text-xl font-semibold tabular-nums",
              (t.scheduledLaborPct ?? 0) >= 0.35 ? "text-rose" : (t.scheduledLaborPct ?? 0) >= 0.28 ? "text-amber" : "text-mint"
            )}
          >
            {percent(t.scheduledLaborPct)}
          </div>
          <div className="mt-0.5 text-[11px] text-ink-3">
            {t.benchmarkLaborPct != null ? `recent actual ${percent(t.benchmarkLaborPct)}` : "no recent benchmark"}
          </div>
        </div>
      </div>

      {/* Day-by-day */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line text-left text-[10px] uppercase tracking-wide text-ink-3">
              <th className="px-2 py-1.5 font-medium">Day</th>
              <th className="px-2 py-1.5 text-right font-medium">Scheduled</th>
              <th className="px-2 py-1.5 text-right font-medium">Typical</th>
              <th className="px-2 py-1.5 text-right font-medium">Gap</th>
              <th className="px-2 py-1.5 text-right font-medium">Staff</th>
              <th className="px-2 py-1.5 text-right font-medium">Labor $</th>
              <th className="px-2 py-1.5 text-right font-medium">Proj. Sales</th>
              <th className="px-2 py-1.5 text-right font-medium">Labor %</th>
              <th className="px-2 py-1.5 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {so.days.map((d) => {
              const gap = gapText(d.gapHours);
              return (
                <tr key={d.date} className="border-b border-line/50">
                  <td className="px-2 py-1.5 font-medium text-ink">
                    {weekdayDate(d.date)}
                    {d.events.length > 0 && (
                      <span className="ml-1.5 rounded bg-brand/10 px-1 py-0.5 text-[9px] font-semibold uppercase text-brand">
                        {d.events.length} event{d.events.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-ink">{d.scheduledHours}h</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-ink-2">{d.expectedHours != null ? `${d.expectedHours}h` : "—"}</td>
                  <td className={cn("px-2 py-1.5 text-right tabular-nums font-medium", gap.cls)}>{gap.text}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-ink-2">{d.headcount || "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-ink-2">{money(d.scheduledCost)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-ink-2">{money(d.projectedSales)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-ink-2">{percent(d.scheduledLaborPct)}</td>
                  <td className="px-2 py-1.5 text-right">
                    <span className="inline-flex items-center gap-1">
                      <span className={cn("pill text-[10px] uppercase", PILL[d.status])}>{STATUS_LABEL[d.status]}</span>
                      <EstBadge note={MODEL_NOTE} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Department breakdown */}
      <div className="mt-4">
        <div className="mb-2 text-sm font-semibold text-ink">By department · scheduled vs recent weekly average</div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {so.byDepartment.map((d) => {
            const gap = gapText(d.gapHours);
            return (
              <div key={d.department} className="rounded-xl border border-line bg-canvas-700 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">{d.department}</span>
                  <span className="flex items-center gap-1">
                    <EstBadge note={MODEL_NOTE} />
                    <span className={cn("pill text-[10px] uppercase", PILL[d.status])}>{STATUS_LABEL[d.status]}</span>
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
                  <span>Scheduled <b className="tabular-nums text-ink">{Math.round(d.scheduledHours)}h</b></span>
                  <span>Typical <b className="tabular-nums text-ink">{d.typicalHours != null ? `${Math.round(d.typicalHours)}h` : "—"}</b></span>
                  <span>Gap <b className={cn("tabular-nums", gap.cls)}>{gap.text}</b></span>
                  <span>{money(d.scheduledCost)} · {d.headcount} staff</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
        <span className="font-medium text-ink-2">How to read this:</span> &ldquo;typical&rdquo; is the average for that weekday
        (or department-week) over the last 4 weeks of actuals, scaled up when booked events add volume. Short days need shifts
        added in When I Work; over days are trimmable labor. Imported from the When I Work schedule export — automated sync
        arrives with API credentials.
      </p>
    </Card>
  );
}
