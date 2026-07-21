"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

/** Click-assign a drop to a driver — one select, optimistic, no drag-drop. */
export function AssignPicker({
  orderId,
  date,
  driverKey,
  drivers,
}: {
  orderId: string;
  date: string;
  driverKey: string | null;
  drivers: Array<{ key: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(driverKey ?? "");
  const [error, setError] = useState(false);

  const onChange = (next: string) => {
    setValue(next);
    setError(false);
    startTransition(async () => {
      const r = await fetch("/api/delivery/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, date, driverKey: next || null }),
      }).catch(() => null);
      if (!r?.ok) {
        setError(true);
        setValue(driverKey ?? "");
        return;
      }
      router.refresh();
    });
  };

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={pending}
      title={error ? "Assignment failed — try again" : "Assign to driver"}
      className={cn(
        "rounded-lg border bg-white px-1.5 py-1 text-[11px] text-ink-2 transition hover:border-brand/40",
        error ? "border-rose" : "border-line",
        pending && "opacity-50"
      )}
    >
      <option value="">unassigned</option>
      {drivers.map((d) => (
        <option key={d.key} value={d.key}>
          {d.name}
        </option>
      ))}
    </select>
  );
}
