# Environments: keeping development off the production database

Local development and the production server now use **separate Atlas clusters**,
so nothing you try locally — a test user, a planned shift, a draft invoice — can
ever land in real customer data. This document describes the setup.

> History: dev and prod used to share one cluster/database (`/ByggExp`). The
> local `.env` was switched to a dedicated dev cluster on 2026-08-16.

## The model: a separate cluster per tier

| Environment | `NODE_ENV`    | Atlas cluster (project)               | Database      | Where        |
| ----------- | ------------- | ------------------------------------- | ------------- | ------------ |
| Production  | `production`  | `cluster0.zgjfrlf` (Project 0)        | `ByggExp`     | VPS only     |
| Development | `development` | `cluster0.rfx8tac` (byggexp-dev)      | `ByggExp_dev` | your machine |

Both are free-tier **M0** clusters. Dev has its own database user, so local
credentials cannot reach production even by accident. (A staging tier can be
added later — see below.)

## One-time setup (local development) — DONE 2026-08-16

Local `.env` already points at the dev cluster:

```
NODE_ENV=development
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster0.rfx8tac.mongodb.net/ByggExp_dev?retryWrites=true&w=majority&appName=Cluster0
```

(The database is created automatically on first write — no Atlas console step.)
Start the API; it logs the active database on boot:

```
[Bootstrap] Environment: development | Database: ByggExp_dev
```

If you ever see `Database: ByggExp` with `Environment: development`, the process
**refuses to start** (see Guardrails) — that is by design.

## Seeding demo data

Once your local `.env` points at `ByggExp_dev`, fill it with a self-contained
demo company (admin + workers + projects + tasks):

```
npm run seed:demo
```

- Re-runnable: it removes its own previously seeded records first.
- **Safe:** refuses to run against a production-looking database (name contains
  `byggexp` without a `dev`/`stg`/`test`/`local` marker) unless `SEED_FORCE=1`.
- Login after seeding: `admin@byggexp.dev` / `demo1234` (companyAdmin).

## Guardrails already in place

- **Startup hard-fail** (`src/main.ts`): prints the environment + database on
  boot and **refuses to start** (`process.exit(1)`) when a non-production
  process targets a production-looking DB. Escape hatch: `ALLOW_PROD_DB=true`
  for a deliberate run (e.g. a one-off migration/cleanup script against prod).
- **Seed guard** (`scripts/seed-demo.ts`): won't seed a prod-looking DB.
- **CI gate** (`.github/workflows/ci.yml` + the deploy workflow): tests must
  pass before anything is built or deployed.

## Staging (your action to provision)

Reuse the existing deploy pipeline against a separate host + database:

1. Provision a staging app on the VPS (or a second VPS): a `byggexp-api-stg`
   PM2 process on its own port, and a `shared/.env` with
   `NODE_ENV=production`, `MONGODB_URI=…/ByggExp_stg`.
2. In GitHub, add staging secrets (`SSH_HOST_STG`, `SSH_USER_STG`, …) and copy
   `.github/workflows/deploy.yml` to `deploy-staging.yml`, pointing it at the
   staging secrets/paths and triggering on the `staging` branch (or
   `workflow_dispatch`).
3. Promote `staging` → `main` once smoke-tested.

## Still to do

- Seed the fresh dev database: `npm run seed:demo` (dev cluster starts empty).
- When real customers arrive, consider promoting **production** to a paid tier
  (M10) with automated backups + IP allowlist; migrate `ByggExp` via
  `mongodump`/`mongorestore` in a short maintenance window. Not needed while the
  data is all mock/throwaway.
