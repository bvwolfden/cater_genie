import type { Connector, ConnectorStatus, PullResult, LaborEntryInput } from "./types";
import { ConnectorUnavailableError } from "./types";

// When I Work — labor. Discovery: documented v2 REST API. Auth is two-step:
// POST email+password with the W-Key developer-key header to mint a session
// token, then call /2/times for clocked hours. The developer key is NOT
// self-serve — it must be requested from When I Work as an account Admin.
//
// We have username/password in env but still need WHENIWORK_API_TOKEN (the
// developer/session key) before this can run.

const BASE = process.env.WHENIWORK_BASE_URL || "https://api.wheniwork.com/2";
const TOKEN = process.env.WHENIWORK_API_TOKEN || "";

export const whenIWorkConnector: Connector = {
  status(): ConnectorStatus {
    const hasLogin = Boolean(
      process.env.WHENIWORK_USERNAME && process.env.WHENIWORK_PASSWORD
    );
    return {
      system: "WHENIWORK",
      label: "When I Work",
      category: "labor",
      configured: Boolean(TOKEN),
      method: "rest-api",
      readiness: TOKEN
        ? "Ready — API token configured."
        : hasLogin
          ? "Login captured. Still need a developer API key (request from When I Work as Admin) → set WHENIWORK_API_TOKEN."
          : "Request a developer API key from When I Work, then set WHENIWORK_API_TOKEN.",
    };
  },

  async pull(date: Date): Promise<PullResult> {
    if (!TOKEN) {
      throw new ConnectorUnavailableError(
        "WHENIWORK",
        "When I Work developer/session token (WHENIWORK_API_TOKEN) not set. Request the developer key from When I Work support."
      );
    }
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const url =
      `${BASE}/times?start=${start.toISOString()}&end=${end.toISOString()}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}`, "W-Token": TOKEN },
    });
    if (!res.ok) {
      throw new ConnectorUnavailableError(
        "WHENIWORK",
        `When I Work API ${res.status}: ${await res.text()}`
      );
    }
    const data = (await res.json()) as {
      times?: Array<{
        user_id?: number;
        length?: number; // hours
        notes?: string;
      }>;
    };
    const iso = date.toISOString().slice(0, 10);
    const labor: LaborEntryInput[] = (data.times ?? []).map((t) => ({
      date: iso,
      employeeId: t.user_id != null ? String(t.user_id) : undefined,
      regularHours: t.length,
    }));
    return { labor, note: "Pulled from When I Work /times (clocked hours)." };
  },
};
