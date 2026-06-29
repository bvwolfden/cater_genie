import type { Connector, ConnectorStatus, PullResult, BalanceInput } from "./types";
import { ConnectorUnavailableError } from "./types";

// QuickBooks Online — accounting. Discovery: documented REST API, OAuth 2.0.
// For "current bank/cash balances" query the Account entity's CurrentBalance:
//   GET {base}/v3/company/{realmId}/query?query=SELECT * FROM Account WHERE AccountType='Bank'
// Requires OAuth access token (refresh token rotates every use).
//
// NOTE: confirming Online vs Desktop is still an open client question. This
// connector implements the Online path. Username/password in env are for the
// portal, not the API — QBO needs OAuth tokens.

const BASE = process.env.QBO_BASE_URL || "https://quickbooks.api.intuit.com";
const REALM = process.env.QBO_REALM_ID || "";
const ACCESS = process.env.QBO_ACCESS_TOKEN || "";

// Map QuickBooks account names → our canonical AccountType. Tune once we see
// the real chart of accounts.
const NAME_MAP: Array<[RegExp, BalanceInput["account"]]> = [
  [/oper/i, "OPERATING"],
  [/payroll/i, "PAYROLL"],
  [/merchant/i, "MERCHANT"],
  [/saving/i, "SAVINGS"],
  [/holding/i, "HOLDING"],
  [/cc|credit card|processing/i, "CC_PROCESSING"],
];

export const quickbooksConnector: Connector = {
  status(): ConnectorStatus {
    return {
      system: "QUICKBOOKS",
      label: "QuickBooks Online",
      category: "accounting",
      configured: Boolean(REALM && ACCESS),
      method: "oauth-rest",
      readiness:
        REALM && ACCESS
          ? "Ready — realm + access token configured."
          : "Confirm Online vs Desktop, register an Intuit app, then set QBO_REALM_ID + QBO_ACCESS_TOKEN (OAuth).",
    };
  },

  async pull(date: Date): Promise<PullResult> {
    if (!REALM || !ACCESS) {
      throw new ConnectorUnavailableError(
        "QUICKBOOKS",
        "QuickBooks realm/access token not set. Needs Intuit OAuth (Online) — username/password alone won't authorize the API."
      );
    }
    const q = encodeURIComponent(
      "SELECT Name, AccountType, CurrentBalance FROM Account WHERE Active = true"
    );
    const url = `${BASE}/v3/company/${REALM}/query?query=${q}&minorversion=73`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${ACCESS}`, Accept: "application/json" },
    });
    if (!res.ok) {
      throw new ConnectorUnavailableError(
        "QUICKBOOKS",
        `QuickBooks API ${res.status}: ${await res.text()}`
      );
    }
    const data = (await res.json()) as {
      QueryResponse?: { Account?: Array<{ Name?: string; CurrentBalance?: number }> };
    };
    const iso = date.toISOString().slice(0, 10);
    const balances: BalanceInput[] = [];
    for (const a of data.QueryResponse?.Account ?? []) {
      const hit = NAME_MAP.find(([re]) => re.test(a.Name ?? ""));
      if (hit && a.CurrentBalance != null) {
        balances.push({ date: iso, account: hit[1], balance: a.CurrentBalance });
      }
    }
    return { balances, note: "Account.CurrentBalance via QBO query endpoint." };
  },
};
