"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

const KEY = "cg-draft-banner-dismissed";

/**
 * Slim site-wide notice that the numbers are still draft quality.
 * Dismissable per browser session (sessionStorage).
 */
export function DraftBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!sessionStorage.getItem(KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  function dismiss() {
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      // sessionStorage unavailable — dismiss for this render only
    }
    setVisible(false);
  }

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-amber/30 bg-amber/10 px-4 py-1.5 text-[12px] font-medium text-ink-2"
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber" />
      <span className="min-w-0">
        <span className="font-semibold text-ink">Draft data</span> — numbers are still being reconciled and several
        models use assumptions. Not decision-grade yet.
      </span>
      <button
        onClick={dismiss}
        aria-label="Dismiss draft-data notice"
        className="ml-1 shrink-0 rounded-full p-0.5 text-ink-3 transition hover:bg-amber/20 hover:text-ink"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
