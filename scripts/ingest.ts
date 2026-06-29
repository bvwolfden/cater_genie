/**
 * Live ingestion job. Runs each source connector for a target date and writes
 * results to Postgres. Today most connectors throw ConnectorUnavailableError
 * (credentials/API access pending) — those are logged and recorded as FAILED
 * SyncRuns, which the dashboard surfaces as "pending" data sources.
 *
 * Usage: npm run ingest [-- YYYY-MM-DD]   (defaults to yesterday)
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { connectors, ConnectorUnavailableError } from "../src/lib/connectors";

const prisma = new PrismaClient();

function targetDate(): Date {
  const arg = process.argv[2];
  if (arg && /^\d{4}-\d{2}-\d{2}$/.test(arg)) return new Date(`${arg}T12:00:00Z`);
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

async function main() {
  const date = targetDate();
  const iso = date.toISOString().slice(0, 10);
  console.log(`Ingest for ${iso}`);

  for (const connector of connectors) {
    const s = connector.status();
    const run = await prisma.syncRun.create({
      data: { source: s.system, status: "RUNNING" },
    });
    try {
      const result = await connector.pull(date);
      let rows = 0;

      for (const sale of result.sales ?? []) {
        await prisma.dailySales.upsert({
          where: { date_channel: { date: new Date(`${sale.date}T00:00:00Z`), channel: sale.channel } },
          create: { ...sale, date: new Date(`${sale.date}T00:00:00Z`), source: s.system },
          update: { netSales: sale.netSales, tax: sale.tax, grossSales: sale.grossSales, orderCount: sale.orderCount },
        });
        rows++;
      }
      for (const b of result.balances ?? []) {
        await prisma.accountBalance.upsert({
          where: { date_account: { date: new Date(`${b.date}T00:00:00Z`), account: b.account } },
          create: { ...b, date: new Date(`${b.date}T00:00:00Z`), source: s.system },
          update: { balance: b.balance },
        });
        rows++;
      }
      if (result.labor?.length) {
        await prisma.laborEntry.createMany({
          data: result.labor.map((l) => ({ ...l, date: new Date(`${l.date}T00:00:00Z`), source: s.system })),
        });
        rows += result.labor.length;
      }

      await prisma.syncRun.update({
        where: { id: run.id },
        data: { status: "SUCCESS", rowsWritten: rows, finishedAt: new Date(), message: result.note },
      });
      console.log(`  ✓ ${s.label}: ${rows} rows`);
    } catch (err) {
      const message =
        err instanceof ConnectorUnavailableError ? err.message : String(err);
      await prisma.syncRun.update({
        where: { id: run.id },
        data: { status: "FAILED", finishedAt: new Date(), message },
      });
      console.log(`  • ${s.label}: pending — ${message}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
