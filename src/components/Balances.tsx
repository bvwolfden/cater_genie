import type { Dashboard } from "@/lib/dashboard";
import { money } from "@/lib/format";
import { Card, SectionHeader } from "./primitives";
import { cn } from "@/lib/cn";

const LABEL: Record<string, string> = {
  OPERATING: "Operating",
  PAYROLL: "Payroll",
  MERCHANT: "Merchant",
  SAVINGS: "Savings",
  HOLDING: "Holding",
  CC_PROCESSING: "CC Processing",
};

export function Balances({ data }: { data: Dashboard }) {
  const balances = data.balances;
  const total = data.kpis.cashPosition;
  return (
    <Card className="card-pad">
      <SectionHeader
        title="Account Balances"
        subtitle="Manual entry · latest snapshot per account (QuickBooks not yet syncing)"
        right={
          <div className="text-right">
            <div className="stat-label">Net position</div>
            <div className={cn("text-lg font-semibold tabular-nums", (total ?? 0) < 0 ? "text-rose" : "text-mint")}>
              {money(total)}
            </div>
          </div>
        }
      />
      <div className="space-y-1">
        {balances.map((b) => {
          const delta = b.prev != null ? b.balance - b.prev : null;
          return (
            <div key={b.account} className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-canvas-700">
              <span className="text-sm text-ink-2">{LABEL[b.account] ?? b.account}</span>
              <div className="flex items-center gap-3">
                {delta != null && delta !== 0 && (
                  <span className={cn("text-xs tabular-nums", delta >= 0 ? "text-mint" : "text-rose")}>
                    {delta >= 0 ? "+" : ""}
                    {money(delta)}
                  </span>
                )}
                <span className={cn("w-24 text-right text-sm font-semibold tabular-nums", b.balance < 0 ? "text-rose" : "text-ink")}>
                  {money(b.balance)}
                </span>
              </div>
            </div>
          );
        })}
        {balances.length === 0 && <div className="py-6 text-center text-sm text-ink-3">No balance data.</div>}
      </div>
    </Card>
  );
}
