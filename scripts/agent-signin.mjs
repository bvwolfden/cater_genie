#!/usr/bin/env node
// Agent test sign-in helper.
//
// The app is behind Clerk auth with MFA required, so a plain email+password
// login can't complete headlessly. This mints a one-time Clerk sign-in token
// for the dedicated test user and prints a ticket URL. Open that URL in a
// (headless) browser and Clerk signs you in automatically — bypassing MFA —
// then you land on the dashboard.
//
// Usage:
//   node scripts/agent-signin.mjs [baseUrl]
//   # baseUrl defaults to APP_URL env or the staging URL.
//
// Requires in .env: CLERK_SECRET_KEY, CLERK_TEST_USER_EMAIL.
// Never print CLERK_SECRET_KEY or the password — only the (short-lived) ticket.

import fs from "node:fs";

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#") || !s.includes("=")) continue;
    const i = s.indexOf("=");
    env[s.slice(0, i).trim()] = s.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv();
const SK = env.CLERK_SECRET_KEY;
const EMAIL = env.CLERK_TEST_USER_EMAIL;
const BASE = process.argv[2] || process.env.APP_URL || "https://catergenie-staging.up.railway.app";

if (!SK || !EMAIL) {
  console.error("Missing CLERK_SECRET_KEY or CLERK_TEST_USER_EMAIL in .env");
  process.exit(1);
}

const api = (path, init = {}) =>
  fetch(`https://api.clerk.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${SK}`, "Content-Type": "application/x-www-form-urlencoded", ...(init.headers || {}) },
  });

const users = await (await api(`/users?email_address=${encodeURIComponent(EMAIL)}`)).json();
if (!Array.isArray(users) || users.length === 0) {
  console.error(`No Clerk user with email ${EMAIL}`);
  process.exit(1);
}
const userId = users[0].id;

const res = await api(`/sign_in_tokens`, { method: "POST", body: new URLSearchParams({ user_id: userId }) });
const tok = await res.json();
if (!tok.token) {
  console.error("Failed to mint sign-in token:", JSON.stringify(tok).slice(0, 200));
  process.exit(1);
}

const url = `${BASE}/sign-in?__clerk_ticket=${tok.token}`;
console.log(`\nUser:   ${EMAIL} (${userId})`);
console.log(`Ticket URL (single-use, expires soon — open in a browser to sign in):\n\n${url}\n`);
