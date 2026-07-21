import type { Dashboard } from "@/lib/dashboard";
import { money, percent, weekdayDate, laborHealth } from "@/lib/format";
import { Card, SectionHeader, ProjBadge } from "./primitives";
import { Explain } from "./Explain";
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
        title={
          <span className="flex items-center gap-2">
            Daily Ledger
            <ProjBadge />
            <Explain
              align="left"
              title="Projected days — how the italic rows are built"
              steps={[
                {
                  label: "Net sales",
                  detail: "The median for that weekday over the last 28 days of actuals — next Tuesday is predicted by recent Tuesdays. Median, not average, so one holiday-skewed week doesn't drag every projection.",
                },
                {
                  label: "Labor $ and hours",
                  detail: "Also weekday medians from recent history — labor is mostly a scheduled cost (a slow Monday still staffs the kitchen), so it is NOT projected as a % of sales. Labor % is just the two projections divided.",
                },
                {
                  label: "What this can't see",
                  detail: "Holidays, one-off catering spikes, and weather. Booked events show up in the Staffing Outlook and Booked Ahead panels — cross-check big days there.",
                },
              ]}
            />
          </span>
        }
        subtitle="Next 10 days projected (italic) · then recent actuals"
      />
      {/* Desktop: table */}
      <div className="hidden overflow-x-auto md:block">
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
                    isSelected ? "bg-brand/5" : d.projected ? "bg-amber/5 italic text-ink-2" : "hover:bg-canvas-700"
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
      {/* Mobile: cards */}
      <div className="space-y-2 md:hidden">
        {rows.map((d) => {
          const tone = laborHealth(d.laborPct);
          const pctColor = tone === "alert" ? "text-rose" : tone === "warn" ? "text-amber" : "text-mint";
          const isSelected = d.date === data.selectedDate;
          return (
            <div key={d.date} className={cn("rounded-xl border border-line p-3", isSelected ? "bg-brand/5" : d.projected ? "bg-amber/5 italic" : "bg-canvas-700")}>
              <div className="flex items-center justify-between">
                <span className={cn("font-medium text-ink", d.projected && "italic")}>
                  {weekdayDate(d.date)}
                  {d.projected && <span className="ml-2 rounded bg-amber/15 px-1.5 py-0.5 text-[10px] font-semibold not-italic text-amber">projected</span>}
                  {isSelected && <span className="ml-2 rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand">selected</span>}
                </span>
                <span className="font-semibold tabular-nums text-ink">{money(d.netSales)}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-2">
                <span>Tax <b className="text-ink">{money(d.tax)}</b></span>
                <span>Labor <b className="text-ink">{money(d.laborCost)}</b></span>
                <span>Labor % <b className={pctColor}>{percent(d.laborPct)}</b></span>
                <span>Hours <b className="text-ink">{d.laborHours != null ? d.laborHours.toFixed(1) : "—"}</b></span>
                <span>Food <b className="text-ink">{money(d.foodPurchases)}</b></span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
