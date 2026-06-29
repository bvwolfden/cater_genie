import { getDashboard } from "@/lib/dashboard";
import { getInsight } from "@/lib/insights";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";
import { DatePicker } from "@/components/DatePicker";
import { Kpis } from "@/components/Kpis";
import { Balances } from "@/components/Balances";
import { Sources } from "@/components/Sources";
import { DailyLedger } from "@/components/DailyLedger";
import { InsightsPanel } from "@/components/InsightsPanel";
import { Card, SectionHeader } from "@/components/primitives";
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
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const data = await getDashboard(date);
  const insight = await getInsight(data);

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 md:px-8">
      <Nav />
      <Header control={<DatePicker selected={data.selectedDate} available={data.availableDates} />} />

      <Kpis data={data} />

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Left / main column */}
        <div className="space-y-4 xl:col-span-2">
          <Card className="card-pad">
            <SectionHeader
              title="Daily Sales & Labor"
              subtitle="Net sales (area) vs labor cost (line) — last 30 days"
            />
            <SalesTrendChart series={data.series} />
          </Card>

          <Card className="card-pad">
            <SectionHeader
              title="Weekly Revenue vs Prior Year & Projection"
              subtitle="Bars: 2026 revenue · dashed: prior year · gold: projection"
            />
            <WeeklyCompChart data={data.weekly} />
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="card-pad">
              <SectionHeader title="Channel Mix" subtitle="Actual vs projected · recent weeks" />
              <ChannelMixChart data={data.channelMix} />
            </Card>
            <Card className="card-pad">
              <SectionHeader title="Labor by Department" subtitle="Paid cost · current week" />
              <LaborDeptChart data={data.laborByDept} />
            </Card>
          </div>

          <DailyLedger data={data} />
        </div>

        {/* Right / rail */}
        <div className="space-y-4">
          <InsightsPanel initial={insight} />
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
