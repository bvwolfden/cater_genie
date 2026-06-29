import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/qbo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get("qbo_oauth_state")?.value;

  const back = (qs: string) => NextResponse.redirect(new URL(`/?${qs}`, url.origin));

  if (url.searchParams.get("error")) return back(`qbo=denied`);
  if (!code || !realmId) return back(`qbo=error`);
  if (!state || !cookieState || state !== cookieState) return back(`qbo=state`);

  try {
    await exchangeCode(code, realmId);
    const res = back(`qbo=connected`);
    res.cookies.delete("qbo_oauth_state");
    return res;
  } catch (e) {
    console.error("QBO callback failed", e);
    return back(`qbo=error`);
  }
}
