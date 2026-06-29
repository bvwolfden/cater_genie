"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

export function DeptFilter({
  departments,
  active,
}: {
  departments: string[];
  active: string;
}) {
  const router = useRouter();
  const options = ["all", ...departments];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((d) => {
        const isActive = active === d || (d === "all" && !active);
        return (
          <button
            key={d}
            onClick={() => router.push(d === "all" ? "/labor" : `/labor?dept=${encodeURIComponent(d)}`)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition",
              isActive
                ? "border-brand bg-brand text-white"
                : "border-line bg-white text-ink-2 hover:border-hairline hover:text-ink"
            )}
          >
            {d === "all" ? "All departments" : d}
          </button>
        );
      })}
    </div>
  );
}
