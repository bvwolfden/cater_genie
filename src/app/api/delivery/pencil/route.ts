import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Pencil in a phone-call booking from the SlotFinder. The caller isn't in
 * CaterTrax yet, so this creates a placeholder EventBooking (source MANUAL,
 * status "penciled") plus a DeliveryStop with the driver pre-assigned —
 * location copied from the company's last known drop when we have one. The
 * board hides the pencil automatically once a real CaterTrax order for the
 * same company lands on the same day.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { date?: string; company?: string; time?: string; driverKey?: string }
    | null;
  const company = body?.company?.trim();
  if (!body?.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date) || !company || !body.time || !body.driverKey) {
    return NextResponse.json({ ok: false, error: "date, company, time and driverKey required" }, { status: 400 });
  }

  let assignedBy: string | null = null;
  try {
    const a = await auth();
    assignedBy = a.userId ?? null;
  } catch {
    // Clerk disabled — keep null
  }

  // Location: reuse the company's most recent enriched stop so the pencil
  // lands on the map and gets real drive-time math, not the flat rule.
  const priorBookings = await prisma.eventBooking.findMany({
    where: { source: "CATERTRAX", company: { equals: company, mode: "insensitive" }, orderId: { not: null } },
    orderBy: { eventDate: "desc" },
    take: 10,
  });
  const priorStop = priorBookings.length
    ? await prisma.deliveryStop.findFirst({
        where: { orderId: { in: priorBookings.map((b) => b.orderId!) }, addressRaw: { not: null } },
        orderBy: { date: "desc" },
      })
    : null;

  const orderId = `pencil-${randomUUID().slice(0, 8)}`;
  const date = new Date(`${body.date}T00:00:00Z`);
  await prisma.$transaction([
    prisma.eventBooking.create({
      data: {
        eventDate: date,
        name: `${company} (${orderId})`,
        status: "penciled",
        company,
        eventTime: body.time,
        orderId,
        source: "MANUAL",
      },
    }),
    prisma.deliveryStop.create({
      data: {
        orderId,
        date,
        deliveryTime: body.time,
        addressRaw: priorStop?.addressRaw ?? null,
        city: priorStop?.city ?? null,
        zip: priorStop?.zip ?? null,
        building: priorStop?.building ?? null,
        addressKey: priorStop?.addressKey ?? null,
        driverKey: body.driverKey,
        assignedAt: new Date(),
        assignedBy,
      },
    }),
  ]);
  return NextResponse.json({ ok: true, orderId });
}

/** Remove a penciled drop (only pencils — real CaterTrax rows are sync-owned). */
export async function DELETE(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { orderId?: string } | null;
  if (!body?.orderId?.startsWith("pencil-")) {
    return NextResponse.json({ ok: false, error: "orderId must be a pencil- id" }, { status: 400 });
  }
  await prisma.$transaction([
    prisma.deliveryStop.deleteMany({ where: { orderId: body.orderId } }),
    prisma.eventBooking.deleteMany({ where: { orderId: body.orderId, source: "MANUAL" } }),
  ]);
  return NextResponse.json({ ok: true });
}
