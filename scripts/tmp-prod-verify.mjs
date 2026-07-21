// Sign in with a Clerk ticket, upload the WIW schedule via /api/import,
// commit the batch, then screenshot the dashboard + labor pages.
import { chromium } from "playwright";
import fs from "node:fs";

const TICKET_URL = process.argv[2];
const BASE = new URL(TICKET_URL).origin;
const FILE = "/Users/brian/Projects/cater_genie/docs/Schedule for Jul 20, 2026 - Jul 26, 2026.xlsx";
const OUT = "/private/tmp/claude-501/-Users-brian-Projects-cater-genie/17e70cfe-fb8f-4f11-9e68-7dd08e3535d0/scratchpad";
const SKIP_UPLOAD = process.argv.includes("--skip-upload");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

console.log("signing in…");
await page.goto(TICKET_URL, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(3000);
console.log("landed on:", page.url());

if (!SKIP_UPLOAD) {
  console.log("uploading schedule…");
  const b64 = fs.readFileSync(FILE).toString("base64");
  const upload = await page.evaluate(
    async ({ b64, name }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const file = new File([bytes], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/import", { method: "POST", body: fd });
      return { status: res.status, body: await res.json() };
    },
    { b64, name: "Schedule for Jul 20, 2026 - Jul 26, 2026.xlsx" }
  );
  const batch = upload.body?.batch;
  console.log("upload status:", upload.status, "batch:", batch?.id, batch?.kind, batch?.status, "|", batch?.summary ?? batch?.error);
  if (batch?.status !== "PENDING") {
    console.error("PARSE FAILED:", JSON.stringify(upload.body).slice(0, 800));
    await browser.close();
    process.exit(1);
  }
  const shifts = batch.parsed?.shifts ?? [];
  console.log("parsed shifts:", shifts.length);

  const commit = await page.evaluate(async (id) => {
    const res = await fetch(`/api/import/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "commit" }),
    });
    return { status: res.status, body: await res.json() };
  }, batch.id);
  console.log("commit:", commit.status, JSON.stringify(commit.body).slice(0, 300));
}

console.log("screenshotting…");
await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/prod-home.png`, fullPage: false });

await page.goto(`${BASE}/labor`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/prod-labor.png`, fullPage: false });

await browser.close();
console.log("done");
