import { getLaborAnalysis, getLaborDetail, getForwardPlanning, getStaffingOutlook } from "@/lib/dashboard";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";
import { DeptFilter } from "@/components/DeptFilter";
import { RangePicker } from "@/components/RangePicker";
import { DepartmentTable, EmployeeTable } from "@/components/LaborTables";
import { ComparisonPanels } from "@/components/Comparisons";
import { StaffingOutlookPanel } from "@/components/StaffingOutlookPanel";
import { EmployeeAnomalies } from "@/components/EmployeeAnomalies";
import { LaborTrendChart } from "@/components/charts";
import { Card, SectionHeader, ChartLegend, Sparkline, Delta, ProjBadge } from "@/components/primitives";
import { Explain } from "@/components/Explain";
import { CanvasGrid, type CanvasSlot } from "@/components/canvas/CanvasGrid";
import { LABOR_CARDS } from "@/lib/canvas/registry";
import { getUserLayout } from "@/lib/layout";
import { money, percent, hours, shortDate, deltaPct } from "@/lib/format";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

function LaborStat({
  label,
  value,
  accent = "text-ink",
  deltaValue,
  deltaLabel,
  prior,
  spark,
  sub,
  badge,
}: {
  label: string;
  value: string;
  accent?: string;
  deltaValue?: number | null;
  deltaLabel?: string;
  prior?: string;
  spark?: number[];
  sub?: string;
  badge?: React.ReactNode;
}) {
  return (
    <Card className="card-pad overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span className="stat-label">{label}</span>
        {badge}
      </div>
      <div className={cn("mt-1.5 text-2xl font-semibold tabular-nums", accent)}>{value}</div>
      <div className="mt-1.5 flex items-center gap-1.5">
        {deltaValue != null ? <Delta value={deltaValue} upIsGood={false} /> : null}
        <span className="truncate text-[11px] text-ink-3">{deltaLabel ?? sub}</span>
      </div>
      {prior && <div className="mt-0.5 text-[11px] text-ink-3">{prior}</div>}
      {spark && spark.length > 1 && (
        <div className="mt-2">
          <Sparkline data={spark} stroke="#FFB400" fill="#FFB4001f" />
        </div>
      )}
    </Card>
  );
}

