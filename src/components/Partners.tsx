import type { Pulse } from "@/lib/dashboard";
import { money, percent } from "@/lib/format";
import { Card, SectionHeader, Sparkline } from "./primitives";
import { Crown } from "lucide-react";
import { cn } from "@/lib/cn";

// Ownership split — equal 4-way by default. Edit names/shares to match reality.
const PARTNERS: { name: string; share: number }[] = [
  { name: "Partner 1", share: 0.25 },
  { name: "Partner 2", share: 0.25 },
  { name: "Partner 3", share: 0.25 },
  { name: "Partner 4", share: 0.25 },
];

export function Partners({ pulse }: { pulse: Pulse }) {
  const poolYtd = pulse.ytd.profit;
  const poolEoy = pulse.projectedYearEnd.profit;
  const profitCum = pulse.points
    .map((p) => p.actualProfit ?? p.projProfit)
    .filter((v): v is number => v != null);

  return (
    <Card className="card-pad">
      <SectionHeader
        title={
          <span className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-amber/15 text-amber">
              <Crown className="h-3.5 w-3.5" />
            </span>
            Partner Distributions
          </span>
        }
        subtitle="Each partner's share of profit — to date and projected to year-end"
        right={
          <div className="hidden text-right sm:block">
            <div className="stat-label">Profit pool · YTD → year-end</div>
            <div className="text-sm font-semibold tabular-nums text-ink">
              {money(poolYtd)} <span className="text-ink-3">→</span>{" "}
              <span className={poolEoy >= 0 ? "text-mint" : "text-rose"}>{money(poolEoy)}</span>
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {PARTNERS.map((p) => {
          const ytd = poolYtd * p.share;
          const eoy = poolEoy * p.share;
          const remaining = eoy - ytd;
          const spark = profitCum.map((v) => v * p.share);
          return (
            <div key={p.name} className="rounded-xl border border-line bg-canvas-700 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">{p.name}</span>
                <span className="pill bg-amber/10 text-[10px] text-amber">{percent(p.share, 0)}</span>
              </div>
              <div className={cn("mt-2 text-xl font-semibold tabular-nums", ytd >= 0 ? "text-ink" : "text-rose")}>
                {money(ytd)}
              </div>
              <div className="text-[11px] text-ink-3">earned to date</div>
              <div className="mt-2">
                <Sparkline data={spark} stroke="#FFB400" fill="#FFB4001f" height={30} />
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-xs">
                <span className="text-ink-2">Year-end</span>
                <span className={cn("font-semibold tabular-nums", eoy >= 0 ? "text-mint" : "text-rose")}>{money(eoy)}</span>
              </div>
              <div className="mt-0.5 flex items-center justify-between text-[11px] text-ink-3">
                <span>still to come</span>
                <span className="tabular-nums">{money(remaining)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] text-ink-3">
        Assumes an equal 4-way split of net profit. Tell me the real partner names and ownership % to make this exact.
      </p>
    </Card>
  );
}
