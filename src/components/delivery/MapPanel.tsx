"use client";

import dynamic from "next/dynamic";
import type { MapLane, MapStop } from "./DeliveryMapInner";

// Leaflet touches `window` — client-only.
const DeliveryMapInner = dynamic(() => import("./DeliveryMapInner"), {
  ssr: false,
  loading: () => <div className="grid h-full w-full place-items-center rounded-xl bg-canvas-700 text-[12px] text-ink-3">Loading map…</div>,
});

export function MapPanel({
  depot,
  stops,
  lanes,
}: {
  depot: { lat: number; lng: number; label: string };
  stops: MapStop[];
  lanes: MapLane[];
}) {
  if (!stops.length) {
    return (
      <div className="grid h-full min-h-[280px] w-full place-items-center rounded-xl border border-dashed border-line text-center text-[12px] text-ink-3">
        No geocoded drops yet — pins appear as addresses geocode (a few per sync run).
      </div>
    );
  }
  return (
    <div className="h-[380px] w-full overflow-hidden rounded-xl border border-line">
      <DeliveryMapInner depot={depot} stops={stops} lanes={lanes} />
    </div>
  );
}
