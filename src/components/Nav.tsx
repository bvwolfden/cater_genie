"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users } from "lucide-react";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/labor", label: "Labor", icon: Users },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="mb-5 flex items-center gap-1 rounded-xl border border-line bg-white p-1 shadow-card w-max">
      {TABS.map((t) => {
        const active = pathname === t.href;
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition",
              active ? "bg-brand text-white shadow-sm" : "text-ink-2 hover:bg-canvas-700 hover:text-ink"
            )}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
