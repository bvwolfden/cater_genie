"use client";

import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { money, moneyCompact, percent, shortDate } from "@/lib/format";

const AXIS = { fill: "#717171", fontSize: 11 };
const GRID = "#EBEBEB";
const CORAL = "#FF385C";
const TEAL = "#00A699";
const GOLD = "#FFB400";

export const channelLabel: Record<string, string> = {
  CAFE_RETAIL: "Cafe · Clover",
  CATERTRAX: "CaterTrax",
  CATEREASE: "Caterease",
  ALOHA: "Aloha",
  OTHER: "Other",
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
  series: { date: string; netSales: number | null; laborCost: number | null; laborPct: number | null }[];
}) {
  const data = series.filter((d) => d.netSales != null).slice(-30);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="netFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CORAL} stopOpacity={0.28} />
            <stop offset="100%" stopColor={CORAL} stopOpacity={0} />
          </linearGradient>
        </defs>
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
                <div className="text-mint">Labor {money(payload[0]?.payload.laborCost)}</div>
                <div className="text-ink-2">Labor % {percent(payload[0]?.payload.laborPct)}</div>
              </Box>
            ) : null
          }
        />
        <Area type="monotone" dataKey="netSales" stroke={CORAL} strokeWidth={2.25} fill="url(#netFill)" isAnimationActive={false} />
        <Line type="monotone" dataKey="laborCost" stroke={TEAL} strokeWidth={2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// --- Labor by department -----------------------------------------------------
export function LaborDeptChart({ data }: { data: { department: string; cost: number; hours: number }[] }) {
  const rows = data.slice(0, 8);
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 34)}>
      <ComposedChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
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
                <div className="text-ink-2">{payload[0]?.payload.hours.toFixed(1)} h</div>
              </Box>
            ) : null
          }
        />
        <Bar dataKey="cost" radius={[0, 6, 6, 0]} barSize={16} isAnimationActive={false}>
          {rows.map((_, i) => (
            <Cell key={i} fill={`hsl(347, 92%, ${62 + i * 3}%)`} />
          ))}
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
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="weekStart" tickFormatter={(d) => shortDate(d)} tick={AXIS} tickLine={false} axisLine={false} minTickGap={20} />
        <YAxis tickFormatter={(v) => moneyCompact(v)} tick={AXIS} tickLine={false} axisLine={false} width={52} />
        <Tooltip
          cursor={{ fill: "rgba(255,56,92,0.05)" }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <Box>
                <div className="mb-1 font-semibold text-ink">Week of {shortDate(label as string)}</div>
                <div className="text-brand">Revenue {money(payload[0]?.payload.total)}</div>
                <div className="text-ink-2">Prior yr {money(payload[0]?.payload.priorYear)}</div>
                <div className="text-amber">Projected {money(payload[0]?.payload.projected)}</div>
              </Box>
            ) : null
          }
        />
        <Bar dataKey="total" fill={CORAL} radius={[5, 5, 0, 0]} barSize={16} isAnimationActive={false} />
        <Line type="monotone" dataKey="priorYear" stroke="#A6A6A6" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="projected" stroke={GOLD} strokeWidth={2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
