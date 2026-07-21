"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { GripVertical, LayoutGrid, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { TAB_CARDS, type LayoutCard, type TabId, type TabLayout } from "@/lib/canvas/registry";
import { SortableCard } from "./SortableCard";
import { LibrarySidebar } from "./LibrarySidebar";

/** A card's server-rendered content; element is null when there's no data to show right now. */
export type CanvasSlot = { id: string; element: React.ReactNode | null };

/**
 * The customizable card canvas for a tab. The server page renders every
 * registered card (slots) and reads the user's saved layout; this component
 * owns order/membership from there: drag the grip to reorder, ✕ to remove,
 * "Add cards" to pull hidden cards back from the per-tab library. Changes
 * save per-user via /api/layout (debounced).
 *
 * Cards kept in the layout whose element is null (no data yet) stay in the
 * saved order but render nothing — they reappear when data does.
 */
export function CanvasGrid({ tab, layout, slots }: { tab: TabId; layout: TabLayout; slots: CanvasSlot[] }) {
  const [cards, setCards] = useState<LayoutCard[]>(layout.cards);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [resetting, setResetting] = useState(false);

  const metas = TAB_CARDS[tab];
  const elements = useMemo(() => new Map(slots.map((s) => [s.id, s.element])), [slots]);
  const metaById = useMemo(() => new Map(metas.map((m) => [m.id, m])), [metas]);

  const visible = cards.filter((c) => metaById.has(c.id) && elements.get(c.id) != null);
  const onCanvas = new Set(cards.map((c) => c.id));
  const library = metas.filter((m) => !onCanvas.has(m.id)).map((m) => ({ meta: m, hasData: elements.get(m.id) != null }));

  // --- persistence: optimistic state + debounced save, beacon flush on leave ---
  const pending = useRef<LayoutCard[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function mutate(next: LayoutCard[]) {
    setCards(next);
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  }

  async function flush() {
    const toSave = pending.current;
    if (!toSave) return;
    pending.current = null;
    try {
      const res = await fetch("/api/layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab, cards: toSave }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setSaveError(false);
    } catch {
      pending.current = pending.current ?? toSave; // keep for retry on next change/leave
      setSaveError(true);
    }
  }

  useEffect(() => {
    function onPageHide() {
      if (!pending.current) return;
      const body = new Blob([JSON.stringify({ tab, cards: pending.current })], { type: "application/json" });
      navigator.sendBeacon("/api/layout", body);
      pending.current = null;
    }
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [tab]);

  // --- interactions ---
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function onDragStart(e: DragStartEvent) {
    setDragId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setDragId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = cards.findIndex((c) => c.id === active.id);
    const to = cards.findIndex((c) => c.id === over.id);
    if (from < 0 || to < 0) return;
    mutate(arrayMove(cards, from, to));
  }

  function remove(id: string) {
    mutate(cards.filter((c) => c.id !== id));
  }

  function add(id: string) {
    if (onCanvas.has(id)) return;
    mutate([...cards, { id }]);
  }

  async function reset() {
    setResetting(true);
    try {
      await fetch(`/api/layout?tab=${tab}`, { method: "DELETE" });
      location.reload();
    } catch {
      setResetting(false);
      setSaveError(true);
    }
  }

  const dragMeta = dragId ? metaById.get(dragId) : null;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-end gap-2">
        {saveError && <span className="text-xs font-medium text-rose">Couldn’t save layout — changes retry automatically</span>}
        <button
          onClick={reset}
          disabled={resetting}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-ink-3 transition-colors hover:bg-canvas-600 hover:text-ink-2 disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset layout
        </button>
        <button
          onClick={() => setLibraryOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink shadow-card transition-colors hover:bg-canvas-700"
        >
          <LayoutGrid className="h-3.5 w-3.5 text-brand" />
          Add cards
          {library.length > 0 && (
            <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand">{library.length}</span>
          )}
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <SortableContext items={visible.map((c) => c.id)} strategy={rectSortingStrategy}>
          <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-3">
            {visible.map((c) => {
              const meta = metaById.get(c.id)!;
              return (
                <SortableCard key={c.id} id={c.id} title={meta.title} span={c.span ?? meta.defaultSpan} onRemove={remove}>
                  {elements.get(c.id)}
                </SortableCard>
              );
            })}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {dragMeta && (
            <div className="pill cursor-grabbing border border-line bg-white text-ink shadow-cardHover">
              <GripVertical className="h-3.5 w-3.5 text-ink-3" />
              {dragMeta.title}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {visible.length === 0 && (
        <div className="mt-3 rounded-2xl border border-dashed border-hairline p-10 text-center text-sm text-ink-3">
          Nothing on the canvas — open <span className="font-semibold text-ink-2">Add cards</span> to build this tab back up.
        </div>
      )}

      <LibrarySidebar open={libraryOpen} items={library} onAdd={add} onClose={() => setLibraryOpen(false)} />
    </div>
  );
}