export default async function LaborPage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string; from?: string; to?: string }>;
}) {
  const { dept, from, to } = await searchParams;
  const [a, detail, fp, staffing, layout] = await Promise.all([
    getLaborAnalysis({ from, to }),
    getLaborDetail(dept),
    getForwardPlanning(),
    getStaffingOutlook(),
    getUserLayout("labor"),
  ]);

  const weeklySpark = a.weekly.filter((w) => w.actualLabor != null).map((w) => w.actualLabor!);
  const mom = a.comparisons.mom;
  const boundary = a.weekly.filter((w) => w.actualLabor != null).slice(-1)[0]?.week ?? null;
  const rangeLabel = a.range.from && a.range.to ? `${shortDate(a.range.from)} – ${shortDate(a.range.to)}` : "period";

  // Derivation facts for the year-end projection popover.
  const projWeeks = a.weekly.filter((w) => w.actualLabor == null && w.projLabor != null);
  const projRest = projWeeks.reduce((s, w) => s + (w.projLabor ?? 0), 0);
  const peakWeek = [...projWeeks].sort((x, y) => (y.projLabor ?? 0) - (x.projLabor ?? 0))[0];
  const m = a.assumptions;
  const projExplain = (
    <Explain
      title={`Year-end payroll ${money(a.projectedYearEndLabor)} — how it's built`}
      steps={[
        {
          label: "Start from actuals",
          detail: `${money(a.ytdLabor)} of payroll is on the books through the week of ${boundary ? shortDate(boundary) : "—"} (weekly comp sheet).`,
        },
        {
          label: "Project each remaining week's revenue",
          detail: `Take what the same week did last year and scale by this year's pace: 2026 is running ${m.yoyRevenuePace.toFixed(2)}× 2025 on matched weeks. This keeps the real seasonality — the Sep–Oct event peak, the early-December holiday-party spike, the dead week after Christmas. Weeks whose revenue is already recorded use the actual number.`,
        },
        {
          label: "Turn revenue into labor",
          detail: `Every week carries about ${money(m.fixedWeeklyLabor)} of fixed labor (the crew you staff no matter what) plus ${(m.variableLaborPct * 100).toFixed(1)}¢ per revenue dollar — both fit to 2026's own weeks. That's why slow weeks don't drop to zero and big weeks don't scale linearly.`,
        },
        {
          label: "Add it up",
          detail: `${projWeeks.length} remaining weeks total ${money(projRest)} projected${peakWeek ? ` (largest: ${money(peakWeek.projLabor)} the week of ${shortDate(peakWeek.week)})` : ""}, plus ${money(a.ytdLabor)} actual = ${money(a.projectedYearEndLabor)}.`,
        },
      ]}
      note="Hover any dotted week on the trend chart below for that week's specific math. Seasonality assumptions are documented in docs/seasonality-research.md."
    />
  );

  // One renderer per registered card (ids in @/lib/canvas/registry).
  const renderers: Record<string, React.ReactNode | null> = {
    // Period KPIs — compared to the SAME period last year
    "labor-kpis": (
      <div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <LaborStat
          label={`Payroll $ · ${rangeLabel}`}
          value={money(a.range.laborCost)}
          deltaValue={deltaPct(a.range.laborCost, a.range.laborPrev)}
          deltaLabel="vs same period 2025"
          prior={`${money(a.range.laborPrev)} in 2025`}
          spark={weeklySpark}
        />
        <LaborStat
          label={`Payroll % · ${rangeLabel}`}
          value={percent(a.range.laborPct)}
          accent={(a.range.laborPct ?? 0) >= 0.5 ? "text-rose" : (a.range.laborPct ?? 0) >= 0.35 ? "text-amber" : "text-mint"}
          deltaValue={deltaPct(a.range.laborPct, a.range.laborPctPrev)}
          deltaLabel="vs same period 2025"
          prior={a.range.laborPctPrev != null ? `${percent(a.range.laborPctPrev)} in 2025` : undefined}
        />
        <LaborStat label={`Hours · ${rangeLabel}`} value={hours(a.range.hours)} sub={`${a.range.weeks} weeks`} />
        <LaborStat
          label="Projected Payroll · Year-end"
          value={money(a.projectedYearEndLabor)}
          accent="text-ink-2"
          sub={`seasonal model · from ${money(a.ytdLabor)} YTD`}
          badge={
            <>
              <ProjBadge />
              {projExplain}
            </>
          }
        />
        </div>
        <p className="mt-2 text-[11px] text-ink-3">
          Payroll figures come from the weekly comp sheet (loaded cost) — the timesheet-based wages
          shown on the dashboard KPIs run materially lower. Reconciliation flags live in Data Quality.
        </p>
      </div>
    ),
    // Staffing outlook — real imported schedule vs typical staffing
    "staffing-outlook": <StaffingOutlookPanel so={staffing} />,
    "labor-trend": (
      <Card className="card-pad">
        <SectionHeader
          title="Labor Cost Trend & Projection"
          subtitle="Weekly labor — actual to date; projection = prior-year seasonality × 2026 pace"
          right={<ChartLegend items={[{ color: "#FFB400", label: "Labor" }]} note="solid = actual, dotted = projected" />}
        />
        <LaborTrendChart weekly={a.weekly} boundary={boundary} model={a.assumptions} />
      </Card>
    ),
    "labor-comparisons": (
      <Card className="card-pad">
        <SectionHeader title="Labor — Month-over-Month & Year-over-Year" subtitle="Cost, and as a % of revenue" />
        <ComparisonPanels
          mom={a.comparisons.mom}
          yoy={a.comparisons.yoy}
          spark={a.weekly.filter((w) => w.actualLabor != null).map((w) => w.actualLabor!)}
          sparkLabel="weekly labor trend"
        />
      </Card>
    ),
    "employee-table": <EmployeeTable detail={detail} />,
    "employee-anomalies": <EmployeeAnomalies anomalies={fp.anomalies} />,
    // Filter + table are coupled through the ?dept= searchParam — one card.
    "dept-detail": (
      <div className="space-y-4">
        <Card className="card-pad">
          <SectionHeader title="Latest Week Detail" subtitle="By department · timesheet export" />
          <DeptFilter departments={detail.departments.map((d) => d.department)} active={dept ?? "all"} />
        </Card>
        <DepartmentTable detail={detail} />
      </div>
    ),
  };
  const slots: CanvasSlot[] = LABOR_CARDS.map((m) => ({ id: m.id, element: renderers[m.id] ?? null }));

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 md:px-8">
      <Nav />
      <Header control={<RangePicker from={a.range.from} to={a.range.to} availableDates={a.availableDates} basePath="/labor" />} />
      <CanvasGrid tab="labor" layout={layout} slots={slots} />
    </main>
  );
}
