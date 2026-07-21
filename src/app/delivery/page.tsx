import Link from "next/link";
import { getDeliveryDay, getDeliveryDates, type DeliveryStopView } from "@/lib/delivery";
import { driverColor } from "@/lib/delivery-palette";
import { SERVICE_MIN, SPACING_MIN } from "@/lib/routing";
import { money, shortDate, weekdayDate } from "@/lib/format";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";
import { Card, SectionHeader } from "@/components/primitives";
import { Explain } from "@/components/Explain";
import { cn } from "@/lib/cn";
import { Truck, TriangleAlert, MapPin, UploadCloud } from "lucide-react";

export const dynamic = "force-dynamic";

const todayISO = () => new Date().toISOString().slice(0, 10);

function StopRow({ s, tone }: { s: DeliveryStopView; tone?: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className={cn("w-16 shrink-0 text-right text-sm font-semibold tabular-nums", s.timeLabel ? "text-ink" : "text-ink-3")}>
        {s.timeLabel ?? "—"}
      </span>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tone ?? "#A6A6A6" }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">{s.company ?? s.building ?? `Order #${s.orderId}`}</div>
        <div className="truncate text-[11px] text-ink-3">
          {s.building && s.building !== s.company ? `${s.building} · ` : ""}
          {s.address ?? "no address yet"}
          {!s.geocoded && s.address ? " · not on map yet" : ""}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm tabular-nums text-ink-2">{s.guests != null ? `${s.guests}g` : "—"}</div>
        <div className="text-[11px] tabular-nums text-ink-3">{money(s.revenue)}</div>
      </div>
    </div>
  );
}

export default async function DeliveryPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const dates = await getDeliveryDates(14);
  const fallback = dates.find((d) => d.drops > 0)?.date ?? todayISO();
  const dateISO = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : fallback;
  const day = await getDeliveryDay(dateISO);

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 md:px-8">
      <Nav />
      <Header />

      {/* Day selector */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {dates.map((d) => {
          const active = d.date === dateISO;
          return (
            <Link
              key={d.date}
              href={`/delivery?date=${d.date}`}
              className={cn(
                "flex flex-col items-center rounded-xl border px-3 py-1.5 transition",
                active ? "border-brand bg-brand text-white shadow-sm" : "border-line bg-white text-ink-2 hover:border-brand/40"
              )}
            >
              <span className="text-[11px] font-semibold uppercase leading-4">{shortDate(d.date)}</span>
              <span className={cn("text-[10px] leading-4", active ? "text-white/80" : "text-ink-3")}>
                {d.drops} drop{d.drops === 1 ? "" : "s"} · {d.drivers} drv
                {d.conflicts > 0 && <span className={active ? " text-white" : " text-rose"}> · {d.conflicts}!</span>}
              </span>
            </Link>
          );
        })}
        {dates.length === 0 && <p className="text-sm text-ink-3">No upcoming CaterTrax orders synced yet.</p>}
      </div>

      {/* Conflicts — what a scheduler would actually act on */}
      {day.conflicts.length > 0 && (
        <Card className="card-pad mb-4">
          <SectionHeader
            title={
              <span className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-amber/10 text-amber"><TriangleAlert className="h-3.5 w-3.5" /></span>
                Needs attention · {weekdayDate(day.date)}
              </span>
            }
            subtitle="Every flag explains itself — check it against the board below"
          />
          <ul className="space-y-1.5">
            {day.conflicts.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-ink-2">
                <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", c.kind === "tight-run" || c.kind === "no-driver-window" ? "bg-rose" : "bg-amber")} />
                {c.text}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="card-pad">
        <SectionHeader
          title={
            <span className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-md bg-brand/10 text-brand"><Truck className="h-3.5 w-3.5" /></span>
              Delivery Board · {weekdayDate(day.date)}
            </span>
          }
          subtitle={`${day.totals.drops} drops · ${day.totals.guests} guests · ${money(day.totals.revenue)} · ${day.totals.drivers} driver${day.totals.drivers === 1 ? "" : "s"} scheduled`}
          right={
            <Explain
              title="How this board works"
              steps={[
                { label: "Drops", detail: "Every CaterTrax order for the day, with its delivery time, address and building straight from the CaterTrax coversheet (synced daily)." },
                { label: "Drivers", detail: "Delivery-department shifts from the When I Work schedule import. Assigning a drop to a driver here is the plan of record — CaterTrax doesn't track this." },
                { label: "The math", detail: `Flags assume ~${SERVICE_MIN} min to unload at a stop plus drive time between buildings (straight-line distance at city speed). If we don't know a building's location yet, the flat ${SPACING_MIN}-min spacing rule applies. Same building = drops can stack.` },
              ]}
              note="Nothing here is hidden model magic: every flag names the drops and minutes behind it."
            />
          }
        />

        {/* Driver lanes */}
        {day.lanes.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {day.lanes.map((lane, i) => (
              <div key={lane.key} className="rounded-xl border border-line bg-canvas-700 p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: driverColor(i) }} />
                    {lane.name}
                  </span>
                  <span className="text-[11px] text-ink-3">
                    {lane.startLabel && lane.endLabel ? `${lane.startLabel} – ${lane.endLabel}` : "shift times unknown"}
                    {" · "}{lane.stops.length} stop{lane.stops.length === 1 ? "" : "s"}
                  </span>
                </div>
                {lane.stops.length ? (
                  <div className="divide-y divide-line">
                    {lane.stops.map((s) => <StopRow key={s.orderId} s={s} tone={driverColor(i)} />)}
                  </div>
                ) : (
                  <p className="py-2 text-[12px] text-ink-3">No stops assigned yet.</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="mb-3 grid place-items-center rounded-xl border border-dashed border-line px-6 py-6 text-center">
            <UploadCloud className="mb-1.5 h-5 w-5 text-ink-3" />
            <p className="text-sm text-ink-2">No delivery drivers on the schedule for this day.</p>
            <p className="mt-1 max-w-md text-[12px] text-ink-3">
              Driver lanes come from the When I Work schedule import (Delivery department) — drop the week&apos;s export on the{" "}
              <Link href="/import" className="font-medium text-brand hover:underline">Import page</Link>.
            </p>
          </div>
        )}

        {/* Unassigned pool */}
        <div className="mt-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
            <MapPin className="h-4 w-4 text-ink-3" />
            Unassigned drops
            <span className="text-[11px] font-normal text-ink-3">— in delivery-time order; assign them to drivers as Kevin plans the day</span>
          </div>
          {day.unassigned.length ? (
            <div className="divide-y divide-line">
              {day.unassigned.map((s) => <StopRow key={s.orderId} s={s} />)}
            </div>
          ) : (
            <p className="py-2 text-[12px] text-ink-3">{day.totals.drops ? "Every drop is assigned." : "No drops on this day."}</p>
          )}
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-ink-3">
          <span className="font-medium text-ink-2">Where this data comes from:</span> orders, delivery times, addresses and
          building names sync daily from CaterTrax (coversheet). Driver shifts come from the When I Work schedule import.
          {day.totals.drops > 0 && day.totals.geocoded < day.totals.drops
            ? ` ${day.totals.drops - day.totals.geocoded} of ${day.totals.drops} drops aren't on the map yet — new addresses geocode a few per sync run.`
            : ""}
        </p>
      </Card>
    </main>
  );
}
