import { NextRequest, NextResponse } from "next/server";
import { syncCaterTrax } from "@/lib/connectors/catertrax";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // day-by-day portal pulls over a range

const isoOf = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Pull CaterTrax delivery revenue from the admin portal into a pending import.
 * POST /api/catertrax/sync?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Defaults to the trailing 7 days ending yesterday.
 */
export async function POST(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const yesterday = new Date(Date.now() - 86_400_000);
  const to = params.get("to") || isoOf(yesterday);
  const from = params.get("from") || isoOf(new Date(new Date(`${to}T00:00:00Z`).getTime() - 6 * 86_400_000));

  try {
    const result = await syncCaterTrax(from, to);
    return NextResponse.json({ ok: true, ...result, from, to });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
