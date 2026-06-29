import type { Dashboard } from "@/lib/dashboard";
import { Card, SectionHeader, StatusDot } from "./primitives";
import { cn } from "@/lib/cn";
import { Store, Truck, Users, Calculator } from "lucide-react";

const ICON: Record<string, typeof Store> = {
  CLOVER: Store,
  CATERTRAX: Truck,
  WHENIWORK: Users,
  QUICKBOOKS: Calculator,
};

const METHOD_LABEL: Record<string, string> = {
  "rest-api": "REST API",
  "oauth-rest": "OAuth REST",
  "scheduled-report": "Scheduled report",
  manual: "Manual",
};

export function Sources({ data }: { data: Dashboard }) {
  return (
    <Card className="card-pad">
      <SectionHeader title="Data Sources" subtitle="Ingestion connectors → Postgres" />
      <div className="space-y-2">
        {data.sources.map((s) => {
          const Icon = ICON[s.system] ?? Store;
          const tone = s.configured ? "good" : "warn";
          return (
            <div key={s.system} className="rounded-xl border border-line bg-canvas-700 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-ink-2 shadow-sm">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-ink">{s.label}</div>
                    <div className="text-[11px] uppercase tracking-wide text-ink-3">{s.category}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <StatusDot tone={tone} />
                  <span className={cn("text-xs font-semibold", s.configured ? "text-mint" : "text-amber")}>
                    {s.configured ? "Connected" : "Pending"}
                  </span>
                </div>
              </div>
              <div className="mt-2 flex items-start gap-2">
                <span className="pill shrink-0 border border-line bg-white text-[10px] text-ink-2">
                  {METHOD_LABEL[s.method] ?? s.method}
                </span>
                <p className="text-[11px] leading-snug text-ink-2">{s.readiness}</p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-ink-3">
        Historical data seeded from spreadsheets. Connectors above will pull live once access is granted.
      </p>
    </Card>
  );
}
