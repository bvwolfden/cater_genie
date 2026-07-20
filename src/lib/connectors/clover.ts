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
    // Clover's Reporting "Net Sales" excludes tax, tips, and refunds.
    // order.total INCLUDES tax, so summing it silently overstates net sales
    // vs the merchant's own reports. Compute from payments instead:
    // Σ(payment.amount − taxAmount − tipAmount) − Σ(refund.amount).
    // Paginate: 1000 max per request.
    type Payment = { amount?: number; taxAmount?: number; tipAmount?: number };
    type Refund = { amount?: number };
    type Order = { payments?: { elements?: Payment[] }; refunds?: { elements?: Refund[] } };

    let cents = 0;
    let orderCount = 0;
    for (let offset = 0; ; offset += 1000) {
      const url =
        `${BASE}/v3/merchants/${MERCHANT}/orders` +
        `?filter=createdTime>=${start}&filter=createdTime<${end}` +
        `&expand=payments,refunds&limit=1000&offset=${offset}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
      });
      if (!res.ok) {
        throw new ConnectorUnavailableError(
          "CLOVER",
          `Clover API ${res.status}: ${await res.text()}`
        );
      }
      const data = (await res.json()) as { elements?: Order[] };
      const orders = data.elements ?? [];
      orderCount += orders.length;
      for (const o of orders) {
        for (const p of o.payments?.elements ?? []) {
          cents += (p.amount ?? 0) - (p.taxAmount ?? 0) - (p.tipAmount ?? 0);
        }
        for (const r of o.refunds?.elements ?? []) {
          cents -= r.amount ?? 0;
        }
      }
      if (orders.length < 1000) break;
    }

    const iso = date.toISOString().slice(0, 10);
    return {
      sales: [
        {
          date: iso,
          channel: "CAFE_RETAIL",
          netSales: cents / 100,
          orderCount,
        },
      ],
      // TODO: reconcile against Clover Reporting on the first live day —
      // partial/line-item refunds can drift slightly from the report.
      note: "Net sales from Clover payments (excl. tax & tips, less refunds).",
    };
  },
};
