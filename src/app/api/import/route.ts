import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createImportBatch } from "@/lib/importer";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // AI parsing of a big sheet can take a while

/** List recent import batches (newest first). */
export async function GET() {
  const batches = await prisma.importBatch.findMany({
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
