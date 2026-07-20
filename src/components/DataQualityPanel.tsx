import { ShieldAlert, ShieldCheck, AlertTriangle, Info } from "lucide-react";
import { Card } from "./primitives";
import { cn } from "@/lib/cn";
import type { DataQuality } from "@/lib/quality";

// Surfaces "this number looks wrong" — cross-source mismatches and outliers.
// Until live feeds are the truth, we flag; we don't silently trust.
export function DataQualityPanel({ quality }: { quality: DataQuality }) {
  const { flags, checkedDays } = quality;
  const warns = flags.filter((f) => f.severity === "warn").length;

  return (
    <Card className="card-pad">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cn(
            "grid h-8 w-8 place-items-center rounded-lg",
            warns ? "bg-amber/10 text-amber" : "bg-mint/10 text-mint"
          )}
        >
          {warns ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
        </span>
        <div>
          <div className="text-sm font-semibold text-ink">Data Quality</div>
          <div className="text-[11px] text-ink-3">
            {checkedDays} days checked · {warns ? `${warns} need${warns === 1 ? "s" : ""} a look` : "no conflicts found"}
          </div>
        </div>
      </div>

      {flags.length === 0 ? (
        <p className="text-xs text-ink-2">All cross-checks pass — sheet, timesheets, and trends agree.</p>
      ) : (
        <div className="space-y-2">
          {flags.map((f, i) => {
            const Icon = f.severity === "warn" ? AlertTriangle : Info;
            return (
              <div
                key={i}
                className={cn(
                  "flex gap-2.5 rounded-xl border px-3 py-2",
                  f.severity === "warn" ? "border-amber/30 bg-amber/10" : "border-cyan/20 bg-cyan/5"
                )}
              >
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", f.severity === "warn" ? "text-amber" : "text-cyan")} />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-ink">
                    {f.title} <span className="font-normal text-ink-3">· {f.date}</span>
                  </div>
                  <div className="text-xs text-ink-2">{f.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
