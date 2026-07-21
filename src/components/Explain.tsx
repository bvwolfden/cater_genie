"use client";
import { useEffect, useRef, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface ExplainStep {
  label: string;
  detail: string;
}

/**
 * "How was this number derived?" — a tiny ⓘ trigger that keeps the UI clean
 * and surfaces the full arithmetic (with the actual inputs) on click.
 * Wordiness is fine inside; nothing shows until the user asks.
 */
export function Explain({
  title,
  steps,
  note,
  align = "right",
  className,
}: {
  title: string;
  steps: ExplainStep[];
  note?: string;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        aria-label={`How is this calculated? ${title}`}
        title="How is this calculated?"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex shrink-0 items-center text-ink-3 transition-colors hover:text-brand",
          open && "text-brand"
        )}
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={title}
          className={cn(
            "absolute top-full z-50 mt-1.5 w-[21rem] max-w-[85vw] rounded-xl border border-line bg-white p-3.5 text-left shadow-xl",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="text-[12px] font-semibold leading-snug text-ink">{title}</div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="shrink-0 text-ink-3 hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-2 text-[11.5px] leading-relaxed">
                <span className="mt-px grid h-4 w-4 shrink-0 place-items-center rounded-full bg-brand/10 text-[9px] font-bold text-brand">
                  {i + 1}
                </span>
                <span className="min-w-0 text-ink-2">
                  <span className="font-medium text-ink">{s.label}.</span> {s.detail}
                </span>
              </li>
            ))}
          </ol>
          {note && <p className="mt-2.5 border-t border-line/60 pt-2 text-[10.5px] leading-relaxed text-ink-3">{note}</p>}
        </div>
      )}
    </div>
  );
}
