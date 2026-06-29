/**
 * Seed Postgres from the extracted spreadsheet JSON (prisma/seed-data/*.json).
 * Idempotent: clears the seeded tables and reloads. Run `npm run extract` first.
 */
import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DIR = path.join(process.cwd(), "prisma", "seed-data");

function load<T>(name: string): T[] {
  const p = path.join(DIR, name);
  if (!existsSync(p)) {
    console.warn(`  ! missing ${name} — did you run \`npm run extract\`?`);
    return [];
  }
  return JSON.parse(readFileSync(p, "utf8")) as T[];
}

const d = (s?: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null);

async function main() {
  console.log("Seeding CaterGenie from spreadsheet exports…");

  const dailyMetrics = load<any>("daily_metrics.json");
  const balances = load<any>("account_balances.json");
  const labor = load<any>("labor_entries.json");
  const rollups = load<any>("weekly_rollup.json");
  const channels = load<any>("weekly_channel_revenue.json");

  // Clear seeded tables for a deterministic reload.
  await prisma.$transaction([
    prisma.dailyMetric.deleteMany({}),
    prisma.accountBalance.deleteMany({}),
    prisma.laborEntry.deleteMany({}),
    prisma.weeklyRollup.deleteMany({}),
    prisma.weeklyChannelRevenue.deleteMany({}),
  ]);

  const run = await prisma.syncRun.create({
    data: { source: "SPREADSHEET", status: "RUNNING" },
  });

  let rows = 0;

  rows += (
    await prisma.dailyMetric.createMany({
      data: dailyMetrics.map((m) => ({
        date: d(m.date)!,
        weekLabel: m.weekLabel ?? null,
        netSales: m.netSales ?? null,
        tax: m.tax ?? null,
        laborCost: m.laborCost ?? null,
        laborHours: m.laborHours ?? null,
        laborPct: m.laborPct ?? null,
        foodPurchases: m.foodPurchases ?? null,
        notes: m.notes ?? null,
        source: "SPREADSHEET",
      })),
    })
  ).count;

  rows += (
    await prisma.accountBalance.createMany({
      data: balances.map((b) => ({
        date: d(b.date)!,
        account: b.account,
        balance: b.balance,
        source: "SPREADSHEET",
      })),
    })
  ).count;

  rows += (
    await prisma.laborEntry.createMany({
      data: labor.map((l) => ({
        date: d(l.date)!,
        employeeId: l.employeeId ?? null,
        firstName: l.firstName ?? null,
        lastName: l.lastName ?? null,
        department: l.department ?? null,
        position: l.position ?? null,
        jobSite: l.jobSite ?? null,
        regularHours: l.regularHours ?? null,
        otHours: l.otHours ?? null,
        doubleOtHours: l.doubleOtHours ?? null,
        hourlyRate: l.hourlyRate ?? null,
        paidTotal: l.paidTotal ?? null,
        tips: l.tips ?? null,
        earningsTotal: l.earningsTotal ?? null,
        source: "WHENIWORK",
      })),
    })
  ).count;

  rows += (
    await prisma.weeklyRollup.createMany({
      data: rollups.map((r) => ({
        weekStart: d(r.weekStart)!,
        weekEnd: d(r.weekEnd),
        totalRevenue: r.totalRevenue ?? null,
        revenuePrev1: r.revenuePrev1 ?? null,
        revenuePrev2: r.revenuePrev2 ?? null,
        revenuePrev3: r.revenuePrev3 ?? null,
        projectedTotal: r.projectedTotal ?? null,
        laborCost: r.laborCost ?? null,
        laborPct: r.laborPct ?? null,
      })),
    })
  ).count;

  rows += (
    await prisma.weeklyChannelRevenue.createMany({
      data: channels.map((c) => ({
        weekStart: d(c.weekStart)!,
        weekEnd: d(c.weekEnd),
        channel: c.channel,
        actual: c.actual ?? null,
        projected: c.projected ?? null,
      })),
    })
  ).count;

  await prisma.syncRun.update({
    where: { id: run.id },
    data: { status: "SUCCESS", rowsWritten: rows, finishedAt: new Date() },
  });

  console.log(`  daily metrics:      ${dailyMetrics.length}`);
  console.log(`  account balances:   ${balances.length}`);
  console.log(`  labor entries:      ${labor.length}`);
  console.log(`  weekly rollups:     ${rollups.length}`);
  console.log(`  channel revenue:    ${channels.length}`);
  console.log(`Done. ${rows} rows written.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
