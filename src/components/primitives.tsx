import { cn } from "@/lib/cn";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("card", className)}>{children}</div>;
}

export function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: React.ReactNode;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-ink-2">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/** Up/down delta badge. `upIsGood` controls whether up is good (green). */
export function Delta({
  value,
  upIsGood = true,
}: {
  value: number | null;
  upIsGood?: boolean;
}) {
  if (value == null) return <span className="text-xs text-ink-3">—</span>;
  const up = value >= 0;
  const good = up === upIsGood;
  // Arrow reflects sentiment: up/green = better, down/red = worse (consistent
  // for cost metrics too, where a decrease is "better").
  const Icon = good ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("pill", good ? "bg-mint/10 text-mint" : "bg-rose/10 text-rose")}>
      <Icon className="h-3 w-3" />
      {Math.abs(value * 100).toFixed(1)}%
    </span>
  );
}

/**
 * Lightweight inline SVG sparkline — responsive (fills its container width via
 * viewBox + non-scaling strokes), server-renderable, no chart lib.
 */
export function Sparkline({
  data,
  height = 34,
  stroke = "#FF385C",
  fill = "rgba(255,56,92,0.12)",
  className = "w-full",
}: {
  data: number[];
  height?: number;
  stroke?: string;
  fill?: string;
  className?: string;
}) {
  const pts = data.filter((d) => Number.isFinite(d));
  if (pts.length < 2) return <div className={className} style={{ height }} />;
  const W = 100; // viewBox units; scales to container width
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const stepX = W / (pts.length - 1);
  const coords = pts.map((v, i) => {
    const x = i * stepX;
    const y = height - 3 - ((v - min) / span) * (height - 6);
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L${W},${height} L0,${height} Z`;
  const [lx, ly] = coords[coords.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" className={className}>
      <path d={area} fill={fill} stroke="none" />
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={1.6} fill={stroke} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Reusable chart legend with color swatches. */
export function ChartLegend({
  items,
  note,
}: {
  items: { color: string; label: string }[];
  note?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
      {note && <span className="text-ink-3">{note}</span>}
    </div>
  );
}

export function StatusDot({ tone }: { tone: "good" | "warn" | "alert" | "idle" }) {
  const color = {
    good: "bg-mint",
    warn: "bg-amber",
    alert: "bg-rose",
    idle: "bg-ink-3",
  }[tone];
  return <span className={cn("inline-block h-2 w-2 rounded-full", color)} />;
}
