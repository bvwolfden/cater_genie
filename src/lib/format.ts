// Pure formatting helpers — safe on both client and server.

const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const usd2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function money(n: number | null | undefined, cents = false): string {
  if (n == null || Number.isNaN(n)) return "—";
  return (cents ? usd2 : usd0).format(n);
}

/** Compact money for tight spaces: $12.3k, $1.2M. */
export function moneyCompact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function percent(fraction: number | null | undefined, digits = 1): string {
  if (fraction == null || Number.isNaN(fraction)) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function hours(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 1 })} h`;
}

export function shortDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function weekdayDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Labor-percent health color (lower is better; >35% caution, >50% alert). */
export function laborHealth(fraction: number | null | undefined): "good" | "warn" | "alert" {
  if (fraction == null) return "good";
  if (fraction >= 0.5) return "alert";
  if (fraction >= 0.35) return "warn";
  return "good";
}

export function deltaPct(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null || prev === 0) return null;
  return (curr - prev) / Math.abs(prev);
}

/** "11:30 AM" / "9:30 am" / "13:05" → minutes since midnight, else null. */
export function timeToMinutes(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (min > 59) return null;
  const ap = m[3]?.toLowerCase();
  if (ap?.startsWith("p") && h !== 12) h += 12;
  if (ap?.startsWith("a") && h === 12) h = 0;
  if (h > 23) return null;
  return h * 60 + min;
}

/** 690 → "11:30 AM" */
export function minutesToLabel(min: number): string {
  const h24 = Math.floor(min / 60) % 24;
  const m = Math.round(min % 60);
  const ap = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}
