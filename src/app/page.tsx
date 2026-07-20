import { getDashboard, getPulse } from "@/lib/dashboard";
import { getInsight } from "@/lib/insights";
import { getDataQuality } from "@/lib/quality";
import { DataQualityPanel } from "@/components/DataQualityPanel";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";
import { DatePicker } from "@/components/DatePicker";
import { RangePicker } from "@/components/RangePicker";
import { Kpis } from "@/components/Kpis";
import { Balances } from "@/components/Balances";
import { Sources } from "@/components/Sources";
import { DailyLedger } from "@/components/DailyLedger";
import { Comparisons } from "@/components/Comparisons";
import { Pulse } from "@/components/Pulse";
import { InsightsPanel } from "@/components/InsightsPanel";
import { Card, SectionHeader, ChartLegend } from "@/components/primitives";
import { money, percent, shortDate } from "@/lib/format";
import {
  SalesTrendChart,
  LaborDeptChart,
  ChannelMixChart,
  WeeklyCompChart,
} from "@/components/charts";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; from?: string; to?: string; qbo?: string }>;
}) {
  const { date, from, to, qbo } = await searchParams;
  const [data, pulse, quality] = await Promise.all([
    getDashboard({ date, from, to }),
    getPulse(),
    getDataQuality(),
  ]);
  const insight = await getInsight(data);

  const r = data.range;
  const rangeSubtitle =
    r.from && r.to
      ? `${shortDate(r.from)} – ${shortDate(r.to)} · ${money(r.netSales)} sales · ${money(r.laborCost)} labor · ${percent(r.laborPct)} labor`
      : "Net sales (area) vs labor cost (line)";

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 md:px-8">
      <Nav />
      <Header control={<DatePicker selected={data.selectedDate} available={data.availableDates} />} />

      {qbo && (
        <div
          className={
            qbo === "connected"
              ? "mt-3 rounded-xl border border-mint/40 bg-mint/10 px-4 py-2.5 text-sm font-medium text-cyan"
              : "mt-3 rounded-xl border border-amber/40 bg-amber/10 px-4 py-2.5 text-sm font-medium text-amber"
          }
        >
          {qbo === "connected"
            ? "QuickBooks connected — account balances will pull on the next sync."
            : qbo === "denied"
              ? "QuickBooks authorization was cancelled."
              : "QuickBooks connection didn't complete. Please try Connect again."}
        </div>
      )}

      <Kpis data={data} />

      {/* Hero: pulse of the business */}
      <div className="mt-4">
        <Pulse pulse={pulse} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Left / main column */}
        <div className="min-w-0 space-y-4 xl:col-span-2">
          <Card className="card-pad">
            <SectionHeader
              title="Daily Sales & Labor"
              subtitle={rangeSubtitle}
              right={<RangePicker from={data.range.from} to={data.range.to} availableDates={data.availableDates} />}
            />
            <div className="mb-2">
              <ChartLegend
                items={[
                  { color: "#FF385C", label: "Net sales" },
                  { color: "#FFB400", label: "Labor" },
                  { color: "#00A699", label: "Gross margin" },
                ]}
                note="gross margin = sales − labor − food"
              />
            </div>
            <SalesTrendChart series={data.rangeSeries} />
          </Card>

          <Comparisons data={data} />

          <Card className="card-pad">
            <SectionHeader
              title="Weekly Revenue vs Prior Year & Projection"
              subtitle="Weekly revenue · last 16 weeks · vs last year and plan"
              right={
                <ChartLegend
                  items={[
                    { color: "#FF385C", label: "2026 revenue" },
                    { color: "#A6A6A6", label: "Prior year" },
                    { color: "#FFB400", label: "Projection" },
                  ]}
                />
              }
            />
            <WeeklyCompChart data={data.weekly} />
          </Card>

          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="card-pad">
              <SectionHeader
                title="Revenue by Business Line"
                subtitle={
                  data.channelMixRange.from && data.channelMixRange.to
                    ? `Actual vs plan · ${data.channelMixRange.weeks} weeks (${shortDate(data.channelMixRange.from)} – ${shortDate(data.channelMixRange.to)})`
                    : "Actual vs plan"
                }
                right={<ChartLegend items={[{ color: "#FF385C", label: "Actual" }, { color: "#DDDDDD", label: "Plan" }]} />}
              />
              <ChannelMixChart data={data.channelMix} />
            </Card>
            <Card className="card-pad">
              <SectionHeader title="Labor by Department" subtitle="Paid cost · latest timesheet week" />
              <LaborDeptChart data={data.laborByDept} />
            </Card>
          </div>

          <DailyLedger data={data} />
        </div>

        {/* Right / rail */}
        <div className="space-y-4">
          <InsightsPanel initial={insight} />
          <DataQualityPanel quality={quality} />
          <Balances data={data} />
          <Sources data={data} />
        </div>
      </div>

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-[11px] text-ink-3">
        <span>CaterGenie · integration spike MVP</span>
        <span>Data via automated ingestion → Postgres · refreshed {new Date(data.generatedAt).toLocaleTimeString("en-US")}</span>
      </footer>
    </main>
  );
}
