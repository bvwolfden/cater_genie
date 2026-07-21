import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { DEFAULT_LAYOUTS, TAB_CARDS, type Span, type TabId, type TabLayout } from "@/lib/canvas/registry";

/** Clerk user id, or "default" when auth is disabled. Never trust a client-sent id. */
export async function layoutUserId(): Promise<string> {
  try {
    const a = await auth();
    return a.userId ?? "default";
  } catch {
    return "default"; // Clerk disabled
  }
}

/**
 * The user's saved canvas layout for a tab, reconciled against the registry:
 * - saved ids no longer registered are dropped (renamed/removed cards);
 * - registered cards absent from the saved layout stay off-canvas (library),
 *   so shipping a new card never forces it onto an arranged canvas.
 * No saved row (or any read error) → the code default.
 */
export async function getUserLayout(tab: TabId): Promise<TabLayout> {
  try {
    const userId = await layoutUserId();
    const row = await prisma.userLayout.findUnique({ where: { userId_tab: { userId, tab } } });
    if (!row) return DEFAULT_LAYOUTS[tab];
    const saved = row.layout as { version?: number; cards?: { id?: unknown; span?: unknown }[] } | null;
    if (!saved?.cards || !Array.isArray(saved.cards)) return DEFAULT_LAYOUTS[tab];
    const known = new Set(TAB_CARDS[tab].map((c) => c.id));
    const cards = saved.cards
      .filter((c): c is { id: string; span?: number } => typeof c.id === "string" && known.has(c.id))
      .map((c) => ({ id: c.id, ...(c.span === 1 || c.span === 2 || c.span === 3 ? { span: c.span as Span } : {}) }));
    return { version: 1, cards };
  } catch {
    return DEFAULT_LAYOUTS[tab]; // table missing / DB hiccup — fail soft to defaults
  }
}
