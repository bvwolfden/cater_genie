"use client";

import { Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CardMeta } from "@/lib/canvas/registry";

/**
 * Slide-in library of off-canvas cards for the current tab. Click a card to
 * add it to the bottom of the canvas; drag it into place from there.
 */
export function LibrarySidebar({
  open,
  items,
  onAdd,
  onClose,
}: {
  open: boolean;
  items: { meta: CardMeta; hasData: boolean }[];
  onAdd: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-ink/20" onClick={onClose} aria-hidden />}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-80 max-w-[90vw] flex-col border-l border-line bg-white shadow-cardHover transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full",
        )}
        aria-label="Card library"
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-ink">Card library</div>
            <div className="text-xs text-ink-3">Click a card to add it to this tab</div>
          </div>
          <button onClick={onClose} aria-label="Close library" className="rounded-full p-1.5 text-ink-3 hover:bg-canvas-600 hover:text-ink-2">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {items.length === 0 && (
            <div className="rounded-xl border border-dashed border-hairline p-4 text-center text-xs text-ink-3">
              Every card is already on the canvas. Remove one (✕ on hover) and it lands back here.
            </div>
          )}
          {items.map(({ meta, hasData }) => (
            <button
              key={meta.id}
              onClick={() => onAdd(meta.id)}
              className="group flex w-full items-start gap-3 rounded-xl border border-line bg-white p-3 text-left transition-colors hover:border-hairline hover:bg-canvas-700"
            >
              <span className="mt-0.5 rounded-full border border-line bg-canvas-700 p-1 text-ink-3 transition-colors group-hover:border-brand/30 group-hover:bg-brand/10 group-hover:text-brand">
                <Plus className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-medium text-ink">
                  {meta.title}
                  {!hasData && (
                    <span className="rounded-full bg-canvas-600 px-2 py-0.5 text-[10px] font-medium text-ink-3">no data right now</span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-ink-2">{meta.description}</span>
              </span>
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}
