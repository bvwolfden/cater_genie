import { NextRequest, NextResponse } from "next/server";
import { syncCaterTrax, syncCaterTraxBookings, syncDeliveryStops } from "@/lib/connectors/catertrax";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // day-by-day portal pulls over a range

const isoOf = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Pull CaterTrax data from the admin portal.
 * POST /api/catertrax/sync?kind=all|sales|bookings
 *   - sales:    trailing revenue into a pending import (staged for review).
 *     Range via ?from=YYYY-MM-DD&to=YYYY-MM-DD (default trailing 7 days).
 *   - bookings: forward orders upserted straight into EventBooking so the
 *     staffing outlook sees committed demand. Horizon via ?days=N (default 14).
 *   - all (default): both — this is what the daily trigger calls.
 */
export async function POST(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const kind = params.get("kind") || "all";
  const out: Record<string, unknown> = { ok: true, kind };
  const errors: string[] = [];

  if (kind === "all" || kind === "sales") {
    const yesterday = new Date(Date.now() - 86_400_000);
    const to = params.get("to") || isoOf(yesterday);
    const from = params.get("from") || isoOf(new Date(new Date(`${to}T00:00:00Z`).getTime() - 6 * 86_400_000));
    try {
      out.sales = { ...(await syncCaterTrax(from, to)), from, to };
    } catch (err) {
      errors.push(`sales: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (kind === "all" || kind === "bookings") {
    const days = Math.max(1, Math.min(60, parseInt(params.get("days") || "14", 10) || 14));
    try {
      out.bookings = await syncCaterTraxBookings(days);
    } catch (err) {
      errors.push(`bookings: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Delivery-stop enrichment (coversheet addresses/times + geocodes) for the
  // /delivery scheduler. Deliberately NON-FATAL: a failure degrades the board
  // but must never fail the daily sync.
  if (kind === "all" || kind === "bookings" || kind === "stops") {
    const days = Math.max(1, Math.min(60, parseInt(params.get("days") || "14", 10) || 14));
    try {
      out.stops = await syncDeliveryStops(days);
    } catch (err) {
      out.stopsWarning = `stops: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (errors.length) {
    return NextResponse.json({ ...out, ok: false, error: errors.join(" | ") }, { status: 502 });
  }
  return NextResponse.json(out);
}
