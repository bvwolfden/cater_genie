// No-Docker local Postgres for development/verification.
// Starts a real Postgres (downloaded binary, no Docker/admin) on :5433 and
// stays alive until killed. Use `npm run db:start` (Docker) in normal dev;
// this is the fallback when Docker isn't available.
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, ".pgdata");

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "catergenie",
  password: "catergenie",
  port: 5433,
  persistent: true,
});

const alreadyInit = existsSync(path.join(dataDir, "PG_VERSION"));

try {
  if (!alreadyInit) {
    console.log("[pg] initialising cluster…");
    await pg.initialise();
  }
  console.log("[pg] starting…");
  await pg.start();
  try {
    await pg.createDatabase("catergenie");
    console.log("[pg] created database 'catergenie'");
  } catch {
    // already exists
  }
  console.log("[pg] READY on postgresql://catergenie:catergenie@localhost:5433/catergenie");

  const shutdown = async () => {
    console.log("\n[pg] stopping…");
    try {
      await pg.stop();
    } catch {}
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep the process alive so Postgres stays up.
  await new Promise(() => {});
} catch (err) {
  console.error("[pg] failed:", err);
  process.exit(1);
}
