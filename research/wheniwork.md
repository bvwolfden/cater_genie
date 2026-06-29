# When I Work — Integration Research

> Time-boxed integration spike. Goal: programmatically pull **yesterday's labor**
> (hours worked / clocked shifts, scheduled vs. actual, ideally labor cost) for a
> daily-sales dashboard. Researched June 2026 against current official docs.

## Verdict (TL;DR)
- **Can we integrate?** **Yes — Conditional.** A documented v2 REST API exists and
  returns clocked time entries (the `times` resource) and shifts. The condition is
  an **access-approval gate**: you must email When I Work and be granted a developer
  key (not fully self-serve), and you need an **Admin** on the account.
- **Recommended approach:** **REST API** — pull the `/times` resource filtered to
  yesterday's date range. (For an always-on dashboard, layer in **webhooks** later
  to avoid polling; API pull is the right primary path for a daily batch job.)
- **Confidence:** **High** on auth flow, base URLs, access-gate, plan availability,
  and that `times` is the labor-hours resource. **Medium** on exact `times` JSON
  field names and exact query-param names (the live field-level schema is behind a
  JavaScript-rendered Swagger SPA at apidocs.wheniwork.com that can't be fetched as
  text — fields below are reconstructed from the v2 API conventions and the PHP/
  Airbyte ecosystem and should be verified against the live Swagger once you have a
  key).
- **Effort estimate:** ~1–3 days for a working daily pull (most of the calendar time
  is waiting on access approval, not coding).

## Authentication
Token-based, two-step. **There is no public OAuth app-registration flow and no
self-serve API key in the UI.** Sequence:

1. **Get a developer key (manual approval gate).** Email When I Work to request API
   access. You must have **Admin-level access** to the account. The request should
   include: company name using When I Work, admin name, developer contact
   (name/email/phone), and intended use. They issue a private **developer key**
   (`W-Key`). This is a gated, human-reviewed process — *not* self-serve.
2. **Log in to mint a session token.** POST the account user's email + password to
   the login service with the developer key in the header. You receive a `person`
   object containing a **token**.
3. **Call the API** with that token (header `Authorization: Bearer <token>` or
   `W-Token: <token>`; also accepted as cookie or query string). Use `W-UserId` to
   select which account/workplace to act as when a user belongs to several.

**Token longevity:** tokens **expire 7 days (604,800 s) after creation**; refresh at
least 2 days before expiry via the login service's `/refresh` endpoint. Plan to store
the token and auto-refresh on a schedule (or just re-login each run for a daily job).

**Plan tier:** API access requires a paid account (Admin). Time clock / attendance
and scheduling are **included in all current paid plans** (Single Location
~$2.50/user/mo and Multiple Locations ~$5/user/mo), so labor-hours data is not gated
to a premium tier. Forecasting/labor-cost **estimation** tooling and custom reports
sit on the Multiple Locations tier.

## API Overview
- **REST, JSON, versioned (`/2/`).** Documented but **partner-gated for access** — the
  reference is public to read; minting a key is approval-only.
- When I Work splits functionality into a **Primary API** plus several smaller
  service APIs. The Primary API covers Shifts, Users, Times (worked time),
  Schedules/Locations, Positions, Sites, Tasks, Tags, etc. Separate services exist
  for **Login/Auth**, **Forecast Tools**, **Tasks**, and **Tags**.
- Time clock / attendance is **not a separate API product** — clocked punches surface
  through the Primary API's **`times`** resource (confirmed: the Airbyte connector and
  PHP wrapper both treat `times` as the time-tracking/attendance stream).
- **Webhooks** are offered and explicitly recommended by When I Work for keeping a
  data store in sync instead of repeatedly polling (HMAC-SHA256 signed payloads,
  5–7 s batching delay, ~2 h exponential-backoff retry). The documented webhook
  example events are `users::created/updated/deleted/invited`; time/shift event
  availability should be confirmed in-product on the Webhooks settings page.

## Base URLs
| Purpose | Base URL |
|---|---|
| Primary API (shifts, times, users, …) | `https://api.wheniwork.com/2/` |
| Login / auth (mint token) | `https://api.login.wheniwork.com/login` |
| Token refresh | `https://api.login.wheniwork.com/refresh` |
| API reference (Swagger SPA) | `https://apidocs.wheniwork.com/external/index.html` |
| Login service reference | `https://apidocs.wheniwork.com/external/index.html?repo=login` |
| Forecast Tools service | `https://apidocs.wheniwork.com/external/index.html?repo=forecast-tools` |

