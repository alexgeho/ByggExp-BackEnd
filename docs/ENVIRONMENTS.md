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

## Guardrails already in place

- **Startup log + warning** (`src/main.ts`): prints the environment + database
  on boot and warns when a non-production process targets the production DB.
- **CI gate** (`.github/workflows/ci.yml` + the deploy workflow): tests must
  pass before anything is built or deployed.

## Still to do (needs your action / a follow-up)

- Provision a **staging** deploy target (host + `ByggExp_stg` DB) so changes can
  be smoke-tested against production-like data before hitting real customers.
- Add a **seed script** that fills a fresh `ByggExp_dev` with realistic demo
  data (company, users, projects, shifts) — best written once a separate dev DB
  exists, so it can be iterated safely without touching production.
- Move existing **test/demo records** out of the production `ByggExp` database.
