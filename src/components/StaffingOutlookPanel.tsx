import Link from "next/link";
import type { StaffingOutlook, StaffingDay } from "@/lib/dashboard";
import { money, percent, shortDate, weekdayDate } from "@/lib/format";
import { Card, EstBadge, SectionHeader } from "./primitives";
import { Explain } from "./Explain";
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

function statusLabel(status: string, benchmark: string): string {
  if (benchmark === "curve") {
    return status === "short" ? "behind" : status === "over" ? "heavy" : status === "ok" ? "on pace" : "no baseline";
  }
  return status === "short" ? "short" : status === "over" ? "over" : status === "ok" ? "ok" : "no baseline";
}

function gapText(gap: number | null): { text: string; cls: string } {
  if (gap == null) return { text: "—", cls: "text-ink-3" };
  const r = Math.round(gap);
  return { text: `${r >= 0 ? "+" : ""}${r}h`, cls: r < -4 ? "text-rose" : r > 4 ? "text-amber" : "text-ink-2" };
}

function DayStatus({ d }: { d: StaffingDay }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("pill text-[10px] uppercase", PILL[d.status])}>{statusLabel(d.status, d.benchmark)}</span>
      {d.benchmark !== "curve" && <EstBadge note={MODEL_NOTE} />}
    </span>
  );
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
  const curve = so.curveBased;
  // Derivation inputs: booked-event revenue is carried per day; the weekday
  // norm is whatever remains of each day's projection.
  const eventRevTotal = so.days.reduce((s, d) => s + d.events.reduce((x, e) => x + (e.revenue ?? 0), 0), 0);
  const eventCount = so.days.reduce((s, d) => s + d.events.length, 0);
  const normTotal = (t.projectedSales ?? 0) - eventRevTotal;
  const sample = so.days.find((d) => d.projectedSales != null && d.events.length > 0) ?? so.days.find((d) => d.projectedSales != null);
  const sampleEventRev = sample ? sample.events.reduce((x, e) => x + (e.revenue ?? 0), 0) : 0;
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
        subtitle={
          curve
            ? `Schedule build pace vs history — hours usually booked by ${so.asOf ? shortDate(so.asOf) : "now"} for each weekday, from the When I Work audit log`
            : "When I Work schedule vs typical staffing for each weekday (last 4 weeks of actuals, scaled for booked events)"
        }
        right={curve ? undefined : <EstBadge note={MODEL_NOTE} />}
      />

      {/* Week totals */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-canvas-700 px-4 py-3">
          <div className="stat-label">Booked Hours</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-ink">{Math.round(t.scheduledHours)}h</div>
          <div className="mt-0.5 text-[11px] text-ink-3">
            {curve && t.typicalFinalWeek != null
              ? `${t.headcount} people · weeks typically finish ~${t.typicalFinalWeek}h`
              : `${t.headcount} people`}
          </div>
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
            <Explain
              title={`Projected sales ${money(t.projectedSales)} — how it's built`}
              steps={[
                {
                  label: "Weekday norms",
                  detail: `Each day starts from the average for that weekday over the last 4 weeks of actual sales — about ${money(normTotal)} across this week. A typical Tuesday predicts next Tuesday.`,
                },
                {
                  label: "Add booked events",
                  detail: `${eventCount} booked event${eventCount === 1 ? "" : "s"} (Caterease/CaterTrax orders already on the calendar) add ${money(eventRevTotal)} on top of the norms on the days they land.`,
                },
                ...(sample
                  ? [
                      {
                        label: `Example — ${weekdayDate(sample.date)}`,
                        detail:
                          sample.events.length > 0
                            ? `${money((sample.projectedSales ?? 0) - sampleEventRev)} typical for this weekday + ${money(sampleEventRev)} from ${sample.events.length} booked event${sample.events.length === 1 ? "" : "s"} = ${money(sample.projectedSales)}.`
                            : `no events booked, so the day is just its weekday norm: ${money(sample.projectedSales)}.`,
                      },
                    ]
                  : []),
              ]}
              note="Bookings are real orders, not modeled. The weekday-norm half is an estimate — it can't see walk-in swings or holidays yet."
            />
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-ink">{money(t.projectedSales)}</div>
          <div className="mt-0.5 text-[11px] text-ink-3">weekday norms + bookings</div>
        </div>
        <div className="rounded-xl border border-line bg-canvas-700 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="stat-label">Implied Labor %</span>
            <EstBadge note="scheduled labor $ over modeled projected sales" />
            <Explain
              title={`Implied labor ${percent(t.scheduledLaborPct)} — how it's built`}
              steps={[
                {
                  label: "Scheduled labor $",
                  detail: `${money(t.scheduledCost)} — every When I Work shift this week, hours × that person's scheduled rate. This half is real (it's the schedule), not modeled.`,
                },
                {
                  label: "Divide by projected sales",
                  detail: `${money(t.scheduledCost)} ÷ ${money(t.projectedSales)} projected sales = ${percent(t.scheduledLaborPct)}. The projection is the modeled part — weekday norms plus booked events (see the Projected Sales note).`,
                },
                {
                  label: "Compare to reality",
                  detail:
                    t.benchmarkLaborPct != null
                      ? `Recent actual daily labor ran ${percent(t.benchmarkLaborPct)} of sales — the scheduled week should land in that neighborhood once fully built.`
                      : "No recent daily labor benchmark available yet.",
                },
              ]}
              note="Scheduled-rate wages run lower than the comp sheet's loaded payroll cost (taxes, wellness, draws), so don't compare this % directly against the payroll cards above."
            />
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
              <th className="px-2 py-1.5 text-right font-medium">Booked</th>
              <th className="px-2 py-1.5 text-right font-medium">
                <span className="inline-flex items-center gap-1">
                  {curve ? "Usual by now" : "Typical"}
                  <Explain
                    title={curve ? "Usual by now — the schedule build curve" : "Typical hours — how each day's baseline is built"}
                    steps={
                      curve
                        ? [
                            {
                              label: "The build curve",
                              detail:
                                "The When I Work audit log records when every shift was created. Most of each week's hours get added in the final days — so a light day far out is normal, not a crisis.",
                            },
                            {
                              label: "Usual by now",
                              detail:
                                "For each day, we look at how many hours were on the books this same number of days ahead for that weekday over recent weeks, and take the median.",
                            },
                            {
                              label: "Behind / on pace / heavy",
                              detail:
                                "A day flags BEHIND only when it's far under what's usually booked by now (under ~60%). ENDS ~ shows where that weekday's schedule typically finishes.",
                            },
                          ]
                        : [
                            {
                              label: "Weekday average",
                              detail: "Average worked hours for that weekday over the last 4 weeks of actual timesheets — last month's Mondays predict next Monday.",
                            },
                            {
                              label: "Scale for bookings",
                              detail: "If booked events push a day's projected sales above its norm, typical hours scale up by the same ratio (capped at 2×).",
                            },
                            {
                              label: "Gap and status",
                              detail: "Gap = scheduled − typical. A day flags SHORT or OVER when the schedule misses typical by more than the tolerance band.",
                            },
                          ]
                    }
                  />
                </span>
              </th>
              <th className="px-2 py-1.5 text-right font-medium">Gap</th>
              {curve && <th className="px-2 py-1.5 text-right font-medium">Ends ~</th>}
              <th className="px-2 py-1.5 text-right font-medium">Staff</th>
              <th className="px-2 py-1.5 text-right font-medium">Labor $</th>
              <th className="px-2 py-1.5 text-right font-medium">
                <span className="inline-flex items-center gap-1">
                  Proj. Sales
                  <Explain
                    title="Projected sales per day — how it's built"
                    steps={[
                      {
                        label: "Weekday norm",
                        detail: "Average net sales for that weekday over the last 4 weeks of actuals.",
                      },
                      {
                        label: "Plus booked events",
                        detail: "Days tagged with an EVENTS pill add the actual dollar value of Caterease/CaterTrax orders already booked for that date — those dollars are real commitments, not modeled.",
                      },
                    ]}
                  />
                </span>
              </th>
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
                  <td className="px-2 py-1.5 text-right tabular-nums text-ink-2">
                    {d.benchmark === "curve"
                      ? d.typicalByNow != null
                        ? `${Math.round(d.typicalByNow)}h`
                        : "—"
                      : d.expectedHours != null
                        ? `${d.expectedHours}h`
                        : "—"}
                  </td>
                  <td className={cn("px-2 py-1.5 text-right tabular-nums font-medium", gap.cls)}>{gap.text}</td>
                  {curve && (
                    <td className="px-2 py-1.5 text-right tabular-nums text-ink-3">
                      {d.typicalFinal != null ? `${Math.round(d.typicalFinal)}h` : "—"}
                    </td>
                  )}
                  <td className="px-2 py-1.5 text-right tabular-nums text-ink-2">{d.headcount || "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-ink-2">{money(d.scheduledCost)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-ink-2">{money(d.projectedSales)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-ink-2">{percent(d.scheduledLaborPct)}</td>
                  <td className="px-2 py-1.5 text-right">
                    <DayStatus d={d} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Department breakdown */}
      <div className="mt-4">
        <div className="mb-2 text-sm font-semibold text-ink">
          {curve ? "By department · share of this week's booked hours vs typical share" : "By department · scheduled vs recent weekly average"}
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {so.byDepartment.map((d) => {
            const gap = gapText(d.gapHours);
            return (
              <div key={d.department} className="rounded-xl border border-line bg-canvas-700 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">{d.department}</span>
                  <span className="flex items-center gap-1">
                    {!curve && <EstBadge note={MODEL_NOTE} />}
                    <span className={cn("pill text-[10px] uppercase", PILL[d.status])}>
                      {curve
                        ? d.status === "short"
                          ? "light so far"
                          : d.status === "over"
                            ? "heavy"
                            : d.status === "ok"
                              ? "in line"
                              : "no baseline"
                        : statusLabel(d.status, "worked")}
                    </span>
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
                  <span>Booked <b className="tabular-nums text-ink">{Math.round(d.scheduledHours)}h</b></span>
                  {d.share != null && d.typicalShare != null ? (
                    <span>
                      Share <b className="tabular-nums text-ink">{Math.round(d.share * 100)}%</b>{" "}
                      <span className="text-ink-3">vs ~{Math.round(d.typicalShare * 100)}% typical</span>
                    </span>
                  ) : (
                    <>
                      <span>Typical week <b className="tabular-nums text-ink">{d.typicalHours != null ? `${Math.round(d.typicalHours)}h` : "—"}</b></span>
                      <span>Gap <b className={cn("tabular-nums", gap.cls)}>{gap.text}</b></span>
                    </>
                  )}
                  <span>{money(d.scheduledCost)} · {d.headcount} staff</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
        <span className="font-medium text-ink-2">How to read this:</span>{" "}
        {curve ? (
          <>
            Kevin builds most of each week&apos;s schedule in the final days, so days are judged against the{" "}
            <span className="font-medium text-ink-2">build curve</span> — hours usually on the books this many days out for
            that weekday (median of recent weeks, from the When I Work audit log). <span className="font-medium text-ink-2">Behind</span>{" "}
            means far under the usual pace; <span className="font-medium text-ink-2">Ends ~</span> is where the day typically
            finishes. Department pills compare each department&apos;s share of booked hours against its usual share of the week.
          </>
        ) : (
          <>
            &ldquo;typical&rdquo; is the average for that weekday (or department-week) over the last 4 weeks of actuals, scaled
            up when booked events add volume. Short days need shifts added in When I Work; over days are trimmable labor.
          </>
        )}{" "}
        Imported from When I Work exports — automated sync arrives with API credentials.
      </p>
    </Card>
  );
}
