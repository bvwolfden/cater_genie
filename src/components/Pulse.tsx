import type { Pulse as PulseData } from "@/lib/dashboard";
import { money, percent } from "@/lib/format";
import { Card, SectionHeader, ChartLegend } from "./primitives";
import { PulseChart } from "./PulseChart";
import { Activity } from "lucide-react";
import { cn } from "@/lib/cn";

function Stat({ label, value, sub, accent = "text-ink" }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-line bg-canvas-700 px-4 py-3">
      <div className="stat-label">{label}</div>
      <div className={cn("mt-1 text-xl font-semibold tabular-nums", accent)}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-ink-3">{sub}</div>}
    </div>
  );
}

export function Pulse({ pulse }: { pulse: PulseData }) {
  const a = pulse.assumptions;
  const { ytd, projectedYearEnd: eoy } = pulse;
  return (
    <Card className="card-pad">
      <SectionHeader
        title={
          <span className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-brand/10 text-brand">
              <Activity className="h-3.5 w-3.5" />
            </span>
            Pulse of the Business
          </span>
        }
        subtitle="Cumulative revenue, cost & profit — actual + seasonal projection vs last year"
        right={
          <ChartLegend
            items={[
              { color: "#FF385C", label: "Revenue" },
              { color: "#FFB400", label: "Costs" },
              { color: "#00A699", label: "Profit" },
              { color: "#B0B0B0", label: "2025" },
            ]}
            note="solid = actual, dotted = projected"
          />
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Revenue · YTD" value={money(ytd.revenue)} sub={ytd.throughWeek ? `through ${ytd.throughWeek}` : undefined} />
        <Stat label="Gross Margin · YTD" value={money(ytd.grossProfit)} sub={`${percent(ytd.grossMarginPct)} of revenue`} accent="text-ink" />
        <Stat label="Net Profit · YTD" value={money(ytd.profit)} accent={ytd.profit >= 0 ? "text-mint" : "text-rose"} sub={`${percent(ytd.marginPct)} net margin`} />
        <Stat label="Proj. Net Profit · Year-end" value={money(eoy.profit)} accent={eoy.profit >= 0 ? "text-mint" : "text-rose"} sub={`on ${money(eoy.revenue)} revenue`} />
      </div>

      <PulseChart points={pulse.points} boundary={ytd.throughWeek} />

      <div className="mt-3 space-y-2 text-[11px] leading-relaxed text-ink-3">
        <p>
          <span className="font-medium text-ink-2">Seasonal projection:</span> the rest of the year follows{" "}
          <span className="font-medium text-ink-2">2025&apos;s weekly pattern</span> scaled to 2026&apos;s pace
          (<span className="font-medium text-ink-2">{percent(a.yoyGrowthPct, 1)} YoY</span>) — not a straight line. The gray line is last year for reference.
          Gross margin = revenue − labor (<span className="font-medium text-ink-2">{percent(a.laborPct)}</span>) − food (<span className="font-medium text-ink-2">{percent(a.foodPct)}</span>).
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-ink-2">Net profit also subtracts (stubbed until connected):</span>
          {pulse.stubbedCosts.map((c) => (
            <span key={c.key} className="pill border border-amber/30 bg-amber/10 text-[10px] text-amber">
              {c.label.split(" (")[0]} · {c.basis} · STUB
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}
