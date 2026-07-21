import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Idempotent one-row data repairs for unambiguous defects the validation
 * suite has flagged. Each repair narrowly matches the bad value (so a
 * re-run is a no-op) and logs a MANUAL SyncRun for the audit trail.
 *
 * POST /api/admin/repair?fix=<id>   ·   GET lists available repairs.
 */
const REPAIRS: Record<string, { description: string; apply: () => Promise<string> }> = {
  "weekend-typo-2026-06-08": {
    description: "WeeklyRollup week of 2026-06-08 has weekEnd 2025-06-14 (year typo) — set to 2026-06-14.",
    apply: async () => {
      const row = await prisma.weeklyRollup.findFirst({
        where: { weekStart: new Date("2026-06-08T00:00:00Z") },
      });
      if (!row) return "no row for week 2026-06-08 — nothing to do";
      const cur = row.weekEnd?.toISOString().slice(0, 10);
      if (cur !== "2025-06-14") return `weekEnd is ${cur ?? "null"} — already repaired or doesn't match, no-op`;
      await prisma.weeklyRollup.update({
        where: { id: row.id },
        data: { weekEnd: new Date("2026-06-14T00:00:00Z") },
      });
      return "weekEnd 2025-06-14 → 2026-06-14";
    },
  },
};

export async function GET() {
  return NextResponse.json({
    repairs: Object.entries(REPAIRS).map(([id, r]) => ({ id, description: r.description })),
  });
}

export async function POST(req: NextRequest) {
  const fix = req.nextUrl.searchParams.get("fix");
  const repair = fix ? REPAIRS[fix] : undefined;
  if (!repair) {
    return NextResponse.json(
      { ok: false, error: `unknown fix — available: ${Object.keys(REPAIRS).join(", ")}` },
      { status: 400 }
    );
  }
  const result = await repair.apply();
  await prisma.syncRun.create({
    data: { source: "MANUAL", status: "SUCCESS", message: `Repair ${fix}: ${result}`, rowsWritten: result.includes("→") ? 1 : 0 },
  });
  return NextResponse.json({ ok: true, fix, result });
}
