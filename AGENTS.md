# CaterGenie — rules for ALL agents

Read this before touching anything. On 7/20/2026 an agent silently created a
local Postgres copy and pointed `.env` at it; other agents then audited and
wrote to the copy believing it was production. Hours were lost untangling it.
These rules exist so that never happens again.

## One database. One app. No local environment.

- **The ONLY database is Railway production Postgres.** `.env` `DATABASE_URL`
  points at it (public proxy URL). Treat every query as touching Kevin's real
  business data.
- **Never create a local database, copy, or seed.** `docker-compose.yml`'s
  `db` service and `npm run db:start` / `db:embedded` / `seed` exist but are
  OFF-LIMITS without Brian's explicit say-so in the current conversation.
  Never repoint `DATABASE_URL`.
- **Never run the app locally to verify.** Brian verifies on the deployed app
  only: **https://catergenie-staging.up.railway.app** (Railway project
  `dynamic-emotion`, service `catergenie`; the env is named "staging" but it
  IS the live app Kevin uses).

## Shipping

- `main` auto-deploys to Railway on push. Direct pushes to `main` are blocked
  — branch → PR → squash-merge (`gh`).
- **Multiple agents share this checkout.** Do not switch branches, `git add
  -A`, stash, or pull in the working tree — you will strand or clobber
  another agent's WIP. Stage only files you created/edited, then either work
  in your own `git worktree`, or commit without touching HEAD:
  `git write-tree` → `git commit-tree <tree> -p HEAD -m ...` →
  `git push origin <sha>:refs/heads/<branch>` → merge via
  `gh api -X PUT repos/.../pulls/<n>/merge -f merge_method=squash`.
- After any deploy, run the smoke test: **`npm run smoke`** (walks every page
  authenticated; exits 1 on failure). Deploy status via Railway MCP or `railway`.

## Data safety

- **Prod writes go through deployed endpoints**, not raw DB connections:
  syncs via `POST /api/catertrax/sync?kind=all|sales|bookings`, one-row data
  repairs via `POST /api/admin/repair?fix=<id>` (add new repairs to its
  registry — idempotent, narrowly matched, logged).
- Read-only data health check: `npm run validate:data` (cross-source
  reconciliation suite; also rendered in the dashboard's Data Quality panel).
- Direct `prisma ... update/delete` against prod requires Brian's explicit
  approval for the specific change.

## Testing past auth

- Clerk test user creds are in `.env` (`CLERK_TEST_USER_EMAIL/PASSWORD`) —
  never print them. Password sign-in dead-ends at a new-device email OTP;
  instead mint a sign-in ticket with the Clerk backend API and open
  `/sign-in?__clerk_ticket=<token>` (see `scripts/smoke.mjs` for the pattern).

## Context

- Owner: Brian (PM). App user: Kevin (Bistro To Go). Sources: Clover (retail
  sales), CaterTrax (delivery/catering — automated portal sync incl. daily
  forward bookings), Caterease (events — manual file drop on /import, Citrix
  app, no API), When I Work (labor/schedule), QuickBooks (balances, not yet
  connected).
- Numbers policy: nothing modeled/assumed may look measured. Use the badge
  primitives (`ProjBadge`, `EstBadge`, `CoverageDot` in
  `src/components/primitives.tsx`); the site-wide draft banner stays until
  Brian retires it.
