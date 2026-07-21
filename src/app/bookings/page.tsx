import Link from "next/link";
import { getBookingsOutlook } from "@/lib/dashboard";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";
import { BookingsChart } from "@/components/charts";
import { Card, SectionHeader } from "@/components/primitives";
import { CanvasGrid, type CanvasSlot } from "@/components/canvas/CanvasGrid";
import { BOOKINGS_CARDS } from "@/lib/canvas/registry";
import { getUserLayout } from "@/lib/layout";
import { money, shortDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { CalendarCheck, Users, DollarSign, UploadCloud } from "lucide-react";

export const dynamic = "force-dynamic";

function Stat({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: React.ReactNode }) {
  return (
    <Card className="card-pad">
      <div className="flex items-center justify-between gap-1">
        <span className="stat-label min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0 text-ink-3">{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-ink">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-ink-3">{sub}</div>}
    </Card>
  );
}

function statusTone(status: string | null): string {
  const s = (status ?? "").toLowerCase();
  // Severity first: "incomplete" contains "complete" and "confirmation
  // pending" contains "confirm" — a green match must never win over those.
  if (s.includes("cancel")) return "bg-rose/10 text-rose";
  if (s.includes("incomplete") || s.includes("pending") || s.includes("tentative") || s.includes("change") || s.includes("prospect"))
    return "bg-amber/10 text-amber";
  if (s.includes("confirm") || s.includes("complete") || s.includes("definite")) return "bg-mint/10 text-mint";
  return "bg-canvas-700 text-ink-2";
}

const dayName = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });

export default async function BookingsPage() {
  const [b, layout] = await Promise.all([getBookingsOutlook(), getUserLayout("bookings")]);

  // One renderer per registered card (ids in @/lib/canvas/registry).
  const renderers: Record<string, React.ReactNode | null> = {
    "booking-stats": (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Booked Revenue · ahead"
          value={money(b.totals.revenue)}
          sub={b.window ? `${shortDate(b.window.from)} – ${shortDate(b.window.to)}` : "no upcoming bookings"}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <Stat
          label="Orders · ahead"
          value={String(b.totals.bookings)}
          sub={`${b.totals.days} days with bookings`}
          icon={<CalendarCheck className="h-4 w-4" />}
        />
        <Stat label="Guests · ahead" value={b.totals.guests.toLocaleString("en-US")} icon={<Users className="h-4 w-4" />} />
        <Stat
          label="Next 7 Days"
          value={money(b.next7.revenue)}
          sub={`${b.next7.bookings} orders`}
          icon={<CalendarCheck className="h-4 w-4" />}
        />
      </div>
    ),
    "revenue-by-day": (
      <Card className="card-pad">
        <SectionHeader
          title="Booked Revenue by Day"
          subtitle="Real forward orders — commitments, not projections"
        />
        <BookingsChart days={b.days} window={b.window} />
      </Card>
    ),
    "upcoming-bookings": (
      <div className="min-w-0 space-y-3">
        {b.days.length === 0 && (
            <Card className="card-pad">
              <SectionHeader title="Upcoming Bookings" subtitle="Nothing on the books yet" />
              <p className="text-sm text-ink-2">
                Bookings arrive from the CaterTrax daily sync and Caterease imports on the{" "}
                <Link href="/import" className="text-brand underline-offset-2 hover:underline">Import</Link> tab.
              </p>
            </Card>
          )}
        {b.days.map((d) => (
            <Card key={d.date} className="card-pad">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-ink">
                    {dayName(d.date)} · {shortDate(d.date)}
                  </div>
                  <div className="text-[11px] text-ink-3">
                    {d.count} order{d.count === 1 ? "" : "s"} · {d.guests} guests
                  </div>
                </div>
                <div className="text-lg font-semibold tabular-nums text-ink">{money(d.revenue)}</div>
              </div>
              <div className="divide-y divide-line">
                {d.events.map((e, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink">{e.name ?? "(unnamed booking)"}</div>
                      <div className="text-[11px] text-ink-3">
                        {e.guests != null ? `${e.guests} guests · ` : ""}
                        {e.source === "CATERTRAX" ? "CaterTrax" : e.source === "CATEREASE" ? "Caterease" : "Manual"}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {e.status && (
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", statusTone(e.status))}>
                          {e.status}
                        </span>
                      )}
                      <span className="w-20 text-right text-sm font-semibold tabular-nums text-ink">{money(e.revenue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
        ))}
      </div>
    ),
    "by-source": (
      <Card className="card-pad">
        <SectionHeader title="By Source" subtitle="Where these bookings come from" />
            <div className="divide-y divide-line">
              {b.bySource.map((s) => (
                <div key={s.source} className="flex items-center justify-between py-2">
                  <span className="text-sm text-ink-2">
                    {s.source === "CATERTRAX" ? "CaterTrax (daily sync)" : s.source === "CATEREASE" ? "Caterease (import)" : "Manual"}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-ink">
                    {s.count} · {money(s.revenue)}
                  </span>
                </div>
              ))}
              {b.bySource.length === 0 && <p className="py-2 text-sm text-ink-3">No sources yet.</p>}
            </div>
            <p className="mt-3 text-[11px] text-ink-3">
              {b.lastSync
                ? `Last CaterTrax bookings sync ${new Date(b.lastSync).toLocaleString("en-US", { timeZone: "America/New_York" })} ET.`
                : "CaterTrax bookings sync has not run yet."}{" "}
              Caterease bookings land via the <UploadCloud className="inline h-3 w-3" />{" "}
              <Link href="/import" className="text-brand underline-offset-2 hover:underline">Import</Link> tab.
            </p>
      </Card>
    ),
  };
  const slots: CanvasSlot[] = BOOKINGS_CARDS.map((m) => ({ id: m.id, element: renderers[m.id] ?? null }));

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 md:px-8">
      <Nav />
      <Header />
      <CanvasGrid tab="bookings" layout={layout} slots={slots} />
    </main>
  );
}
