// Delivery routing engine — pure functions, no I/O, shared by the /delivery
// board (conflicts) and the SlotFinder (feasibility). Everything here is
// deliberately transparent: every verdict carries a plain-English reason a
// scheduler can sanity-check against the board.
import { minutesToLabel } from "./format";

export interface LatLng {
  lat: number;
  lng: number;
}

/** Tunable operating assumptions — surfaced in the UI, not hidden. */
export const SERVICE_MIN = 12; // unload + set down at a stop
export const SPACING_MIN = 30; // no-geocode fallback: Kevin's spacing rule between different buildings
export const SLOT_STEP_MIN = 15; // candidate window granularity

const havKm = (a: LatLng, b: LatLng): number => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

/**
 * Minutes of travel between two stops. Urban heuristic: straight-line km ×
 * 1.35 road factor at 22 km/h + 4 min to park and walk in. Same building = 0
 * (stack the drops). No geocode on either end = Kevin's flat spacing rule.
 */
export function driveMinutes(a: LatLng | null, b: LatLng | null, sameBuilding: boolean): number {
  if (sameBuilding) return 0;
  if (!a || !b) return SPACING_MIN - SERVICE_MIN; // so service + drive ≈ the 30-min rule
  const km = havKm(a, b);
  return Math.max(4, Math.round(((km * 1.35) / 22) * 60 + 4));
}

// --- Day model (built by src/lib/delivery.ts) --------------------------------
export interface RouteStop {
  orderId: string;
  company: string | null;
  building: string | null;
  timeMin: number | null; // delivery time, minutes since midnight
  latLng: LatLng | null;
  guests: number | null;
}

export interface DriverLaneModel {
  key: string;
  name: string;
  startMin: number | null;
  endMin: number | null;
  stops: RouteStop[]; // sorted by timeMin
}

export interface Conflict {
  kind: "tight-run" | "no-driver-window" | "capacity-crunch" | "no-time";
  text: string; // plain-English, names the drops involved
  orderIds: string[];
}

const sameBldg = (a: RouteStop, b: RouteStop): boolean =>
  (a.building != null && a.building === b.building) ||
  (a.latLng != null && b.latLng != null && havKm(a.latLng, b.latLng) < 0.05);

const label = (s: RouteStop): string => s.company ?? s.building ?? `#${s.orderId}`;

/**
 * Conflicts a scheduler would actually act on. Assigned lanes are checked for
 * back-to-back feasibility; the whole day is checked for windows where drops
 * outnumber drivers on shift.
 */
export function computeConflicts(lanes: DriverLaneModel[], unassigned: RouteStop[]): Conflict[] {
  const out: Conflict[] = [];

  // Tight runs within an assigned lane: consecutive stops the driver can't make.
  for (const lane of lanes) {
    const timed = lane.stops.filter((s) => s.timeMin != null);
    for (let i = 1; i < timed.length; i++) {
      const prev = timed[i - 1], cur = timed[i];
      const need = SERVICE_MIN + driveMinutes(prev.latLng, cur.latLng, sameBldg(prev, cur));
      const gap = cur.timeMin! - prev.timeMin!;
      if (gap < need) {
        out.push({
          kind: "tight-run",
          text: `${lane.name}: ${label(prev)} at ${minutesToLabel(prev.timeMin!)} → ${label(cur)} at ${minutesToLabel(cur.timeMin!)} leaves ${gap} min, needs ~${need} (unload + drive).`,
          orderIds: [prev.orderId, cur.orderId],
        });
      }
    }
  }

  // Drops whose time no scheduled driver shift covers at all.
  const allStops = [...lanes.flatMap((l) => l.stops), ...unassigned];
  for (const s of allStops) {
    if (s.timeMin == null) continue;
    const covered = lanes.some(
      (l) => l.startMin != null && l.endMin != null && s.timeMin! >= l.startMin && s.timeMin! + SERVICE_MIN <= l.endMin
    );
    if (!covered && lanes.length) {
      out.push({
        kind: "no-driver-window",
        text: `${label(s)} at ${minutesToLabel(s.timeMin)} falls outside every scheduled driver shift.`,
        orderIds: [s.orderId],
      });
    }
  }

  // Windows where distinct-building drops outnumber drivers on shift.
  const timed = allStops.filter((s) => s.timeMin != null).sort((a, b) => a.timeMin! - b.timeMin!);
  for (let i = 0; i < timed.length; i++) {
    const w0 = timed[i].timeMin!;
    const windowStops = timed.filter((s) => s.timeMin! >= w0 && s.timeMin! < w0 + 45);
    const buildings = new Set(windowStops.map((s) => s.building ?? s.company ?? s.orderId));
    const driversOn = lanes.filter(
      (l) => l.startMin != null && l.endMin != null && l.startMin <= w0 + 45 && l.endMin >= w0
    ).length;
    if (buildings.size > driversOn && windowStops.length > 1) {
      out.push({
        kind: "capacity-crunch",
        text: `${minutesToLabel(w0)}–${minutesToLabel(w0 + 45)}: ${windowStops.length} drops at ${buildings.size} buildings with ${driversOn} driver${driversOn === 1 ? "" : "s"} on shift.`,
        orderIds: windowStops.map((s) => s.orderId),
      });
      i += windowStops.length - 1; // don't re-report overlapping windows
    }
  }

  // Drops the source gave us no time for — invisible to all checks above.
  for (const s of allStops.filter((s) => s.timeMin == null)) {
    out.push({ kind: "no-time", text: `${label(s)} has no delivery time from CaterTrax yet.`, orderIds: [s.orderId] });
  }

  return out;
}

