# Architecture

## Overview

```
Next.js web app (public, buyer, seller)      Next.js admin app
                \                               /
                 \                             /
                  Express API  /v1  (modular monolith)
                 /        |         \          \
          Workers     PostgreSQL    Redis     File storage + CDN
         (BullMQ)
             |
   External services: Stream Chat, Claude API, email provider
```

- Clients hold no business logic; they call the API.
- The API is stateless: tokens for auth, object storage for files, Redis for
  shared state. It can run as many copies as needed behind a load balancer.
- Slow work runs in the worker.
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
│   │           ├── order/         Day 13
│   │           └── notification/  Day 14
│   ├── worker/
│   │   └── src/
│   │       ├── index.ts
│   │       └── jobs/          ai-identify, send-notification, expire-rfqs
│   ├── web/
│   │   └── src/
│   │       ├── app/
│   │       │   ├── (public)/  landing, sell, sellers, products, search, legal
│   │       │   ├── buyer/
│   │       │   │   ├── (auth)/    BUYER auth: login, signup (+ signup/company),
│   │       │   │   │              reset-password  → /buyer/login, /buyer/signup
│   │       │   │   └── (portal)/  dashboard, find-part, requests, messages,
│   │       │   │                  orders, settings  (layout.tsx = buyer guard)
│   │       │   └── seller/
│   │       │       ├── (auth)/    SELLER auth: login, signup, reset-password
│   │       │       │              → /seller/login, /seller/signup
│   │       │       └── (portal)/  dashboard, onboarding, products, rfq-inbox,
│   │       │                      quotations, messages, orders, settings
│   │       │                      (layout.tsx = seller guard)
│   │       ├── features/      one folder per API module name
│   │       ├── components/    ui/, layout/
│   │       └── lib/
│   └── admin/
│       └── src/
│           ├── app/(auth)/    login
│           ├── app/(portal)/  dashboard, sellers, users, products, rfqs,
│           │                  orders, ai  (layout.tsx = admin guard)
│           ├── features/, components/ (ui, layout), lib/
└── packages/
    ├── schemas/               Zod schemas and types, one file per module
    ├── api-client/            typed functions for every /v1 endpoint
    ├── ui-tokens/             colours, spacing, fonts from Figma
    └── i18n/                  en.json now, ar.json later
```

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
6. Buyer confirms. `order` creates the order and tracks its status:
   confirmed -> packed -> shipped -> delivered (or cancelled).
7. `notification` listens to events and sends email and in-app notices.

## Notifications

A module publishes an event (for example `quote.sent`). The `notification`
module subscribes, checks the user's settings, and adds a job to the queue.
The worker renders the template and calls the email provider. Each job has a
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

API and worker on a managed platform, web apps on Vercel, managed Postgres and
Redis, object storage with a CDN. Two API instances for reliability. No
Dockerfiles are required for this setup; add them when moving to AWS.
