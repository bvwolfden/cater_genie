import { NextResponse } from "next/server";
import { getAuthorizeUrl, qboConfigured } from "@/lib/qbo";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!qboConfigured()) {
    return NextResponse.json(
      { ok: false, error: "QuickBooks app credentials not set (QBO_CLIENT_ID / QBO_CLIENT_SECRET)." },
      { status: 503 }
    );
  }
  const state = crypto.randomBytes(12).toString("hex");
  const res = NextResponse.redirect(getAuthorizeUrl(state));
  // Stash state for CSRF check on callback.
  res.cookies.set("qbo_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
