# Druta
Druta is a mobile-first running app. The backend currently lives in `druta/apps/web` (auth + API routes) and is consumed by the Expo mobile app in `druta/apps/mobile`.

## Local Development

### 1. Install dependencies
1. `cd druta/apps/web && bun install`
2. `cd ../mobile && npm install`

### 2. Configure env files
1. `cp druta/apps/web/.env.example druta/apps/web/.env`
2. `cp druta/apps/mobile/.env.example druta/apps/mobile/.env`

Required backend envs in `druta/apps/web/.env`:
1. `DATABASE_URL=postgresql://...`
2. `AUTH_SECRET=<random secret>`
3. `AUTH_URL=<backend origin>`

Required mobile envs in `druta/apps/mobile/.env`:
1. `EXPO_PUBLIC_BASE_URL=<backend origin>`
2. `EXPO_PUBLIC_PROXY_BASE_URL=<backend origin>`
3. `EXPO_PUBLIC_HOST=<backend host without https://>`

### 3. Run migrations
1. `cd druta/apps/web`
2. `bun run db:migrate`

### 4. Start backend
1. `cd druta/apps/web`
2. `bun run dev --host 0.0.0.0 --port 3000`

### 5. Start mobile app
1. `cd druta/apps/mobile`
2. `npm run start:phone`

This starts Expo in tunnel mode and prevents stale LAN Metro sessions that frequently break physical phone launches.

## Production Build and Start (Backend)
1. `cd druta/apps/web`
2. `bun run build`
3. `bun run start`

Health endpoint:
1. `GET /api/healthz`

## Railway Deployment (Beta-Fast)

### 1. Prepare infrastructure
1. Create Neon production DB/project (or a dedicated production branch).
2. Create a Railway project and a service targeting `druta/apps/web`.

### 2. Configure Railway service
1. Root directory: `druta/apps/web`
2. Build command: `bun install && bun run build`
3. Start command: `bun run start`

### 3. Set Railway env vars
1. `DATABASE_URL=<Neon pooled URL with sslmode=require>`
2. `AUTH_SECRET=<secure random secret>`
3. `AUTH_URL=https://<your-railway-domain>`
4. `ALLOW_DEV_AUTH=false`

### 4. Run migrations in Railway
1. Run: `bun run db:migrate`
2. Confirm migration table contains `0001_initial_schema.sql`.

### 5. Point mobile app to deployed backend
Update `druta/apps/mobile/.env`:
1. `EXPO_PUBLIC_BASE_URL=https://<your-railway-domain>`
2. `EXPO_PUBLIC_PROXY_BASE_URL=https://<your-railway-domain>`
3. `EXPO_PUBLIC_HOST=<your-railway-domain>`

Restart Expo after env updates.

## Local Backend Tunnel Utilities (Optional)
Use these only when backend is local and the phone needs internet-reachable access:
1. `cd druta/apps/web && bun run ngrok:start-free`
2. `cd druta/apps/web && bun run ngrok:sync-env`
3. Restart backend if `.env` changes stopped dev server.
4. `cd druta/apps/web && bun run ngrok:doctor`

## Smoke E2E
Run end-to-end smoke check (signup -> run save -> territory read -> challenge race):

1. Start backend with dev auth enabled:
   `cd druta/apps/web && ALLOW_DEV_AUTH=true bun run dev --host 127.0.0.1 --port 3001`
2. In another terminal:
   `cd druta/apps/web && SMOKE_BASE_URL=http://127.0.0.1:3001 bun run smoke:e2e`
