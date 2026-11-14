# Architecture

## Overview

```
        Next.js web app (public, buyer, seller, admin under /admin)
                              |
                  Express API  /v1  (modular monolith)
                 /        |         \          \
          Workers     PostgreSQL    Redis     File storage + CDN
       (BullMQ, inside
        the API process)
             |
   External services: Stream Chat, Claude API, email provider
```

- Clients hold no business logic; they call the API.
- The API is stateless: tokens for auth, object storage for files, Redis for
  shared state. It can run as many copies as needed behind a load balancer.
- Slow work runs as BullMQ jobs, processed by workers inside the API
  process (`apps/api/src/worker`), never inside a request.
- Modules communicate through their `index.ts` exports or through events.

## Folder structure (20-day scope)

```
muhrak/
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── server.ts, app.ts
│   │       ├── config/env.ts
│   │       ├── db/            client.ts, schema.ts, seed.ts
│   │       ├── shared/        errors, http, logger, events, queue,
│   │       │                  rate-limit, pagination
│   │       └── modules/
│   │           ├── auth/          Day 1-2
│   │           ├── health/
│   │           ├── upload/        Day 3
│   │           ├── seller/        Day 3-4
│   │           ├── admin/         Day 4, 17
│   │           ├── audit/         Day 4
│   │           ├── catalog/       Day 5, 9
│   │           ├── ai/            Day 6-8
│   │           ├── rfq/           Day 10
│   │           ├── chat/          Day 11
│   │           ├── quotation/     Day 12
│   │           ├── order/         Day 12, 14
│   │           ├── payment/       Day 12-13 (gateway behind providers/)
│   │           ├── ledger/        Day 12, 15 (append-only money entries)
│   │           ├── payout/        Day 15
│   │           └── notification/  Day 2, ongoing
│   │       ├── schemas/       Zod request/response schemas, money helpers
│   │       │                  (source; copied to apps/web/src/schemas)
│   │       └── worker/        background jobs, run in the API process
│   │           ├── index.ts       startWorkers / closeWorkers (server.ts)
│   │           ├── jobs/          send-email; later ai-identify, expire-rfqs
│   │           └── email/         templates, providers/ (resend, console)
│   ├── web/
│   │   └── src/
│   │       ├── app/
│   │       │   ├── (public)/  landing, sell, sellers, products, search, legal
│   │       │   ├── buyer/
│   │       │   │   ├── (auth)/    BUYER auth: login, signup (+ signup/company),
│   │       │   │   │              reset-password  → /buyer/login, /buyer/signup
│   │       │   │   └── (portal)/  dashboard, find-part, requests, messages,
│   │       │   │                  orders, settings  (layout.tsx = buyer guard)
│   │       │   ├── admin/     ADMIN console (own side, own session):
│   │       │   │   ├── login/     → /admin/login (no sign-up, no reset)
│   │       │   │   └── (console)/ sellers, sellers/[id], soon/[slug]
│   │       │   │                  (layout.tsx = admin guard)
│   │       │   └── seller/
│   │       │       ├── (auth)/    SELLER auth: login, signup, reset-password
│   │       │       │              → /seller/login, /seller/signup
│   │       │       └── (portal)/  dashboard, onboarding, products, rfq-inbox,
│   │       │                      quotations, messages, orders, settings
│   │       │                      (layout.tsx = seller guard)
│   │       ├── features/      one folder per API module name
│   │       ├── components/    ui/, layout/
│   │       ├── schemas/       exact copy of apps/api/src/schemas
│   │       └── lib/
└── docs/
```

No `packages/` and no workspace tooling (developer decision, 14 Nov 2026):
each app has its own `package.json`, `pnpm-lock.yaml` and tsconfig. The Zod
schemas live in `apps/api/src/schemas` (source) and are copied to
`apps/web/src/schemas`; an API test fails if the copies differ.

## Module shape

```
modules/<name>/
├── <name>.routes.ts       HTTP only
├── <name>.service.ts      business rules
├── <name>.repository.ts   database queries
├── <name>.events.ts       events published or handled (when needed)
└── index.ts               public exports
```

Modules that call an outside service add an interface file and a `providers/`
folder: `ai`, `chat`, `upload`, `notification`.

## Core workflow

1. Buyer uploads a photo. `ai` identifies the part (queued job) and returns
   editable fields with a confidence level per field.
2. `catalog` matches the part to seller products.
3. Buyer sends a quote request. `rfq` stores it and assigns matched sellers.
4. `chat` opens a Stream conversation and posts a card that carries only the
   RFQ id. The card renders from the API. Postgres is the source of truth.
5. Seller sends a quotation (`quotation`); a quotation card is posted.
6. Buyer accepts the quotation. `order` creates the order in
   `awaiting_payment` with the amounts copied from the quotation.
7. `payment` sends the buyer to the gateway's hosted checkout. Only the
   gateway's signed webhook (stored once, idempotent) marks the payment
   succeeded; `ledger` then records the charge, platform fee and seller
   credit in one transaction, and the order becomes `paid`.
8. Seller fulfils: paid -> packed -> shipped -> delivered -> completed
   (or cancelled / refunded). Buyer confirms delivery or it auto-confirms.
9. After the hold period, with no open problem report, `payout` pays the
   seller's available balance to their verified bank account (admin
   action, audited). Refunds go back through the gateway and the ledger.
10. A daily worker job reconciles the gateway's records with the ledger.
11. `notification` listens to events and sends emails.

## Notifications

A module publishes an event (for example `quote.sent`). The `notification`
module subscribes, checks the user's settings, and adds a job to the queue.
The email worker (inside the API) renders the template and calls the email
provider. Each job has a
unique key so a retry cannot send twice.

## AI safety

Per-user daily limits, a monthly budget cap, an on/off switch per feature,
validated and resized uploads, caching by image hash, Zod-validated output,
timeouts and limited retries, a manual fallback, and a row in `ai_jobs` for
every call. The API key stays on the server.

## Scaling path (change only when measured)

| Trigger | Change |
|---|---|
| API CPU stays high | Add API instances |
| Jobs wait too long | Add workers; split queues by type |
| Heavy read load | Add a database read replica |
| Search slow or Arabic results poor | Add a search engine fed by events |
| Very large tables | Partition by month |
| In-region hosting required | Move containers to AWS Middle East |

## Hosting for launch

API (with its background workers) on a managed platform, web apps on Vercel, managed Postgres and
Redis, object storage with a CDN. Two API instances for reliability. No
Dockerfiles are required for this setup; add them when moving to AWS.
