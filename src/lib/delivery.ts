// Delivery scheduler data readers. Joins the four sources the board needs:
// EventBooking (the order: company/guests/revenue), DeliveryStop (coversheet
// enrichment: address/building/time + Kevin's driver assignment), GeoPoint
// (cached geocodes), and ScheduledShift dept "Delivery" (driver lanes).
// All joined in memory on the CaterTrax orderId.
import { prisma } from "./db";
import { timeToMinutes } from "./format";
import { DEPOT } from "./geocode";
import {
  computeConflicts,
  type Conflict,
  type DriverLaneModel,
  type LatLng,
  type RouteStop,
} from "./routing";

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const n = (v: unknown): number | null => (v == null ? null : Number(v));

export interface DeliveryStopView extends RouteStop {
  timeLabel: string | null;
  address: string | null;
  zip: string | null;
  revenue: number | null;
  status: string | null;
  driverKey: string | null;
  geocoded: boolean;
}

export interface DeliveryLane {
  key: string;
  name: string;
  startMin: number | null;
  endMin: number | null;
  startLabel: string | null;
  endLabel: string | null;
  stops: DeliveryStopView[];
}

export interface DeliveryDay {
  date: string;
  lanes: DeliveryLane[];
  unassigned: DeliveryStopView[];
  conflicts: Conflict[];
  depot: typeof DEPOT;
  totals: { drops: number; guests: number; revenue: number; drivers: number; geocoded: number };
}

export const driverKeyOf = (employeeId: string | null, first: string | null, last: string | null): string =>
  employeeId || [first, last].filter(Boolean).join(" ").toLowerCase().trim() || "unknown";

