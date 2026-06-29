import type { ForwardPlanning } from "@/lib/dashboard";
import { shortDate } from "@/lib/format";
import { Card, SectionHeader, ChartLegend } from "./primitives";
import { CapacityChart } from "./charts";
import { cn } from "@/lib/cn";
import { TriangleAlert, CalendarClock } from "lucide-react";

const STATUS: Record<string, string> = {
  short: "bg-rose/10 text-rose",
  tight: "bg-amber/10 text-amber",
  over: "bg-amber/10 text-amber",
  ok: "bg-mint/10 text-mint",
  covered: "bg-mint/10 text-mint",
};

function StubBanner() {
  return (
    <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber/30 bg-amber/10 px-3 py-2 text-[11px] text-ink-2">
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
      <span>
        <span className="font-semibold text-amber">Projected / stub.</span> Schedules (When I Work) and bookings (Caterease/CaterTrax) aren&apos;t connected yet —
        demand is modeled from seasonality and last week&apos;s hours. Delivery is short-lead (1–2 wks); catering is more predictable.
      </span>
    </div>
  );
}

export function ForwardCoverage({ fp }: { fp: ForwardPlanning }) {
  return (
    <Card className="card-pad">
      <SectionHeader
        title={
          <span className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-brand/10 text-brand">
              <CalendarClock className="h-3.5 w-3.5" />
            </span>
            Coverage & Capacity — Next 2 Weeks
          </span>
        }
        subtitle="Forecast demand (ongoing ops + booked events) vs available labor, by department"
      />
      <StubBanner />

      {/* Department coverage */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="stat-label pb-2">Department</th>
              <th className="stat-label pb-2 text-right">Demand</th>
              <th className="stat-label pb-2 text-right">Available</th>
              <th className="stat-label pb-2 text-right">Gap</th>
              <th className="stat-label pb-2 pl-3">Status &amp; recommendation</th>
            </tr>
          </thead>
          <tbody>
            {fp.coverage.map((c) => (
              <tr key={c.dept} className="border-b border-line/70 last:border-0">
                <td className="py-2 font-medium text-ink">{c.dept}</td>
                <td className="py-2 text-right tabular-nums text-ink-2">{Math.round(c.demandHours)}h</td>
                <td className="py-2 text-right tabular-nums text-ink-2">{Math.round(c.availableHours)}h</td>
                <td className={cn("py-2 text-right font-medium tabular-nums", c.gapHours < -4 ? "text-rose" : c.gapHours > 0 ? "text-mint" : "text-ink-2")}>
                  {c.gapHours >= 0 ? "+" : ""}{Math.round(c.gapHours)}h
                </td>
                <td className="py-2 pl-3">
                  <span className={cn("pill mr-2 text-[10px] uppercase", STATUS[c.status])}>{c.status}</span>
                  <span className="text-[12px] text-ink-2">{c.recommendation}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {fp.pto.length > 0 && (
        <p className="mt-2 text-[11px] text-ink-3">
          Time-off (stub): {fp.pto.map((p) => `${p.name} (${p.dept}, ${p.dates})`).join("; ")}.
        </p>
      )}

      {/* Upcoming events */}
      {fp.events.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-sm font-semibold text-ink">Upcoming events & required staff</div>
          <div className="space-y-2">
            {fp.events.map((e, i) => (
              <div key={i} className="rounded-xl border border-line bg-canvas-700 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-ink">
                    {shortDate(e.date)} · {e.name} <span className="text-ink-3">· {e.line}</span>
                  </div>
                  <span className={cn("pill text-[10px] uppercase", STATUS[e.status])}>{e.status}</span>
                </div>
                <div className="mt-1 text-[12px] text-ink-2">
                  ~{e.requiredHours}h · {e.depts.join(", ")} — {e.recommendation}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6-week capacity outlook */}
      {fp.capacityWeeks.length > 0 && (
        <div className="mt-4">
          <SectionHeader
            title="Capacity vs Demand · next 6 weeks"
            subtitle="Available labor hours vs forecast need (factoring stubbed time-off)"
            right={<ChartLegend items={[{ color: "#9fd8d6", label: "Capacity" }, { color: "#FF385C", label: "Demand" }]} />}
          />
          <CapacityChart data={fp.capacityWeeks} />
        </div>
      )}
    </Card>
  );
}
