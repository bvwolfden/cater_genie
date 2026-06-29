# QuickBooks — Integration Research

_Spike date: 2026-06-28. Researcher: integration engineering. All findings verified against current (2025/2026) Intuit Developer docs and corroborating sources; URLs at the bottom._

## Verdict (TL;DR)
- **Can we integrate?** **Conditional → effectively Yes.** If the client is on **QuickBooks Online (QBO)**, yes — clean documented REST API. If they're on **QuickBooks Desktop**, yes but materially harder (Web Connector / QBXML, on-prem). No screen scraping needed in either case.
- **Recommended approach:** **QBO Accounting REST API** (OAuth 2.0). Pull **current bank/cash balances from the `Account` entity (`CurrentBalance` field) via the SQL-like query endpoint**; use the **Reports API (`ProfitAndLoss`)** only if/when we need sales totals.
- **Confidence:** High for QBO (well-documented, stable API, single known company is the easy case). Medium overall — gated on the one big unknown below.
- **Effort estimate:** ~**2–4 dev-days** for a working QBO read-only balance pull (including OAuth + token refresh + sandbox testing), excluding Intuit production app review (1–3 weeks wall-clock, mostly waiting). **Desktop: roughly 2–4x that**, plus an always-on Windows host.
- **⚠️ Key unknown: Online vs Desktop.** This is a **required client question before any build**. The two products share a brand and almost nothing else technically. Confirm first.

---

## Online vs Desktop (why it matters)

QuickBooks is **two completely different products** with two completely different integration stories:

| | **QuickBooks Online (QBO)** | **QuickBooks Desktop (QBDT)** |
|---|---|---|
| Hosting | Cloud / SaaS | Local install on a Windows machine (or hosted Windows) |
| Integration | Modern **REST API** (JSON), OAuth 2.0 | **QBXML** over **SOAP**, brokered by the **Web Connector** |
| Direction of calls | Your app calls Intuit's cloud | **QuickBooks calls you** — the Web Connector polls *your* SOAP server on a schedule |
| Auth | OAuth 2.0 (access + refresh tokens) | `.qwc` config file + username/password validated by your `authenticate()` method |
| Network | Anywhere | Needs an app/service running on (or reachable from) the machine where QB Desktop runs |
| Real-time? | Yes (on-demand HTTP) | No — batch/poll model; data flows when the Web Connector runs |

> "You're not calling QuickBooks. QuickBooks is calling you." — on the Desktop polling model.

**Implication for a daily-sales dashboard:** QBO is by far the better fit (cloud-to-cloud, on-demand, JSON). Desktop is workable but requires an always-on Windows host running our SOAP service and the Web Connector, which is operationally heavier and a poor match for a hosted dashboard. **We must confirm which product the client runs before estimating firmly.** Many catering/restaurant shops still run Desktop (esp. older Enterprise installs), so do not assume.

---

## Authentication

### QuickBooks Online — OAuth 2.0 (recommended)
QBO uses **OAuth 2.0 exclusively** — no API keys, no basic auth. Flow:

1. **Register an app** on the **Intuit Developer portal** (developer.intuit.com). Free. This yields a **Client ID** and **Client Secret**, plus separate **sandbox** and **production** key pairs.
2. **Authorization Code flow**: redirect the user to Intuit's authorize URL with the requested scope and a CSRF `state`. User signs in and consents; Intuit redirects back with an **authorization code** and the **`realmId`** (the company ID).
3. **Exchange** the code at the token endpoint for an **access token** + **refresh token**.
4. Call the API with `Authorization: Bearer <access_token>` and the `realmId` in the URL path.

**Token longevity (important for ops):**
- **Access token:** valid **60 minutes** (3,600 s).
- **Refresh token:** valid **100 days** of inactivity; **rotates on use** (~every 24h the value changes — you must always persist the latest one). Hard ceiling **5 years**, after which the user must re-authorize.
- A **sandbox company** is auto-provisioned with your developer account for testing against `sandbox-quickbooks.api.intuit.com`.

