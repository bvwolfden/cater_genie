import type { Dashboard, PeriodComparison } from "@/lib/dashboard";
import { money, percent } from "@/lib/format";
import { Card, SectionHeader, Delta, Sparkline } from "./primitives";
import { cn } from "@/lib/cn";
import { TrendingUp, CalendarClock, ArrowUpRight, ArrowDownRight } from "lucide-react";

function Row({
  metric,
  current,
  prior,
  deltaPct,
  upIsGood = true,
  fmt = money,
}: {
  metric: string;
  current: number | null;
  prior: number | null;
  deltaPct: number | null;
  upIsGood?: boolean;
  fmt?: (n: number | null) => string;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-ink-2">{metric}</span>
      <div className="flex items-center gap-3">
        <span className="text-xs tabular-nums text-ink-3">{prior != null ? fmt(prior) : "n/a"}</span>
        <span className="text-sm font-semibold tabular-nums text-ink">{fmt(current)}</span>
        <div className="w-16 text-right">
          {deltaPct != null ? <Delta value={deltaPct} upIsGood={upIsGood} /> : <span className="text-xs text-ink-3">—</span>}
        </div>
      </div>
    </div>
  );
}

function Panel({ cmp, icon, spark, sparkLabel }: { cmp: PeriodComparison; icon: React.ReactNode; spark?: number[]; sparkLabel?: string }) {
  return (
    <div className="rounded-xl border border-line bg-canvas-700 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand/10 text-brand">{icon}</span>
        <div>
          <div className="text-sm font-semibold text-ink">{cmp.label}</div>
          <div className="text-[11px] text-ink-3">
            {cmp.currentLabel} vs {cmp.priorLabel}
          </div>
        </div>
      </div>
      <div className="mb-1 flex items-center justify-end gap-3 text-[10px] uppercase tracking-wide text-ink-3">
        <span>{cmp.priorLabel}</span>
        <span className="font-semibold text-ink-2">{cmp.currentLabel}</span>
        <span className="w-16 text-right">change</span>
      </div>
      <div className="divide-y divide-line">
        <Row metric="Net sales / wk" current={cmp.sales.current} prior={cmp.sales.prior} deltaPct={cmp.sales.deltaPct} />
        <Row metric="Payroll $ / wk" current={cmp.labor.current} prior={cmp.labor.prior} deltaPct={cmp.labor.deltaPct} upIsGood={false} />
        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-ink-2">Payroll %</span>
          <div className="flex items-center gap-3">
            <span className="text-xs tabular-nums text-ink-3">{cmp.laborPct.prior != null ? percent(cmp.laborPct.prior) : "n/a"}</span>
            <span className={cn("text-sm font-semibold tabular-nums", (cmp.laborPct.current ?? 0) >= 0.35 ? "text-amber" : "text-mint")}>
              {percent(cmp.laborPct.current)}
            </span>
            <span className="w-16" />
          </div>
        </div>
      </div>
      {spark && spark.length > 1 && (
        <div className="mt-3 border-t border-line pt-2">
          <Sparkline data={spark} />
          <div className="mt-0.5 text-[10px] text-ink-3">{sparkLabel ?? "trend by month"}</div>
        </div>
      )}
    </div>
  );
}

export function ComparisonPanels({ mom, yoy, spark, sparkLabel }: { mom: PeriodComparison; yoy: PeriodComparison; spark?: number[]; sparkLabel?: string }) {
  return (
    <div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Panel cmp={mom} icon={<CalendarClock className="h-3.5 w-3.5" />} spark={spark} sparkLabel={sparkLabel} />
        <Panel cmp={yoy} icon={<TrendingUp className="h-3.5 w-3.5" />} spark={spark} sparkLabel={sparkLabel} />
      </div>
      <div className="mt-2 flex items-center gap-3 text-[11px] text-ink-3">
        <span className="flex items-center gap-1 text-mint"><ArrowUpRight className="h-3 w-3" /> better</span>
        <span className="flex items-center gap-1 text-rose"><ArrowDownRight className="h-3 w-3" /> worse</span>
        <span>vs the comparison period</span>
      </div>
    </div>
  );
}

export function Comparisons({ data }: { data: Dashboard }) {
  return (
    <Card className="card-pad">
      <SectionHeader title="Comparisons" subtitle="Last complete month · per-week averages vs prior month and prior year" />
      <ComparisonPanels
        mom={data.comparisons.mom}
        yoy={data.comparisons.yoy}
        spark={data.weekly.filter((w) => w.total != null).map((w) => w.total!)}
        sparkLabel="weekly revenue trend"
      />
      <p className="mt-3 text-[11px] text-ink-3">
        Per-week averages over weeks with data (months differ in week count and labor coverage).
        Payroll here is the weekly comp sheet&apos;s loaded figure — daily KPI labor uses timesheet wages, a lower basis.
      </p>
    </Card>
  );
}
