"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { weekdayDate } from "@/lib/format";

export function DatePicker({ selected, available }: { selected: string | null; available: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const idx = selected ? available.indexOf(selected) : available.length - 1;
  const latest = available[available.length - 1];

  function go(date: string) {
    const q = new URLSearchParams(params.toString());
    if (date === latest) q.delete("date");
    else q.set("date", date);
    const qs = q.toString();
    router.push(qs ? `/?${qs}` : "/");
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="stat-label hidden sm:block">Reporting day</span>
      <div className="flex items-center gap-1 rounded-lg border border-line bg-canvas-700 p-1">
        <button
          onClick={() => idx > 0 && go(available[idx - 1])}
          disabled={idx <= 0}
          className="grid h-7 w-7 place-items-center rounded-md text-ink-2 hover:bg-canvas-600 hover:text-ink disabled:opacity-30"
          aria-label="Previous day"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="relative flex items-center gap-1.5 px-1.5">
          <CalendarDays className="h-3.5 w-3.5 text-brand" />
          <select
            value={selected ?? latest ?? ""}
            onChange={(e) => go(e.target.value)}
            className="appearance-none bg-transparent pr-1 text-sm font-semibold text-ink outline-none"
          >
            {[...available].reverse().map((d) => (
              <option key={d} value={d} className="bg-white">
                {weekdayDate(d)}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => idx < available.length - 1 && go(available[idx + 1])}
          disabled={idx >= available.length - 1}
          className="grid h-7 w-7 place-items-center rounded-md text-ink-2 hover:bg-canvas-600 hover:text-ink disabled:opacity-30"
          aria-label="Next day"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
