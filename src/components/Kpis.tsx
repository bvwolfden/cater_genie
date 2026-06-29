import type { Dashboard, DayPoint } from "@/lib/dashboard";
import { money, percent, hours, laborHealth, deltaPct } from "@/lib/format";
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
  const k = data.kpis;
  const s = data.series;
  const recent = (pick: (d: DayPoint) => number | null) =>
    s.map(pick).filter((v): v is number => v != null).slice(-14);

  const tone = laborHealth(k.laborPct);
  const laborAccent = tone === "alert" ? "text-rose" : tone === "warn" ? "text-amber" : "text-mint";
  const mom = data.comparisons.mom;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <StatCard
        label="Net Sales · Today"
        value={money(k.netSales)}
        icon={<DollarSign className="h-4 w-4" />}
        deltaValue={deltaPct(k.netSales, k.netSalesPrev)}
        deltaLabel="vs prior day"
        spark={recent((d) => d.netSales)}
        sparkColor="#FF385C"
      />

      <StatCard
        label="Labor %"
        value={percent(k.laborPct)}
        icon={<Users className="h-4 w-4" />}
        accent={laborAccent}
        deltaValue={deltaPct(k.laborPct, k.laborPctPrev)}
        deltaLabel="vs prior day"
        deltaUpIsGood={false}
        spark={recent((d) => d.laborPct)}
        sparkColor="#FFB400"
      />

      <StatCard
        label="Hours · Today"
        value={hours(k.laborHours)}
        icon={<Clock className="h-4 w-4" />}
        deltaValue={deltaPct(k.laborHours, k.laborHoursPrev)}
        deltaLabel="vs prior day"
        deltaUpIsGood={false}
        spark={recent((d) => d.laborHours)}
        sparkColor="#008489"
      />

      <StatCard
        label={`Net Sales · ${k.monthLabel ?? "MTD"}`}
        value={money(k.mtdNetSales)}
        icon={<CalendarRange className="h-4 w-4" />}
        deltaValue={mom.sales.deltaPct}
        deltaLabel={`vs ${mom.priorLabel}`}
        spark={recent((d) => d.netSales)}
        sparkColor="#FF385C"
      />

      <StatCard
        label="Cash Position"
        value={money(k.cashPosition)}
        icon={<Banknote className="h-4 w-4" />}
        accent={k.cashPosition != null && k.cashPosition < 0 ? "text-rose" : "text-ink"}
        deltaValue={deltaPct(k.cashPosition, k.cashPositionPrev)}
        deltaLabel="vs prior snapshot"
        spark={k.cashSeries.slice(-14)}
        sparkColor="#00A699"
      />

      <StatCard
        label="Food Purchases · Today"
        value={money(k.foodPurchases)}
        icon={<Utensils className="h-4 w-4" />}
        deltaValue={deltaPct(k.foodPurchases, k.foodPurchasesPrev)}
        deltaLabel="vs prior day"
        deltaUpIsGood={false}
        spark={recent((d) => d.foodPurchases)}
        sparkColor="#FFB400"
      />
    </div>
  );
}
