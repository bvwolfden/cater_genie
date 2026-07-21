"use client";

import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { money, moneyCompact, percent, shortDate } from "@/lib/format";
import { channelLabel } from "@/lib/labels";

const AXIS = { fill: "#717171", fontSize: 11 };
const GRID = "#EBEBEB";
const CORAL = "#FF385C";
const TEAL = "#00A699";
const GOLD = "#FFB400";

// Renders a series name at the far-right (last) point of a line/area.
const endLabel = (text: string, color: string, lastIndex: number) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function EndLabel(props: any) {
    if (props.index !== lastIndex) return null;
    const x = Number(props.x), y = Number(props.y);
    if (!isFinite(x) || !isFinite(y)) return null;
    return (
      <text x={x + 6} y={y} fill={color} fontSize={11} fontWeight={600} dominantBaseline="middle">
        {text}
      </text>
    );
  };

function Box({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-card">
      {children}
    </div>
  );
}

// --- Daily sales + labor -----------------------------------------------------
export function SalesTrendChart({
  series,
}: {
  series: { date: string; netSales: number | null; laborCost: number | null; laborPct: number | null; foodPurchases?: number | null }[];
}) {
  const data = series
    .filter((d) => d.netSales != null)
    .map((d) => ({
      ...d,
      grossMargin: d.netSales! - (d.laborCost ?? 0) - (d.foodPurchases ?? 0),
    }));
  // Weekend bands (Sat–Sun) — sales are lumpy by day-of-week (weddings weekend,
  // corporate delivery weekday).
  const isWeekend = (isoDt: string) => {
    const day = new Date(`${isoDt}T00:00:00Z`).getUTCDay();
    return day === 0 || day === 6;
  };
  const weekendSpans: [string, string][] = [];
  for (let i = 0; i < data.length; ) {
    if (isWeekend(data[i].date)) {
      let j = i;
      while (j + 1 < data.length && isWeekend(data[j + 1].date)) j++;
      weekendSpans.push([data[i].date, data[j].date]);
      i = j + 1;
    } else i++;
  }
  const last = data.length - 1;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 72, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="netFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CORAL} stopOpacity={0.28} />
            <stop offset="100%" stopColor={CORAL} stopOpacity={0} />
          </linearGradient>
        </defs>
        {weekendSpans.map(([x1, x2], i) => (
          <ReferenceArea key={i} x1={x1} x2={x2} fill="#1f2937" fillOpacity={0.05} ifOverflow="extendDomain" />
        ))}
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" tickFormatter={(d) => shortDate(d)} tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tickFormatter={(v) => moneyCompact(v)} tick={AXIS} tickLine={false} axisLine={false} width={52} />
        <Tooltip
          cursor={{ stroke: "#DDDDDD" }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <Box>
                <div className="mb-1 font-semibold text-ink">{shortDate(label as string)}</div>
                <div className="text-brand">Net sales {money(payload[0]?.payload.netSales)}</div>
                <div className="text-amber">Labor {money(payload[0]?.payload.laborCost)}</div>
                <div className="text-mint">Gross margin {money(payload[0]?.payload.grossMargin)}</div>
                <div className="text-ink-2">Labor % {percent(payload[0]?.payload.laborPct)}</div>
              </Box>
            ) : null
          }
        />
        <Area type="monotone" dataKey="netSales" stroke={CORAL} strokeWidth={2.25} fill="url(#netFill)" isAnimationActive={false}>
          <LabelList content={endLabel("Net sales", CORAL, last)} />
        </Area>
        <Line type="monotone" dataKey="laborCost" stroke={GOLD} strokeWidth={2} dot={false} isAnimationActive={false}>
          <LabelList content={endLabel("Labor", GOLD, last)} />
        </Line>
        <Line type="monotone" dataKey="grossMargin" stroke={TEAL} strokeWidth={2} dot={false} isAnimationActive={false}>
          <LabelList content={endLabel("Gross margin", TEAL, last)} />
        </Line>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// --- Labor by department -----------------------------------------------------
