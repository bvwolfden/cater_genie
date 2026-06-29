# CaterGenie

A unified **daily operations dashboard** for a restaurant/catering company. It
pulls data from the operational systems (Clover POS, CaterTrax, When I Work,
QuickBooks) into Postgres and surfaces one "morning dashboard" — daily sales,
labor, cash position, weekly comps vs. projection — with **AI insights**.

This repo is the MVP from the integration spike. Live connectors are scaffolded
behind a common interface; historical data is seeded from the client's
spreadsheets so the dashboard is fully populated today.

> Note: the source spreadsheets and their derived seed data contain real
> payroll/financial information and are intentionally **not** committed (this
> repo is public). They live locally and are loaded straight into the database.

## Architecture

```
 ingestion jobs            source of truth        backend            UI
┌──────────────┐          ┌──────────────┐    ┌────────────┐   ┌──────────────┐
│ Clover       │          │              │    │ getDashboard│   │ Next.js RSC  │
│ CaterTrax    │  upsert  │  PostgreSQL  │───▶│  (Prisma)   │──▶│ + Recharts   │
│ When I Work  │ ───────▶ │  (Prisma)    │    │ getInsight  │   │ AI Insights  │
│ QuickBooks   │          │              │    │  (Claude)   │   │              │
│ spreadsheets │          └──────────────┘    └────────────┘   └──────────────┘
└──────────────┘
```

- **Ingestion** (`src/lib/connectors/*`, `scripts/ingest.ts`): one connector per
  system implementing a shared `Connector` interface. Each knows its chosen
  integration method (REST, OAuth REST, scheduled report) and reports a
  readiness status. Today they throw `ConnectorUnavailableError` until access is
  granted — surfaced on the dashboard as "Pending".
- **Postgres** is the single source of truth (`prisma/schema.prisma`).
- **Backend** (`src/lib/dashboard.ts`, `src/lib/insights.ts`) reads only from
  Postgres. AI insights call Claude when `ANTHROPIC_API_KEY` is set; otherwise a
  deterministic rules engine produces the narrative + alerts.
- **UI** (`src/app`, `src/components`): Next.js App Router, Tailwind, Recharts.

## Quick start

Requires Node 20+. Database via Docker (recommended) or a no-Docker fallback.

```bash
cp .env.example .env            # adjust if needed
npm install

# 1. Database
npm run db:start                # Docker Postgres on :5433  (or: npm run db:embedded)
npm run db:push                 # apply schema

# 2. Seed from the spreadsheets in the repo root
npm run extract                 # xlsx -> prisma/seed-data/*.json  (needs python3 + openpyxl)
npm run seed                    # JSON -> Postgres

# 3. Run
npm run dev                     # http://localhost:3000
```

Shortcut: `npm run setup` runs db:start → db:push → extract → seed.

> No Docker? Use `npm run db:embedded` (downloads a standalone Postgres binary,
> no admin) instead of `npm run db:start`, then continue from `db:push`.

## Live ingestion

`npm run ingest -- 2026-06-27` runs every connector for a date and writes to
Postgres. Fill the matching `.env` values to bring a source online:

| System | Method | What's needed |
|---|---|---|
| Clover | REST API | `CLOVER_MERCHANT_ID`, `CLOVER_API_TOKEN` (merchant-generated token) |
| When I Work | REST API | `WHENIWORK_API_TOKEN` (developer key — request from When I Work as Admin) |
| QuickBooks | OAuth REST | Confirm Online vs Desktop; `QBO_REALM_ID`, `QBO_ACCESS_TOKEN` |
| CaterTrax | Scheduled report | No public API — vendor-configured CSV/Excel drop into `CATERTRAX_DROP_DIR` |

See `research/*.md` for the full integration findings per system.

## AI Insights

Set `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`, default
`claude-opus-4-8`) to generate the narrative with Claude. Results are cached per
day in the `Insight` table; the **Regenerate** button forces a refresh.

## Deploy (Railway)

Postgres + a Next.js service. Set `DATABASE_URL` and `ANTHROPIC_API_KEY` as
service variables, run `prisma db push` (or migrations) on deploy, and seed once.

## Project layout

```
prisma/schema.prisma         data model
scripts/extract_spreadsheets.py  xlsx -> JSON
scripts/seed.ts              JSON -> Postgres
scripts/ingest.ts            run connectors -> Postgres
src/lib/connectors/*         per-system connectors (shared interface)
src/lib/dashboard.ts         Postgres -> dashboard read model
src/lib/insights.ts          Claude + rules-engine insights
src/components/*              dashboard UI
research/*.md                integration discovery findings
```
