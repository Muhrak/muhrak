# Deploying staging

Staging is a test copy of Muhrak on the internet. It deploys automatically
from the `develop` branch of `github.com/Muhrak/muhrak`.

| Piece | Host | Config |
|---|---|---|
| API (`apps/api`) | Railway | `apps/api/railway.json` |
| Background jobs | inside the API | `apps/api/src/worker` |
| PostgreSQL | Railway | Railway's Postgres template |
| Redis | Upstash | `REDIS_URL` (`rediss://...`) |
| Web (`apps/web`) | Vercel | Root directory `apps/web` |
| Email | Resend | `RESEND_API_KEY` |

Since 14 Nov 2026 the two apps are standalone (no workspace, no shared
package, one lockfile per app), so each service builds from **its app
folder**: Railway Root Directory `apps/api`, Vercel Root Directory
`apps/web`.

The Railway API service starts with the `RAILPACK_START_CMD` variable:

| Service | Root Directory | `RAILPACK_START_CMD` |
|---|---|---|
| API (`muhrak`) | `apps/api` | `pnpm db:migrate && pnpm start` |

Database migrations run at API start. If a migration fails, the API does not
start and Railway keeps the previous version running.

`apps/api/railway.json` holds the same settings
plus a health check and watch patterns. They only apply if the service's
**Settings → Config-as-code → Railway Config File** is set and the staged
change is deployed; on 2026-11-11 that setting did not take effect, so the
variables above are what is actually used.

### Live staging (as of 2026-11-11)

- Railway project `charismatic-inspiration`, environment `production`
  (this is our staging): services `muhrak` (API with background workers), `Postgres` (the `worker` service is obsolete since 14 Nov 2026).
- Web: https://muhrak.vercel.app (Vercel, root directory `apps/web`).
- API: https://muhrak-production.up.railway.app (`/health/ready` checks the database).
  `CORS_ORIGINS=https://muhrak.vercel.app`.
- The developer's machine has the Railway CLI linked to this project
  (`railway status`, `railway logs`, `railway variables`).

## 1. Railway: project and database

1. Sign in at railway.com with the **Muhrak** GitHub account.
2. **New Project → Deploy PostgreSQL**. Rename the project `muhrak-staging`.

## 2. Railway: API service

1. In the project: **Create → GitHub Repo → Muhrak/muhrak**.
2. Open the new service → **Settings**:
   - **Service name**: `api`
   - **Source → Branch**: `develop`
   - **Root Directory**: `apps/api`
3. **Variables → Raw Editor**, paste and fill in:

   ```
   RAILPACK_START_CMD=pnpm db:migrate && pnpm start
   NODE_ENV=production
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=<rediss:// URL from Upstash, same as apps/api/.env>
   JWT_SECRET=<new random value, see below>
   RESEND_API_KEY=<from Resend>
   CORS_ORIGINS=<Vercel URL from step 5, fill in later>
   WEB_APP_URL=<same Vercel URL; used for links in emails>
   ```

   Make a fresh `JWT_SECRET` for staging; do not reuse your local one:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

4. **Settings → Networking → Generate Domain**. This is the API URL, for
   example `https://api-production-xxxx.up.railway.app`.
5. Check `<API URL>/health/ready` returns `{"status":"ok","database":"ok"}`.

## 3. Railway: worker service (removed 14 Nov 2026)

There is no separate worker service any more. The background workers
(emails now; AI and RFQ expiry later) run inside the API process
(`apps/api/src/worker`, started by `server.ts`), so the `muhrak` service
needs `RESEND_API_KEY` (and optionally `EMAIL_FROM`).

Queue namespace: `QUEUE_PREFIX` (default `bull` in production, `muhrak-dev`
locally). Local development and staging use the same Upstash Redis, so they
MUST keep different prefixes, or one environment takes the other's jobs.
Never set `QUEUE_PREFIX=bull` on a developer machine.

Clean-up after the move: delete the Railway `worker` service (its start
command `pnpm --filter @muhrak/worker start` no longer exists, so it only
fails and restarts). Do it after the API with the workers is deployed, so
the email queue is never without a worker.

## 4. Vercel: web

1. Sign in at vercel.com with the **Muhrak** GitHub account.
2. **Add New → Project → Import Muhrak/muhrak**.
3. **Root Directory**: `apps/web`. Framework is detected as Next.js.
4. **Environment Variables**: `API_ORIGIN` = the Railway API URL (the older
   name `NEXT_PUBLIC_API_URL` is still read). The browser never calls it
   directly: `next.config.ts` proxies `/api/*` to it, so the session cookie
   is first-party
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

## Security settings (12 Nov 2026)