export function LaborDeptChart({ data }: { data: { department: string; cost: number; hours: number; headcount?: number }[] }) {
  const rows = data.slice(0, 8);
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 34)}>
      <ComposedChart data={rows} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 8 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tickFormatter={(v) => moneyCompact(v)} tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="department" tick={AXIS} tickLine={false} axisLine={false} width={86} />
        <Tooltip
          cursor={{ fill: "rgba(255,56,92,0.06)" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <Box>
                <div className="font-semibold text-ink">{payload[0]?.payload.department}</div>
                <div className="text-brand">{money(payload[0]?.payload.cost)}</div>
                <div className="text-ink-2">{payload[0]?.payload.hours.toFixed(1)} h · {payload[0]?.payload.headcount ?? 0} ppl</div>
              </Box>
            ) : null
          }
        />
        <Bar dataKey="cost" radius={[0, 6, 6, 0]} barSize={16} isAnimationActive={false}>
          {rows.map((_, i) => (
            <Cell key={i} fill={`hsl(347, 92%, ${62 + i * 3}%)`} />
          ))}
          <LabelList dataKey="headcount" position="right" formatter={(v: unknown) => `${String(v)} ppl`} style={{ fill: "#717171", fontSize: 11 }} />
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// --- Channel mix: actual vs projected ---------------------------------------
export function ChannelMixChart({ data }: { data: { channel: string; actual: number; projected: number }[] }) {
  const rows = data.map((d) => ({ ...d, name: channelLabel[d.channel] ?? d.channel }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={(v) => moneyCompact(v)} tick={AXIS} tickLine={false} axisLine={false} width={52} />
        <Tooltip
          cursor={{ fill: "rgba(255,56,92,0.06)" }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <Box>
                <div className="mb-1 font-semibold text-ink">{label}</div>
                <div className="text-brand">Actual {money(payload[0]?.payload.actual)}</div>
                <div className="text-ink-2">Projected {money(payload[0]?.payload.projected)}</div>
              </Box>
            ) : null
          }
        />
        <Bar dataKey="projected" fill="#DDDDDD" radius={[6, 6, 0, 0]} barSize={22} isAnimationActive={false} />
        <Bar dataKey="actual" fill={CORAL} radius={[6, 6, 0, 0]} barSize={22} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// --- Weekly revenue vs prior year vs projection ------------------------------
export function WeeklyCompChart({
  data,
}: {
  data: { weekStart: string; total: number | null; priorYear: number | null; projected: number | null }[];
}) {
  const rows = data.slice(-16);
  // Last actual week — where the solid line hands off to the dashed projection.
  const boundary = [...rows].reverse().find((r) => r.total != null && r.projected != null)?.weekStart ?? null;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="weekStart" tickFormatter={(d) => shortDate(d)} tick={AXIS} tickLine={false} axisLine={false} minTickGap={20} />
        <YAxis tickFormatter={(v) => moneyCompact(v)} tick={AXIS} tickLine={false} axisLine={false} width={52} />
        {boundary && <ReferenceLine x={boundary} stroke="#C2C2C2" strokeDasharray="3 3" label={{ value: "today", position: "top", fill: "#A6A6A6", fontSize: 10 }} />}
        <Tooltip
          cursor={{ fill: "rgba(255,56,92,0.05)" }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as { total: number | null; priorYear: number | null; projected: number | null };
            const isProjected = p.total == null && p.projected != null;
            const value = isProjected ? p.projected : p.total;
            const yoy = value != null && p.priorYear ? value / p.priorYear - 1 : null;
            return (
              <Box>
                <div className="mb-1 font-semibold text-ink">
                  Week of {shortDate(label as string)} {isProjected && <span className="text-ink-3">· projected</span>}
                </div>
                {isProjected ? (
                  <div className="text-amber">Projected {money(p.projected)}</div>
                ) : (
                  <div className="text-brand">Revenue {money(p.total)}</div>
                )}
                <div className="text-ink-2">Prior yr {money(p.priorYear)}</div>
                {yoy != null && (
                  <div className={yoy >= 0 ? "text-mint" : "text-brand"}>
                    {yoy >= 0 ? "+" : ""}{percent(yoy)} vs prior yr
                  </div>
                )}
              </Box>
            );
          }}
        />
        <Bar dataKey="total" fill={CORAL} radius={[5, 5, 0, 0]} barSize={16} isAnimationActive={false} />
        <Line type="monotone" dataKey="priorYear" stroke="#A6A6A6" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="total" stroke={GOLD} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="projected" stroke={GOLD} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// --- Weekly labor cost trend + projection -----------------------------------
export function LaborTrendChart({
  weekly,
  boundary,
}: {
  weekly: { week: string; actualLabor: number | null; projLabor: number | null }[];
  boundary: string | null;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={weekly} margin={{ top: 10, right: 12, bottom: 0, left: 4 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="week" tickFormatter={(d) => shortDate(d)} tick={AXIS} tickLine={false} axisLine={false} minTickGap={28} />
        <YAxis tickFormatter={(v) => moneyCompact(v)} tick={AXIS} tickLine={false} axisLine={false} width={54} />
        {boundary && <ReferenceLine x={boundary} stroke="#C2C2C2" strokeDasharray="3 3" label={{ value: "today", position: "top", fill: "#A6A6A6", fontSize: 10 }} />}
        <Tooltip
          cursor={{ stroke: "#DDDDDD" }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as { actualLabor: number | null; projLabor: number | null };
            const v = p.actualLabor ?? p.projLabor;
            const projected = p.actualLabor == null;
            return (
              <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-card">
                <div className="mb-1 font-semibold text-ink">
                  Week of {shortDate(label as string)} {projected && <span className="text-ink-3">· projected</span>}
                </div>
                <div className="text-amber">Labor {money(v)}</div>
              </div>
            );
          }}
        />
        <Line type="monotone" dataKey="actualLabor" stroke={GOLD} strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls={false} />
        <Line type="monotone" dataKey="projLabor" stroke={GOLD} strokeWidth={2} strokeDasharray="3 4" dot={false} isAnimationActive={false} connectNulls={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// --- Forward capacity vs demand (next ~6 weeks) -----------------------------
export function CapacityChart({ data }: { data: { week: string; capacity: number; demand: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="week" tickFormatter={(d) => shortDate(d)} tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis tickFormatter={(v) => `${v}h`} tick={AXIS} tickLine={false} axisLine={false} width={44} />
        <Tooltip
          cursor={{ fill: "rgba(255,56,92,0.06)" }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <Box>
                <div className="mb-1 font-semibold text-ink">Week of {shortDate(label as string)}</div>
                <div className="text-cyan">Capacity {Math.round(payload[0]?.payload.capacity)}h</div>
                <div className="text-brand">Demand {Math.round(payload[0]?.payload.demand)}h</div>
              </Box>
            ) : null
          }
        />
        <Bar dataKey="capacity" fill="#9fd8d6" radius={[5, 5, 0, 0]} barSize={16} isAnimationActive={false} />
        <Bar dataKey="demand" fill={CORAL} radius={[5, 5, 0, 0]} barSize={16} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
