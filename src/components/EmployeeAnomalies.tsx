import type { ForwardPlanning } from "@/lib/dashboard";
import { Card, SectionHeader } from "./primitives";
import { cn } from "@/lib/cn";
import { Sparkles, AlertTriangle, Info } from "lucide-react";

export function EmployeeAnomalies({ anomalies }: { anomalies: ForwardPlanning["anomalies"] }) {
  return (
    <Card className="card-pad">
      <SectionHeader
        title={
          <span className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-brand/10 text-brand">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            Employee Flags
          </span>
        }
        subtitle="Time & attendance outliers worth a look"
      />
      <div className="space-y-2">
        {anomalies.map((a, i) => {
          const Icon = a.severity === "warn" ? AlertTriangle : Info;
          const tone = a.severity === "warn" ? "border-amber/30 bg-amber/10 text-amber" : "border-cyan/20 bg-cyan/5 text-cyan";
          return (
            <div key={i} className={cn("flex gap-2.5 rounded-xl border px-3 py-2", tone)}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="text-xs font-semibold text-ink">
                  {a.employee} <span className="font-normal text-ink-3">· {a.dept}</span>
                </div>
                <div className="text-xs text-ink-2">
                  <span className="font-medium">{a.title}.</span> {a.detail}
                </div>
              </div>
            </div>
          );
        })}
        {anomalies.length === 0 && <div className="py-4 text-center text-sm text-ink-3">No flags this week.</div>}
      </div>
      <p className="mt-3 text-[11px] text-ink-3">
        Cross-sectional flags from one week of T&amp;A. Trend/seasonal anomalies (per-employee history, no-shows, drift) unlock once more time-clock history is connected.
      </p>
    </Card>
  );
}
