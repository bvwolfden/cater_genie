# Clover POS — Integration Research

> Research date: 2026-06-28. All findings sourced from current (2025/2026) official Clover developer docs at `docs.clover.com/dev`. URLs cited at bottom.

## Verdict (TL;DR)
- **Can we integrate?** **Yes.** Clover exposes a public, documented REST API ("Platform API", v3) that returns orders and payments, from which yesterday's gross/net sales and order counts can be computed.
- **Recommended approach:** **REST API (Platform v3)** — pull `GET /v3/merchants/{mId}/orders` (and/or `/payments`) filtered by `createdTime` for yesterday, aggregate in our backend. No screen scraping, no CSV.
- **Auth (fastest for one known merchant):** A **merchant-generated API token** created by the merchant in their own Clover Dashboard (Settings → Business Operations → API tokens), used as `Authorization: Bearer <token>`. This avoids building/submitting an App Market OAuth app. See important caveat in Risks about Clover's "sandbox-only" language on these tokens.
- **Confidence:** **High** on the API existing, the endpoints, date filtering, cents representation, and rate limits. **Medium** on the long-term supportability of the production merchant-token shortcut (Clover docs are inconsistent about whether merchant-generated tokens are production-blessed or sandbox-only). OAuth is the unambiguously supported production path if the shortcut is rejected.
- **Effort estimate:** ~**0.5–1.5 days** with a merchant API token; ~**3–5 days** if we must build, get approved, and ship a full OAuth app.

---

## Authentication

Clover supports multiple auth mechanisms; the right one depends on whether this is a one-off for a single, cooperative merchant (us/our client) or a multi-merchant product.

**1. Merchant-generated API token (fastest for a single known merchant)**
- The merchant logs into their **Clover Dashboard** → **Settings / Setup** → **Business Operations → API tokens** → **Create new token**, names it, and checks the permission boxes (e.g., read Orders, read Payments, read Merchant).
- Token is used directly as a Bearer token: `Authorization: Bearer <api-token>`.
- Per Clover docs, these merchant-level tokens authenticate requests to the **Clover Platform API** endpoints (orders, payments, inventory, etc.) and are described as providing "direct, persistent access."
- No OAuth redirect dance, no App Market app, no app approval. This is by far the lowest-friction path **if** we control or can ask the merchant to generate the token.
- **Caveat (see Risks):** Clover's docs strongly frame merchant-generated test tokens as **sandbox-only** and say production should use OAuth tokens. A production "Generate API token" screen does exist in the live merchant dashboard, and Clover's own Platform-API token docs say merchant tokens can call production Platform endpoints — but the messaging is inconsistent. Treat this as "works today, validate longevity."

**2. OAuth 2.0 (v2 flow) — the officially-blessed production path**
- Standard OAuth 2.0 authorization-code flow. Apps created after Oct 2023 use the **v2/OAuth** flow, which issues an **expiring `access_token` (30 min) + `refresh_token`** pair.
- Flow:
  1. Redirect merchant to `…/oauth/v2/authorize?client_id={APPID}&redirect_uri={URI}&response_type=code`.
  2. Merchant approves → Clover redirects back with `?code=…`.
  3. Backend POSTs `client_id`, `client_secret`, `code` to `…/oauth/v2/token` → receives `access_token` + `refresh_token`.
  4. Call REST API with `Authorization: Bearer <access_token>`; refresh via `…/oauth/v2/refresh` before the 30-min access token expires.
- Supports high-trust and low-trust (**PKCE**) variants.
- Requires creating an app in the Clover Developer Dashboard. For production, the app (even a **private app** scoped to specific merchants, not publicly listed) **must be submitted to Clover and approved** before merchants can install it. Private apps are installed via a developer-shared OAuth link rather than the public App Market.
- A legacy non-expiring OAuth flow exists but is deprecated ("for reference only").

**3. Ecommerce API tokens** — distinct, public/private key pair created under **Setup → Ecommerce → Ecommerce API Tokens**, scoped to **online payment/charge** operations (Hosted iFrame, Hosted Checkout, charges). **Not the right tool for reading sales/order history.** Mentioned only to disambiguate.

**Merchant ID (`mId`):** Required in every Platform API path (`/v3/merchants/{mId}/…`). It's the merchant's Clover ID, visible in the dashboard and returned during OAuth.

