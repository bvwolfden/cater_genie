import type { LaborDetail } from "@/lib/dashboard";
import { money, hours } from "@/lib/format";
import { Card, SectionHeader } from "./primitives";

const maxCost = (rows: { cost: number }[]) => Math.max(1, ...rows.map((r) => r.cost));

export function DepartmentTable({ detail }: { detail: LaborDetail }) {
  const peak = maxCost(detail.byDepartment);
  return (
    <Card className="card-pad">
      <SectionHeader title="By Department" subtitle={detail.dateRange.start ? `Hours & paid cost · ${detail.dateRange.start} → ${detail.dateRange.end}` : "Hours & paid cost"} />
      <div className="space-y-2.5">
        {detail.byDepartment.map((d) => (
          <div key={d.department}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium text-ink">{d.department}</span>
              <span className="tabular-nums text-ink-2">
                {money(d.cost)} · {d.hours.toFixed(1)}h · {d.headcount} ppl
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-canvas-600">
              <div className="h-full rounded-full bg-brand" style={{ width: `${(d.cost / peak) * 100}%` }} />
            </div>
          </div>
        ))}
        {detail.byDepartment.length === 0 && <div className="py-6 text-center text-sm text-ink-3">No labor data.</div>}
      </div>
      {detail.byDepartment.length > 0 && (
        <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5 text-sm">
          <span className="font-semibold text-ink">Total</span>
          <span className="font-semibold tabular-nums text-ink">
            {money(detail.totals.cost)} · {detail.totals.hours.toFixed(1)}h · {detail.totals.headcount} ppl
          </span>
        </div>
      )}
    </Card>
  );
}

export function EmployeeTable({ detail }: { detail: LaborDetail }) {
  const cols = ["Employee", "Department", "Sched", "Actual", "OT", "Rate", "Cost"];
  return (
    <Card className="card-pad">
      <SectionHeader
        title="By Employee"
        subtitle={`${detail.byEmployee.length} people${detail.dateRange.start ? ` · ${detail.dateRange.start} → ${detail.dateRange.end}` : ""} · scheduled = stub`}
      />
      {/* Desktop: table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              {cols.map((c, i) => (
                <th key={c} className={`stat-label pb-2 ${i <= 1 ? "text-left" : "text-right"}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {detail.byEmployee.map((e) => (
              <tr key={e.employeeId ?? e.name} className="border-b border-line/70 last:border-0 hover:bg-canvas-700">
                <td className="py-2.5 font-medium text-ink">{e.name}</td>
                <td className="py-2.5 text-ink-2">{e.department ?? "—"}</td>
                <td className="py-2.5 text-right tabular-nums text-ink-3">{e.scheduledHours.toFixed(0)}</td>
                <td className="py-2.5 text-right font-medium tabular-nums text-ink">{e.hours.toFixed(1)}</td>
                <td className="py-2.5 text-right tabular-nums text-ink-2">{e.otHours ? e.otHours.toFixed(1) : "—"}</td>
                <td className="py-2.5 text-right tabular-nums text-ink-2">{e.avgRate != null ? money(e.avgRate, true) : "—"}</td>
                <td className="py-2.5 text-right font-semibold tabular-nums text-ink">{money(e.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile: cards (no horizontal scroll) */}
      <div className="space-y-2 md:hidden">
        {detail.byEmployee.map((e) => (
          <div key={e.employeeId ?? e.name} className="rounded-xl border border-line bg-canvas-700 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-ink">{e.name}</span>
              <span className="font-semibold tabular-nums text-ink">{money(e.cost)}</span>
            </div>
            <div className="text-[11px] text-ink-3">{e.department ?? "—"}</div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-2">
              <span>Sched <b className="text-ink">{e.scheduledHours.toFixed(0)}h</b></span>
              <span>Actual <b className="text-ink">{e.hours.toFixed(1)}h</b></span>
              <span>OT <b className="text-ink">{e.otHours ? e.otHours.toFixed(1) : "—"}</b></span>
              <span>Rate <b className="text-ink">{e.avgRate != null ? money(e.avgRate, true) : "—"}</b></span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function LaborTotals({ detail }: { detail: LaborDetail }) {
  const t = detail.totals;
  const items = [
    { label: "Total Labor Cost", value: money(t.cost) },
    { label: "Total Hours", value: hours(t.hours) },
    { label: "Headcount", value: String(t.headcount) },
  ];
  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map((i) => (
        <Card key={i.label} className="card-pad">
          <div className="stat-label">{i.label}</div>
          <div className="mt-1.5 text-2xl font-semibold tabular-nums text-ink">{i.value}</div>
        </Card>
      ))}
    </div>
  );
}
