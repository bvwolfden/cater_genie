import type { Dashboard } from "@/lib/dashboard";
import { money, percent, hours, laborHealth, deltaPct, shortDate } from "@/lib/format";
import { Card, Delta, Sparkline } from "./primitives";
import { cn } from "@/lib/cn";
import { DollarSign, Users, Banknote, CalendarRange, Utensils, Clock } from "lucide-react";

function StatCard({
  label,
  value,
  icon,
  accent = "text-ink",
  deltaValue,
  deltaLabel,
  deltaUpIsGood = true,
  spark,
  sparkColor = "#FF385C",
  sparkCaption,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: string;
  deltaValue: number | null;
  deltaLabel: string;
  deltaUpIsGood?: boolean;
  spark: number[];
  sparkColor?: string;
  sparkCaption: string;
}) {
  return (
    <Card className="card-pad animate-fade-up overflow-hidden">
      <div className="flex items-center justify-between gap-1">
        <span className="stat-label min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0 text-ink-3">{icon}</span>
      </div>
      <div className={cn("mt-2 text-2xl font-semibold tracking-tight tabular-nums", accent)}>{value}</div>
      <div className="mt-1.5 flex items-center gap-1.5">
        {deltaValue != null ? <Delta value={deltaValue} upIsGood={deltaUpIsGood} /> : <span className="text-xs text-ink-3">—</span>}
        <span className="truncate text-[11px] text-ink-3">{deltaLabel}</span>
      </div>
      <div className="mt-2">
        <Sparkline data={spark} stroke={sparkColor} fill={`${sparkColor}1f`} />
        <div className="mt-0.5 text-[10px] text-ink-3">{sparkCaption}</div>
      </div>
    </Card>
  );
}

export function Kpis({ data }: { data: Dashboard }) {
  const w = data.periodKpis;
  const k = data.kpis;
  const vsPrior = `vs ${w.priorLabel}`;
  const sparkCaption = `by ${w.sparkUnit} · last 8`;
  const tone = laborHealth(w.laborPct);
  const laborAccent = tone === "alert" ? "text-rose" : tone === "warn" ? "text-amber" : "text-mint";
  const mom = data.comparisons.mom;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <StatCard
        label={`Net Sales · ${w.label}`}
        value={money(w.netSales)}
        icon={<DollarSign className="h-4 w-4" />}
        deltaValue={deltaPct(w.netSales, w.netSalesPrev)}
        deltaLabel={vsPrior}
        spark={w.spark.net}
        sparkColor="#FF385C"
        sparkCaption={sparkCaption}
      />

      <StatCard
        label={`Labor % · ${w.label}`}
        value={percent(w.laborPct)}
        icon={<Users className="h-4 w-4" />}
        accent={laborAccent}
        deltaValue={deltaPct(w.laborPct, w.laborPctPrev)}
        deltaLabel={vsPrior}
        deltaUpIsGood={false}
        spark={w.spark.laborPct}
        sparkColor="#FFB400"
        sparkCaption={sparkCaption}
      />

      <StatCard
        label={`Hours · ${w.label}`}
        value={hours(w.hours)}
        icon={<Clock className="h-4 w-4" />}
        deltaValue={deltaPct(w.hours, w.hoursPrev)}
        deltaLabel={vsPrior}
        deltaUpIsGood={false}
        spark={w.spark.hours}
        sparkColor="#008489"
        sparkCaption={sparkCaption}
      />

      <StatCard
        label={`Net Sales · ${k.monthLabel ?? "MTD"}`}
        value={money(k.mtdNetSales)}
        icon={<CalendarRange className="h-4 w-4" />}
        deltaValue={mom.sales.deltaPct}
        deltaLabel={`vs ${mom.priorLabel}`}
        spark={w.spark.net}
        sparkColor="#FF385C"
        sparkCaption={sparkCaption}
      />

      <StatCard
        label="Cash Position"
        value={money(w.cash)}
        icon={<Banknote className="h-4 w-4" />}
        accent={w.cash != null && w.cash < 0 ? "text-rose" : "text-ink"}
        deltaValue={deltaPct(w.cash, w.cashPrev)}
        deltaLabel={vsPrior}
        spark={w.spark.cash}
        sparkColor="#00A699"
        sparkCaption={sparkCaption}
      />

      <StatCard
        label={`Food · ${w.label}`}
        value={money(w.food)}
        icon={<Utensils className="h-4 w-4" />}
        deltaValue={deltaPct(w.food, w.foodPrev)}
        deltaLabel={vsPrior}
        deltaUpIsGood={false}
        spark={w.spark.food}
        sparkColor="#FFB400"
        sparkCaption={sparkCaption}
      />
    </div>
  );
}