**Sandbox / dev environment:** Yes. Full sandbox at `sandbox.dev.clover.com` (dashboard) + `apisandbox.dev.clover.com` (API). You create test merchants and generate test API tokens there for free. Convert URLs by swapping `api.clover.com` ↔ `apisandbox.dev.clover.com` and `www.clover.com` ↔ `sandbox.dev.clover.com`.

**Fastest for a single known merchant:** Merchant-generated API token (option 1). It skips app creation, OAuth infrastructure, and Clover's approval queue.

---

## API Overview

- **Yes, a public, documented REST API exists** — the **Clover Platform REST API (v3)**. It returns merchants, orders, payments, inventory, employees, customers, etc. Documentation: `docs.clover.com/dev`, with an OpenAPI/Markdown index at `docs.clover.com/dev/llms.txt`.
- **Public vs. approval-gated:** The API itself is public and documented; anyone can read docs and use the sandbox immediately. **Approval is only gated at the OAuth-app level** (you need an approved app to run the OAuth install flow against real merchants in production). The merchant-generated-token path needs **no app approval**.
- **Three API families (don't conflate them):**
  - **Platform REST API (v3)** — `/v3/merchants/{mId}/…` — read/write merchant data incl. **orders and payments**. **This is what we use for sales data.**
  - **Ecommerce API** — taking online card payments (charges, tokens, refunds) on a website. Not for reporting.
  - **Payments / semi-integration (Android, Secure Network Pay Display, etc.)** — driving physical payment terminals. Not relevant here.
- **No dedicated "Reporting/Analytics" REST API.** Clover's dashboard Sales/Reporting screens (gross sales, net sales, average ticket) are computed from order data; Clover documentation and community confirm that programmatic reporting metrics are derived from the **`GET /orders` endpoint**. We will compute gross/net/counts ourselves from orders (and/or payments).

---

## Base URLs

| Environment | Platform REST API base | OAuth authorize | OAuth token |
|---|---|---|---|
| **Production — North America** | `https://api.clover.com` | `https://www.clover.com/oauth/v2/authorize` | `https://api.clover.com/oauth/v2/token` |
| **Production — Europe** | `https://api.eu.clover.com` | (regional `eu` variants) | `https://api.eu.clover.com/oauth/v2/token` |
| **Production — Latin America** | `https://api.la.clover.com` | (regional `la` variants) | `https://api.la.clover.com/oauth/v2/token` |
| **Sandbox** | `https://apisandbox.dev.clover.com` | `https://sandbox.dev.clover.com/oauth/v2/authorize` | `https://apisandbox.dev.clover.com/oauth/v2/token` |

Platform endpoint pattern: `{base}/v3/merchants/{mId}/{resource}`. Refresh endpoint: `{base}/oauth/v2/refresh`.

---

## Getting Yesterday's Sales (endpoints + date filtering)

**Primary endpoint — Orders (recommended for "sales"):**
```
GET /v3/merchants/{mId}/orders
```
- Filterable fields include `createdTime`, `clientCreatedTime`, `modifiedTime`, `total`, `state`, `orderType`, `payType`, `employee.id`.
- `expand` supports: `lineItems`, `payments`, `refunds`, `credits`, `voids`, `discounts`, `serviceCharge`, `payment.tender`, `payment.cardTransaction`, `customers`, `orderType`, etc.
- `order.total` and line-item amounts are integers in **cents** (e.g., `1099` = $10.99).
- `order.state` distinguishes `open` / `locked` (paid) / etc.; **voids** appear via the `voids` expand and excluded/zeroed line items.

**Secondary / cross-check endpoint — Payments (good for "money actually collected"):**
```
GET /v3/merchants/{mId}/payments
```
- Returns `id`, `amount` (cents), `tipAmount`, `taxAmount`, `cashbackAmount`, `result` (e.g., `SUCCESS`), `createdTime`, `modifiedTime`, `order`, `tender`, `employee`.
- Refunds are a separate resource (`/v3/merchants/{mId}/payments/{payId}/refunds`, or via order `refunds` expand). **Net sales must subtract refunds** — pull refunds for the same window and subtract, since a refund issued yesterday may apply to an older payment.

**Date filtering (yesterday):**
- Time is **milliseconds since Unix epoch** (Clover ms = Unix seconds × 1000). Filter with comparison operators:
  ```
  filter=createdTime>=<startMs>&filter=createdTime<=<endMs>
  ```
- Compute yesterday's bounds in the **merchant's local timezone**, then convert to epoch ms. (Clover stamps in server/UTC ms; use `clientCreatedTime` if you need the device-local capture time. For a daily dashboard, pick one consistently and document it.)
- **Hard limits to design around:**
  - **90-day window** is enforced on Orders/Payments queries — fine for "yesterday," but our filter must always include a `createdTime` bound or the call is rejected/truncated.
  - **Max 1000 records per request.** A busy restaurant day can exceed this → **paginate** with `limit` (≤1000) + `offset`, looping until fewer than `limit` rows return.

**Amount representation:** All monetary values are **integer cents**. Divide by 100 for dollars. Watch tax/tip: gross sales typically excludes tax/tip/gratuity/service-charge per Clover's own definitions — replicate Clover's gross/net definitions if we want numbers to match the merchant's dashboard.

**Gross vs. Net (Clover's definitions):** *Gross sales* = revenue excluding tax, surcharges, tips, gratuities, and non-revenue items. *Net sales* = gross adjusted for discounts/refunds (still excluding tax/tips/gratuities). Match these to reconcile with the merchant's Clover reports.

---

## Sample Request

Pull yesterday's orders (with payments and refunds expanded), paginated, for a single merchant using a merchant API token. Example bounds shown for 2026-06-27 00:00:00 → 23:59:59.999 (epoch ms placeholders):

```bash
# startMs = 2026-06-27T00:00:00 local  -> 1750996800000  (example)
# endMs   = 2026-06-27T23:59:59.999    -> 1751083199999  (example)

curl -G "https://api.clover.com/v3/merchants/${MERCHANT_ID}/orders" \
  -H "Authorization: Bearer ${CLOVER_API_TOKEN}" \
  -H "Accept: application/json" \
  -H "User-Agent: CaterGenie-Dashboard/1.0 (integration@catergenie.example)" \
  --data-urlencode "filter=createdTime>=1750996800000" \
  --data-urlencode "filter=createdTime<=1751083199999" \
  --data-urlencode "expand=payments,refunds,lineItems" \
  --data-urlencode "limit=1000" \
  --data-urlencode "offset=0"
```

Payments cross-check:
```bash
curl -G "https://api.clover.com/v3/merchants/${MERCHANT_ID}/payments" \
  -H "Authorization: Bearer ${CLOVER_API_TOKEN}" \
  -H "Accept: application/json" \
  -H "User-Agent: CaterGenie-Dashboard/1.0 (integration@catergenie.example)" \
  --data-urlencode "filter=createdTime>=1750996800000" \
  --data-urlencode "filter=createdTime<=1751083199999" \
  --data-urlencode "expand=order,tender" \
  --data-urlencode "limit=1000"
```

Notes: `User-Agent` is required by Clover. `curl -G` + `--data-urlencode` handles percent-encoding of `>=`/`<=`. Loop `offset` by 1000 until the returned `elements` array is shorter than `limit`.

---

## Sample Response

`GET /orders` (shape; amounts in cents, times in epoch ms):
```json
{
  "elements": [
    {
      "id": "ABC123XYZ4567",
      "currency": "USD",
      "total": 4598,
      "state": "locked",
      "createdTime": 1751002345000,
      "clientCreatedTime": 1751002340000,
      "modifiedTime": 1751002400000,
      "orderType": { "id": "DINEIN1", "label": "Dine In" },
      "lineItems": {
        "elements": [
          { "id": "LI1", "name": "Catering Tray - Lasagna", "price": 3999, "unitQty": 1 },
          { "id": "LI2", "name": "Garden Salad",            "price": 599,  "unitQty": 1 }
        ]
      },
      "payments": {
        "elements": [
          {
            "id": "PAY987",
            "amount": 4598,
            "tipAmount": 600,
            "taxAmount": 0,
            "result": "SUCCESS",
            "createdTime": 1751002350000,
            "tender": { "label": "Credit Card" }
          }
        ]
      },
      "refunds": { "elements": [] }
    }
  ],
  "href": "https://api.clover.com/v3/merchants/.../orders"
}
```

`GET /payments` (shape):
```json
{
  "elements": [
    {
      "id": "PAY987",
      "amount": 4598,
      "tipAmount": 600,
      "taxAmount": 0,
      "cashbackAmount": 0,
      "result": "SUCCESS",
      "createdTime": 1751002350000,
      "modifiedTime": 1751002350000,
      "order":    { "id": "ABC123XYZ4567" },
      "tender":   { "label": "Credit Card", "labelKey": "com.clover.tender.credit_card" },
      "employee": { "id": "EMP1" }
    }
  ]
}
```

Aggregation for the dashboard: count `elements` for transaction/order counts; sum `total` (orders) or `amount` (payments) for gross; subtract refund amounts and apply Clover's tax/tip exclusions for net. All `/100` for dollars.

---

## Required Permissions / Scopes

Clover permissions are **per-resource Read/Write**. For a read-only daily-sales dashboard we need only Read:
- **Merchant — Read** (`MERCHANT_R`) — minimum required for almost everything; gives merchant/timezone/currency context.
- **Orders — Read** (`ORDERS_R`) — to call `GET /orders` and expand line items.
- **Payments — Read** (`PAYMENTS_R`) — to call `GET /payments` and read amounts/tips/refunds.
- (Optional) **Inventory — Read**, **Customers — Read** if we later break down by item or customer.

How these are granted:
- **Merchant API token:** checkboxes selected at token-creation time in the dashboard map directly to these resource permissions.
- **OAuth app:** the same Read permissions are declared in the app's settings; the merchant consents at install. **Gotcha:** changing an OAuth app's permissions after install does **not** take effect until the merchant **uninstalls and reinstalls** — set permissions correctly before the merchant installs.

No Write permissions needed. No PCI-scope card-data permissions needed (we read amounts/results, not PANs).

---

## Recommendation

**Primary approach: Clover Platform REST API (v3), pull `GET /orders` (+ `/payments` for reconciliation), filtered by `createdTime` for yesterday, aggregated in our backend on a daily schedule.**

Auth: start with a **merchant-generated API token** for the single known merchant (lowest friction, no approval gate). Keep the **OAuth v2 app** as the fallback/long-term path if (a) Clover deprecates production merchant tokens, or (b) we go multi-merchant as a product.

Why not the alternatives:
- **CSV export** — manual or email-based, not reliably automatable, and no stable programmatic trigger; brittle for a daily dashboard.
- **Scheduled report** — Clover has no public API to schedule/fetch a report file; dashboard reports aren't exposed as a downloadable API artifact.
- **Direct database** — not available; Clover is fully hosted SaaS, no DB access.
- **Screen scraping** — explicitly excluded; fragile, likely ToS-violating, and unnecessary given a real API.

The REST API is documented, sandboxed, returns exactly the fields we need (amounts in cents, timestamps, order/payment counts), and supports the date filtering required for "yesterday."

---

## Estimated Implementation Effort

Assuming a single cooperative merchant and our backend already has a job scheduler/HTTP client:

| Phase | Effort |
|---|---|
| Sandbox setup, test merchant, generate test token, first successful `GET /orders` | 1–2 hrs |
| Date-window math (merchant TZ → epoch ms), pagination loop (limit/offset), 429 backoff | 2–4 hrs |
| Aggregation logic (gross/net/counts, refunds subtraction, tax/tip exclusion to match Clover) | 2–4 hrs |
| Wire to production: obtain merchant token, store secret, daily scheduled job, persist results | 2–3 hrs |
| Reconcile our numbers vs. merchant's Clover dashboard report; fix definition mismatches | 2–4 hrs |
| **Total (merchant-token path)** | **~0.5–1.5 days** |
| **Add if full OAuth app required** (build app, OAuth + refresh handling, submit for approval, wait on Clover review) | **+2–3.5 days incl. approval wait** |

Approval wait time for an OAuth/private app is the main schedule risk and is outside our control.

---

## Risks & Open Questions

- **Production merchant-token ambiguity (biggest non-technical risk).** Clover docs repeatedly frame merchant-generated API tokens as **sandbox/testing only** and direct production users to OAuth, yet a production "Generate API token" screen exists and Clover's Platform-token docs say merchant tokens call production Platform endpoints. **Action:** validate against the live merchant dashboard early; if Clover blocks or warns, fall back to OAuth. Don't architect so the whole pipeline depends on the shortcut being permanent — isolate auth behind an interface.
- **App approval gate (OAuth path).** Even a private (non-listed) app must be **submitted to and approved by Clover** before production install. Timeline is Clover-controlled. Only relevant if we take the OAuth path.
- **Rate limits.** **16 req/s and 5 concurrent per token; 50 req/s and 10 concurrent per app.** Exceeding → `429` with `X-RateLimit-*` and `Retry-After` headers; Clover requires pause-1s-then-exponential-backoff. A once-daily pull of one day's orders is well within limits, but our pagination loop must honor 429s.
- **90-day query window + 1000-record cap.** Always include a `createdTime` filter; paginate via `limit`(≤1000)+`offset`. A high-volume catering day could exceed 1000 orders → must page.
- **Timezone correctness.** Clover timestamps are epoch ms (UTC-based). "Yesterday" must be computed in the **merchant's local timezone** or counts/totals will straddle day boundaries and won't match the merchant's dashboard. Decide `createdTime` vs `clientCreatedTime` and document it.
- **Gross/net definition drift.** Our aggregates must replicate Clover's gross/net rules (exclude tax/tips/gratuities/service charges; subtract discounts/refunds) or numbers won't reconcile with what the merchant sees. Budget reconciliation time.
- **Refund timing.** A refund booked yesterday may reference an order from days ago — net-sales logic must pull refunds by their own `createdTime`, not assume they share the order's date.
- **Token expiry / refresh (OAuth path).** `access_token` expires in **30 minutes**; must implement refresh-token rotation and store the rotating refresh token. Merchant tokens avoid this.
- **PCI considerations.** Reading order/payment **metadata and amounts** is low-risk; we never touch full PANs (Clover returns only last4/tender labels). No PCI scope increase from this read-only integration, but treat the API token/secret as sensitive credentials (vault, least privilege, rotation).
- **Data freshness.** Fine for a daily ("yesterday") dashboard; orders/payments are queryable shortly after capture. Not designed here for sub-minute real-time (webhooks would be needed for that, which require an app).
- **Open question:** confirm exact field names for the merchant's gross/net as displayed in *their* Clover plan/region, and whether service charges/auto-gratuity for catering appear as `serviceCharge` vs. line items (affects gross calc). Resolve during reconciliation against a known day.

---

## Documentation Links

- API Reference overview: https://docs.clover.com/dev/reference/api-reference-overview
- Use Clover REST API (base URLs, auth): https://docs.clover.com/dev/docs/making-rest-api-calls
- Get all orders (reference): https://docs.clover.com/dev/reference/ordergetorders
- Get all payments: https://docs.clover.com/dev/docs/get-all-payments
- Apply filters to API requests (date filtering syntax): https://docs.clover.com/dev/docs/applying-filters
- Limits on Payments/Orders endpoints (90-day window, 1000 cap): https://docs.clover.com/dev/docs/limits-added-to-calls-to-payments-and-orders-endpoints
- API usage and rate limits (16/s, 50/s, concurrency, 429): https://docs.clover.com/dev/docs/api-usage-rate-limits
- Authenticate with the v2/OAuth flow: https://docs.clover.com/dev/docs/use-oauth
- Generate OAuth expiring (access + refresh) tokens: https://docs.clover.com/dev/docs/generate-expiring-tokens-using-v2-oauth-flow
- OAuth and tokens FAQs (30-min access token, merchant tokens): https://docs.clover.com/dev/docs/oauth-and-tokens-faqs
- Create merchant-specific API token: https://docs.clover.com/dev/docs/gdp-create-merchant-specific-api-token
- Generate a merchant-specific test API token (sandbox): https://docs.clover.com/dev/docs/generate-a-test-api-token
- Use test API tokens in sandbox: https://docs.clover.com/dev/docs/using-api-tokens
- Set app permissions (Read/Write scopes): https://docs.clover.com/dev/docs/permissions
- Work with private apps (approval, install link): https://docs.clover.com/dev/docs/private-apps
- App approval and App Market FAQs: https://docs.clover.com/dev/docs/app-approval-and-app-market-faqs
- Set up an Ecommerce API token (for disambiguation): https://docs.clover.com/dev/docs/setting-up-an-api-token
- AI/OpenAPI docs index: https://docs.clover.com/dev/llms.txt
