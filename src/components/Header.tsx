import { ChefHat } from "lucide-react";

export function Header({ control }: { control?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-white shadow-glow">
          <ChefHat className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            CaterGenie <span className="font-normal text-ink-3">/ Daily Ops</span>
          </h1>
          <p className="text-[13px] text-ink-2">Retail · Delivery · Labor · Cash — unified, with AI insights</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {control}
        <span className="pill border border-mint/30 bg-mint/10 text-mint">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-mint" />
          Live
        </span>
      </div>
    </header>
  );
}