**Fastest path for a single known company:** Because we control the one company, we don't need a polished consumer OAuth UX. Do the OAuth handshake **once manually** (e.g. via Intuit's OAuth 2.0 Playground or a one-time local callback), capture the refresh token, store it securely, and run a background refresher. From then on the dashboard just refreshes the access token as needed — no user interaction.

### QuickBooks Desktop — Web Connector / QBXML
- You build a **SOAP web service** implementing Intuit's exact method signatures (`authenticate`, `sendRequestXML`, `receiveResponseXML`, `closeConnection`, etc.).
- You ship the client a **`.qwc` file** (app metadata + your SOAP endpoint URL). They import it into the **QuickBooks Web Connector** app and enter a password.
- The Web Connector then **polls your service** on a schedule (or on demand), passing **QBXML** request/response payloads. Because the Web Connector runs on the same machine as QuickBooks, **no inbound firewall ports** to QB are needed.
- Auth is effectively: the `.qwc` ties to a username; your `authenticate()` validates the password and returns a session ticket.

**Which is fastest for a single known company?** **QBO, decisively.** One manual OAuth handshake and we're reading JSON. Desktop requires standing up and hosting a SOAP server, generating/installing a `.qwc`, and coordinating the Web Connector on the client's machine.

---

## API Overview

- **QBO Accounting API**: **public, fully documented, REST/JSON.** Requires **creating an app** on the Intuit Developer portal to obtain OAuth credentials. SDKs exist (Node, .NET, Java, PHP, Python, Ruby) but raw HTTP is straightforward.
- **App review / production keys:** Sandbox keys work immediately. To use **production** credentials, Intuit requires an **app assessment** — a security questionnaire (how you store tokens, data retention), a use-case review (what the app does, which scopes), and possibly a demo. **Typically 1–3 weeks wall-clock.**
  - **Single-company caveat / unknown:** Intuit's heavyweight review is aimed at apps **published to the App Store / used by many customers**. For a **single internal company** you are not listing publicly, the review burden is generally lighter, but **you still need production keys to hit the production company**, and Intuit may still require the assessment. **Confirm the exact current gate during the spike** — budget for the 1–3 week review as the conservative case. Sandbox can be used to build/validate everything in parallel while approval is pending.
- **Rate limits (QBO):** ~**500 requests/min per company (realmId)**, **40 concurrent**, batch max 30 entities. A daily dashboard is nowhere near these. Throttling returns **HTTP 429** → use exponential backoff.

