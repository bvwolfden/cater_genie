#!/usr/bin/env node
/**
 * End-to-end smoke test against a deployed CaterGenie instance.
 *
 *   npm run smoke                        → tests the staging URL
 *   npm run smoke -- https://my.app      → tests another deployment
 *
 * Signs in as the Clerk test user via a backend-minted sign-in ticket
 * (CLERK_SECRET_KEY + CLERK_TEST_USER_EMAIL, read from env or .env), walks
 * every page, and fails on: HTTP errors, missing page markers, NaN/$NaN in
 * rendered output, or browser console errors. Warnings (empty bookings,
 * "undefined" text) don't fail the run but are reported.
 *
 * Requires: `npx playwright install chromium` once per machine.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_URL = "https://catergenie-staging.up.railway.app";
const BASE = (process.argv[2] || process.env.SMOKE_URL || DEFAULT_URL).replace(/\/$/, "");

// --- env (shell env wins; fall back to repo .env) ---------------------------
const envFile = path.join(process.cwd(), ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i < 1 || line.startsWith("#")) continue;
    const k = line.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}
const { CLERK_SECRET_KEY, CLERK_TEST_USER_EMAIL } = process.env;
if (!CLERK_SECRET_KEY || !CLERK_TEST_USER_EMAIL) {
  console.error("smoke: CLERK_SECRET_KEY and CLERK_TEST_USER_EMAIL are required (env or .env)");
  process.exit(2);
}

// --- results ----------------------------------------------------------------
const results = [];
const pass = (name, detail = "") => results.push({ ok: true, warn: false, name, detail });
const warn = (name, detail = "") => results.push({ ok: true, warn: true, name, detail });
const fail = (name, detail = "") => results.push({ ok: false, warn: false, name, detail });

async function mintTicket() {
  const headers = { Authorization: `Bearer ${CLERK_SECRET_KEY}`, "Content-Type": "application/json" };
  const users = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(CLERK_TEST_USER_EMAIL)}`,
    { headers }
  ).then((r) => r.json());
  if (!Array.isArray(users) || !users.length) throw new Error(`no Clerk user for ${CLERK_TEST_USER_EMAIL}`);
  const t = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers,
    body: JSON.stringify({ user_id: users[0].id, expires_in_seconds: 600 }),
  }).then((r) => r.json());
  if (!t.token) throw new Error(`sign-in token mint failed: ${JSON.stringify(t).slice(0, 200)}`);
  return t.token;
}

// Text that should never appear in rendered pages.
const FATAL_STRINGS = ["NaN", "$NaN"];
const WARN_STRINGS = ["undefined", "Infinity"];

const PAGES = [
  { path: "/", markers: ["Pulse of the Business", "Data Quality", "Weekly Revenue"] },
  { path: "/labor", markers: ["Payroll", "Latest Week Detail"] },
  { path: "/bookings", markers: ["Booked Revenue by Day", "By Source"] },
  { path: "/delivery", markers: ["Delivery Board", "Unassigned drops"] },
  { path: "/entry", markers: ["Net sales"] },
  { path: "/import", markers: ["Import"] },
];

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160));
  });

  // 1. Auth is enforced: unauthenticated dashboard must bounce to sign-in.
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (page.url().includes("sign-in")) pass("auth: unauthenticated / redirects to sign-in");
  else fail("auth: unauthenticated / redirects to sign-in", `landed on ${page.url()}`);

  // 2. Test-user sign-in via ticket.
  const ticket = await mintTicket();
  await page.goto(`${BASE}/sign-in?__clerk_ticket=${ticket}`, { waitUntil: "networkidle", timeout: 60000 });
  try {
    await page.waitForURL((u) => !u.href.includes("sign-in"), { timeout: 30000 });
    pass("auth: ticket sign-in");
  } catch {
    fail("auth: ticket sign-in", `stuck at ${page.url()}`);
    console.log(render());
    await browser.close();
    process.exit(1);
  }

  // 3. Every page renders with its markers and without poison strings.
  for (const p of PAGES) {
    consoleErrors.length = 0;
    const res = await page.goto(`${BASE}${p.path}`, { waitUntil: "networkidle", timeout: 60000 });
    const status = res?.status() ?? 0;
    if (status >= 400) {
      fail(`page ${p.path}: loads`, `HTTP ${status}`);
      continue;
    }
    pass(`page ${p.path}: loads`, `HTTP ${status}`);
    await page.waitForTimeout(800);
    const body = await page.locator("body").innerText();
    for (const m of p.markers) {
      if (body.includes(m)) pass(`page ${p.path}: shows "${m}"`);
      else fail(`page ${p.path}: shows "${m}"`, "marker missing");
    }
    for (const s of FATAL_STRINGS) {
      if (body.includes(s)) fail(`page ${p.path}: no "${s}"`, "rendered a non-number");
    }
    for (const s of WARN_STRINGS) {
      if (new RegExp(`\\b${s}\\b`).test(body)) warn(`page ${p.path}: contains "${s}"`);
    }
    if (consoleErrors.length) warn(`page ${p.path}: console errors`, consoleErrors[0]);

    if (p.path === "/") {
      if (body.includes("Draft data")) pass("dashboard: draft-data banner present");
      else warn("dashboard: draft-data banner present", "missing (dismissed sessions hide it)");
      const dq = body.match(/(\d+)\s+critical\s*·\s*(\d+)\s+warnings?/);
      if (dq) pass("dashboard: data-quality counts", `${dq[1]} critical · ${dq[2]} warnings`);
    }
    if (p.path === "/bookings") {
      const orders = body.match(/ORDERS · AHEAD\s*\n?\s*(\d+)/i);
      const count = orders ? parseInt(orders[1], 10) : 0;
      if (count > 0) pass("bookings: forward orders present", `${count} orders`);
      else warn("bookings: forward orders present", "0 orders — has the daily sync run?");
    }
  }

  // 4. Admin repair endpoint is reachable and lists repairs (GET only — no writes).
  const rep = await page.request.get(`${BASE}/api/admin/repair`);
  if (rep.status() === 200) {
    const list = await rep.json().catch(() => null);
    pass("api: /api/admin/repair lists repairs", `${list?.repairs?.length ?? 0} registered`);
  } else fail("api: /api/admin/repair lists repairs", `HTTP ${rep.status()}`);

  await browser.close();
  console.log(render());
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
};

function render() {
  const lines = results.map((r) =>
    `${r.ok ? (r.warn ? "⚠" : "✓") : "✗"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`
  );
  const fails = results.filter((r) => !r.ok).length;
  const warns = results.filter((r) => r.warn).length;
  lines.push("", `smoke: ${results.length} checks · ${fails} failed · ${warns} warnings · ${BASE}`);
  return lines.join("\n");
}

run().catch((e) => {
  console.error("smoke: crashed —", e.message);
  process.exit(1);
});
