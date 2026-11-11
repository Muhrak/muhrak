# Deploying staging

Staging is a test copy of Muhrak on the internet. It deploys automatically
from the `develop` branch of `github.com/Muhrak/muhrak`.

| Piece | Host | Config |
|---|---|---|
| API (`apps/api`) | Railway | `apps/api/railway.json` |
| Worker (`apps/worker`) | Railway | `apps/worker/railway.json` |
| PostgreSQL | Railway | Railway's Postgres template |
| Redis | Upstash | `REDIS_URL` (`rediss://...`) |
| Web (`apps/web`) | Vercel | Root directory `apps/web` |
| Email | Resend | `RESEND_API_KEY` |

Every service builds from the **repo root**, because the apps import the
shared `packages/schemas` workspace. Each Railway service points at its own
`railway.json`, which sets the start command and which file changes trigger
a redeploy.

Database migrations run automatically before each API deploy
(`preDeployCommand` in `apps/api/railway.json`). If a migration fails, the
new version is not started and the old one keeps running.

## 1. Railway: project and database

1. Sign in at railway.com with the **Muhrak** GitHub account.
2. **New Project → Deploy PostgreSQL**. Rename the project `muhrak-staging`.

## 2. Railway: API service

1. In the project: **Create → GitHub Repo → Muhrak/muhrak**.
2. Open the new service → **Settings**:
   - **Service name**: `api`
   - **Source → Branch**: `develop`
   - **Root Directory**: leave empty (repo root)
   - **Config-as-code → Railway Config File**: `/apps/api/railway.json`
3. **Variables → Raw Editor**, paste and fill in:

   ```
   NODE_ENV=production
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=<rediss:// URL from Upstash, same as apps/api/.env>
   JWT_SECRET=<new random value, see below>
   RESEND_API_KEY=<from Resend>
   CORS_ORIGINS=<Vercel URL from step 5, fill in later>
   ```

   Make a fresh `JWT_SECRET` for staging; do not reuse your local one:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

4. **Settings → Networking → Generate Domain**. This is the API URL, for
   example `https://api-production-xxxx.up.railway.app`.
5. Check `<API URL>/health/ready` returns `{"status":"ok","database":"ok"}`.

## 3. Railway: worker service

1. **Create → GitHub Repo → Muhrak/muhrak** again.
2. **Settings**: name `worker`, branch `develop`, root directory empty,
   config file `/apps/worker/railway.json`. Do **not** generate a domain.
3. **Variables**:

   ```
   NODE_ENV=production
   REDIS_URL=<same rediss:// URL>
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   RESEND_API_KEY=<from Resend>
   ```

4. Logs should show `Muhrak worker started`.

## 4. Vercel: web

1. Sign in at vercel.com with the **Muhrak** GitHub account.
2. **Add New → Project → Import Muhrak/muhrak**.
3. **Root Directory**: `apps/web`. Framework is detected as Next.js.
4. **Environment Variables**: `NEXT_PUBLIC_API_URL` = the Railway API URL
   (no trailing slash).
5. Deploy. Then **Settings → Git → Production Branch** = `develop` and
   redeploy, so the main Vercel URL always shows `develop`.

## 5. Connect web and API

1. Copy the Vercel project URL (for example `https://muhrak.vercel.app`).
2. In Railway, set the API variable `CORS_ORIGINS` to that URL. Railway
   redeploys the API.
3. Open the Vercel URL and sign up as a buyer. If sign-up fails with a
   network error, check `CORS_ORIGINS` exactly matches the URL (https, no
   trailing slash).

## Later: production

Production will use separate Railway services and a separate Vercel project
deploying from `main`, with their own database and secrets. Never point
staging and production at the same database.
