## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

## Database migrations

MongoDB migrations for this project are described in `docs/database-migrations.md`.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
# ByggExp-BackEnd

## Fortnox integration

`src/fortnox` — a company admin connects Fortnox once (OAuth2 Authorization Code,
`access_type=offline`), then sends invoices (incl. ROT/RUT tax reduction and credit
notes) and the lönerunderlag (salary + absence transactions to Fortnox Lön).
Tokens are AES-256-GCM encrypted per company and never returned to the client;
refresh tokens are rotated on every refresh.

Env (see `.env.example`): `FORTNOX_CLIENT_ID`, `FORTNOX_CLIENT_SECRET`,
`FORTNOX_REDIRECT_URI` (= `https://api.byggexp.se/fortnox/callback`, registered
in the Fortnox Developer Portal). Optional: `FORTNOX_SCOPES`, `FORTNOX_RETURN_URL`,
`FORTNOX_TOKEN_KEY`. Without the three required vars `GET /fortnox/status` returns
`configured: false` and everything else is a 503 "Fortnox is not configured".

| Method | Path | Who |
| --- | --- | --- |
| GET | `/fortnox/status` | any signed-in user |
| GET | `/fortnox/connect-url` | company.manage |
| GET | `/fortnox/callback` | public (Fortnox redirect, signed state) |
| DELETE | `/fortnox/connection` | company.manage |
| POST | `/fortnox/invoices/:id` | finance.manage |
| POST | `/fortnox/payroll` `{from,to,userIds?,force?}` | companyAdmin / superadmin |

Invoices carry `fortnoxStatus` (`sent` / `error` / null), `fortnoxDocumentNumber`,
`fortnoxSentAt`, `fortnoxError`.
