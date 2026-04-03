# Druta Backend Deployment (Railway + Neon)

This guide deploys the backend currently located in `druta/apps/web`.

## Prerequisites
1. Railway account and project access.
2. Neon Postgres production database URL.
3. Bun installed locally for migration and smoke checks.

## 1. Validate Locally Before Deploy
1. `cd druta/apps/web`
2. `bun run typecheck`
3. `bun run build`
4. `bun run start`
5. Verify health: `curl http://127.0.0.1:3000/api/healthz`

## 2. Create Railway Service
1. Create a new Railway service from this repo.
2. Set service root to `druta/apps/web`.
3. Recommended: use Dockerfile build (this repo now includes `druta/apps/web/Dockerfile`).
4. If you stay on Railpack:
   1. Build command: `bun install && bun run build`
   2. Start command: `bun run start`

## 3. Configure Production Environment Variables
Set these in Railway service variables:
1. `DATABASE_URL=postgresql://...`
2. `AUTH_SECRET=<openssl rand -base64 32>`
3. `AUTH_URL=https://<railway-service-domain>`
4. `ALLOW_DEV_AUTH=false`

Optional:
1. `CORS_ORIGINS=https://<allowed-origin-1>,https://<allowed-origin-2>`

## 4. Run Migrations on Production DB
Run once from Railway shell or a one-off job:
1. `cd /app`
2. `bun run db:migrate`

Expected output:
1. `Applied 0001_initial_schema.sql` or
2. `Skipping 0001_initial_schema.sql (already applied)`

## 5. Point Mobile App to Deployed Backend
Update `druta/apps/mobile/.env`:
1. `EXPO_PUBLIC_BASE_URL=https://<railway-service-domain>`
2. `EXPO_PUBLIC_PROXY_BASE_URL=https://<railway-service-domain>`
3. `EXPO_PUBLIC_HOST=<railway-service-domain>`

Restart Expo:
1. `cd druta/apps/mobile`
2. `npm run start:phone`

## 6. Post-Deploy Verification
1. `GET https://<railway-service-domain>/api/healthz` returns `{"ok":true,...}`.
2. `GET https://<railway-service-domain>/api/auth/dev-mode` returns `{"devMode":false}`.
3. Mobile flow works on physical phone:
   1. Sign up/sign in.
   2. Save run.
   3. Read territories.
   4. Challenge and accept race.
   5. Restart app and confirm persistence.

## 7. Rollback Plan
1. Revert to previous Railway deployment in the Deployments tab.
2. Keep DB schema as-is (migration is additive and idempotent in current baseline).

## 8. Railway Build Troubleshooting
If build fails with `secret ID missing for "" environment variable`:
1. This is a Railway/Railpack variable parsing issue (not app compile failure).
2. In Railway Variables, check both:
   1. Service variables
   2. Project/shared variables
3. Remove/recreate variables using **New Variable** (avoid pasted malformed raw entries).
4. Redeploy.
5. If it still fails, force Dockerfile build:
   1. Set `RAILWAY_DOCKERFILE_PATH=Dockerfile`
   2. Redeploy (this bypasses the Railpack secret-mount path).

## Notes
1. Once deployed, ngrok is not required for backend access from mobile.
2. Expo tunnel can still be used for Metro bundler transport during local mobile development.
