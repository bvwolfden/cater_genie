import { ShieldAlert, ShieldCheck, AlertTriangle, Info, OctagonAlert } from "lucide-react";
import { Card } from "./primitives";
import { cn } from "@/lib/cn";
import type { DataQuality, QualityFlag } from "@/lib/quality";

// Surfaces "this number looks wrong" — entry-level sanity checks plus the
// cross-source reconciliation suite (daily↔weekly, imports↔tables, balances,
// channels). Until live feeds are the truth, we flag; we don't silently trust.

const MAX_PER_SECTION = 6;

const SECTIONS: { key: QualityFlag["category"]; label: string }[] = [
  { key: "entry", label: "Entry checks" },
  { key: "reconciliation", label: "Cross-source reconciliation" },
];

function FlagRow({ f }: { f: QualityFlag }) {
  const Icon = f.severity === "critical" ? OctagonAlert : f.severity === "warn" ? AlertTriangle : Info;
  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-xl border px-3 py-2",
        f.severity === "critical"
          ? "border-rose/30 bg-rose/10"
          : f.severity === "warn"
            ? "border-amber/30 bg-amber/10"
            : "border-cyan/20 bg-cyan/5"
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          f.severity === "critical" ? "text-rose" : f.severity === "warn" ? "text-amber" : "text-cyan"
        )}
      />
      <div className="min-w-0">
        <div className="text-xs font-semibold text-ink">
          {f.title} <span className="font-normal text-ink-3">· {f.date}</span>
        </div>
        <div className="text-xs text-ink-2">{f.detail}</div>
      </div>
    </div>
  );
}

export function DataQualityPanel({ quality }: { quality: DataQuality }) {
  const { flags, checkedDays, checkedWeeks } = quality;
  const criticals = flags.filter((f) => f.severity === "critical").length;
  const warns = flags.filter((f) => f.severity === "warn").length;
  const infos = flags.filter((f) => f.severity === "info").length;

  const counts = [
    criticals ? `${criticals} critical` : null,
    warns ? `${warns} warning${warns === 1 ? "" : "s"}` : null,
    infos ? `${infos} info` : null,
  ].filter(Boolean);

  return (
    <Card className="card-pad">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cn(
            "grid h-8 w-8 place-items-center rounded-lg",
            criticals ? "bg-rose/10 text-rose" : warns ? "bg-amber/10 text-amber" : "bg-mint/10 text-mint"
          )}
        >
          {criticals || warns ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
        </span>
        <div>
          <div className="text-sm font-semibold text-ink">Data Quality</div>
          <div className="text-[11px] text-ink-3">
            {checkedDays} days · {checkedWeeks} weeks checked · {counts.length ? counts.join(" · ") : "no conflicts found"}
          </div>
        </div>
      </div>

      {flags.length === 0 ? (
        <p className="text-xs text-ink-2">All cross-checks pass — sheet, timesheets, rollups, and imports agree.</p>
      ) : (
        <div className="space-y-3">
          {SECTIONS.map(({ key, label }) => {
            const group = flags.filter((f) => f.category === key);
            if (group.length === 0) return null;
            const shown = group.slice(0, MAX_PER_SECTION);
            return (
              <div key={key}>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  {label} · {group.length}
                </div>
                <div className="space-y-2">
                  {shown.map((f, i) => (
                    <FlagRow key={i} f={f} />
                  ))}
                  {group.length > shown.length && (
                    <div className="px-3 text-[11px] text-ink-3">
                      +{group.length - shown.length} more — run <code>npm run validate:data</code> for the full report.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
