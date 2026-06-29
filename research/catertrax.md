# CaterTrax — Integration Research

> Research date: 2026-06-28. Conducted as a time-boxed integration spike for a daily-sales dashboard.
> Goal: pull **yesterday's corporate catering/delivery sales** (order totals, order counts, by day) out of CaterTrax.

## Verdict (TL;DR)
- **Can we integrate?** **Conditional — YES, but not via a self-serve API.** There is **no public/documented API**. The realistic path is a vendor-coordinated **data feed / report export** (scheduled report email or SFTP/flat-file export), built by CaterTrax Professional Services, OR — fallback — parsing the built-in CaterTrax reports/admin exports.
- **Recommended approach:** **Scheduled/automated report export** out of the CaterTrax management console (CommandCentre/TraxCentre), delivered as **CSV/Excel** — either pulled by an admin or, better, configured by CaterTrax Professional Services to drop daily to **email or SFTP**. Treat this as a vendor-coordinated effort, not a code-first integration.
- **Confidence:** **Medium** on "a usable reporting/export exists" (multiple sources confirm reporting + import/export). **Low** on the exact mechanism/format/automation, because none of it is publicly documented — it must be confirmed with the vendor and with the client's actual admin login.
- **Effort estimate:** **2–6 weeks elapsed**, of which only ~3–8 engineering days. The long pole is **vendor + client coordination**, not code.
- **⚠️ Biggest blocker:** **No public API and no public docs.** Everything depends on (a) what the *client's specific CaterTrax instance/role* can export, and (b) a **vendor conversation** with CaterTrax Professional Services for any automated feed. This is the integration most likely to slip the timeline because we cannot self-serve or fully validate it without client credentials + a vendor SOW.

---

## Ownership & Platform Background

**Important correction to the project's stated assumption.** CaterTrax is **NOT owned by Compass Group / Foodbuy.** Compass Group (and Sodexo, Aramark, Guckenheimer) are **customers** of CaterTrax, not its owner.

- CaterTrax (legal entity: **Hospitality 101, Inc.**, Rochester, NY) was **acquired on 2017-11-14 by Volaris Group**, a division of **Constellation Software Inc.** (TSX: CSU) — a serial acquirer of vertical-market software companies.
  - https://catertrax.com/highlight/volaris-group-constellation-software-company-completes-acquisition-hospitality-101-inc/
  - https://www.crunchbase.com/acquisition/volaris-group-acquires-catertrax--7f023a23
  - https://rocgrowth.com/archives/2041
- **Why this matters for us:** Partner/API access does **not** route through Compass/Foodbuy. It routes through **CaterTrax directly** (a Volaris/Constellation operating company). Constellation/Volaris companies are typically run lean, profit-focused, and conservative about opening platforms — they are unlikely to have an open public API and likely to monetize integration work as billable Professional Services. Set expectations accordingly: this will be a "talk to your account team / scope a services engagement" situation, not a "grab an API key" situation.

**What the platform is:** Market-leading web-based catering & hospitality ordering platform for foodservice operators. Claims 5,000+ client locations, 5M+ orders/year, used by Sodexo, Compass Group, Guckenheimer, Aramark. Two tiers: **Independent** (single/small multi-site) and **Enterprise** (multi-location, centralized reporting, approvals, "system integrations").
- https://www.catertrax.com/
- https://www.catertrax.com/enterprise

