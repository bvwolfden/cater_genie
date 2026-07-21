# CaterGenie

@AGENTS.md

The file above is the single source of truth for environment, shipping, and
data-safety rules. Highlights that are non-negotiable:

- `.env` `DATABASE_URL` = Railway **production**. There is no local database
  and you must not create one or repoint the URL.
- Verify on the deployed app (https://catergenie-staging.up.railway.app),
  never localhost. `npm run smoke` after every deploy.
- Shared checkout: stage only your own files, never `git add -A`, never
  switch branches in this tree — use worktrees or git plumbing + PR + API
  merge (details in AGENTS.md).
- Prod writes only through deployed endpoints or with Brian's explicit
  approval.
