import type { Connector, ConnectorStatus, PullResult } from "./types";
import { ConnectorUnavailableError } from "./types";

// Clover POS — retail. Discovery: public Platform REST API (v3). Pull orders
// for the day and aggregate net sales ourselves (no reporting API). Fastest
// auth path is a merchant-generated API token used as a Bearer.
//
// Reference: GET {base}/v3/merchants/{mId}/orders?filter=createdTime>=...&expand=lineItems,payments

const BASE = process.env.CLOVER_BASE_URL || "https://api.clover.com";
const MERCHANT = process.env.CLOVER_MERCHANT_ID || "";
const TOKEN = process.env.CLOVER_API_TOKEN || "";

function dayBounds(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.getTime(), end: end.getTime() };
}

export const cloverConnector: Connector = {
  status(): ConnectorStatus {
    return {
      system: "CLOVER",
      label: "Clover POS",
      category: "retail",
      configured: Boolean(MERCHANT && TOKEN),
      method: "rest-api",
      readiness:
        MERCHANT && TOKEN
          ? "Ready — merchant token configured."
          : "Set CLOVER_MERCHANT_ID + CLOVER_API_TOKEN (merchant-generated token).",
    };
  },

  async pull(date: Date): Promise<PullResult> {
    if (!MERCHANT || !TOKEN) {
      throw new ConnectorUnavailableError(
        "CLOVER",
        "Clover merchant id/token not set. Merchant generates a token in the Clover dashboard → API tokens."
      );
    }
    const { start, end } = dayBounds(date);
    const url =
      `${BASE}/v3/merchants/${MERCHANT}/orders` +
      `?filter=createdTime>=${start}&filter=createdTime<${end}` +
      `&expand=payments&limit=1000`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
    });
    if (!res.ok) {
      throw new ConnectorUnavailableError(
        "CLOVER",
        `Clover API ${res.status}: ${await res.text()}`
      );
    }
    const data = (await res.json()) as { elements?: Array<{ total?: number }> };
    // Clover amounts are integer cents.
    const cents = (data.elements ?? []).reduce((s, o) => s + (o.total ?? 0), 0);
    const iso = date.toISOString().slice(0, 10);
    return {
      sales: [
        {
          date: iso,
          channel: "CAFE_RETAIL",
          netSales: cents / 100,
          orderCount: data.elements?.length ?? 0,
        },
      ],
      note: "Aggregated from Clover orders (cents → dollars).",
    };
  },
};
