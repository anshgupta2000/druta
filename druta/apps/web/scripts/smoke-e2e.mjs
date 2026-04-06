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

const latLngToGrid = (lat, lng) => {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos((lat * Math.PI) / 180);
  return {
    gridLat: Math.floor((lat * metersPerDegreeLat) / 200),
    gridLng: Math.floor((lng * metersPerDegreeLng) / 200),
  };
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

  const runStartedAt = new Date(Date.now() - 900000).toISOString();
  const runSessionStart = await request('/api/runs/live/start', {
    method: 'POST',
    cookie: cookieA,
    body: { started_at: runStartedAt },
  });
  ensureOk(runSessionStart, 'Start live run session for user A');
  const runSessionId = runSessionStart.data?.run_session_id;
  assert.ok(runSessionId, 'run_session_id missing');

  const now = Date.now();
  const routePoints = [
    { latitude: 37.7749, longitude: -122.4194, timestamp: now - 120000, accuracy: 8 },
    { latitude: 37.7752, longitude: -122.419, timestamp: now - 90000, accuracy: 7 },
    { latitude: 37.7755, longitude: -122.4186, timestamp: now - 60000, accuracy: 6 },
    { latitude: 37.7758, longitude: -122.4182, timestamp: now - 30000, accuracy: 6 },
  ];

  const liveChunkResult = await request('/api/runs/live/chunk', {
    method: 'POST',
    cookie: cookieA,
    body: {
      run_session_id: runSessionId,
      seq: 1,
      points: routePoints,
    },
  });
  ensureOk(liveChunkResult, 'Upload live run chunk for user A');

  const runFinishResult = await request('/api/runs/live/finish', {
    method: 'POST',
    cookie: cookieA,
    body: {
      run_session_id: runSessionId,
      distance_km: 2.5,
      duration_seconds: 900,
      avg_pace: 10,
      started_at: runStartedAt,
    },
  });
  ensureOk(runFinishResult, 'Finish live run for user A');
  assert.ok(runFinishResult.data?.run?.id, 'Run id missing after live finish');

  const routeGrids = routePoints.map((point) => latLngToGrid(point.latitude, point.longitude));
  const minGridLat = Math.min(...routeGrids.map((item) => item.gridLat)) - 2;
  const maxGridLat = Math.max(...routeGrids.map((item) => item.gridLat)) + 2;
  const minGridLng = Math.min(...routeGrids.map((item) => item.gridLng)) - 2;
  const maxGridLng = Math.max(...routeGrids.map((item) => item.gridLng)) + 2;
  const territoriesResult = await request(
    `/api/territories?minLat=${minGridLat}&maxLat=${maxGridLat}&minLng=${minGridLng}&maxLng=${maxGridLng}`
  );
  ensureOk(territoriesResult, 'Read territories window');
  const routeGridSet = new Set(routeGrids.map((item) => `${item.gridLat}:${item.gridLng}`));
  const territoryFound = (territoriesResult.data?.territories || []).some((entry) => {
    return routeGridSet.has(`${entry.grid_lat}:${entry.grid_lng}`) && entry.owner_id === userAId;
  });
  assert.equal(territoryFound, true, 'Expected claimed territory not found in route window');

  const runListResult = await request('/api/runs', { cookie: cookieA });
  ensureOk(runListResult, 'Read runs after live finish');
  const claimedFromRunHistory = (runListResult.data?.runs || []).some(
    (entry) =>
      Number(entry.id) === Number(runFinishResult.data?.run?.id) && Number(entry.territories_claimed) > 0
  );
  assert.equal(claimedFromRunHistory, true, 'Run history did not record territories_claimed');

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
