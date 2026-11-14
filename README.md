# Muhrak

AI-powered spare parts marketplace for the GCC.

## Layout

Two standalone apps in one repository. Nothing is shared between them as
code; each is installed, run and deployed from its own folder.

```
apps/
  api/   Express API (modular monolith). All backend: business logic,
         database, background jobs (PostgreSQL queue, src/worker), Zod schemas
         (src/schemas, the source).
  web/   Next.js. All frontend: public site, buyer centre, seller centre,
         admin console under /admin. src/schemas is an exact copy of the
         API's schemas (checked by the API tests).
docs/    Plan, architecture, deploy notes, progress.
```

## First run

Requirements: Node 22 or newer, pnpm, PostgreSQL.

```bash
cd apps/api
pnpm install
cp .env.example .env          # then set JWT_SECRET and DATABASE_URL
pnpm db:migrate
pnpm test
pnpm dev                      # http://localhost:4000

cd ../web
pnpm install
cp .env.example .env.local
pnpm dev                      # http://localhost:3000
```

## Changing a request or response shape

1. Change the schema in `apps/api/src/schemas/`.
2. Copy the same file to `apps/web/src/schemas/`.
3. `pnpm test` in `apps/api` fails if the two copies differ.

## Branches

| Branch | Purpose | Deploys to |
|---|---|---|
| `main` | Production. Only receives merges from `develop`. | Production |
| `develop` | Development. Day-to-day work lands here. | Staging |
| `feature/<name>` | Optional, for bigger pieces of work. Branch from `develop`, merge back into `develop`. | — |

Flow: work on `develop` (or a feature branch) → test on staging → open a pull
request `develop` → `main` to release. Never commit directly to `main`.

## How a module is built

Every module in `apps/api/src/modules/` follows the shape of `auth`:

| File | Job | Must not |
|---|---|---|
| `x.routes.ts` | HTTP: validate, call the service, respond | Contain business rules or SQL |
| `x.service.ts` | Business rules | Touch `req`/`res` or write SQL |
| `x.repository.ts` | Database queries | Contain business rules |
| `index.ts` | The module's public exports | Export internals by default |

More rules: `CLAUDE.md` and `docs/ARCHITECTURE.md`.

## Rules for money

- Amounts are whole numbers in the smallest unit, stored with their currency.
  OMR, KWD and BHD have three decimals. Use `src/schemas/money.ts`; never use
  floats.
- Database columns for money are `bigint`.
