import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createImportBatch } from "@/lib/importer";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // AI parsing of a big sheet can take a while

/** List import batches (newest first) by tab:
 *  recent    — needs attention (pending / failed), not archived
 *  committed — already accepted into the dashboard
 *  archive   — rejected / dismissed
 * (REJECTED counts as archived even for rows predating the archived column.) */
export async function GET(req: NextRequest) {
  const tab = req.nextUrl.searchParams.get("tab") ?? "recent";
  const where =
    tab === "archive"
      ? { OR: [{ archived: true }, { status: "REJECTED" }] }
      : tab === "committed"
        ? { archived: false, status: "COMMITTED" }
        : { archived: false, status: { notIn: ["REJECTED", "COMMITTED"] } };
  const batches = await prisma.importBatch.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  return NextResponse.json({ batches });
}

/** Upload a file → AI-parse → pending batch awaiting review. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (15MB max)" }, { status: 413 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const batch = await createImportBatch(file.name, buf, file.type || "application/octet-stream");
  return NextResponse.json({ batch }, { status: batch.status === "FAILED" ? 422 : 201 });
}
