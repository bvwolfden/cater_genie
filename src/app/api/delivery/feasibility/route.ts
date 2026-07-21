import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDeliveryDay, getKnownCustomers } from "@/lib/delivery";
import { suggestSlots, type DriverLaneModel } from "@/lib/routing";
import { timeToMinutes } from "@/lib/format";
import { normalizeAddressKey } from "@/lib/geocode";

export const dynamic = "force-dynamic";

/**
 * "A business just called — what can we offer them?"
 * POST { date: "YYYY-MM-DD", company?: string, address?: string, time?: "11:30 AM" }
 * Location resolution, most-trusted first: geocode cache by address → the
 * company's last known stop → nothing (flat spacing rule). Shares the exact
 * feasibility code the board's conflict flags use.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { date?: string; company?: string; address?: string; time?: string } | null;
  if (!body?.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return NextResponse.json({ ok: false, error: "date (YYYY-MM-DD) required" }, { status: 400 });
  }

  let latLng: { lat: number; lng: number } | null = null;
  let building: string | null = null;
  let locationNote = "No known location — using the flat 30-min spacing rule.";
  if (body.address) {
    const key = normalizeAddressKey(body.address);
    const geo = await prisma.geoPoint.findUnique({ where: { addressKey: key } });
    if (geo?.lat != null && geo.lng != null) {
      latLng = { lat: geo.lat, lng: geo.lng };
      locationNote = `Using the address you entered (${geo.addressRaw}).`;
    }
  }
  if (!latLng && body.company) {
    const known = (await getKnownCustomers()).find((c) => c.company.toLowerCase() === body.company!.toLowerCase());
    if (known) {
      building = known.building;
      if (known.lat != null && known.lng != null) {
        latLng = { lat: known.lat, lng: known.lng };
        locationNote = `Using ${known.company}'s last delivery address: ${known.address ?? known.building ?? "on file"}.`;
      } else if (known.address) {
        locationNote = `${known.company}'s address (${known.address}) isn't geocoded yet — using the flat 30-min spacing rule.`;
      }
    } else if (body.company.trim()) {
      locationNote = `First order from "${body.company}" — no address on file yet, using the flat 30-min spacing rule.`;
    }
  }

  const day = await getDeliveryDay(body.date);
  const timeMin = timeToMinutes(body.time ?? null);
  const result = suggestSlots(day.lanes as DriverLaneModel[], day.unassigned, { timeMin, latLng, building });
  return NextResponse.json({ ok: true, date: body.date, locationNote, timeMin, ...result });
}
