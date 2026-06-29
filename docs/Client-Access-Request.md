# CaterGenie — Data & Access Request

**For:** Bistro To Go
**Purpose:** To automate the daily dashboard and turn the projected/"forecast" views (sales, labor, cash, and the 2-week coverage & capacity planning) into **live data**, we need **read-only** access to the systems you already use. Nothing below changes how those systems work — we only read from them.

Most items are quick (a token or a confirmation). **CaterTrax is the one that needs a short vendor conversation**, so it's worth starting first.

---

## Priority at a glance

| # | System | What it powers | What we need | Effort |
|---|---|---|---|---|
| 1 | **When I Work** | Labor hours, schedules, coverage planning | Developer API key + admin OK | ~1 email, then quick |
| 2 | **CaterTrax** | Corporate delivery sales + upcoming orders | Reporting login + scheduled export (vendor) | Vendor step — start now |
| 3 | **QuickBooks** | Cash position, account balances | Confirm Online vs Desktop, then connect | Quick once confirmed |
| 4 | **Clover** | Retail / café sales | Merchant API token | ~5 minutes |
| 5 | **Caterease** | Event/wedding bookings (catering) | Reporting/export access | Quick–moderate |

---

## 1. When I Work — labor, schedules, time-off  *(highest priority)*

**Powers:** daily labor hours & cost, the **2-week capacity-vs-demand coverage view**, time-off planning, and employee flags.

**What we need:**
- **A developer API key.** This is *not* the same as the regular login — When I Work issues it on request to an **account Admin**. Please email their support (or your account rep) from the Admin account and ask:
  > "We're integrating When I Work with an internal reporting/scheduling dashboard. Please issue a **developer API key** for our account."
- Confirmation of which **plan tier** you're on (time-clock/attendance is included on paid plans; we want to be sure scheduling is enabled).
- Access to **published schedules and time-off/PTO** (these come with the API key, but confirm scheduling is in use).

**Why it matters:** This is the single biggest unlock — it turns the *projected* coverage, capacity, and "actual vs scheduled hours" views into **real** ones, and gives us the time-clock history needed for meaningful employee anomaly detection.

---

## 2. CaterTrax — corporate delivery sales & orders  *(start this first; it's the slow one)*

**Powers:** the **delivery** slice of daily sales, and **upcoming delivery orders** for coverage planning.

**The situation:** CaterTrax has **no public API**, so the clean path is a **scheduled report export** delivered to us automatically (CSV/Excel by email or SFTP). That's typically set up by **CaterTrax's team** (they're owned by Volaris/Constellation), so it usually involves a short request — possibly billable.

**What we need:**
- ✅ **Reporting login — already provided.** We can review the available reports in your instance (`bistrotogo.catertrax.com`).
- A short note to your **CaterTrax account manager / support** asking:
  > "Can we set up a **scheduled Sales report export** (daily or weekly, CSV/Excel) delivered by email or SFTP? We also want an **orders/bookings export** covering upcoming delivery dates."
- Let us know if there's a cost or SOW so we can plan around it.

**Why we flag it:** this is the item most likely to take real calendar time, so kicking it off now keeps it off the critical path.

---

## 3. QuickBooks — cash position & account balances

**Powers:** the cash-position KPI and the account-balances panel (Operating, Payroll, Merchant, Savings, Holding, CC Processing).

**First, one question that changes everything:**
- **Do you use QuickBooks _Online_ or QuickBooks _Desktop_?**
  - **Online** → quick: you click "Connect/Authorize" once through Intuit and we read balances via their official API. (We register the app; you just approve it.)
  - **Desktop** → still doable, but heavier (needs an always-on connector on a Windows machine or a third-party bridge). Confirming this up front avoids surprises.

**What we need:**
- The Online/Desktop answer.
- If Online: the **company/organization name** and a quick **OAuth authorization** (we'll send a "Connect to QuickBooks" link; you approve read-only **Accounting** access).

---

## 4. Clover — retail / café sales

**Powers:** the retail/café slice of daily sales.

**What we need (≈5 minutes):**
- In the Clover Dashboard: **Business Operations → API Tokens** (or **Setup → API Tokens**), **create a token** with **read** access to **Merchant, Orders, and Payments**.
- Send us that **API token** and your **Merchant ID** (in the Clover dashboard URL / account settings).

---

## 5. Caterease — event & wedding bookings

**Powers:** the **events/catering** revenue line and **upcoming weddings/events** in the coverage view.

**What we need:**
- Confirm you still run events through **Caterease**.
- A **reporting/export login**, or the ability to schedule an **event/booking export** (upcoming events with date, type, and expected headcount). If Caterease has an API or data export on your plan, point us to it and we'll take it from there.

---

## What makes the "forecast" views become real

The capacity, coverage, and forward-ledger views are currently **modeled/projected**. They turn into live numbers when these three feeds connect:

1. **When I Work schedules + time-off** → real capacity, real "scheduled vs actual."
2. **Caterease / CaterTrax bookings** → real upcoming events & demand.
3. **When I Work time-clock history** (more than one week) → real per-employee trend anomalies.

In the meantime, please **keep sending the weekly spreadsheets** you already produce — we'll keep the dashboard current from those until the automated feeds are live.

---

## How to share credentials securely

Please **don't email tokens/passwords in plain text.** Any of these is fine:
- A password manager share (1Password, Bitwarden, LastPass), or
- A one-time secret link (e.g., onetimesecret.com), or
- A quick screen-share where you paste them into our secure store.

Where a system allows it, a **dedicated, read-only / limited login** for the integration (rather than a personal admin account) is ideal — easier to rotate and audit later.

---

## Quick checklist to send back

- [ ] **When I Work**: developer API key requested from support (and plan/scheduling confirmed)
- [ ] **CaterTrax**: reporting login shared + scheduled-export request sent to your account manager
- [ ] **QuickBooks**: Online or Desktop? (+ company name if Online)
- [ ] **Clover**: API token + Merchant ID
- [ ] **Caterease**: reporting/export access (or confirm the export option on your plan)
- [ ] Credentials shared via a **secure** method (not plain email)

Thanks! Once #1, #3, and #4 are in, most of the dashboard goes live immediately; #2 and #5 light up the delivery/events pieces and the forward coverage planning.
