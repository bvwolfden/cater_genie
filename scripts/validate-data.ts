/**
 * Data-validation suite — runs the exact same checks the dashboard's Data
 * Quality panel uses (src/lib/quality-core.ts) and prints a human-readable
 * report. Exits 1 if any CRITICAL flag fires, so it can gate deploys/crons.
 *
 * Run:  npm run validate:data
 */
import "dotenv/config";
import { getDataQuality, type QualityFlag, type QualitySeverity } from "../src/lib/quality-core";
import { prisma } from "../src/lib/db";

const BADGE: Record<QualitySeverity, string> = { critical: "CRIT", warn: "warn", info: "info" };

function printSection(label: string, flags: QualityFlag[]) {
  console.log(`\n${label} — ${flags.length} flag${flags.length === 1 ? "" : "s"}`);
  console.log("-".repeat(72));
  if (flags.length === 0) {
    console.log("  all clear");
    return;
  }
  for (const f of flags) {
    console.log(`  [${BADGE[f.severity]}] ${f.date}  ${f.title}`);
    console.log(`         ${f.detail}`);
  }
}

async function main() {
  const q = await getDataQuality();
  const count = (s: QualitySeverity) => q.flags.filter((f) => f.severity === s).length;
  const criticals = count("critical");

  console.log("CaterGenie data validation");
  console.log("=".repeat(72));
  console.log(
    `Checked ${q.checkedDays} days and ${q.checkedWeeks} weeks at ${q.generatedAt}\n` +
      `Flags: ${criticals} critical · ${count("warn")} warning · ${count("info")} info`
  );

  printSection("Entry checks", q.flags.filter((f) => f.category === "entry"));
  printSection("Cross-source reconciliation", q.flags.filter((f) => f.category === "reconciliation"));

  console.log();
  if (criticals > 0) {
    console.log(`FAIL — ${criticals} critical flag${criticals === 1 ? "" : "s"} need${criticals === 1 ? "s" : ""} attention.`);
    process.exitCode = 1;
  } else {
    console.log("PASS — no critical flags.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
