import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { commitImportBatch } from "@/lib/importer";

export const dynamic = "force-dynamic";

/** Commit or reject a pending batch: body { action: "commit" | "reject" }. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action === "commit") {
    const result = await commitImportBatch(id);
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  }
  if (action === "reject") {
    const batch = await prisma.importBatch.findUnique({ where: { id } });
    if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    if (batch.status !== "PENDING") return NextResponse.json({ error: `Batch is ${batch.status}` }, { status: 409 });
    await prisma.importBatch.update({ where: { id }, data: { status: "REJECTED" } });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'action must be "commit" or "reject"' }, { status: 400 });
}
