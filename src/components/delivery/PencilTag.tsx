"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { X } from "lucide-react";

/**
 * Marks a SlotFinder-penciled drop on the board: not a real CaterTrax order
 * yet, removable with one click. The board hides the pencil automatically
 * once the matching CaterTrax order syncs in.
 */
export function PencilTag({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  const remove = () => {
    startTransition(async () => {
      const r = await fetch("/api/delivery/pencil", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      }).catch(() => null);
      if (!r?.ok) {
        setError(true);
        return;
      }
      router.refresh();
    });
  };

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full bg-amber/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-amber",
        pending && "opacity-50"
      )}
      title={
        error
          ? "Couldn't remove — try again"
          : "Penciled from the SlotFinder — not in CaterTrax yet. Clears automatically when the real order syncs in."
      }
    >
      Penciled
      <button onClick={remove} disabled={pending} className="hover:text-ink" title="Remove this penciled drop">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
