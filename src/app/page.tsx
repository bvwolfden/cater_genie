import Link from "next/link";
import { getDashboard, getPulse, getStaffingOutlook, getBookingsOutlook } from "@/lib/dashboard";
import { StaffingCallout } from "@/components/StaffingCallout";
import { getInsight } from "@/lib/insights";
import { getDataQuality } from "@/lib/quality";
import { DataQualityPanel } from "@/components/DataQualityPanel";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";
import { PeriodPicker } from "@/components/PeriodPicker";
import { RangePicker } from "@/components/RangePicker";
import { Kpis } from "@/components/Kpis";
import { Balances } from "@/components/Balances";
import { Sources } from "@/components/Sources";
import { DailyLedger } from "@/components/DailyLedger";
import { Comparisons } from "@/components/Comparisons";
import { Pulse } from "@/components/Pulse";
import { InsightsPanel } from "@/components/InsightsPanel";
import { Card, SectionHeader, ChartLegend, ProjBadge } from "@/components/primitives";
import { Explain } from "@/components/Explain";
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
  searchParams: Promise<{ date?: string; from?: string; to?: string; period?: string; qbo?: string }>;
}) {
  const { date, from, to, period, qbo } = await searchParams;
  const [data, pulse, quality, staffing, bookings] = await Promise.all([
    getDashboard({ date, from, to, period }),
    getPulse(),
    getDataQuality(),
    getStaffingOutlook(),
    getBookingsOutlook(),
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
      <Header
        control={
          <PeriodPicker
            period={data.periodKpis.period}
            selected={data.selectedDate}
            latest={data.latestDate}
            first={data.availableDates[0] ?? null}
            from={data.periodKpis.period === "custom" ? data.periodKpis.from : from ?? null}
            to={data.periodKpis.period === "custom" ? data.periodKpis.to : to ?? null}
          />
        }
      />

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

      {/* Staffing highlight — over/under-staffed days in the imported schedule */}
      {staffing && (
        <div className="mt-4">
          <StaffingCallout so={staffing} />
        </div>
      )}

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
              subtitle="Weekly revenue · last 16 weeks · dashed = projected ahead"
              right={
                <div className="flex items-center gap-2">
                  <ChartLegend
                    items={[
                      { color: "#FF385C", label: "2026 revenue" },
                      { color: "#A6A6A6", label: "Prior year" },
                      { color: "#FFB400", label: "Actual → projected" },
                    ]}
                  />
                  <ProjBadge />
                  {data.weeklyProjection && (
                    <Explain
                      title="Projected weeks — how they're built"
                      steps={[
                        {
                          label: "Prior-year seasonality",
                          detail: "Each dashed future week starts from what the same calendar week did in 2025 — that's where holiday spikes and slow weeks come from.",
                        },
                        {
                          label: "Scale to this year's pace",
                          detail: `2026 is running ${data.weeklyProjection.pace.toFixed(2)}× the 2025 number over the last ${data.weeklyProjection.paceWeeks} matched weeks, so each prior-year week is multiplied by ${data.weeklyProjection.pace.toFixed(2)}.`,
                        },
                        {
                          label: "Fallback",
                          detail: `A future week with no 2025 data uses the recent run-rate instead (${money(data.weeklyProjection.runRate)}/week, the average of the last 4 actual weeks).`,
                        },
                      ]}
                      note="Only the next 4 weeks are shown — beyond that, confidence drops until real bookings cover the horizon."
                    />
                  )}
                </div>
              }
            />
            <WeeklyCompChart data={data.weekly} />
          </Card>

          {bookings.totals.bookings > 0 && (
            <Card className="card-pad">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink">Booked Ahead</div>
                  <div className="text-[11px] text-ink-3">
                    Real orders on the books
                    {bookings.window ? ` · ${shortDate(bookings.window.from)} – ${shortDate(bookings.window.to)}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-5">
                  <div className="text-right">
                    <div className="stat-label">Revenue</div>
                    <div className="text-lg font-semibold tabular-nums text-ink">{money(bookings.totals.revenue)}</div>
                  </div>
                  <div className="text-right">
                    <div className="stat-label">Orders</div>
                    <div className="text-lg font-semibold tabular-nums text-ink">{bookings.totals.bookings}</div>
                  </div>
                  <div className="text-right">
                    <div className="stat-label">Next 7 days</div>
                    <div className="text-lg font-semibold tabular-nums text-ink">{money(bookings.next7.revenue)}</div>
                  </div>
                  <Link
                    href="/bookings"
                    className="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
                  >
                    View bookings →
                  </Link>
                </div>
              </div>
            </Card>
          )}

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
