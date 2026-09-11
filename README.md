# 3afya

> عافية — well-being, vitality. A personal, self-hostable workout & health
> tracker: log what you've done, and keep a living reference for your health.

Track your workout program and eating over time; look back and see the trend.
Built to the same blueprint as [mi7rab](https://github.com/rezo8/mi7rab) —
pnpm + Turborepo, Hono + Drizzle + Postgres, Better Auth with Postgres sessions,
React + Vite + Tailwind.

> **Status:** full scaffold built and running locally. Runs entirely on your
> machine (Docker Postgres). Cloud deploy is deferred — see
> [Later](#later-deploy).

## Stack

| Layer    | Choice                                                            |
| -------- | ---------------------------------------------------------------- |
| Monorepo | pnpm workspaces + Turborepo (Node 22, ESM), scope `@afya/*`      |
| Frontend | React + Vite + TS · TanStack Router + Query · Tailwind v4        |
| Backend  | Hono · Drizzle ORM · node-postgres → **Postgres**                |
| Auth     | **Better Auth** (email + password, sessions in Postgres)         |
| Local    | **Docker Compose** — Postgres                                    |

## Quickstart

Prereqs: Node 22, pnpm, Docker.

```bash
# 1. Local Postgres (5435) — port chosen to avoid clashing with mi7rab
docker compose up -d

# 2. API env (dotenv loads it from apps/api)
cp .env.example apps/api/.env      # then set a real BETTER_AUTH_SECRET

# 3. Install, migrate, seed demo data
pnpm install
pnpm --filter @afya/api db:migrate
pnpm --filter @afya/api db:seed     # optional: a demo account with history

# 4. Run both apps
pnpm dev                            # api → :3001, web → :5174
```

Open **http://localhost:5174**. Sign up, or use the seeded demo login:

```
afya@local.dev  /  afya-dev-123
```

### Ports (all offset from mi7rab's)

| Service  | 3afya | mi7rab |
| -------- | ----- | ------ |
| Web      | 5174  | 5173   |
| API      | 3001  | 3000   |
| Postgres | 5435  | 5433   |

## Structure

```
apps/
  api/   Hono backend — auth, tracker API, Drizzle schema + migrations
  web/   React app — Today, Program builder, Trends, History
packages/
  shared/         API contract types (@afya/shared)
  eslint-config/  shared lint config      tsconfig/  shared TS configs
```

## Data model

All rows are user-scoped.

- **Exercises** are a shared **library**, reused across program days. Each has a
  measurement **kind** that decides what a set records:
  - `weighted` → weight (lb) × reps — e.g. bench press
  - `reps` → a count only — e.g. pull-ups, soccer drills
  - `time` → a duration — e.g. planks, timed holds
- A **program** is a set of named **days** in a rotation order (not weekday-
  pinned); "Today" is the next day after your last session.
- A day holds ordered exercises with targets (sets × reps, or sets × time) — no
  planned weight. Working weight lives in **logged sets**; Today pre-fills it
  from your last session so you can beat it.
- **Fuel** is logged per entry (add/remove) against a daily protein/calorie
  target. **Body metrics** (weight, resting HR, sleep…) trend over time.

Estimated 1RM trends use the Epley formula on the best set per session.

## Design

Frontend direction is **"Vitality"** — a warm, dark, mobile-first world with an
espresso ground and a marigold accent; the working-set number is the signature.
The design was prototyped before implementation
([clickable prototype](https://claude.ai/code/artifact/0b48935e-66cd-4b5d-95c3-eb48859a6e79)).

## Later: deploy

A future session can add the GCP path (Cloud Run + Artifact Registry + Secret
Manager, adapted from mi7rab), reusing one shared Cloud SQL instance across
personal apps with a separate logical database per app. Not needed to run
locally.

## License

MIT — see [LICENSE](./LICENSE).