// --- SlotFinder --------------------------------------------------------------
export interface SlotVerdict {
  driverKey: string;
  driverName: string;
  feasible: boolean;
  reason: string;
}

export interface SlotSuggestion {
  timeMin: number;
  timeLabel: string;
  driverKey: string;
  driverName: string;
  reason: string;
}

/**
 * "A business just called — what can we offer?" For each scheduled driver,
 * test whether a new drop at the queried location fits between their existing
 * stops (unload + drive both sides, inside their shift). With no queried time,
 * scan the whole day in 15-min steps. Unassigned drops count against the
 * day's capacity: a window where unassigned + new would exceed drivers on
 * shift is excluded.
 */
export function suggestSlots(
  lanes: DriverLaneModel[],
  unassigned: RouteStop[],
  q: { timeMin?: number | null; latLng: LatLng | null; building?: string | null }
): { atRequested: SlotVerdict[]; alternatives: SlotSuggestion[]; blockers: string[] } {
  const newStop: RouteStop = {
    orderId: "(new)",
    company: null,
    building: q.building ?? null,
    timeMin: null,
    latLng: q.latLng,
    guests: null,
  };

  const capacityOk = (t: number): boolean => {
    const win = unassigned.filter((s) => s.timeMin != null && Math.abs(s.timeMin - t) < 45).length;
    const driversOn = lanes.filter((l) => l.startMin != null && l.endMin != null && l.startMin <= t && l.endMin >= t).length;
    return win + 1 <= Math.max(driversOn, 1);
  };

  const tryInsert = (lane: DriverLaneModel, t: number): { ok: boolean; reason: string } => {
    if (lane.startMin == null || lane.endMin == null) return { ok: false, reason: `${lane.name} has no shift times on the schedule.` };
    const fromDepot = t - lane.startMin; // driver must be able to leave depot and arrive
    if (fromDepot < 0 || t + SERVICE_MIN > lane.endMin) {
      return { ok: false, reason: `${lane.name}'s shift is ${minutesToLabel(lane.startMin)}–${minutesToLabel(lane.endMin)}.` };
    }
    const timed = lane.stops.filter((s) => s.timeMin != null);
    const prev = [...timed].reverse().find((s) => s.timeMin! <= t) ?? null;
    const next = timed.find((s) => s.timeMin! > t) ?? null;
    if (prev) {
      const need = SERVICE_MIN + driveMinutes(prev.latLng, newStop.latLng, sameBldg(prev, newStop));
      if (t - prev.timeMin! < need) {
        return { ok: false, reason: `${lane.name} drops ${label(prev)} at ${minutesToLabel(prev.timeMin!)} — needs ~${need} min before the next drop, has ${t - prev.timeMin!}.` };
      }
    }
    if (next) {
      const need = SERVICE_MIN + driveMinutes(newStop.latLng, next.latLng, sameBldg(newStop, next));
      if (next.timeMin! - t < need) {
        return { ok: false, reason: `${lane.name} is due at ${label(next)} by ${minutesToLabel(next.timeMin!)} — needs ~${need} min after this drop, has ${next.timeMin! - t}.` };
      }
    }
    const after = prev ? `after ${label(prev)} (${minutesToLabel(prev.timeMin!)})` : "first drop of the shift";
    const before = next ? `, back before ${label(next)} (${minutesToLabel(next.timeMin!)})` : "";
    return { ok: true, reason: `${lane.name} is free — ${after}${before}.` };
  };

  const blockers: string[] = [];
  if (!lanes.length) blockers.push("No delivery drivers are on the schedule for this day yet (import the week's schedule in When I Work).");
  if (!q.latLng) blockers.push(`No known location for this customer yet — using the flat ${SPACING_MIN}-min spacing rule instead of drive times.`);

  const atRequested: SlotVerdict[] = [];
  if (q.timeMin != null) {
    for (const lane of lanes) {
      const v = tryInsert(lane, q.timeMin);
      const cap = capacityOk(q.timeMin);
      atRequested.push({
        driverKey: lane.key,
        driverName: lane.name,
        feasible: v.ok && cap,
        reason: v.ok && !cap ? `Window is already crowded: unassigned drops around ${minutesToLabel(q.timeMin)} would outnumber drivers on shift.` : v.reason,
      });
    }
  }

  // Scan the day for open windows (nearest to the asked time first, else chronological).
  const dayLo = Math.min(...lanes.map((l) => l.startMin ?? 600), 600);
  const dayHi = Math.max(...lanes.map((l) => l.endMin ?? 1020), 1020);
  const alternatives: SlotSuggestion[] = [];
  for (let t = dayLo; t <= dayHi - SERVICE_MIN; t += SLOT_STEP_MIN) {
    for (const lane of lanes) {
      const v = tryInsert(lane, t);
      if (v.ok && capacityOk(t)) {
        alternatives.push({ timeMin: t, timeLabel: minutesToLabel(t), driverKey: lane.key, driverName: lane.name, reason: v.reason });
        break; // one driver per time slot is enough to offer the window
      }
    }
  }
  const ref = q.timeMin;
  if (ref != null) alternatives.sort((a, b) => Math.abs(a.timeMin - ref) - Math.abs(b.timeMin - ref));

  return { atRequested, alternatives: alternatives.slice(0, 8), blockers };
}
