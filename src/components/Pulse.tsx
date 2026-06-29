import type { Pulse as PulseData } from "@/lib/dashboard";
import { money, percent } from "@/lib/format";
import { Card, SectionHeader } from "./primitives";
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

function Legend() {
  const items = [
    { c: "#FF385C", l: "Revenue" },
    { c: "#FFB400", l: "Costs" },
    { c: "#00A699", l: "Profit" },
  ];
  return (
    <div className="flex items-center gap-3 text-xs text-ink-2">
      {items.map((i) => (
        <span key={i.l} className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: i.c }} />
          {i.l}
        </span>
      ))}
      <span className="text-ink-3">· solid = actual, dotted = projected</span>
    </div>
  );
}

export function Pulse({ pulse }: { pulse: PulseData }) {
  const a = pulse.assumptions;
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
        subtitle="Cumulative revenue, cost & profit — actual to date, projected to year-end"
        right={<Legend />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Revenue · YTD" value={money(pulse.ytd.revenue)} sub={pulse.ytd.throughWeek ? `through ${pulse.ytd.throughWeek}` : undefined} />
        <Stat label="Profit · YTD" value={money(pulse.ytd.profit)} accent={pulse.ytd.profit >= 0 ? "text-mint" : "text-rose"} sub={`${percent(pulse.ytd.marginPct)} margin`} />
        <Stat label="Proj. Revenue · Year-end" value={money(pulse.projectedYearEnd.revenue)} accent="text-ink-2" />
        <Stat label="Proj. Profit · Year-end" value={money(pulse.projectedYearEnd.profit)} accent={pulse.projectedYearEnd.profit >= 0 ? "text-mint" : "text-rose"} sub={`${percent(pulse.projectedYearEnd.marginPct)} margin`} />
      </div>

      <PulseChart points={pulse.points} boundary={pulse.ytd.throughWeek} />

      <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
        Projection assumes <span className="font-medium text-ink-2">{percent(a.weeklyGrowthPct, 2)}/wk growth</span> (from recent run-rate),
        labor at <span className="font-medium text-ink-2">{percent(a.laborPct)}</span>, food at <span className="font-medium text-ink-2">{percent(a.foodPct)}</span>,
        and <span className="font-medium text-ink-2">{percent(a.overheadPct)}</span> overhead (gas/utilities/other) of revenue. These are tunable inputs.
      </p>
    </Card>
  );
}
