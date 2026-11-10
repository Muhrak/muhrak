# Muhrak

AI-powered spare parts marketplace for the GCC. This repository is a monorepo:
every app and shared package lives here.

## Status of this scaffold

This is the Phase 1 starting point: workspace setup, shared schemas, and the
API with one complete module (`auth`) to copy as a template.

**The package versions in the `package.json` files were written without
running an install.** The first `pnpm install` may report a version that does
not exist or a small type error. Fix those first, then commit the generated
`pnpm-lock.yaml`. From then on the lockfile pins exact versions.

## Layout

```
apps/
  api/      Express API (modular monolith). All business logic lives here.
  worker/   Background jobs (BullMQ). Placeholder for now.
  web/      Next.js: public site, buyer centre, seller centre. Not created yet.
  admin/    Next.js: admin console. Not created yet.
packages/
  schemas/  Zod schemas, types and money helpers shared by every app.
```

`apps/mobile` (React Native + Expo, buyer only) is added in Phase 6.

## First run

Requirements: Node 22 or newer, pnpm, Docker.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env        # then set JWT_SECRET
cp apps/worker/.env.example apps/worker/.env
pnpm db:up                                    # Postgres + Redis in Docker
pnpm db:generate                              # create the first migration
pnpm db:migrate                               # apply it
pnpm test
pnpm --filter @muhrak/api dev                 # http://localhost:4000
```

Try it:

```bash
curl http://localhost:4000/health/ready

curl -X POST http://localhost:4000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"khalid@example.com","password":"a-long-password","fullName":"Khalid Al Amri","role":"buyer"}'

curl http://localhost:4000/v1/auth/me -H "Authorization: Bearer <accessToken>"
```

## Creating the web apps

These are generated with the official tool so they start on the current
Next.js version:

```bash
cd apps
pnpm create next-app@latest web   --typescript --tailwind --app --eslint
pnpm create next-app@latest admin --typescript --tailwind --app --eslint
```

Then in each app: add `"@muhrak/schemas": "workspace:*"` to dependencies, add
`transpilePackages: ["@muhrak/schemas"]` to the Next config, and run the admin
app on port 3001.

## How a module is built

Every module in `apps/api/src/modules/` follows the shape of `auth`:

| File | Job | Must not |
|---|---|---|
| `x.routes.ts` | HTTP: validate, call the service, respond | Contain business rules or SQL |
| `x.service.ts` | Business rules | Touch `req`/`res` or write SQL |
| `x.repository.ts` | Database queries | Contain business rules |
| `index.ts` | The module's public exports | Export internals by default |

Rules:

1. A module imports another module only through its `index.ts`.
2. A module queries only its own tables.
3. Request and response shapes are Zod schemas in `packages/schemas`, so the
   web and mobile apps share them.
4. Outside services (payment gateway, AI, chat, storage, notifications) sit
   behind a small interface with one implementation per provider.

## Rules for money

- Amounts are whole numbers in the smallest unit, stored with their currency.
  OMR, KWD and BHD have three decimals. Use the helpers in
  `packages/schemas/src/money.ts`; never use floats.
- Database columns for money are `bigint`.
- Every movement of money will be an append-only row in a ledger table
  (Phase 4). Balances are calculated, never edited.

## Auth, in short

- Access token: JWT, 15 minutes, sent as `Authorization: Bearer <token>`.
- Refresh token: random string, 30 days, stored hashed, single use. Reusing an
  old one signs the user out everywhere.
- Works the same for the website and the mobile app.

Not built yet: email verification, password reset, Google and Apple sign-in,
phone OTP, 2-step for admins, login rate limiting. Add rate limiting before
any public deployment.
