import { NextResponse } from "next/server";
import { saveDailyEntry, type DailyEntryInput } from "@/lib/entry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as DailyEntryInput;
  if (!body?.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return NextResponse.json({ ok: false, error: "Valid date required" }, { status: 400 });
  }
  const result = await saveDailyEntry(body);
  return NextResponse.json(result);
}
