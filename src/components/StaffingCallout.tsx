import Link from "next/link";
import type { StaffingOutlook } from "@/lib/dashboard";
import { shortDate } from "@/lib/format";
import { Card } from "./primitives";
import { cn } from "@/lib/cn";
import { Users, ArrowRight, TriangleAlert, CircleCheck } from "lucide-react";

const CHIP: Record<string, string> = {
  short: "border-rose/40 bg-rose/10 text-rose",
  over: "border-amber/40 bg-amber/10 text-amber",
  ok: "border-mint/40 bg-mint/10 text-mint",
  unknown: "border-line bg-canvas-700 text-ink-3",
};

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Compact main-dashboard strip: is next week's schedule right-sized? */
export function StaffingCallout({ so }: { so: StaffingOutlook }) {
  const top = so.callouts[0];
  const alert = top?.severity === "alert";
  return (
    <Card className="card-pad">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md", alert ? "bg-rose/10 text-rose" : "bg-brand/10 text-brand")}>
            <Users className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-ink">
              Staffing · {shortDate(so.window.from)} – {shortDate(so.window.to)}
              <span className="text-[11px] font-normal text-ink-3">
                {Math.round(so.totals.scheduledHours)}h · {so.totals.headcount} people booked
                {so.curveBased && so.totals.typicalFinalWeek != null ? ` · weeks typically finish ~${so.totals.typicalFinalWeek}h` : ""}
              </span>
            </div>
            {top && (
              <div className="mt-0.5 flex items-start gap-1.5 text-[12px] text-ink-2">
                {top.severity === "ok" ? (
                  <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mint" />
                ) : (
                  <TriangleAlert className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", alert ? "text-rose" : "text-amber")} />
                )}
                <span>{top.text}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="flex gap-1">
            {so.days.map((d) => {
              const dow = DOW[new Date(`${d.date}T00:00:00Z`).getUTCDay()];
              return (
                <div
                  key={d.date}
                  title={
                    d.benchmark === "curve"
                      ? `${shortDate(d.date)} · ${d.scheduledHours}h booked vs ~${Math.round(d.typicalByNow ?? 0)}h usual by now${d.typicalFinal != null ? ` · typically ends ~${Math.round(d.typicalFinal)}h` : ""}`
                      : `${shortDate(d.date)} · ${d.scheduledHours}h scheduled${d.expectedHours != null ? ` vs ~${d.expectedHours}h typical` : ""}`
                  }
                  className={cn("grid w-9 place-items-center rounded-lg border py-1 text-center", CHIP[d.status])}
                >
                  <span className="text-[9px] font-semibold uppercase leading-3">{dow}</span>
                  <span className="text-[10px] font-medium leading-3 tabular-nums">{Math.round(d.scheduledHours)}h</span>
                </div>
              );
            })}
          </div>
          <Link href="/labor" className="pill shrink-0 border border-line bg-white text-[11px] text-ink-2 transition hover:border-brand/40 hover:text-brand">
            Labor details <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </Card>
  );
}