**Console/portal names observed (relevant for auth & where reports live):**
- **CommandCentre** — the management/admin console (e.g., https://commandcentre.catertrax.com/, https://commandcentre.catertrax.co.uk/).
- **TraxCentre** — login portal (https://traxcentre.catertrax.com/).
- Per-client ordering sites live on subdomains, e.g. `https://syracuse.catertrax.com/`, `https://southalabamacatering.catertrax.com/`, and white-labeled paths under client domains.

---

## Does an API Exist?

**No public or documented API was found.** Investigated thoroughly:

- **No developer portal, no `/api`, no `api.catertrax.*`, no OpenAPI/Swagger, no REST/GraphQL docs** discoverable via search.
- **Not listed on RapidAPI, not on GitHub** (no SDKs, no community wrappers, no endpoint references).
- **Third-party software directories do not list "API" as a feature.** GetApp's feature list for CaterTrax does **not** include "API." (https://www.getapp.com/hospitality-travel-software/a/catertrax/features/). Capterra's feature/review pages likewise surface reporting but **no API/integration/webhook** capability. (https://www.capterra.com/p/6182/CaterTrax/)
- **What does exist is "integration" via Professional Services, not a developer API.** CaterTrax markets that it "integrates with systems that enterprise organizations already rely on, including point of sale platforms, accounting and enterprise resource planning systems, identity management, and custom integrations" (https://www.catertrax.com/enterprise). Marketing/snippets also reference interfacing with **purchase-order systems (Ariba, JAGGAER, Coupa)** and **payment gateways**. These read as **bespoke, professional-services-built integrations** — likely flat-file/PO/punch-out style — not a documented, self-serve API surface.

**Bottom line:** Assume **no API** for planning purposes. If an internal/partner API exists, it is undocumented and gated behind a vendor conversation + likely an NDA/SOW. Do not build the project plan around the existence of an API.

---

## Authentication

There is no API, so there are no published API auth methods (no OAuth/API keys documented).

**Management console (CommandCentre / TraxCentre) auth — what we observed:**
- **Username (email) + password**, with standard email-based password reset. The TraxCentre and CommandCentre login/reset flows are plain credential-based ("To reset your password, enter the email address you use to sign in to TRAX Centre").
  - https://traxcentre.catertrax.com/
  - https://commandcentre.catertrax.com/
- **End-user ordering sites** use Last Name + Email + Password (per client admin manuals, e.g. Syracuse: https://campusdining.syr.edu/wp-content/uploads/Manage_ExisitingOrders.pdf).
- **Enterprise SSO (SAML) is supported.** CaterTrax can be an SP for SAML SSO — confirmed by a third-party IdP (Finalsite) documenting CaterTrax SAML SSO with provisioning options, and by CaterTrax's own "identity management" integration claim on the Enterprise page.
  - https://www.finalsitesupport.com/hc/en-us/articles/115001338367-Authentications-and-Single-Sign-On-Options-SSOs- (CaterTrax listed among SAML SSO targets)
  - https://www.catertrax.com/enterprise (mentions "identity management" integrations)

**Implication for automation:** Any "screen-scrape" or headless-login approach would have to handle plain credential login **or** the client's SSO/SAML flow — the latter is materially harder to automate and often blocked by IdP MFA. This is one more reason to prefer a **vendor-delivered push feed (email/SFTP)** over pulling via the UI.

---

## Alternative Data-Out Paths (ranked)

Ranked best → worst for getting **yesterday's catering sales (totals + counts, by day)**:

1. **(b/a) Built-in reports exported to CSV/Excel — manual or scheduled.** ✅ *Most realistic.*
   CaterTrax explicitly has reporting ("run aggregate and tailored reports," "real-time site-level and enterprise-wide reporting for sales, production, waste, and adoption") and explicitly supports **import/export of data** within the TRAX platform. A daily sales report filtered to "yesterday," exported as CSV/Excel, is squarely within documented capability. The open question is **automation** (can it be scheduled+emailed, or must an admin click export?).
   - https://www.catertrax.com/enterprise
   - https://www.getapp.com/hospitality-travel-software/a/catertrax/features/ ("Customizable reports," "Reporting & statistics")

2. **(d) SFTP / scheduled flat-file feed built by Professional Services.** ✅ *Best for production, but vendor-gated.*
   Given CaterTrax already builds flat-file/PO integrations (Ariba/JAGGAER/Coupa) and ERP/accounting integrations via Professional Services, a recurring **CSV-over-SFTP export of order/sales data** is plausible as a paid services engagement. This is the cleanest automated path **if** the client is willing to pay for the build and CaterTrax will scope it. Requires a vendor SOW.

3. **(e) Order-confirmation / notification email parsing.** ⚠️ *Possible fallback, fragile.*
   Confirmation emails definitely exist (end-user manuals reference "Request Changes link found in your confirmation email"). Admin/manager order notification emails likely also exist. We could route these to a mailbox and parse them for per-order totals, then aggregate daily. Downsides: per-order (not daily-summary) granularity, brittle HTML parsing, easily broken by template changes, and may not capture every revenue event (changes, cancellations, manual orders).
   - https://eurestcafes.compass-usa.com/MetLife/Documents/Catertrax%20Manual.pdf

4. **(c) Direct database access.** ❌ *Effectively unavailable.*
   Multi-tenant SaaS hosted by CaterTrax. No indication of customer DB access. Do not plan on this.

5. **(f) Screen scraping the admin console.** ❌ *Last resort only.*
   Technically possible against credential login, but fragile, ToS-risky, and badly complicated if the client uses **SAML SSO + MFA**. Avoid unless every other path fails.

---

## Reporting Capabilities

What's confirmed publicly (vendor marketing + third-party directories + reviews):
- **Reports exist and are a selling point.** "Run aggregate and tailored reports to monitor trends, efficiencies, and overall business performance." Enterprise tier: "Real-time site-level and enterprise-wide reporting for sales, production, waste, and adoption without manual reconciliation."
  - https://www.catertrax.com/enterprise
- **Report features per directories:** "Customizable reports," "Reporting & statistics," "Real-Time data," "Configurable date ranges, sales tracking, and budget visibility," "Customizable reports for financial reconciliations, spending, and past-order analysis." Users report pulling reports "weekly and monthly" for financial reporting and being able to "alter the layout and content of reports."
  - https://www.getapp.com/hospitality-travel-software/a/catertrax/features/
  - https://www.capterra.com/p/6182/CaterTrax/
- **Known limitation from reviews:** some users find "report navigation limited and want deeper filters, customer-specific views, or more editable custom reports." So out-of-the-box report shapes may not perfectly match "yesterday's corporate delivery sales" and may need configuration.

**Can reports be auto-scheduled and emailed, and in what format?** **UNCONFIRMED.** Public docs confirm reports + export but do **not** confirm a scheduler that emails CSV/Excel/PDF on a daily cron. **This is the single most important thing to verify** with the vendor or via the client's admin login. Likely formats if export exists: **CSV / Excel (.xlsx)**, possibly **PDF** for formatted reports.

---

## Vendor Contact Path

This will require a vendor conversation. Realistic paths:
- **Existing client's CaterTrax account team / Client Success.** If our client is already a CaterTrax customer (very likely for this dashboard project), they have a Client Success contact / Site Build Specialist. Route integration/export requests through them first — fastest path.
- **CaterTrax Support:** **support@catertrax.com**, **1-800-975-8729**, Mon–Fri 8:30 AM–6:00 PM ET. Admins can also file a ticket in-console (the "life jacket" icon).
- **Sales / Professional Services:** **marketing@catertrax.com** for sales inquiries; **Professional Services** is the team that builds custom integrations / data feeds (POS, ERP, PO systems). Any SFTP/automated feed will be scoped here, almost certainly as **billable services**.
  - Contact/general: https://catertrax.com/contact-us/ and https://catertrax.com/sales-form/
- **Status/trust page** (useful for diligence on uptime/security posture): https://trust.catertrax.com

**Flag for the client:** We almost certainly need the client to (1) grant us an admin/reporting role in their CaterTrax instance and (2) sponsor/authorize any Professional Services request (and budget) for an automated feed. We cannot initiate this purely as a third party.

---

## Sample Request/Response (or likely export schema)

No documented API → no real request/response sample exists. Below is a **realistic, illustrative** schema of the most likely data-out artifact: a **daily catering-orders CSV export** from the CaterTrax management console. Treat column names as representative, not authoritative — confirm against an actual export.

**Likely daily orders export (`catering_orders_YYYYMMDD.csv`):**
```
order_id,confirmation_number,order_date,event_date,delivery_date,status,
order_type,location_site,department,customer_name,customer_email,cost_center,
po_number,payment_method,subtotal,tax,delivery_fee,gratuity,discount,total,
guest_count,item_count,placed_by,created_at,modified_at
```
Example row:
```
1048576,CT-2026-0048213,2026-06-27,2026-06-28,2026-06-28,Confirmed,
Delivery,HQ-Cafe-3,Corporate Sales,"Jane Doe",jane.doe@client.com,CC-4412,
PO-99812,Invoice,842.50,71.61,35.00,0.00,0.00,949.11,
40,12,admin.user,2026-06-27T09:14:03Z,2026-06-27T16:02:55Z
```

**Daily aggregate the dashboard actually needs** (derive from the row-level export, or request a summary report):
```
business_date,location_site,order_count,gross_sales,net_sales,avg_order_value
2026-06-27,HQ-Cafe-3,37,18420.55,17110.00,497.85
```

If instead we go the **email-parsing** route, the artifact is an HTML order-confirmation email per order containing confirmation #, event date, line items, and an order total — aggregated by us into the daily summary above.

---

## Recommendation

**Primary approach: Scheduled CSV/Excel report export from the CaterTrax management console, delivered to us automatically (email or SFTP), configured with CaterTrax Professional Services.**

Concretely, pursue in this order:
1. **Get client admin access** to their CaterTrax console (CommandCentre/TraxCentre) and **inspect the Reports section live.** Determine: (a) is there a sales/orders report that can be filtered to "yesterday," (b) can it export CSV/Excel, (c) can it be **scheduled + emailed**.
2. **If scheduled email export exists:** point it at a dedicated ingest mailbox, and have our pipeline fetch + parse the attachment daily. **This is the lowest-risk, lowest-cost outcome — no vendor build required.**
3. **If only manual export exists:** open a **Professional Services** request (via the client's account team) to set up a **recurring CSV-over-SFTP (or scheduled-email) data feed** of order/sales data. Budget for billable services + lead time.
4. **Avoid screen scraping.** Only fall back to (e) email-parsing of order confirmations if both above stall — and treat that as interim.

**Do NOT** plan around an API. **Do NOT** plan around direct DB access.

---

## Estimated Implementation Effort

| Path | Eng effort | Elapsed time | Notes |
|---|---|---|---|
| Scheduled report email already available in console | 2–4 days | **1–2 weeks** | Mailbox + attachment parser + daily aggregation. Cheapest. Gated only on client admin access. |
| Professional Services SFTP/scheduled feed | 3–6 days our side | **3–6 weeks** | Long pole is **vendor SOW + scheduling + their build**. Billable services + lead time. |
| Manual export + RPA/operator-assisted | 2–3 days | 1–2 weeks | Brittle; needs someone to run it or scripted login (hard with SSO/MFA). |
| Email-confirmation parsing (fallback) | 4–8 days | 2–3 weeks | Fragile parser, per-order granularity, ongoing maintenance. |
| Screen scraping (last resort) | 5–10 days | 2–4 weeks | High maintenance + ToS/SSO/MFA risk. Avoid. |

**Planning number to carry forward: 2–6 weeks elapsed, dominated by vendor + client coordination, not engineering.** The engineering itself is small once we have a reliable file landing somewhere.

---

## Risks & Open Questions

**This is the highest-risk integration in the project. Be explicit with stakeholders.**

- **No API, no docs (highest risk).** We cannot self-serve, prototype, or fully validate without client credentials and/or a vendor conversation. Everything below is unconfirmed until then.
- **Scheduling/automation is unconfirmed.** Reports + export are confirmed; **automatic scheduled delivery is not.** If exports are manual-only, we are forced into either a paid vendor feed or fragile RPA/email-parsing.
- **Report shape may not match "corporate delivery sales."** Reviews flag limited filters/custom views. The exact "yesterday's corporate catering/delivery sales, totals + counts by day" cut may require report configuration (possibly Professional Services).
- **Vendor is a Constellation/Volaris company.** Expect conservative platform access and a **billable services** posture for any custom feed. Lead times and cost are real and not in our control.
- **Auth complications for any UI-based pull.** If the client uses **SAML SSO + MFA**, automated/headless login is hard or infeasible — pushing us toward a vendor push-feed.
- **Client dependency.** We need the client to grant admin/reporting access and to authorize/fund any vendor work. If the client is slow, this integration stalls.
- **Data completeness/semantics.** Need to confirm the export captures the right revenue events (delivery vs pickup vs floor-stock, taxes/fees/gratuity inclusion, cancellations/changes, multi-location scoping, timezone of "business date").
- **Multi-instance reality.** Large operators (Compass/Sodexo/Aramark) run many CaterTrax subdomains. If the client spans multiple sites/subdomains, we may need multiple feeds or an enterprise-level rollup report.

---

## What We Need to Confirm With Client/Vendor

**With the client (first — fastest, free):**
1. Is the client an existing CaterTrax customer, on **Independent or Enterprise** tier? (Enterprise has the centralized reporting we want.)
2. Can they grant us (or a service account) an **admin/reporting role** in their CaterTrax console? Which portal — CommandCentre and/or TraxCentre — and what URL/subdomain(s)?
3. Do they log in with **plain credentials or SSO/SAML (+MFA)**? (Determines whether any UI automation is even feasible.)
4. How many sites/subdomains does their footprint span (single rollup vs many)?
5. Who is their **CaterTrax Client Success / account contact**, and will they sponsor a Professional Services request (and budget)?

**With CaterTrax (via the client's account team / Professional Services):**
6. **Does the management console support SCHEDULED reports emailed automatically (CSV/Excel/PDF)?** ← the pivotal question.
7. Is there **any** API or partner integration program (even undocumented/NDA)? Webhooks?
8. Can Professional Services set up a **recurring CSV-over-SFTP (or scheduled email) order/sales feed**? What's the **scope, cost, and lead time**?
9. What **fields** are available in the order/sales export, and what are the exact semantics (revenue components, order types, cancellations, timezone/business-date definition)?
10. Any contractual/ToS constraints on automated access, scraping, or third-party data extraction.

---

## Documentation Links

**Ownership / background**
- CaterTrax joins Volaris Group (official): https://catertrax.com/highlight/volaris-group-constellation-software-company-completes-acquisition-hospitality-101-inc/
- Crunchbase acquisition (Volaris acquires CaterTrax, 2017-11-14): https://www.crunchbase.com/acquisition/volaris-group-acquires-catertrax--7f023a23
- RocGrowth — Volaris acquires CaterTrax: https://rocgrowth.com/archives/2041

**Product / reporting / integration claims**
- CaterTrax home: https://www.catertrax.com/
- CaterTrax Enterprise (reporting + "system integrations" + "identity management"): https://www.catertrax.com/enterprise
- GetApp features (note: **no "API"** listed): https://www.getapp.com/hospitality-travel-software/a/catertrax/features/
- Capterra (reporting features; review-noted report-filter limits): https://www.capterra.com/p/6182/CaterTrax/

**Portals / auth**
- CommandCentre (admin/management console): https://commandcentre.catertrax.com/ (and UK: https://commandcentre.catertrax.co.uk/)
- TraxCentre login: https://traxcentre.catertrax.com/
- SAML SSO support (3rd-party IdP listing CaterTrax): https://www.finalsitesupport.com/hc/en-us/articles/115001338367-Authentications-and-Single-Sign-On-Options-SSOs-

**Client-facing manuals (confirm order/email/reporting behavior in the wild)**
- Compass/MetLife CaterTrax end-user ordering manual (confirmation emails): https://eurestcafes.compass-usa.com/MetLife/Documents/Catertrax%20Manual.pdf
- Syracuse "Manage Existing Orders in CaterTrax" admin/user guide: https://campusdining.syr.edu/wp-content/uploads/Manage_ExisitingOrders.pdf

**Vendor contact / status**
- Contact: https://catertrax.com/contact-us/ — Support: support@catertrax.com / 1-800-975-8729 (Mon–Fri 8:30a–6:00p ET) — Sales: marketing@catertrax.com
- Sales form: https://catertrax.com/sales-form/
- Trust/status page: https://trust.catertrax.com