> **⚠️ 2026 Reports API change (build-affecting):** Intuit is migrating the QBO **Reports API** to its modernized reporting service; **after June 30, 2026** all report responses flow through the new system and **response structure, fields, row order, and grouping may change**, and **only documented reports/endpoints remain supported**. **Balance Sheet, Profit & Loss, Cash Flow, General Ledger, and Trial Balance remain supported** (good — those are the ones we'd use). Many list/detail reports are at risk. **Mitigation:** prefer the **`Account` entity for balances** (entity API, not affected) and pin a `minorversion`; if we use the Reports API for sales, code defensively against the report JSON and re-test after the cutover.

---

## Base URLs

- **Production:** `https://quickbooks.api.intuit.com/v3/company/{realmId}/`
- **Sandbox:** `https://sandbox-quickbooks.api.intuit.com/v3/company/{realmId}/`
- **OAuth (both):** authorize at `https://appcenter.intuit.com/connect/oauth2`; token exchange at `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer`.
- **Query endpoint:** `GET /v3/company/{realmId}/query?query=<SQL-like>`
- **Reports endpoint:** `GET /v3/company/{realmId}/reports/{ReportName}` (e.g. `BalanceSheet`, `ProfitAndLoss`, `TrialBalance`)
- Always send `Accept: application/json` and pin a `minorversion` (e.g. `minorversion=75`) for response stability.

---

## Getting Account Balances (Account entity vs Reports API)

There are two ways to get balances. **For "current cash/bank balances", use the `Account` entity, not the Reports API.**

### Option A — `Account` entity via the query endpoint ✅ (recommended for balances)
- Every balance-sheet account (Bank, Credit Card, etc.) exposes a **`CurrentBalance`** field, plus **`CurrentBalanceWithSubAccounts`** (rolls up child accounts).
- Filter to cash/bank with `AccountType = 'Bank'`.
- This is a normal entity read — **simple, flat JSON, fast, and unaffected by the 2026 Reports API migration**.
- Query (URL-encode in practice):
  `SELECT * FROM Account WHERE AccountType = 'Bank'`
  or `SELECT Id, Name, AccountType, CurrentBalance, CurrentBalanceWithSubAccounts FROM Account`

### Option B — Reports API `BalanceSheet`
- `GET /reports/BalanceSheet` returns the full balance sheet as a **nested `Header`/`Rows`/`Row`/`ColData` tree** (mirrors the QBO UI report). Good if we want a formatted statement, but **overkill and awkward to parse for "what's in the checking account right now."**
- Subject to the **June 30 2026** response-shape changes noted above.

**Recommendation: Option A (`Account` entity).** It directly answers "current bank/cash balances," returns clean key/value JSON, and is the most robust choice for a dashboard tile. Note the freshness caveat in Risks: `CurrentBalance` reflects what has been **entered and reconciled** in QuickBooks, not necessarily today's real-time bank balance.

---

## Getting Sales Totals (if needed)
For sales/revenue (not balances):
- **`ProfitAndLoss` report**: `GET /v3/company/{realmId}/reports/ProfitAndLoss?start_date=2026-06-28&end_date=2026-06-28` → Income/total revenue rows for the period. Supports `start_date`/`end_date`/`summarize_column_by` (e.g. `Days`) for a daily-sales trend. (Remains supported post-2026 migration.)
- **Entity-level alternative:** query `Invoice` / `SalesReceipt` entities and sum `TotalAmt` for a date range via the query endpoint (e.g. `SELECT * FROM SalesReceipt WHERE TxnDate = '2026-06-28'`). More work but avoids the Reports API entirely.
- Also useful: `TrialBalance` report for a per-account snapshot.

---

## Sample Request

**A. Current bank balances via the `Account` entity (recommended):**
```bash
curl -X GET \
  "https://quickbooks.api.intuit.com/v3/company/1234567890/query?query=SELECT%20Id,Name,AccountType,CurrentBalance,CurrentBalanceWithSubAccounts%20FROM%20Account%20WHERE%20AccountType%20%3D%20'Bank'&minorversion=75" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Accept: application/json"
```
(`1234567890` = the company's `realmId`. Use `sandbox-quickbooks.api.intuit.com` during development.)

**B. Balance sheet report (alternative):**
```bash
curl -X GET \
  "https://quickbooks.api.intuit.com/v3/company/1234567890/reports/BalanceSheet?minorversion=75" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Accept: application/json"
```

**C. Refreshing the access token (run before the 60-min expiry):**
```bash
curl -X POST "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer" \
  -H "Authorization: Basic <base64(client_id:client_secret)>" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token&refresh_token=<CURRENT_REFRESH_TOKEN>"
# Response returns a NEW access_token AND a NEW refresh_token — persist both.
```

---

## Sample Response

**A. `Account` entity query (the shape we'd build the dashboard on):**
```json
{
  "QueryResponse": {
    "startPosition": 1,
    "maxResults": 2,
    "Account": [
      {
        "Id": "35",
        "Name": "Checking",
        "AccountType": "Bank",
        "AccountSubType": "Checking",
        "CurrentBalance": 5000.00,
        "CurrentBalanceWithSubAccounts": 5000.00,
        "CurrencyRef": { "value": "USD", "name": "United States Dollar" },
        "Active": true,
        "Classification": "Asset",
        "MetaData": {
          "CreateTime": "2024-01-15T09:12:00-08:00",
          "LastUpdatedTime": "2026-06-27T18:03:41-07:00"
        }
      },
      {
        "Id": "36",
        "Name": "Savings",
        "AccountType": "Bank",
        "AccountSubType": "Savings",
        "CurrentBalance": 12000.00,
        "CurrentBalanceWithSubAccounts": 12000.00,
        "CurrencyRef": { "value": "USD" },
        "Active": true,
        "Classification": "Asset"
      }
    ]
  },
  "time": "2026-06-28T10:15:22.123-07:00"
}
```

**B. `BalanceSheet` report (nested — note why it's harder to parse):**
```json
{
  "Header": {
    "ReportName": "BalanceSheet",
    "StartPeriod": "2026-01-01",
    "EndPeriod": "2026-06-28",
    "Currency": "USD"
  },
  "Columns": { "Column": [ { "ColTitle": "" }, { "ColTitle": "Total" } ] },
  "Rows": {
    "Row": [
      {
        "Header": { "ColData": [ { "value": "Bank Accounts" } ] },
        "Rows": {
          "Row": [
            { "ColData": [ { "value": "Checking", "id": "35" }, { "value": "5000.00" } ] },
            { "ColData": [ { "value": "Savings",  "id": "36" }, { "value": "12000.00" } ] }
          ]
        },
        "Summary": { "ColData": [ { "value": "Total Bank Accounts" }, { "value": "17000.00" } ] },
        "type": "Section"
      }
    ]
  }
}
```

---

## Required Permissions / Scopes
- **`com.intuit.quickbooks.accounting`** — read/write access to accounting data. **This is the only scope we need** for accounts, balances, and reports. (We only need read access functionally, but this is the granularity Intuit offers.)
- `openid profile email` — only if we want Intuit sign-in / user identity (not required for a server-to-server data pull).
- `com.intuit.quickbooks.payment` — QuickBooks Payments only; **not needed**.

---

## Recommendation

**Primary approach: QBO Accounting REST API (read-only), pulling balances from the `Account` entity.** (Assumes QBO; Desktop fallback below.)

Rationale vs. alternatives:
- **API (chosen):** Official, documented, JSON, on-demand, exact data, no fragile parsing. Best fit for a live dashboard. `Account.CurrentBalance` gives bank/cash balances directly; `ProfitAndLoss` covers sales if needed.
- **CSV export:** Manual or semi-manual, stale, no clean automation hook for "current" balances. Reject.
- **Scheduled report (emailed/exported):** Better than CSV but still batch, brittle, and parsing-heavy. Reject for primary use.
- **Direct database:** QBO has **no customer-accessible database**; not an option. (Desktop has a proprietary local file, also not a supported integration surface.)
- **Screen scraping:** Explicitly avoided — brittle, against ToS, breaks on UI changes.

**Concrete build:** one-time OAuth handshake for the single company → store + auto-rotate the refresh token → on dashboard load (or a cron a few times/day), refresh the access token if near expiry and `GET .../query?query=SELECT ... FROM Account WHERE AccountType='Bank'`. Cache the result so we're not hammering the API.

**Desktop fallback (if client confirms Desktop):** Build a small **SOAP/QBXML service + Web Connector** deployment, or — strongly preferred to save time — use a **third-party unified connector (e.g. Conductor, Apideck)** that wraps the Web Connector/QBXML and exposes a modern REST/JSON API. This trades a vendor fee for avoiding weeks of SOAP/QBXML plumbing and an always-on Windows host.

---

## Estimated Implementation Effort

**QuickBooks Online (read-only balance pull):**
- Intuit app registration + sandbox setup: ~0.5 day
- OAuth handshake + token storage + auto-refresh/rotation: ~1 day
- Account-balance query + parse + dashboard wiring: ~0.5–1 day
- Sales totals (P&L or invoice/sales-receipt query), if in scope: +0.5–1 day
- Error handling, backoff, caching, secrets management: ~0.5 day
- **Total: ~2–4 dev-days of engineering.**
- **Plus wall-clock:** **Intuit production app review ~1–3 weeks** (do it in parallel; build entirely in sandbox meanwhile).

**QuickBooks Desktop:** **materially harder — roughly 2–4x** the QBO effort if built natively (SOAP server, QBXML request/response mapping, `.qwc` provisioning, Web Connector scheduling, an always-on Windows host, client-side coordination). Using a third-party connector cuts the engineering but adds vendor cost, onboarding, and a recurring dependency. Either way, plan for **noticeably more time and more moving parts** than QBO.

---

## Risks & Open Questions

1. **⚠️ Online vs Desktop (biggest unknown):** Entire architecture and effort hinge on this. **Required client question before committing.** Don't assume Online.
2. **Token refresh management:** Refresh tokens **rotate on use** and **expire after 100 days of inactivity** (hard cap 5 years). We must persist the **latest** refresh token atomically every time; losing it forces a manual re-auth. A daily job keeps it warm, but build robust storage + alerting.
3. **Production app review / approval:** Production keys gated behind Intuit's assessment (security questionnaire, use-case review, possible demo), ~1–3 weeks. Could delay go-live even though the single-company use case is simple. Start it early; build in sandbox.
4. **2026 Reports API migration (June 30, 2026 — already past as of this spike's 2026-06-28 date):** Report JSON **structure/fields/ordering may have changed** and only documented reports remain supported. **Balances via the `Account` entity sidestep this entirely** — another reason to prefer Option A. If we use any report (P&L for sales), validate against current responses, not old samples.
5. **Data freshness / meaning of "current":** `CurrentBalance` reflects **what has been entered and reconciled in QuickBooks**, which can **lag the real bank balance** (unentered transactions, pending reconciliation). For a daily-sales dashboard, set expectations: this is the **books** balance, not a live bank feed. If true real-time cash is required, a bank/Plaid feed is a separate concern.
6. **Single point of auth:** One company, one token chain. Document the re-authorization runbook so a token loss doesn't become an outage with no recovery path.
7. **Rate limits:** Generous (500/min/company) — low risk for a dashboard, but implement 429 backoff anyway.

---

## Documentation Links
- Authorization & authentication overview — https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization
- Set up OAuth 2.0 — https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0
- OAuth 2.0 / authorization FAQ (token longevity) — https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/faq
- Account entity API reference (`CurrentBalance`) — https://developer.intuit.com/app/developer/qbo/docs/api/accounting/most-commonly-used/account
- BalanceSheet report reference — https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/balancesheet
- Run reports workflow — https://developer.intuit.com/app/developer/qbo/docs/workflows/run-reports
- REST API features / query language & data formats — https://developer.intuit.com/app/developer/qbo/docs/learn/rest-api-features
- Create basic requests (base URLs, headers) — https://developer.intuit.com/app/developer/qbo/docs/get-started/create-a-request
- Technical requirements for publishing an app (production review) — https://developer.intuit.com/app/developer/qbo/docs/go-live/publish-app/technical-requirements
- QuickBooks Desktop API reference (QBXML) — https://developer.intuit.com/app/developer/qbdesktop/docs/api-reference/qbdesktop
- Reports requestable via the Desktop SDK — https://developer.intuit.com/app/developer/qbdesktop/docs/additional-reference/reports-that-can-be-requested-with-the-sdk
- 2026 Reports API change (independent analysis) — https://g-accon.com/quickbooks-online-reports-api-is-changing/
- QBO API guide w/ base URLs, scopes, rate limits (independent) — https://satvasolutions.com/blog/quickbooks-online-api-guide
- QuickBooks API developer's guide 2026 (independent) — https://dev.to/zuplo/quickbooks-api-complete-developers-guide-2026-3l77
- Building a QuickBooks Desktop integration in 2025/2026 (independent) — https://www.apideck.com/blog/build-an-integration-with-quickbooks-desktop-in-2025
