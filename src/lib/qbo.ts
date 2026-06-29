import "server-only";
import { prisma } from "./db";

// QuickBooks Online OAuth 2.0 + token management.
// Docs: https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0
const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const SCOPE = "com.intuit.quickbooks.accounting";

const CLIENT_ID = process.env.QBO_CLIENT_ID || "";
const CLIENT_SECRET = process.env.QBO_CLIENT_SECRET || "";
const REDIRECT_URI =
  process.env.QBO_REDIRECT_URI || "http://localhost:3000/api/qbo/callback";

export const qboConfigured = () => Boolean(CLIENT_ID && CLIENT_SECRET);
export const qboApiBase = () =>
  process.env.QBO_BASE_URL ||
  (process.env.QBO_ENV === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com");

export function getAuthorizeUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    scope: SCOPE,
    redirect_uri: REDIRECT_URI,
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

const basicAuth = () => "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

async function persist(tok: { access_token: string; refresh_token: string; expires_in: number }, realmId?: string) {
  const expiresAt = new Date(Date.now() + (tok.expires_in - 60) * 1000); // 60s safety
  await prisma.integrationToken.upsert({
    where: { provider: "QBO" },
    create: { provider: "QBO", accessToken: tok.access_token, refreshToken: tok.refresh_token, realmId: realmId ?? null, expiresAt },
    update: { accessToken: tok.access_token, refreshToken: tok.refresh_token, expiresAt, ...(realmId ? { realmId } : {}) },
  });
}

/** Exchange the authorization code (from the callback) for tokens. */
export async function exchangeCode(code: string, realmId: string): Promise<void> {
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!res.ok) throw new Error(`QBO token exchange ${res.status}: ${await res.text()}`);
  await persist(await res.json(), realmId);
}

async function refresh(refreshToken: string, realmId: string | null): Promise<string | null> {
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!res.ok) return null;
  const tok = await res.json();
  await persist(tok, realmId ?? undefined); // refresh token rotates — persist the new one
  return tok.access_token as string;
}

/** A valid access token + realmId, refreshing if expired. Null if not connected. */
export async function getValidQbo(): Promise<{ accessToken: string; realmId: string } | null> {
  if (!qboConfigured()) return null;
  const t = await prisma.integrationToken.findUnique({ where: { provider: "QBO" } });
  if (!t?.refreshToken || !t.realmId) return null;
  if (t.accessToken && t.expiresAt && t.expiresAt.getTime() > Date.now()) {
    return { accessToken: t.accessToken, realmId: t.realmId };
  }
  const fresh = await refresh(t.refreshToken, t.realmId);
  return fresh ? { accessToken: fresh, realmId: t.realmId } : null;
}

export async function qboStatus(): Promise<{ connected: boolean; realmId: string | null; configured: boolean }> {
  const configured = qboConfigured();
  if (!configured) return { connected: false, realmId: null, configured };
  const t = await prisma.integrationToken.findUnique({ where: { provider: "QBO" } });
  return { connected: Boolean(t?.refreshToken && t?.realmId), realmId: t?.realmId ?? null, configured };
}