## Getting Yesterday's Labor (endpoints + date filtering)
Primary resources for a labor dashboard:

- **`GET /2/times`** — **actual clocked/worked time entries** (clock-in/out punches,
  duration, breaks). This is the core "hours worked" source. Filter by a date window
  (`start` / `end` datetime range). Each record ties to a `user_id` and typically a
  `shift_id`, so you can join actual-vs-scheduled.
- **`GET /2/shifts`** — **scheduled** shifts. Filtering requires a `start` and `end`
  range (these params are required for shifts). Use this for *scheduled* hours to
  compare against `times` for *actual*.
- **`GET /2/users`** — employee roster; carries the per-user **hourly rate** used for
  labor-cost math (rate lives on the user profile).
- **`GET /2/payrolls`** — payroll-period aggregates (exposed as a stream by the
  Airbyte connector); potentially useful for reconciled hours but heavier than
  `times` for a daily view.

**Date filtering pattern:** pass `start` and `end` as a datetime range covering
yesterday (e.g. `start=2026-06-27T00:00:00&end=2026-06-28T00:00:00`, in the account's
timezone). Note: confirm exact param names (`start`/`end` vs `start_time`/`end_time`)
and timezone handling against the live Swagger — the account `timezones` data is also
exposed and matters for "yesterday" boundary correctness.

## Hours vs. Labor Cost (what the API exposes)
- **Hours: yes.** `times` gives actual worked duration and clock punches; `shifts`
  gives scheduled duration. Scheduled-vs-actual is achievable by joining on
  `user_id`/`shift_id`.
- **Labor cost: partial / derivable.** When I Work stores an **hourly rate per user**
  (on the user profile) and computes **estimated labor cost** for scheduled hours in
  its Forecast/Scheduler tooling. Via the API you can read user hourly rates
  (`/users`) and multiply by hours from `times` to compute actual labor cost
  yourself. There is **no guarantee the `times` record returns a pre-computed dollar
  cost field**, and overtime/break-pay rules may not be fully reflected — treat
  wage rates as the input and compute cost in our dashboard.
- **Fallback:** if per-user rates aren't reliably populated or overtime math matters,
  source wages from the costing spreadsheet and use the API purely for hours.

## Sample Request
Step 1 — mint a token (developer key + account user credentials):
```bash
curl -X POST 'https://api.login.wheniwork.com/login' \
  -H 'Content-Type: application/json' \
  -H 'W-Key: <DEVELOPER_KEY>' \
  -d '{"email":"manager@caterco.com","password":"<PASSWORD>"}'
# -> returns a person object containing { ... "token": "<SESSION_TOKEN>" ... }
```

Step 2 — pull yesterday's worked time entries (the `times` resource):
```bash
curl -G 'https://api.wheniwork.com/2/times' \
  -H 'Authorization: Bearer <SESSION_TOKEN>' \
  -H 'W-UserId: <USER_ID>' \
  --data-urlencode 'start=2026-06-27T00:00:00' \
  --data-urlencode 'end=2026-06-28T00:00:00'
```

(Parallel call to `https://api.wheniwork.com/2/shifts` with the same `start`/`end`
gives the *scheduled* side for variance.)

## Sample Response
**Illustrative** shape for `GET /2/times` (reconstructed from v2 conventions — verify
field names against the live Swagger once you have a key). When I Work v2 responses
return a top-level array keyed by the resource name:
```json
{
  "times": [
    {
      "id": 558123456,
      "user_id": 8041234,
      "account_id": 567890,
      "location_id": 102938,
      "position_id": 44556,
      "shift_id": 991122334,
      "start_time": "2026-06-27T11:02:14-05:00",
      "end_time":   "2026-06-27T19:08:47-05:00",
      "length": 8.11,
      "break_time": 0.5,
      "paid": true,
      "is_clocked_in": false,
      "notes": "",
      "hourly_rate": 18.50,
      "created_at": "2026-06-27T19:08:47-05:00",
      "updated_at": "2026-06-27T19:09:01-05:00"
    }
  ],
  "users": [ { "id": 8041234, "first_name": "Sam", "last_name": "Rivera" } ]
}
```
Notes: `length` = worked hours; join to `shifts` on `shift_id`/`user_id` for
scheduled-vs-actual; multiply `length` by the user's hourly rate (from `/users` or, if
present, the `hourly_rate` echoed on the time record) for actual labor cost.

## Required Permissions / Scopes
- **Account role: Admin.** Only an Admin can request/obtain the developer key, and the
  login user used to mint the token should have permission to read time and schedule
  data across the relevant locations (an Admin or a Manager/Supervisor with full
  scheduling + time-clock visibility).
