import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { layoutUserId } from "@/lib/layout";
import { cardMeta, isTabId } from "@/lib/canvas/registry";

export const dynamic = "force-dynamic";

/**
 * Save the caller's card canvas for a tab. Body: { tab, cards: [{ id, span? }] }.
 * Every id/span is validated against the registry — the layout JSON is a
 * client-shaped document, but only registry cards can enter it.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { tab?: string; cards?: { id?: unknown; span?: unknown }[] } | null;
  if (!body?.tab || !isTabId(body.tab) || !Array.isArray(body.cards)) {
    return NextResponse.json({ ok: false, error: "tab and cards[] required" }, { status: 400 });
  }
  const tab = body.tab;
  const seen = new Set<string>();
  const cards: { id: string; span?: number }[] = [];
  for (const c of body.cards) {
    if (typeof c?.id !== "string" || !cardMeta(tab, c.id) || seen.has(c.id)) {
      return NextResponse.json({ ok: false, error: `unknown or duplicate card: ${String(c?.id)}` }, { status: 400 });
    }
    seen.add(c.id);
    const span = c.span === 1 || c.span === 2 || c.span === 3 ? c.span : undefined;
    cards.push(span ? { id: c.id, span } : { id: c.id });
  }
  const userId = await layoutUserId();
  await prisma.userLayout.upsert({
    where: { userId_tab: { userId, tab } },
    create: { userId, tab, layout: { version: 1, cards } },
    update: { layout: { version: 1, cards } },
  });
  return NextResponse.json({ ok: true });
}

/** Reset a tab to the code-default layout by deleting the saved row. */
export async function DELETE(req: NextRequest) {
  const tab = req.nextUrl.searchParams.get("tab") ?? "";
  if (!isTabId(tab)) {
    return NextResponse.json({ ok: false, error: "valid tab required" }, { status: 400 });
  }
  const userId = await layoutUserId();
  await prisma.userLayout.deleteMany({ where: { userId, tab } });
  return NextResponse.json({ ok: true });
}
