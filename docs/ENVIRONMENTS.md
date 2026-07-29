# Environments: keeping development off the production database

Today local development, tests and the production server can all point at the
**same** Atlas database (`/ByggExp`). That means anything you try locally — a
test user, a planned shift, a draft invoice — lands in real customer data. A
world-class SaaS never mixes the two. This document describes the target setup
and how to get there.

## The model: one cluster, one database per environment

Use the **same Atlas cluster** but a **different database name** per environment
(no extra cost, full data isolation):

| Environment | `NODE_ENV`    | Database      | Where            |
| ----------- | ------------- | ------------- | ---------------- |
| Production  | `production`  | `ByggExp`     | VPS only         |
| Staging     | `production`  | `ByggExp_stg` | staging host/CI  |
| Development | `development` | `ByggExp_dev` | your machine     |

The connection string only differs in the path segment:

```
mongodb+srv://USER:PASSWORD@cluster0.zgjfrlf.mongodb.net/ByggExp_dev?retryWrites=true&w=majority
```

## One-time setup (local development)

1. In your local `.env`, set:
   ```
   NODE_ENV=development
   MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster0.zgjfrlf.mongodb.net/ByggExp_dev?retryWrites=true&w=majority
   ```
   (A brand-new database name is created automatically on first write — no Atlas
   console step needed.)
2. Start the API. It logs the active database and **warns** if a non-production
   process is connected to the production database:
   ```
   [Bootstrap] Environment: development | Database: ByggExp_dev
   ```
   If you ever see `Database: ByggExp` with `Environment: development`, stop —
   you are about to write to production.

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

- **Startup log + warning** (`src/main.ts`): prints the environment + database
  on boot and warns when a non-production process targets the production DB.
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

- Move existing **test/demo records** out of the production `ByggExp` database
  (the ones created while dev shared the prod DB).
