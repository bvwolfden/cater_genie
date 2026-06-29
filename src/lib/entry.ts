import "server-only";
import { prisma } from "./db";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const num = (v: unknown): number | null => (v == null ? null : Number(v as never));
const toDate = (s: string) => new Date(`${s}T00:00:00Z`);

export interface DailyEntryInput {
  date: string;
  cafeSales?: number | null;
  cateringSales?: number | null;
  eventsSales?: number | null;
  tax?: number | null;
  laborHours?: number | null;
  laborCost?: number | null;
  foodPurchases?: number | null;
  operating?: number | null;
  payroll?: number | null;
  merchant?: number | null;
  savings?: number | null;
  holding?: number | null;
  ccProcessing?: number | null;
  notes?: string | null;
}

export interface EntryContext {
  targetDate: string;
  isEdit: boolean;
  reference: {
    date: string | null;
    netSales: number | null;
    tax: number | null;
    laborCost: number | null;
    laborHours: number | null;
    foodPurchases: number | null;
  };
  lastBalances: Record<string, number>;
  existing: DailyEntryInput | null;
}

/** What the walkthrough needs: target day + last-known values for reference. */
export async function getEntryContext(dateParam?: string): Promise<EntryContext> {
  const [metrics, balances, sales] = await Promise.all([
    prisma.dailyMetric.findMany({ orderBy: { date: "asc" } }),
    prisma.accountBalance.findMany({ orderBy: { date: "asc" } }),
    prisma.dailySales.findMany({ orderBy: { date: "asc" } }),
  ]);

  const withSales = metrics.filter((m) => m.netSales != null);
  const last = withSales[withSales.length - 1] ?? metrics[metrics.length - 1] ?? null;

  let targetDate = dateParam;
  if (!targetDate) {
    if (last) {
      const d = new Date(last.date);
      d.setUTCDate(d.getUTCDate() + 1);
      targetDate = iso(d);
    } else {
      targetDate = iso(new Date());
    }
  }

  const existingMetric = metrics.find((m) => iso(m.date) === targetDate) ?? null;
  const lastBalances: Record<string, number> = {};
  for (const b of balances) lastBalances[b.account] = Number(b.balance); // last wins (sorted asc)

  let existing: DailyEntryInput | null = null;
  if (existingMetric) {
    const dayBal = new Map(balances.filter((b) => iso(b.date) === targetDate).map((b) => [b.account, Number(b.balance)]));
    const dayCh = new Map(sales.filter((s) => iso(s.date) === targetDate).map((s) => [s.channel, num(s.netSales)]));
    existing = {
      date: targetDate,
      cafeSales: dayCh.get("CAFE_RETAIL") ?? null,
      cateringSales: dayCh.get("CATERTRAX") ?? null,
      eventsSales: dayCh.get("CATEREASE") ?? null,
      tax: num(existingMetric.tax),
      laborHours: num(existingMetric.laborHours),
      laborCost: num(existingMetric.laborCost),
      foodPurchases: num(existingMetric.foodPurchases),
      operating: dayBal.get("OPERATING") ?? null,
      payroll: dayBal.get("PAYROLL") ?? null,
      merchant: dayBal.get("MERCHANT") ?? null,
      savings: dayBal.get("SAVINGS") ?? null,
      holding: dayBal.get("HOLDING") ?? null,
      ccProcessing: dayBal.get("CC_PROCESSING") ?? null,
      notes: existingMetric.notes,
    };
  }

  return {
    targetDate,
    isEdit: Boolean(existingMetric),
    reference: {
      date: last ? iso(last.date) : null,
      netSales: num(last?.netSales),
      tax: num(last?.tax),
      laborCost: num(last?.laborCost),
      laborHours: num(last?.laborHours),
      foodPurchases: num(last?.foodPurchases),
    },
    lastBalances,
    existing,
  };
}

/** Persist a manually-entered day into Postgres (same tables the dashboard reads). */
export async function saveDailyEntry(input: DailyEntryInput): Promise<{ ok: boolean; netSales: number | null; rows: number }> {
  const d = toDate(input.date);
  const channels: [string, number | null | undefined][] = [
    ["CAFE_RETAIL", input.cafeSales],
    ["CATERTRAX", input.cateringSales],
    ["CATEREASE", input.eventsSales],
  ];
  const provided = channels.map(([, v]) => v).filter((v): v is number => v != null);
  const netSales = provided.length ? provided.reduce((s, v) => s + v, 0) : null;
  const laborCost = input.laborCost ?? null;
  const laborPct = netSales && laborCost != null ? laborCost / netSales : null;

  let rows = 0;

  await prisma.dailyMetric.upsert({
    where: { date: d },
    create: {
      date: d, netSales, tax: input.tax ?? null, laborCost, laborHours: input.laborHours ?? null,
      laborPct, foodPurchases: input.foodPurchases ?? null, notes: input.notes ?? null, source: "MANUAL",
    },
    update: {
      netSales, tax: input.tax ?? null, laborCost, laborHours: input.laborHours ?? null,
      laborPct, foodPurchases: input.foodPurchases ?? null, notes: input.notes ?? null, source: "MANUAL",
    },
  });
  rows++;

  for (const [channel, v] of channels) {
    if (v == null) continue;
    await prisma.dailySales.upsert({
      where: { date_channel: { date: d, channel: channel as never } },
      create: { date: d, channel: channel as never, netSales: v, source: "MANUAL" },
      update: { netSales: v, source: "MANUAL" },
    });
    rows++;
  }

  const balances: [string, number | null | undefined][] = [
    ["OPERATING", input.operating], ["PAYROLL", input.payroll], ["MERCHANT", input.merchant],
    ["SAVINGS", input.savings], ["HOLDING", input.holding], ["CC_PROCESSING", input.ccProcessing],
  ];
  for (const [account, v] of balances) {
    if (v == null) continue;
    await prisma.accountBalance.upsert({
      where: { date_account: { date: d, account: account as never } },
      create: { date: d, account: account as never, balance: v, source: "MANUAL" },
      update: { balance: v, source: "MANUAL" },
    });
    rows++;
  }

  await prisma.syncRun.create({ data: { source: "MANUAL", status: "SUCCESS", rowsWritten: rows, finishedAt: new Date(), message: `Daily check-in for ${input.date}` } });

  return { ok: true, netSales, rows };
}
