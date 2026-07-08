# 3afya

> عافية — well-being, vitality. A personal, self-hostable workout & health
> tracker: log what you've done, and keep a living reference for your health.

Track workouts, movement, and health markers over time; look back and see the
trend. Built to the same blueprint as [mi7rab](https://github.com/rezo8/mi7rab)
and deployed on the same GCP pattern, sharing one Postgres instance across my
personal apps.

> **Status:** repo initialized. The full scaffold is built out in a follow-up
> session — see [Plan](#plan) below.

## Planned stack (mirrors mi7rab)

| Layer    | Choice                                                                      |
| -------- | --------------------------------------------------------------------------- |
| Monorepo | pnpm workspaces + Turborepo (Node 22, ESM)                                  |
| Frontend | React + Vite + TS · TanStack Router + Query · Tailwind v4                   |
| Backend  | Hono · Drizzle ORM · node-postgres → **Postgres**                           |
| Auth     | **Better Auth** (email + password, sessions in Redis)                       |
| Cache    | **Redis** (Upstash in prod) — sessions, rate limiting                       |
| Deploy   | Docker → Cloud Build → **Artifact Registry → Cloud Run**; secrets in Secret Manager |
| Data     | **Cloud SQL (Postgres)** — a shared instance across personal apps           |

```
apps/
  api/   Hono backend — auth, tracking API, Drizzle schema + migrations
  web/   React app — log entries, dashboards, trends
packages/
  shared/         API contract types      eslint-config/  shared lint config
  tsconfig/       shared TS configs
```

Code packages use the ASCII scope `@afya/*` (e.g. `@afya/api`, `@afya/web`),
mirroring how mi7rab's repo is `mi7rab` but its packages are `@mihrab/*`.

## Shared database plan

The goal is **one Cloud SQL (Postgres) instance shared across my personal
apps** — this health tracker plus a future **wallet** app — each with its own
logical database on that instance, to avoid paying for an instance per app.

Two options for the follow-up session to decide (needs `gcloud` access):

1. **Reuse mi7rab's existing Cloud SQL instance** (`mi7rab:us-central1:mi7rab-db`)
   — add a new `afya` database + user to it. Cheapest, nothing new to provision.
2. **Create a dedicated shared instance** for personal apps and point mi7rab,
   3afya, and the future wallet at it (one database each). Cleaner separation,
   a small migration for mi7rab.

Either way: **separate databases per app on one instance**, not shared tables.

## Domain

mi7rab serves `ribhielzaru.com`. This would likely live on a subdomain
(e.g. `afya.ribhielzaru.com`) via a Cloud Run domain mapping.

## Plan

- [ ] Scaffold the pnpm + Turborepo monorepo (copy structure from mi7rab)
- [ ] `apps/api`: Hono + Drizzle + Better Auth + Redis + zod env validation
- [ ] Schema: users (Better Auth) + workouts / exercises / sets / health metrics
- [ ] `apps/web`: React + Vite + Tailwind — log a workout, view history & trends
- [ ] `packages/shared`, `packages/eslint-config`, `packages/tsconfig`
- [ ] `docker-compose.yml` (Postgres + Redis) for local dev
- [ ] GCP: `Dockerfile`, `cloudbuild.yaml`, `deploy/setup.sh` (adapt from mi7rab)
- [ ] Decide + wire the shared-database strategy (see above)

## License

MIT — see [LICENSE](./LICENSE).
