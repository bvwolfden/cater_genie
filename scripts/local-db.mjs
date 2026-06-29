// Local Postgres manager for normal development (Docker).
// `npm run db:start` / `npm run db:stop`.
// If Docker isn't available, falls back to a hint to use `npm run db:embedded`.
import { execSync, spawnSync } from "node:child_process";

const cmd = process.argv[2] ?? "start";

function dockerAvailable() {
  const r = spawnSync("docker", ["info"], { stdio: "ignore" });
  return r.status === 0;
}

if (!dockerAvailable()) {
  console.error(
    "Docker daemon not reachable.\n" +
      "  • Start Docker Desktop, then re-run `npm run db:start`, or\n" +
      "  • Use the no-Docker fallback:  npm run db:embedded\n"
  );
  process.exit(1);
}

if (cmd === "start") {
  console.log("Starting Postgres via docker compose…");
  execSync("docker compose up -d db", { stdio: "inherit" });
  // wait for healthy
  for (let i = 0; i < 30; i++) {
    const out = spawnSync("docker", [
      "inspect",
      "-f",
      "{{.State.Health.Status}}",
      "catergenie-db",
    ]);
    const status = out.stdout?.toString().trim();
    if (status === "healthy") {
      console.log("Postgres is healthy on localhost:5433");
      process.exit(0);
    }
    execSync("sleep 1");
  }
  console.error("Postgres did not become healthy in time.");
  process.exit(1);
} else if (cmd === "stop") {
  execSync("docker compose stop db", { stdio: "inherit" });
} else {
  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}
