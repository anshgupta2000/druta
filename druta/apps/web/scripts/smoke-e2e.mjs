import assert from 'node:assert/strict';
import process from 'node:process';
import { loadEnvFromFiles } from './load-env.mjs';

loadEnvFromFiles();

const baseUrl = (process.env.SMOKE_BASE_URL || process.env.AUTH_URL || 'http://127.0.0.1:3000').replace(
  /\/+$/,
  ''
);

const readSetCookie = (response) => {
  if (typeof response.headers.getSetCookie === 'function') {
    const values = response.headers.getSetCookie();
    if (values.length > 0) {
      return values[0].split(';')[0];
    }
  }

  const raw = response.headers.get('set-cookie');
  if (!raw) {
    return null;
  }
  return raw.split(';')[0];
};

const request = async (path, { method = 'GET', body, cookie } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  let data = null;
  const text = await response.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
    cookie: readSetCookie(response),
  };
};

const ensureOk = (result, context) => {
  assert.equal(
    result.ok,
    true,
    `${context} failed with status ${result.status}: ${JSON.stringify(result.data)}`
  );
};

const createDevSession = async ({ email, name }) => {
  const result = await request('/api/auth/dev-session', {
    method: 'POST',
    body: {
      email,
      password: 'smoke-test',
      name,
      callbackUrl: '/',
    },
  });
  ensureOk(result, `Create dev session for ${email}`);
  assert.ok(result.cookie, `Expected auth cookie for ${email}`);
  return result.cookie;
};

const run = async () => {
  console.log(`Smoke E2E target: ${baseUrl}`);

  const devMode = await request('/api/auth/dev-mode');
  ensureOk(devMode, 'Read /api/auth/dev-mode');
  assert.equal(
    Boolean(devMode.data?.devMode),
    true,
    'Dev auth flow is disabled. Set ALLOW_DEV_AUTH=true (or remove AUTH_* locally) to run smoke:e2e.'
  );

  const idSuffix = Date.now();
  const userAEmail = `smoke-a-${idSuffix}@druta.local`;
  const userBEmail = `smoke-b-${idSuffix}@druta.local`;

  const cookieA = await createDevSession({ email: userAEmail, name: 'Smoke A' });
  const cookieB = await createDevSession({ email: userBEmail, name: 'Smoke B' });

  const profileAResult = await request('/api/profile', { cookie: cookieA });
  ensureOk(profileAResult, 'Load profile for user A');
  const profileBResult = await request('/api/profile', { cookie: cookieB });
  ensureOk(profileBResult, 'Load profile for user B');

  const userAId = profileAResult.data?.user?.id;
  const userBId = profileBResult.data?.user?.id;
  assert.ok(userAId, 'Missing user A id');
  assert.ok(userBId, 'Missing user B id');

  const runResult = await request('/api/runs', {
    method: 'POST',
    cookie: cookieA,
    body: {
      distance_km: 2.5,
      duration_seconds: 900,
      avg_pace: 10,
      territories_claimed: 1,
      route_data: JSON.stringify([
        { latitude: 37.7749, longitude: -122.4194, timestamp: Date.now() - 10000 },
        { latitude: 37.7754, longitude: -122.4189, timestamp: Date.now() },
      ]),
      started_at: new Date(Date.now() - 900000).toISOString(),
    },
  });
  ensureOk(runResult, 'Create run for user A');
  assert.ok(runResult.data?.run?.id, 'Run id missing');

  const gridLat = 123456 + (idSuffix % 50);
  const gridLng = 654321 + (idSuffix % 50);
  const claimResult = await request('/api/territories', {
    method: 'POST',
    cookie: cookieA,
    body: { grid_lat: gridLat, grid_lng: gridLng },
  });
  ensureOk(claimResult, 'Claim territory for user A');
  assert.ok(claimResult.data?.territory, 'Territory write missing');

  const territoriesResult = await request(
    `/api/territories?minLat=${gridLat - 1}&maxLat=${gridLat + 1}&minLng=${gridLng - 1}&maxLng=${gridLng + 1}`
  );
  ensureOk(territoriesResult, 'Read territories window');
  const territoryFound = (territoriesResult.data?.territories || []).some(
    (entry) => entry.grid_lat === gridLat && entry.grid_lng === gridLng && entry.owner_id === userAId
  );
  assert.equal(territoryFound, true, 'Expected claimed territory not found in read window');

  const challengeResult = await request('/api/races', {
    method: 'POST',
    cookie: cookieA,
    body: {
      opponent_id: userBId,
      race_type: 'distance',
      target_value: 1,
    },
  });
  ensureOk(challengeResult, 'Create race challenge');
  const raceId = challengeResult.data?.race?.id;
  assert.ok(raceId, 'Race id missing');

  const acceptResult = await request('/api/races', {
    method: 'PUT',
    cookie: cookieB,
    body: { race_id: raceId, action: 'accept' },
  });
  ensureOk(acceptResult, 'Accept race challenge');

  const finishResult = await request('/api/races', {
    method: 'PUT',
    cookie: cookieA,
    body: { race_id: raceId, action: 'update_distance', distance: 1.02 },
  });
  ensureOk(finishResult, 'Update race distance to finish');
  assert.equal(Boolean(finishResult.data?.finished), true, 'Race did not finish as expected');
  assert.equal(finishResult.data?.race?.winner_id, userAId, 'Unexpected race winner');

  console.log('Smoke E2E passed: signup -> run save -> territory read -> challenge race');
};

run().catch((error) => {
  console.error('Smoke E2E failed:', error.message);
  process.exit(1);
});
