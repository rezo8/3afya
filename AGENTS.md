# AGENTS.md — 3afya

عافية (3afya, "well-being, vitality") is a personal, self-hostable workout &
health tracker: Hono API + Drizzle/Postgres + Better Auth, React 19 +
TanStack Router/Query web app, pnpm workspace + Turborepo. Node 22, ESM
throughout.

This file is the always-loaded baseline. Deeper, situational knowledge lives
in `.devin/rules/` (loaded when relevant to the task) and `.devin/skills/`
(repeatable procedures, invoke by name). Hard guardrails are enforced in
`.devin/hooks.v1.json` — read what they block before trying to work around
one; it means the action is the kind that needs a human, not a retry.

## Stack

- Monorepo: pnpm workspaces (`apps/*`, `packages/*`) + Turborepo.
- API (`apps/api`, contract types in `@afya/shared`): Hono +
  `@hono/node-server`, Drizzle ORM + drizzle-kit, `pg` → Postgres, `ioredis`
  → Redis, Zod for validation.
- Auth: Better Auth, sessions in Redis, shared with the `mi7rab` project — see
  `.devin/rules/deployment-and-infra.md`. Don't roll custom auth; extend
  `apps/api/src/auth.ts` and the web auth client.
- Web (`apps/web`): React 19 + Vite 6, TanStack Router + TanStack Query,
  Tailwind v4.
- Local ports: web **5174** · api **3001** · Postgres **5435** · Redis
  **6380**. Local DB name/user: `afya`.
- Local dev: `docker compose up -d` → `cp .env.example apps/api/.env` (set a
  real `BETTER_AUTH_SECRET`) → `pnpm install` → `pnpm --filter @afya/api
  db:migrate` (+ `db:seed` for a demo account) → `pnpm dev`.

## Non-negotiables

- **TypeScript strict, no escape hatches.** No `any`, no `unknown` used as a
  dodge, no `as` casts, no non-null `!`, no `@ts-ignore`/`@ts-expect-error`.
  If a type doesn't line up, fix it at the source or validate at the
  boundary — never suppress the error.
- **No comments that describe what the code already says.** Only comment a
  non-obvious *why* — a hidden constraint, a workaround, a business rule
  that can't be expressed in code. The existing code in this repo already
  holds that bar; match it.
- **Functions do one thing. No flag arguments.** Split
  `syncSession(session, true)` into two named functions, or a discriminated
  union parameter. Separate commands from queries — a function either
  changes state or answers a question, never both.
- **Handle errors intentionally.** No swallowed `catch`, no `null` standing
  in for failure when the type system can say it better. Every `catch`
  recovers meaningfully, adds context and rethrows, or converts to a domain
  error.
- **Database changes go through Drizzle migrations only** — read
  `.devin/rules/database-and-migrations.md` and use the `db-schema-change`
  skill before touching `apps/api/src/db/schema/`.
- **Never hand-edit generated files**: `apps/api/drizzle/**`,
  `apps/web/src/routeTree.gen.ts`, anything matching `*.gen.ts`.
- **Don't reflexively run `pnpm format`.** The umbrella `.prettierrc` sets no
  `printWidth`, so `prettier --check` is red across the whole repo (code is
  written at ~110 columns by convention). Match the surrounding style
  instead of reformatting the file.
- **Never add AI attribution to git commits, PRs, or branch names.** No
  "Generated with …" footer, no `Co-Authored-By: <AI>` trailer, no
  `claude/`/`devin/`/`ai/`-prefixed branches. Full policy in
  `.devin/rules/git-and-commits.md`; the obvious violations are also
  blocked in `.devin/hooks.v1.json`.
- Follow existing patterns before introducing a new one. Keep changes scoped
  to the task — don't refactor code you weren't asked to touch.

## Where the rest lives

- `.devin/rules/domain-model.md` — exercises, programs, sessions, fuel, body
  metrics: the actual business rules behind the schema, not just the schema.
- `.devin/rules/web-conventions.md` — screen-level React conventions
  (`SessionScreen` focus logic, the armed-confirm pattern, chart
  interactions, …).
- `.devin/rules/database-and-migrations.md` — drizzle-kit's known gaps,
  backfill conventions, how to rehearse a breaking schema change.
- `.devin/rules/testing.md` — Vitest setup and conventions.
- `.devin/rules/deployment-and-infra.md` — Cloud Run, the shared GCP infra,
  shared auth.
- `.devin/rules/git-and-commits.md` — commit/branch/PR policy in full.
- `.devin/skills/` — `db-schema-change`, `add-audit-report`,
  `task-complete-checklist`: invoke by name when doing that kind of work.