- Sessions: refresh token in an httpOnly, Secure, SameSite=Strict cookie per
  side (`muhrak_rt_buyer`, `muhrak_rt_seller`), path `/api/v1/auth`, set by
  the API and passed through the web app's `/api` proxy. Access token in
  memory only.
- API variables: `CORS_ORIGINS` must list the web URL exactly (it is also the
  CSRF origin check). `TRUST_PROXY_HOPS` = number of proxies adding to
  X-Forwarded-For (measured on staging, see PROGRESS.md).
- Rate limits are counted in Redis (Upstash); if Redis is down they fall back
  to per-instance memory counters.
- Web security headers (CSP, HSTS, frame-ancestors, nosniff,
  Referrer-Policy, Permissions-Policy) are set in `apps/web/next.config.ts`.
- Database backups: enable them on the Postgres volume in the Railway
  dashboard (volume, Backups tab). Not available from the CLI.

## File storage: Amazon S3 (12 Nov 2026)

Private bucket `muhrak-staging-private-om7k`, region `eu-north-1`
(Stockholm). Production gets its own bucket (consider `me-central-1` if data
must stay in the GCC).

Bucket settings: Block all public access on, ACLs disabled (bucket owner
enforced), versioning on, default encryption SSE-S3, a bucket policy that
denies non-HTTPS access, CORS allowing `PUT` and `GET` from the web origins
(`https://muhrak.vercel.app`, `http://localhost:3000`) with header
`content-type`. Lifecycle: abort incomplete multipart uploads after 1 day,
expire `pending/` after 1 day, delete noncurrent versions after 90 days.

IAM user `muhrak-staging-api` (no console access) with one inline policy:
`s3:PutObject` and `s3:GetObject` on `arn:aws:s3:::<bucket>/*` only. No
list or delete, on purpose: the API never deletes files, and without
`s3:ListBucket` S3 answers 403 for a missing file (the code handles that).

Variables:
- Railway `muhrak`: `AWS_REGION`, `AWS_ACCESS_KEY_ID`,
  `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_PRIVATE`. Without them the upload
  endpoints answer 503 and the rest of the API works.
- Vercel: `STORAGE_ORIGIN=https://<bucket>.s3.<region>.amazonaws.com`. The
  browser uploads straight to the bucket and shows logos from it, so the CSP
  (`connect-src`, `img-src`) must allow this exact origin. Without it,
  uploads on the website are blocked by the CSP.

How an upload works: `POST /v1/uploads` checks purpose, type and size and
returns a 5-minute signed PUT link with Content-Type and Content-Length in
the signature (S3 refuses any other type or size). The browser PUTs to
`pending/<id>`. `POST /v1/uploads/:id/complete` reads the stored bytes,
checks the real type with `file-type`, then copies exactly that version
(ETag match) to `files/<purpose>/<id>.<ext>`. Only then can the upload be
attached, once, by its owner, to a record of the right purpose.

Note: until 14 Nov 2026 Vercel built through Turborepo, which hid any
variable not listed in `turbo.json`. Turborepo is gone; Vercel now runs
`next build` in `apps/web` and sees every project variable. The build log
prints `[muhrak] STORAGE_ORIGIN: allowed …` when the bucket is in the CSP.

## Admin console (`/admin` in the web app, since 14 Nov 2026)

The admin console is part of the web app: `https://muhrak.vercel.app/admin`
(login at `/admin/login`). Nothing extra to deploy; it uses the web
project's variables and the web origin already in `CORS_ORIGINS`.

Until 14 Nov 2026 it was a separate app (`apps/admin`, Vercel project
`muhrak-admin`). Clean-up after the move:
1. Vercel: delete the `muhrak-admin` project (or disconnect its Git
   repository). Its root folder no longer exists, so its builds fail.
2. Railway, service `muhrak`: remove `https://muhrak-admin.vercel.app`
   from `CORS_ORIGINS`, leaving `https://muhrak.vercel.app`.

First admin on staging (the password is typed into a hidden prompt, never
into chat or a file):

One-time setup on the dev machine: `ssh-keygen -t ed25519` (Railway offers to
register the key on the first `railway ssh`), and `railway link` in the repo
folder (project charismatic-inspiration, environment production).

```bash
railway ssh --service muhrak
# Now on the Railway server (prompt root@…:/app#). pnpm and node are not on
# the PATH of an SSH session, so find node and run the script directly:
cd /app/apps/api
export PATH="$(dirname "$(find / -type f -path '*/bin/node' 2>/dev/null | head -1)")":$PATH
./node_modules/.bin/tsx src/scripts/admin.ts
exit
```

Check the prompt before running the script: if it still starts with `C:`,
the script runs on your own computer and changes only the LOCAL database.

The same command sets a new password for an existing admin and signs that
admin out everywhere.
