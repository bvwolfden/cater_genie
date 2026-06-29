import type { Connector, ConnectorStatus, PullResult, BalanceInput } from "./types";
import { ConnectorUnavailableError } from "./types";
import { getValidQbo, qboApiBase, qboConfigured } from "../qbo";

// QuickBooks Online — accounting. Discovery: documented REST API, OAuth 2.0.
// For "current bank/cash balances" query the Account entity's CurrentBalance:
//   GET {base}/v3/company/{realmId}/query?query=SELECT * FROM Account WHERE AccountType='Bank'
//
// Auth: tokens are obtained via the in-app "Connect QuickBooks" flow
// (/api/qbo/connect → callback) and stored in IntegrationToken; getValidQbo()
// returns a fresh access token (refreshing as needed). Env QBO_REALM_ID /
// QBO_ACCESS_TOKEN remain as a manual fallback (e.g. OAuth Playground tokens).

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
    const appReady = qboConfigured();
    const envTokens = Boolean(REALM && ACCESS);
    return {
      system: "QUICKBOOKS",
      label: "QuickBooks Online",
      category: "accounting",
      configured: appReady || envTokens,
      method: "oauth-rest",
      readiness: envTokens
        ? "Ready — manual realm + access token configured."
        : appReady
          ? "App configured — click Connect QuickBooks to authorize a company."
          : "Set QBO_CLIENT_ID + QBO_CLIENT_SECRET (Intuit app), then click Connect QuickBooks.",
    };
  },

  async pull(date: Date): Promise<PullResult> {
    const stored = await getValidQbo();
    const realm = stored?.realmId || REALM;
    const access = stored?.accessToken || ACCESS;
    if (!realm || !access) {
      throw new ConnectorUnavailableError(
        "QUICKBOOKS",
        "QuickBooks not connected. Use the in-app Connect QuickBooks flow (or set QBO_REALM_ID + QBO_ACCESS_TOKEN)."
      );
    }
    const q = encodeURIComponent(
      "SELECT Name, AccountType, CurrentBalance FROM Account WHERE Active = true"
    );
    const url = `${qboApiBase()}/v3/company/${realm}/query?query=${q}&minorversion=73`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${access}`, Accept: "application/json" },
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
