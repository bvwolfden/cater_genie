import type { Dashboard } from "@/lib/dashboard";
import { money, percent, hours, laborHealth, deltaPct } from "@/lib/format";
import { Card, Delta, Sparkline } from "./primitives";
import { cn } from "@/lib/cn";
import { DollarSign, Users, Banknote, CalendarRange, Utensils, Clock } from "lucide-react";

function StatCard({
  label,
  value,
  icon,
  children,
  accent = "text-ink",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  children?: React.ReactNode;
  accent?: string;
}) {
  return (
    <Card className="card-pad animate-fade-up">
      <div className="flex items-center justify-between">
        <span className="stat-label">{label}</span>
        <span className="text-ink-3">{icon}</span>
      </div>
      <div className={cn("mt-2 text-2xl font-semibold tracking-tight tabular-nums", accent)}>{value}</div>
      <div className="mt-2 flex items-center justify-between gap-2">{children}</div>
    </Card>
  );
}

export function Kpis({ data }: { data: Dashboard }) {
  const k = data.kpis;
  const netSpark = data.series.filter((s) => s.netSales != null).slice(-14).map((s) => s.netSales!);
  const tone = laborHealth(k.laborPct);
  const laborAccent = tone === "alert" ? "text-rose" : tone === "warn" ? "text-amber" : "text-mint";

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <StatCard label="Net Sales · Today" value={money(k.netSales)} icon={<DollarSign className="h-4 w-4" />}>
        <Delta value={deltaPct(k.netSales, k.netSalesPrev)} />
        <Sparkline data={netSpark} />
      </StatCard>

      <StatCard label="Labor %" value={percent(k.laborPct)} icon={<Users className="h-4 w-4" />} accent={laborAccent}>
        <span className="text-xs text-ink-2">{money(k.laborCost)} labor</span>
      </StatCard>

      <StatCard label="Hours · Today" value={hours(k.laborHours)} icon={<Clock className="h-4 w-4" />}>
        <span className="text-xs text-ink-2">{percent(k.laborPct)} of sales</span>
      </StatCard>

      <StatCard label={`Net Sales · ${k.monthLabel ?? "MTD"}`} value={money(k.mtdNetSales)} icon={<CalendarRange className="h-4 w-4" />}>
        <span className="text-xs text-ink-2">{money(k.mtdAvgDailySales)}/day avg</span>
      </StatCard>

      <StatCard label="Cash Position" value={money(k.cashPosition)} icon={<Banknote className="h-4 w-4" />} accent={k.cashPosition != null && k.cashPosition < 0 ? "text-rose" : "text-ink"}>
        <span className="text-xs text-ink-2">tracked accounts</span>
      </StatCard>

      <StatCard label="Food Purchases · Today" value={money(k.foodPurchases)} icon={<Utensils className="h-4 w-4" />}>
        <span className="text-xs text-ink-2">{percent(k.mtdLaborPct)} blended labor</span>
      </StatCard>
    </div>
  );
}
