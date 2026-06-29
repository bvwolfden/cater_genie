import type { Dashboard } from "@/lib/dashboard";
import { money, percent, weekdayDate, laborHealth } from "@/lib/format";
import { Card, SectionHeader } from "./primitives";
import { cn } from "@/lib/cn";

export function DailyLedger({ data }: { data: Dashboard }) {
  // Future (projected) days first, newest at top, then recent actuals.
  const future = [...data.forwardDays].reverse().map((d) => ({ ...d, projected: true }));
  const past = [...data.series]
    .filter((d) => d.netSales != null || d.laborCost != null)
    .reverse()
    .slice(0, 18)
    .map((d) => ({ ...d, projected: false }));
  const rows = [...future, ...past];

  const cols = ["Day", "Net Sales", "Tax", "Labor $", "Labor %", "Hours", "Food"];

  return (
    <Card className="card-pad">
      <SectionHeader
        title="Daily Ledger"
        subtitle="Next 10 days projected (italic) · then recent actuals"
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              {cols.map((c, i) => (
                <th key={c} className={cn("stat-label pb-2 font-semibold", i === 0 ? "text-left" : "text-right")}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const tone = laborHealth(d.laborPct);
              const pctColor = tone === "alert" ? "text-rose" : tone === "warn" ? "text-amber" : "text-mint";
              const isSelected = d.date === data.selectedDate;
              return (
                <tr
                  key={d.date}
                  className={cn(
                    "border-b border-line/70 last:border-0",
                    isSelected ? "bg-brand/5" : d.projected ? "bg-canvas-700/40 italic text-ink-2" : "hover:bg-canvas-700"
                  )}
                >
                  <td className="py-2.5 font-medium text-ink">
                    {weekdayDate(d.date)}
                    {d.projected && <span className="ml-2 rounded bg-amber/15 px-1.5 py-0.5 text-[10px] font-semibold not-italic text-amber">projected</span>}
                    {isSelected && <span className="ml-2 rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand">selected</span>}
                  </td>
                  <td className="py-2.5 text-right font-semibold tabular-nums text-ink">{money(d.netSales)}</td>
                  <td className="py-2.5 text-right tabular-nums text-ink-2">{money(d.tax)}</td>
                  <td className="py-2.5 text-right tabular-nums text-ink-2">{money(d.laborCost)}</td>
                  <td className={cn("py-2.5 text-right font-medium tabular-nums", pctColor)}>{percent(d.laborPct)}</td>
                  <td className="py-2.5 text-right tabular-nums text-ink-2">{d.laborHours != null ? d.laborHours.toFixed(1) : "—"}</td>
                  <td className="py-2.5 text-right tabular-nums text-ink-2">{money(d.foodPurchases)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
