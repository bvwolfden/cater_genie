"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";

export function DeptFilter({
  departments,
  active,
}: {
  departments: string[];
  active: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const options = ["all", ...departments];

  function go(dept: string) {
    const q = new URLSearchParams(params.toString());
    if (dept === "all") q.delete("dept");
    else q.set("dept", dept);
    const qs = q.toString();
    router.push(qs ? `/labor?${qs}` : "/labor");
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((d) => {
        const isActive = active === d || (d === "all" && !active);
        return (
          <button
            key={d}
            onClick={() => go(d)}
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
