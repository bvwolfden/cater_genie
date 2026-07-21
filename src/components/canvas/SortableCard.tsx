"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Span } from "@/lib/canvas/registry";

export function spanClass(span: Span) {
  return span === 3 ? "xl:col-span-3" : span === 2 ? "xl:col-span-2" : "xl:col-span-1";
}

/**
 * Sortable wrapper around a canvas card. Drag listeners live on the grip
 * handle only, so everything inside the card (pickers, tables, maps) stays
 * fully interactive. The grip + remove chrome is revealed on hover, xl-up.
 */
export function SortableCard({
  id,
  title,
  span,
  onRemove,
  children,
}: {
  id: string;
  title: string;
  span: Span;
  onRemove: (id: string) => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("group/canvas relative min-w-0", spanClass(span), isDragging && "z-10 opacity-40")}
    >
      <div
        className={cn(
          "absolute -right-2 -top-2 z-20 hidden items-center gap-0.5 rounded-full border border-line bg-white p-0.5 shadow-card",
          "opacity-0 transition-opacity group-hover/canvas:opacity-100 focus-within:opacity-100 xl:flex",
        )}
      >
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Move ${title}`}
          title={`Move ${title}`}
          className="cursor-grab rounded-full p-1.5 text-ink-3 hover:bg-canvas-600 hover:text-ink-2 active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onRemove(id)}
          aria-label={`Remove ${title}`}
          title={`Remove ${title} (find it again under Add cards)`}
          className="rounded-full p-1.5 text-ink-3 hover:bg-canvas-600 hover:text-rose"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {children}
    </div>
  );
}
