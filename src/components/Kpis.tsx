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
}) {
  return (
    <Card className="card-pad animate-fade-up overflow-hidden">
      <div className="flex items-center justify-between">
        <span className="stat-label truncate">{label}</span>
        <span className="shrink-0 text-ink-3">{icon}</span>
      </div>
      <div className={cn("mt-2 text-2xl font-semibold tracking-tight tabular-nums", accent)}>{value}</div>
      <div className="mt-1.5 flex items-center gap-1.5">
        {deltaValue != null ? <Delta value={deltaValue} upIsGood={deltaUpIsGood} /> : <span className="text-xs text-ink-3">—</span>}
        <span className="truncate text-[11px] text-ink-3">{deltaLabel}</span>
      </div>
      <div className="mt-2">
        <Sparkline data={spark} stroke={sparkColor} fill={`${sparkColor}1f`} />
      </div>
    </Card>
  );
}

export function Kpis({ data }: { data: Dashboard }) {
  const w = data.weeklyKpis;
  const k = data.kpis;
  const wkLabel = w.from && w.to ? `${shortDate(w.from)}–${shortDate(w.to)}` : "this week";
  const tone = laborHealth(w.laborPct);
  const laborAccent = tone === "alert" ? "text-rose" : tone === "warn" ? "text-amber" : "text-mint";
  const mom = data.comparisons.mom;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <StatCard
        label="Net Sales · This Week"
        value={money(w.netSales)}
        icon={<DollarSign className="h-4 w-4" />}
        deltaValue={deltaPct(w.netSales, w.netSalesPrev)}
        deltaLabel="vs last week"
        spark={w.spark.net}
        sparkColor="#FF385C"
      />

      <StatCard
        label="Labor % · This Week"
        value={percent(w.laborPct)}
        icon={<Users className="h-4 w-4" />}
        accent={laborAccent}
        deltaValue={deltaPct(w.laborPct, w.laborPctPrev)}
        deltaLabel="vs last week"
        deltaUpIsGood={false}
        spark={w.spark.laborPct}
        sparkColor="#FFB400"
      />

      <StatCard
        label="Hours · This Week"
        value={hours(w.hours)}
        icon={<Clock className="h-4 w-4" />}
        deltaValue={deltaPct(w.hours, w.hoursPrev)}
        deltaLabel="vs last week"
        deltaUpIsGood={false}
        spark={w.spark.hours}
        sparkColor="#008489"
      />

      <StatCard
        label={`Net Sales · ${k.monthLabel ?? "MTD"}`}
        value={money(k.mtdNetSales)}
        icon={<CalendarRange className="h-4 w-4" />}
        deltaValue={mom.sales.deltaPct}
        deltaLabel={`vs ${mom.priorLabel}`}
        spark={w.spark.net}
        sparkColor="#FF385C"
      />

      <StatCard
        label="Cash Position"
        value={money(w.cash)}
        icon={<Banknote className="h-4 w-4" />}
        accent={w.cash != null && w.cash < 0 ? "text-rose" : "text-ink"}
        deltaValue={deltaPct(w.cash, w.cashPrev)}
        deltaLabel="vs last week"
        spark={w.spark.cash}
        sparkColor="#00A699"
      />

      <StatCard
        label="Food Purchases · This Week"
        value={money(w.food)}
        icon={<Utensils className="h-4 w-4" />}
        deltaValue={deltaPct(w.food, w.foodPrev)}
        deltaLabel="vs last week"
        deltaUpIsGood={false}
        spark={w.spark.food}
        sparkColor="#FFB400"
      />
    </div>
  );
}
