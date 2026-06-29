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
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-ink-2">{subtitle}</p>}
      </div>
      {right}
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
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("pill", good ? "bg-mint/10 text-mint" : "bg-rose/10 text-rose")}>
      <Icon className="h-3 w-3" />
      {Math.abs(value * 100).toFixed(1)}%
    </span>
  );
}

/** Lightweight inline SVG sparkline — server-renderable, no chart lib. */
export function Sparkline({
  data,
  width = 132,
  height = 40,
  stroke = "#FF385C",
  fill = "rgba(255,56,92,0.12)",
}: {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
}) {
  const pts = data.filter((d) => Number.isFinite(d));
  if (pts.length < 2) return <div style={{ width, height }} />;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const stepX = width / (pts.length - 1);
  const coords = pts.map((v, i) => {
    const x = i * stepX;
    const y = height - 4 - ((v - min) / span) * (height - 8);
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={area} fill={fill} stroke="none" />
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r={2.5} fill={stroke} />
    </svg>
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