- There is no granular OAuth scope system; access is effectively "what the
  authenticating user can see in the product." Use a dedicated service/Admin user.
- `W-UserId` selects the account context when the user spans multiple workplaces.

## Recommendation
**Primary approach: REST API (`GET /2/times` + `GET /2/shifts`, joined with
`/2/users` for rates), run as a daily batch.**

Justification:
- It is the only programmatic source that returns **actual clocked punches** plus
  **scheduled** shifts with clean date filtering and stable IDs to join on —
  exactly the scheduled-vs-actual labor view the dashboard needs.
- Avoids screen scraping (brittle, against intent) and avoids the heavier
  custom-report/CSV-export route (manual, latency-prone, no clean join keys).
- For a *daily* dashboard, a once-per-day pull of yesterday's window is simple,
  cheap, and well within rate limits. **Add webhooks later** only if we need
  near-real-time freshness — When I Work itself recommends webhooks over high-volume
  polling, but daily polling is well below any concern.
- Labor **cost** is computed in our dashboard (hours x per-user rate, or rates from
  the costing spreadsheet) since the API centers on hours, not finalized dollars.

## Estimated Implementation Effort
- **Access/approval:** request and receive developer key — **1–5 business days of
  calendar wait** (email-based approval), ~0.5 h of our effort.
- **Auth + token refresh module:** 0.5 day.
- **Daily pull of `/times` + `/shifts` + `/users`, normalize, compute hours and
  cost, load to dashboard store:** 1 day.
- **Timezone-correct "yesterday" boundaries, pagination, error/retry handling:**
  0.5 day.
- **Total engineering: ~1–3 days** once the key is in hand.

## Risks & Open Questions
- **Access gate (highest schedule risk):** developer key is approval-only via email;
  not self-serve. Start this request immediately — it's the critical path.
- **Token longevity:** 7-day expiry with a refresh ≥2 days before expiry. A daily job
  can simply re-login each run, but build refresh/relogin to avoid silent failures.
- **Exact `times` schema unverified:** field/param names (`start` vs `start_time`,
  presence of a cost field, break handling, `is_clocked_in`) come from convention,
  not a fetched spec — **confirm against the live Swagger** (apidocs.wheniwork.com)
  with a real token before finalizing parsers.
- **Rate limits:** When I Work documents that frequent large requests hit rate limits
  and recommends webhooks for high-volume sync; specific per-minute numbers aren't
  public. A daily pull is low-risk; backfills should paginate and throttle.
- **Time-clock reliability via API:** `times` reflects what's clocked in-product;
  un-clocked or manually-edited shifts, open/in-progress punches
  (`is_clocked_in: true`), and post-hoc edits mean "yesterday" data can change after
  the fact. Consider pulling yesterday on a short lag and/or re-pulling.
- **Labor cost gaps:** API gives hours + per-user rate, not authoritative payroll
  cost (overtime, differentials, paid breaks). Compute cost ourselves or reconcile
  with the costing spreadsheet.
- **Plan/feature confirmation:** time clock is included on current paid plans;
  confirm the specific account has time clock enabled and that hourly rates are
  populated on user profiles if we want cost.

## Documentation Links
- Getting Access to the When I Work API (approval, auth flow, token expiry):
  https://help.wheniwork.com/articles/getting-access-to-the-when-i-work-api-computer/
- API Services Reference Guide (services + base URLs):
  https://help.wheniwork.com/articles/api-services-reference-guide/
- When I Work API Documentation (Swagger SPA — needs a browser/key to render):
  https://apidocs.wheniwork.com/external/index.html
- Login/Auth service reference:
  https://apidocs.wheniwork.com/external/index.html?repo=login
- Webhooks Reference (events, signing, batching/retry):
  https://help.wheniwork.com/articles/webhooks-reference/
- Track Hours and Labor in the Scheduler (per-user hourly rate, labor-cost estimates):
  https://help.wheniwork.com/articles/track-hours-and-labor-in-the-scheduler/
- How Time Clock & Attendance Works (product behavior):
  https://help.wheniwork.com/articles/how-time-clock-attendance-works/
- When I Work Pricing (plan tiers; time clock included on all plans):
  https://wheniwork.com/pricing
- Airbyte When I Work connector (confirms `times`, `shifts`, `users`, `payrolls`
  streams + token auth):
  https://docs.airbyte.com/integrations/sources/when-i-work
- Community PHP wrapper (auth + endpoint examples):
  https://github.com/dolfelt/wheniwork-api-php
