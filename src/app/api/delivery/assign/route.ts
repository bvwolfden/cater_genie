import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Assign (or unassign) a delivery drop to a driver. This is the plan of
 * record — CaterTrax has no concept of driver assignment. The row is upserted
 * so assignment works even before the enrichment sync has created the stop.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { orderId?: string; date?: string; driverKey?: string | null } | null;
  if (!body?.orderId || !body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return NextResponse.json({ ok: false, error: "orderId and date (YYYY-MM-DD) required" }, { status: 400 });
  }
  let assignedBy: string | null = null;
  try {
    const a = await auth();
    assignedBy = a.userId ?? null;
  } catch {
    // Clerk disabled — keep null
  }
  const driverKey = body.driverKey || null;
  const stamp = driverKey ? { assignedAt: new Date(), assignedBy } : { assignedAt: null, assignedBy: null };
  const stop = await prisma.deliveryStop.upsert({
    where: { orderId: body.orderId },
    create: { orderId: body.orderId, date: new Date(`${body.date}T00:00:00Z`), driverKey, ...stamp },
    update: { driverKey, ...stamp },
  });
  return NextResponse.json({ ok: true, orderId: stop.orderId, driverKey: stop.driverKey });
}
