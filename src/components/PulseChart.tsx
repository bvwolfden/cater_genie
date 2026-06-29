"use client";

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PulsePoint } from "@/lib/dashboard";
import { money, moneyCompact, shortDate } from "@/lib/format";

const AXIS = { fill: "#717171", fontSize: 11 };
const GRID = "#EBEBEB";
const REV = "#FF385C";
const COST = "#FFB400";
const PROFIT = "#00A699";

export function PulseChart({ points, boundary }: { points: PulsePoint[]; boundary: string | null }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={points} margin={{ top: 10, right: 12, bottom: 0, left: 4 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="week" tickFormatter={(d) => shortDate(d)} tick={AXIS} tickLine={false} axisLine={false} minTickGap={28} />
        <YAxis tickFormatter={(v) => moneyCompact(v)} tick={AXIS} tickLine={false} axisLine={false} width={54} />
        {boundary && <ReferenceLine x={boundary} stroke="#C2C2C2" strokeDasharray="3 3" label={{ value: "today", position: "top", fill: "#A6A6A6", fontSize: 10 }} />}
        <Tooltip
          cursor={{ stroke: "#DDDDDD" }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as PulsePoint;
            const rev = p.actualRevenue ?? p.projRevenue;
            const cost = p.actualCost ?? p.projCost;
            const profit = p.actualProfit ?? p.projProfit;
            const projected = p.actualRevenue == null;
            return (
              <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-card">
                <div className="mb-1 font-semibold text-ink">
                  {shortDate(label as string)} {projected && <span className="text-ink-3">· projected</span>}
                </div>
                <div className="text-brand">Revenue {money(rev)}</div>
                <div className="text-amber">Cost {money(cost)}</div>
                <div className="text-mint">Profit {money(profit)}</div>
              </div>
            );
          }}
        />
        {/* Prior-year (2025) cumulative revenue — history reference */}
        <Line type="monotone" dataKey="priorYearRevenue" stroke="#B0B0B0" strokeWidth={1.5} strokeDasharray="2 3" dot={false} isAnimationActive={false} connectNulls />
        {/* Actual (solid) cumulative lines */}
        <Line type="monotone" dataKey="actualRevenue" stroke={REV} strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls={false} />
        <Line type="monotone" dataKey="actualCost" stroke={COST} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
        <Line type="monotone" dataKey="actualProfit" stroke={PROFIT} strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls={false} />
        {/* Projected (dotted) continuation */}
        <Line type="monotone" dataKey="projRevenue" stroke={REV} strokeWidth={2} strokeDasharray="3 4" dot={false} isAnimationActive={false} connectNulls={false} />
        <Line type="monotone" dataKey="projCost" stroke={COST} strokeWidth={1.75} strokeDasharray="3 4" dot={false} isAnimationActive={false} connectNulls={false} />
        <Line type="monotone" dataKey="projProfit" stroke={PROFIT} strokeWidth={2} strokeDasharray="3 4" dot={false} isAnimationActive={false} connectNulls={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