export async function getDeliveryDay(dateISO: string): Promise<DeliveryDay> {
  const date = new Date(`${dateISO}T00:00:00Z`);
  const [bookings, stops, shifts] = await Promise.all([
    prisma.eventBooking.findMany({ where: { eventDate: date, source: "CATERTRAX" } }),
    prisma.deliveryStop.findMany({ where: { date } }),
    prisma.scheduledShift.findMany({ where: { date, department: "Delivery" }, orderBy: { startTime: "asc" } }),
  ]);
  const keys = [...new Set(stops.map((s) => s.addressKey).filter((k): k is string => !!k))];
  const geos = keys.length ? await prisma.geoPoint.findMany({ where: { addressKey: { in: keys } } }) : [];
  const geoByKey = new Map(geos.map((g) => [g.addressKey, g]));

  const stopByOrder = new Map(stops.map((s) => [s.orderId, s]));
  const views: DeliveryStopView[] = [];
  for (const b of bookings) {
    if ((b.status ?? "").includes("cancel")) continue;
    const orderId = b.orderId ?? b.name?.match(/\(#(\d+)\)\s*$/)?.[1] ?? null;
    if (!orderId) continue;
    const st = stopByOrder.get(orderId);
    const geo = st?.addressKey ? geoByKey.get(st.addressKey) : undefined;
    const latLng: LatLng | null = geo?.lat != null && geo?.lng != null ? { lat: geo.lat, lng: geo.lng } : null;
    const time = st?.deliveryTime ?? b.eventTime ?? null;
    views.push({
      orderId,
      company: b.company ?? st?.building ?? null,
      building: st?.building ?? null,
      timeMin: timeToMinutes(time),
      timeLabel: time,
      latLng,
      guests: b.guests ?? null,
      address: st?.addressRaw ?? null,
      zip: st?.zip ?? null,
      revenue: n(b.revenue),
      status: b.status,
      driverKey: st?.driverKey ?? null,
      geocoded: latLng != null,
    });
  }
  views.sort((a, b) => (a.timeMin ?? 9999) - (b.timeMin ?? 9999));

  // Driver lanes from the WIW schedule. One lane per person; if someone has
  // split shifts, use the earliest start and latest end (simple + transparent).
  const laneMap = new Map<string, DeliveryLane>();
  for (const s of shifts) {
    const key = driverKeyOf(s.employeeId, s.firstName, s.lastName);
    const name = [s.firstName, s.lastName].filter(Boolean).join(" ") || "Driver";
    const start = timeToMinutes(s.startTime);
    const end = timeToMinutes(s.endTime);
    const lane = laneMap.get(key) ?? {
      key,
      name,
      startMin: start,
      endMin: end,
      startLabel: s.startTime,
      endLabel: s.endTime,
      stops: [] as DeliveryStopView[],
    };
    if (start != null && (lane.startMin == null || start < lane.startMin)) {
      lane.startMin = start;
      lane.startLabel = s.startTime;
    }
    if (end != null && (lane.endMin == null || end > lane.endMin)) {
      lane.endMin = end;
      lane.endLabel = s.endTime;
    }
    laneMap.set(key, lane);
  }
  const lanes = [...laneMap.values()].sort((a, b) => (a.startMin ?? 9999) - (b.startMin ?? 9999));

  const unassigned: DeliveryStopView[] = [];
  for (const v of views) {
    const lane = v.driverKey ? laneMap.get(v.driverKey) : undefined;
    if (lane) lane.stops.push(v);
    else unassigned.push(v);
  }

  const conflicts = computeConflicts(lanes as DriverLaneModel[], unassigned);
  return {
    date: dateISO,
    lanes,
    unassigned,
    conflicts,
    depot: DEPOT,
    totals: {
      drops: views.length,
      guests: views.reduce((s, v) => s + (v.guests ?? 0), 0),
      revenue: views.reduce((s, v) => s + (v.revenue ?? 0), 0),
      drivers: lanes.length,
      geocoded: views.filter((v) => v.geocoded).length,
    },
  };
}

/** Day selector strip: forward days with drop/driver/conflict counts. */
export async function getDeliveryDates(daysAhead = 14): Promise<Array<{ date: string; drops: number; drivers: number; conflicts: number }>> {
  const today = new Date(`${iso(new Date())}T00:00:00Z`);
  const to = new Date(today.getTime() + daysAhead * 86_400_000);
  const [bookings, shifts] = await Promise.all([
    prisma.eventBooking.findMany({ where: { eventDate: { gte: today, lte: to }, source: "CATERTRAX" } }),
    prisma.scheduledShift.findMany({ where: { date: { gte: today, lte: to }, department: "Delivery" } }),
  ]);
  const days = new Map<string, { drops: number; drivers: Set<string> }>();
  for (const b of bookings) {
    if ((b.status ?? "").includes("cancel")) continue;
    const d = iso(b.eventDate);
    const e = days.get(d) ?? { drops: 0, drivers: new Set<string>() };
    e.drops++;
    days.set(d, e);
  }
  for (const s of shifts) {
    const d = iso(s.date);
    const e = days.get(d) ?? { drops: 0, drivers: new Set<string>() };
    e.drivers.add(driverKeyOf(s.employeeId, s.firstName, s.lastName));
    days.set(d, e);
  }
  const out: Array<{ date: string; drops: number; drivers: number; conflicts: number }> = [];
  for (const [d, e] of [...days.entries()].sort()) {
    // Conflict counts come from the full day model only for days with drops —
    // cheap enough at a 14-day horizon.
    const conflicts = e.drops ? (await getDeliveryDay(d)).conflicts.length : 0;
    out.push({ date: d, drops: e.drops, drivers: e.drivers.size, conflicts });
  }
  return out;
}

/** Known customers for the SlotFinder autocomplete: company → last-seen location. */
export async function getKnownCustomers(): Promise<
  Array<{ company: string; building: string | null; address: string | null; lat: number | null; lng: number | null }>
> {
  const bookings = await prisma.eventBooking.findMany({
    where: { source: "CATERTRAX", company: { not: null } },
    orderBy: { eventDate: "desc" },
    take: 500,
  });
  const stops = await prisma.deliveryStop.findMany({ orderBy: { date: "desc" } });
  const geoKeys = [...new Set(stops.map((s) => s.addressKey).filter((k): k is string => !!k))];
  const geos = geoKeys.length ? await prisma.geoPoint.findMany({ where: { addressKey: { in: geoKeys } } }) : [];
  const geoByKey = new Map(geos.map((g) => [g.addressKey, g]));
  const stopByOrder = new Map(stops.map((s) => [s.orderId, s]));

  const seen = new Map<string, { company: string; building: string | null; address: string | null; lat: number | null; lng: number | null }>();
  for (const b of bookings) {
    const company = b.company!;
    if (seen.has(company.toLowerCase())) continue;
    const orderId = b.orderId ?? b.name?.match(/\(#(\d+)\)\s*$/)?.[1] ?? null;
    const st = orderId ? stopByOrder.get(orderId) : undefined;
    const geo = st?.addressKey ? geoByKey.get(st.addressKey) : undefined;
    seen.set(company.toLowerCase(), {
      company,
      building: st?.building ?? null,
      address: st?.addressRaw ?? null,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
    });
  }
  return [...seen.values()].sort((a, b) => a.company.localeCompare(b.company));
}
