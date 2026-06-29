import { ChefHat } from "lucide-react";

export function Header({ control }: { control?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand text-white shadow-glow">
          <ChefHat className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            CaterGenie <span className="font-normal text-ink-3">/ Daily Ops</span>
          </h1>
          <p className="truncate text-[13px] text-ink-2 sm:whitespace-normal">Retail · Delivery · Labor · Cash — unified, with AI insights</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {control}
        <span className="pill border border-mint/30 bg-mint/10 text-mint">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-mint" />
          Live
        </span>
      </div>
    </header>
  );
}
