import { NextResponse } from "next/server";
import { getDashboard } from "@/lib/dashboard";
import { getInsight } from "@/lib/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const dashboard = await getDashboard();
  const insight = await getInsight(dashboard);
  return NextResponse.json(insight);
}

// POST regenerates (bypasses cache) — used by the "Regenerate" button.
export async function POST() {
  const dashboard = await getDashboard();
  const insight = await getInsight(dashboard, { force: true });
  return NextResponse.json(insight);
}
