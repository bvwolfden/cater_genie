# Integration Spike — Summary & MVP Readiness

**Mission:** Prove we can automatically pull data from the client's 4 operational systems and feed a single daily dashboard. *Not* building the dashboard or backend yet — answering "can we connect, how, and how hard."

**One-line answer:** Yes, all four are connectable, but only two are "plug in a key and go." The timeline is governed almost entirely by **CaterTrax** (no API, vendor-gated) and by **access/approval lead times**, not by engineering effort.

---

## The target: what the dashboard actually needs

The existing `Daily Dash Board Online.xlsx` is hand-assembled every morning. Its columns map cleanly to the four systems, which tells us exactly what each integration must return:

| Dashboard field(s) | Source system | Notes |
|---|---|---|
| Daily Net Sales, Daily Tax | **Clover** (retail) + **CaterTrax** (delivery) | The single "Net Sales" number is the *sum* of two systems |
| Labor $, Total Hours, Labor % | **When I Work** | Hours from API; $ derived from rates (see costing sheet) |
| Op Acct, Payroll Acct, Merchant Acct, Savings, Holding Acct, CC Processing | **QuickBooks** | ~6 account balances |
| Food Purchases | **QuickBooks** (likely) | Confirm whether this is a QB expense pull or manual |
| ACC/Budget/Final $ | Projections spreadsheet | Out of scope for system integration; lives in `weekly projections 2026.xlsx` |

So the MVP "Daily Sales" is really four numbers per day: **Retail sales (Clover) + Delivery sales (CaterTrax) + Labor (When I Work) + Account balances (QuickBooks)** — exactly what the spike brief says.

---

## Per-system verdict

| System | Connect? | Best path | Self-serve? | Eng effort | Wall-clock risk | Confidence |
|---|---|---|---|---|---|---|
| **Clover** | ✅ Yes | REST API (Platform v3) — pull orders/payments, aggregate ourselves | Merchant API token = yes; OAuth app = approval-gated | ~0.5–1.5 d (token) / +2–3.5 d (OAuth) | Low | High |
| **When I Work** | ✅ Conditional | REST API v2 (`/times`, `/shifts`, `/users`) | ❌ Must email WIW for a developer key | ~1–3 d once key granted | Medium (key request lead time) | High on path, Medium on field schema |
| **QuickBooks** | ✅ Conditional | QBO REST API — `Account.CurrentBalance` via query endpoint | OAuth app; needs Intuit production review | ~2–4 d (Online) / 2–4× harder (Desktop) | Medium (app review 1–3 wks) | High **if Online** |
| **CaterTrax** | ⚠️ Conditional | **Scheduled CSV/Excel report → email/SFTP**, configured by vendor | ❌ No public API; vendor Professional Services | ~3–8 eng d, but **2–6 weeks elapsed** | **HIGH — governs the timeline** | Medium |

---

## Critical path (what actually determines the schedule)

1. **CaterTrax** — no API exists. Realistic path is a scheduled report export, almost certainly set up via a billable CaterTrax Professional Services engagement (owner is Volaris/Constellation Software, not Compass — Compass is a customer). **Blocked until** the client (a) gives us admin/reporting console access and (b) sponsors a vendor conversation. Start this **day one**.
2. **When I Work developer key** — request must come from an account Admin; not self-serve. Email the request **day one**.
3. **QuickBooks Online/Desktop** — must confirm which product. If Online: register Intuit app, build in sandbox, submit for production review in parallel. If Desktop: materially harder (QBXML + Web Connector + always-on Windows host, or a third-party connector).
4. **Clover** — lowest risk. Merchant generates an API token in their dashboard and we're pulling sales within a day.

**Net:** Engineering for all four is roughly **1–2 weeks of work**, but the spike-to-running-MVP wall-clock is **2–6 weeks**, driven by CaterTrax vendor coordination and approval/credential lead times. The 2–4 week MVP target is achievable *only if* CaterTrax access is granted quickly and the client accepts a scheduled-report (not real-time) feed for delivery sales.

---

## Top risks to retire early

- **CaterTrax is the whole ballgame.** If the client can't get us console access or won't fund a vendor engagement, delivery sales may stay manual for the MVP (Clover + WIW + QBO still automate cleanly).
- **QuickBooks Online vs Desktop** flips the effort 2–4×. Unconfirmed.
- **Access/approval lead times** (WIW key, Intuit production review, Clover token longevity) — all should be kicked off before any code.
- **Clover merchant-token shortcut** may be steered toward sandbox-only by Clover; validate in production early, OAuth is the fallback.

See per-system detail in `clover.md`, `catertrax.md`, `wheniwork.md`, `quickbooks.md`.
