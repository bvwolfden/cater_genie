import Link from "next/link";
import type { Dashboard, LaborAnalysis, BookingsOutlook } from "@/lib/dashboard";
import { Card, Delta, ProjBadge } from "./primitives";
import { money, percent, shortDate, deltaPct, laborHealth } from "@/lib/format";
import { cn } from "@/lib/cn";
import { TrendingUp, Wallet, CalendarCheck, ArrowRight } from "lucide-react";

/** One compact stat inside a strip: label on top, number under it. */
function Stat({
  label,
  value,
  accent = "text-ink",
  delta,
  deltaUpIsGood = true,
  deltaCaption,
  badge,
}: {
  label: string;
  value: string;
  accent?: string;
  delta?: number | null;
  deltaUpIsGood?: boolean;
  /** Names the delta's baseline (e.g. "vs same wk 2025") — required with delta. */
  deltaCaption?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="stat-label">{label}</span>
        {badge}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className={cn("text-lg font-semibold tabular-nums", accent)}>{value}</span>
        {delta != null && <Delta value={delta} upIsGood={deltaUpIsGood} />}
      </div>
      {delta != null && deltaCaption && (
        <div className="mt-0.5 text-[10px] text-ink-3">{deltaCaption}</div>
      )}
    </div>
  );
}

function Strip({
  icon: Icon,
  title,
  href,
  linkLabel,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  href: string;
  linkLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="card-pad">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-brand/10 text-brand">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div className="truncate text-sm font-semibold text-ink">{title}</div>
        </div>
        <Link
          href={href}
          className="pill shrink-0 border border-line bg-white text-[11px] text-ink-2 transition hover:border-brand/40 hover:text-brand"
        >
          {linkLabel} <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">{children}</div>
    </Card>
  );
}

/**
 * Exec-summary strips under the staffing callout: revenue, labor, and booked
 * forward orders at a glance. Fixed scope (latest full week / forward window)
 * regardless of the period picker — built to be scannable on a phone.
 */
export function ExecStrips({
  data,
  labor,
  bookings,
}: {
  data: Dashboard;
  labor: LaborAnalysis;
  bookings: BookingsOutlook;
}) {
  // Latest week with recorded revenue + the first projected week ahead.
  const actualWeeks = data.weekly.filter((w) => w.total != null);
  const revWeek = actualWeeks[actualWeeks.length - 1];
  const nextProj = data.weekly.find((w) => w.total == null && w.projected != null);

  // Latest week with recorded payroll (comp sheet).
  const laborWeeks = labor.weekly.filter((w) => w.actualLabor != null);
  const laborWeek = laborWeeks[laborWeeks.length - 1];
  const laborPctAccent = (p: number | null) =>
    ({ good: "text-mint", warn: "text-amber", alert: "text-rose" })[laborHealth(p)];

  const strips = [
    revWeek && (
      <Strip
        key="rev"
        icon={TrendingUp}
        title={`Revenue · wk of ${shortDate(revWeek.weekStart)}`}
        href="#trends"
        linkLabel="Trends"
      >
        <Stat
          label="Week"
          value={money(revWeek.total)}
          delta={deltaPct(revWeek.total, revWeek.priorYear)}
          deltaCaption="vs same wk 2025"
        />
        {data.kpis.mtdNetSales != null && (
          <Stat
            label={data.kpis.monthLabel ? `${data.kpis.monthLabel} MTD` : "MTD"}
            value={money(data.kpis.mtdNetSales)}
            delta={deltaPct(data.kpis.mtdNetSales, data.kpis.mtdNetSalesPrevSpan)}
            deltaCaption={data.kpis.mtdPriorLabel ? `vs ${data.kpis.mtdPriorLabel}` : undefined}
          />
        )}
        {nextProj && (
          <Stat label="Next wk" value={money(nextProj.projected)} accent="text-ink-2" badge={<ProjBadge />} />
        )}
      </Strip>
    ),
    laborWeek && (
      <Strip
        key="labor"
        icon={Wallet}
        title={`Labor · wk of ${shortDate(laborWeek.week)}`}
        href="/labor"
        linkLabel="Labor details"
      >
        <Stat label="Payroll" value={money(laborWeek.actualLabor)} />
        <Stat
          label="% of revenue"
          value={percent(laborWeek.actualLaborPct)}
          accent={laborPctAccent(laborWeek.actualLaborPct)}
        />
        <Stat
          label="Year-end"
          value={money(labor.projectedYearEndLabor)}
          accent="text-ink-2"
          badge={<ProjBadge />}
        />
      </Strip>
    ),
    bookings.totals.bookings > 0 && (
      <Strip
        key="booked"
        icon={CalendarCheck}
        title={
          bookings.window
            ? `Booked Ahead · ${shortDate(bookings.window.from)} – ${shortDate(bookings.window.to)}`
            : "Booked Ahead"
        }
        href="/bookings"
        linkLabel="Bookings"
      >
        <Stat label="Revenue" value={money(bookings.totals.revenue)} />
        <Stat label="Orders" value={String(bookings.totals.bookings)} />
        <Stat label="Next 7 days" value={money(bookings.next7.revenue)} />
      </Strip>
    ),
  ].filter(Boolean);

  if (!strips.length) return null;
  return <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-3">{strips}</div>;
}
