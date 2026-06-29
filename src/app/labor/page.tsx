import { getLaborAnalysis, getLaborDetail } from "@/lib/dashboard";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";
import { DeptFilter } from "@/components/DeptFilter";
import { RangePicker } from "@/components/RangePicker";
import { DepartmentTable, EmployeeTable } from "@/components/LaborTables";
import { ComparisonPanels } from "@/components/Comparisons";
import { LaborTrendChart } from "@/components/charts";
import { Card, SectionHeader, ChartLegend, Sparkline, Delta } from "@/components/primitives";
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
}: {
  label: string;
  value: string;
  accent?: string;
  deltaValue?: number | null;
  deltaLabel?: string;
  prior?: string;
  spark?: number[];
  sub?: string;
}) {
  return (
    <Card className="card-pad overflow-hidden">
      <div className="stat-label">{label}</div>
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
  const [a, detail] = await Promise.all([
    getLaborAnalysis({ from, to }),
    getLaborDetail(dept),
  ]);

  const weeklySpark = a.weekly.filter((w) => w.actualLabor != null).map((w) => w.actualLabor!);
  const mom = a.comparisons.mom;
  const boundary = a.weekly.filter((w) => w.actualLabor != null).slice(-1)[0]?.week ?? null;
  const rangeLabel = a.range.from && a.range.to ? `${shortDate(a.range.from)} – ${shortDate(a.range.to)}` : "period";

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 md:px-8">
      <Nav />
      <Header control={<RangePicker from={a.range.from} to={a.range.to} availableDates={a.availableDates} basePath="/labor" />} />

      {/* Period KPIs — compared to the SAME period last year */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <LaborStat
          label={`Labor $ · ${rangeLabel}`}
          value={money(a.range.laborCost)}
          deltaValue={deltaPct(a.range.laborCost, a.range.laborPrev)}
          deltaLabel="vs same period 2025"
          prior={`${money(a.range.laborPrev)} in 2025`}
          spark={weeklySpark}
        />
        <LaborStat
          label={`Labor % · ${rangeLabel}`}
          value={percent(a.range.laborPct)}
          accent={(a.range.laborPct ?? 0) >= 0.5 ? "text-rose" : (a.range.laborPct ?? 0) >= 0.35 ? "text-amber" : "text-mint"}
          deltaValue={deltaPct(a.range.laborPct, a.range.laborPctPrev)}
          deltaLabel="vs same period 2025"
          prior={a.range.laborPctPrev != null ? `${percent(a.range.laborPctPrev)} in 2025` : undefined}
        />
        <LaborStat label={`Hours · ${rangeLabel}`} value={hours(a.range.hours)} sub={`${a.range.weeks} weeks`} />
        <LaborStat
          label="Projected Labor · Year-end"
          value={money(a.projectedYearEndLabor)}
          accent="text-ink-2"
          sub={`from ${money(a.ytdLabor)} YTD`}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card className="card-pad">
            <SectionHeader
              title="Labor Cost Trend & Projection"
              subtitle="Weekly labor — actual to date, projected to year-end"
              right={<ChartLegend items={[{ color: "#FFB400", label: "Labor" }]} note="solid = actual, dotted = projected" />}
            />
            <LaborTrendChart weekly={a.weekly} boundary={boundary} />
          </Card>

          <Card className="card-pad">
            <SectionHeader title="Labor — Month-over-Month & Year-over-Year" subtitle="Cost, and as a % of revenue" />
            <ComparisonPanels mom={a.comparisons.mom} yoy={a.comparisons.yoy} />
            <p className="mt-3 text-[11px] text-ink-3">2026 vs 2025 weekly labor & revenue.</p>
          </Card>

          <EmployeeTable detail={detail} />
        </div>

        <div className="space-y-4">
          <Card className="card-pad">
            <SectionHeader title="Latest Week Detail" subtitle="By department · timesheet export" />
            <DeptFilter departments={detail.departments.map((d) => d.department)} active={dept ?? "all"} />
          </Card>
          <DepartmentTable detail={detail} />
        </div>
      </div>
    </main>
  );
}
