const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

type AuthUser = {
  id: string;
  email?: string;
  name?: string;
};

type AuthPayload = {
  jwt?: string;
  user?: AuthUser;
} | null;

type LocalUser = {
  id: string;
  username: string;
  name: string;
  email: string | null;
  image: string | null;
  total_distance_km: number;
  total_runs: number;
  territories_owned: number;
  wins: number;
  losses: number;
  avatar_color: string;
  avatar_url: string | null;
  avatar_code: string | null;
  avatar_thumbnail_url: string | null;
  outfit_loadout: Record<string, unknown>;
};

type LocalRun = {
  id: number;
  user_id: string;
  distance_km: number;
  duration_seconds: number;
  avg_pace: number | null;
  territories_claimed: number;
  started_at: string;
  ended_at: string;
  created_at: string;
};

type LocalFriend = {
  id: number;
  user_id: string;
  friend_id: string;
  status: 'pending' | 'accepted';
  created_at: string;
};

type LocalRace = {
  id: number;
  challenger_id: string;
  opponent_id: string;
  race_type: string;
  target_value: number;
  status: 'pending' | 'active' | 'declined' | 'finished';
  challenger_distance: number;
  opponent_distance: number;
  winner_id: string | null;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
};

type LocalTerritory = {
  id: number;
  grid_lat: number;
  grid_lng: number;
  owner_id: string;
  owner_username: string;
  strength: number;
  last_run_at: string;
};

type LocalRunSession = {
  id: number;
  user_id: string;
  status: 'active' | 'finished' | 'aborted';
  started_at: string;
  ended_at: string | null;
  last_seq: number;
  last_point: {
    latitude: number;
    longitude: number;
    timestamp: number;
    accuracy: number | null;
  } | null;
  territories_claimed: number;
  territories_captured: number;
  territories_strengthened: number;
  total_segments_applied: number;
  total_segments_rejected: number;
  run_id: number | null;
};

const state: {
  users: Map<string, LocalUser>;
  runs: LocalRun[];
  runSessions: LocalRunSession[];
  runSessionChunks: Map<
    string,
    {
      point_count: number;
      applied_segments: number;
      rejected_segments: number;
      changed_tiles: Array<Record<string, unknown>>;
    }
  >;
  territoryContributions: Map<string, Map<string, number>>;
  runSessionTileStats: Map<
    string,
    {
      distance_m: number;
      was_claimed: boolean;
      was_captured: boolean;
      was_strengthened: boolean;
    }
  >;
  friends: LocalFriend[];
  races: LocalRace[];
  territories: LocalTerritory[];
  ids: {
    run: number;
    runSession: number;
    friend: number;
    race: number;
    territory: number;
  };
} = {
  users: new Map(),
  runs: [],
  runSessions: [],
  runSessionChunks: new Map(),
  territoryContributions: new Map(),
  runSessionTileStats: new Map(),
  friends: [],
  races: [],
  territories: [],
  ids: { run: 1, runSession: 1, friend: 1, race: 1, territory: 1 },
};

const colorPalette = ['#3B82F6', '#22C55E', '#F97316', '#A855F7', '#14B8A6'];

const colorForUser = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return colorPalette[Math.abs(hash) % colorPalette.length];
};

const GRID_SIZE_METERS = 200;
const METERS_PER_DEGREE_LAT = 111320;
const MIN_SEGMENT_DISTANCE_METERS = 1;
const MAX_POINT_ACCURACY_METERS = 80;
const MAX_SEGMENT_SPEED_MPS = 12;
const MAX_SEGMENT_DISTANCE_METERS = 450;
const SEGMENT_ALLOCATION_STEP_METERS = 20;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toTimestampMs = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const haversineDistanceMeters = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const toRad = (num: number) => (num * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371000 * c;
};

const latLngToGrid = (lat: number, lng: number) => {
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180);
  const gridLat = Math.floor((lat * METERS_PER_DEGREE_LAT) / GRID_SIZE_METERS);
  const gridLng = Math.floor((lng * metersPerDegreeLng) / GRID_SIZE_METERS);
  return { gridLat, gridLng };
};

const normalizePoint = (point: any) => {
  if (!point || typeof point !== 'object') return null;
  const latitude = Number(point.latitude);
  const longitude = Number(point.longitude);
  const timestamp = toTimestampMs(point.timestamp);
  const accuracy =
    typeof point.accuracy === 'number' && Number.isFinite(point.accuracy)
      ? Math.max(0, point.accuracy)
      : null;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(timestamp)) {
    return null;
  }

  return { latitude, longitude, timestamp, accuracy };
};

const normalizePoints = (points: unknown) => {
  if (!Array.isArray(points)) return [];
  const normalized = [];
  for (const point of points) {
    const parsed = normalizePoint(point);
    if (parsed) normalized.push(parsed);
  }
  return normalized;
};

const tileKey = (gridLat: number, gridLng: number) => `${gridLat}:${gridLng}`;
const sessionChunkKey = (runSessionId: number, seq: number) => `${runSessionId}:${seq}`;
const contributionSubjectKey = (subjectType: string, subjectId: string) => `${subjectType}:${subjectId}`;
const runSessionTileKey = (
  runSessionId: number,
  gridLat: number,
  gridLng: number,
  subjectType: string,
  subjectId: string
) => `${runSessionId}:${gridLat}:${gridLng}:${subjectType}:${subjectId}`;

const resolveTopOwner = (
  contributionMap: Map<string, number>,
  currentOwnerId: string | null | undefined
) => {
  if (!contributionMap || contributionMap.size === 0) return null;

  const sorted = Array.from(contributionMap.entries())
    .map(([subjectKey, distance_m]) => ({
      subject_id: subjectKey.split(':').slice(1).join(':'),
      distance_m,
    }))
    .sort((a, b) => {
      if (b.distance_m !== a.distance_m) {
        return b.distance_m - a.distance_m;
      }
      return a.subject_id.localeCompare(b.subject_id);
    });

  if (sorted.length === 0) return null;

  const maxDistance = sorted[0].distance_m;
  const contenders = sorted
    .filter((entry) => entry.distance_m === maxDistance)
    .map((entry) => entry.subject_id);

  let ownerId;
  if (contenders.length === 1) {
    ownerId = contenders[0];
  } else if (currentOwnerId && contenders.includes(currentOwnerId)) {
    ownerId = currentOwnerId;
  } else {
    ownerId = [...contenders].sort((a, b) => a.localeCompare(b))[0];
  }

  const ownerDistance = sorted.find((entry) => entry.subject_id === ownerId)?.distance_m ?? 0;
  const secondDistance = sorted.find((entry) => entry.subject_id !== ownerId)?.distance_m ?? 0;
  return {
    owner_id: ownerId,
    owner_distance_m: ownerDistance,
    second_distance_m: secondDistance,
    lead_m: Math.max(0, ownerDistance - secondDistance),
  };
};

const allocateSegmentAcrossTiles = (
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number },
  distanceMeters: number
) => {
  const steps = Math.max(1, Math.ceil(distanceMeters / SEGMENT_ALLOCATION_STEP_METERS));
  const perStep = distanceMeters / steps;
  const allocations = new Map<string, { grid_lat: number; grid_lng: number; distance_m: number }>();

  for (let i = 0; i < steps; i += 1) {
    const t1 = i / steps;
    const t2 = (i + 1) / steps;
    const mid = (t1 + t2) / 2;
    const latitude = start.latitude + (end.latitude - start.latitude) * mid;
    const longitude = start.longitude + (end.longitude - start.longitude) * mid;
    const { gridLat, gridLng } = latLngToGrid(latitude, longitude);
    const key = tileKey(gridLat, gridLng);
    const existing = allocations.get(key);
    if (existing) {
      existing.distance_m += perStep;
    } else {
      allocations.set(key, { grid_lat: gridLat, grid_lng: gridLng, distance_m: perStep });
    }
  }

  return allocations;
};

const upsertRunSessionTileStats = ({
  runSessionId,
  gridLat,
  gridLng,
  subjectType,
  subjectId,
  distanceMeters,
  wasClaimed,
  wasCaptured,
  wasStrengthened,
}: {
  runSessionId: number;
  gridLat: number;
  gridLng: number;
  subjectType: string;
  subjectId: string;
  distanceMeters: number;
  wasClaimed: boolean;
  wasCaptured: boolean;
  wasStrengthened: boolean;
}) => {
  const key = runSessionTileKey(runSessionId, gridLat, gridLng, subjectType, subjectId);
  const existing = state.runSessionTileStats.get(key);
  if (existing) {
    existing.distance_m += distanceMeters;
    existing.was_claimed = existing.was_claimed || wasClaimed;
    existing.was_captured = existing.was_captured || wasCaptured;
    existing.was_strengthened = existing.was_strengthened || wasStrengthened;
  } else {
    state.runSessionTileStats.set(key, {
      distance_m: distanceMeters,
      was_claimed: wasClaimed,
      was_captured: wasCaptured,
      was_strengthened: wasStrengthened,
    });
  }
};

const recomputeRunSessionStats = (runSessionId: number, userId: string) => {
  let territories_claimed = 0;
  let territories_captured = 0;
  let territories_strengthened = 0;

  for (const [key, value] of Array.from(state.runSessionTileStats.entries())) {
    const parts = key.split(':');
    if (parts.length < 5) continue;
    const sessionId = Number(parts[0]);
    const subjectType = parts[3];
    const subjectId = parts.slice(4).join(':');
    if (sessionId !== runSessionId || subjectType !== 'user' || subjectId !== userId) {
      continue;
    }
    if (value.was_claimed) territories_claimed += 1;
    if (value.was_captured) territories_captured += 1;
    if (value.was_strengthened) territories_strengthened += 1;
  }

  return { territories_claimed, territories_captured, territories_strengthened };
};

const getBody = (init?: RequestInit) => {
  if (!init?.body || typeof init.body !== 'string') {
    return {};
  }
  try {
    return JSON.parse(init.body);
  } catch {
    return {};
  }
};

const requireUser = (auth: AuthPayload) => {
  const user = auth?.user;
  if (!user?.id) {
    return null;
  }
  if (!state.users.has(user.id)) {
    const usernameBase =
      user.email?.split('@')?.[0] || user.name?.replace(/\s+/g, '').toLowerCase() || 'runner';
    state.users.set(user.id, {
      id: user.id,
      username: usernameBase.slice(0, 24),
      name: user.name || usernameBase,
      email: user.email || null,
      image: null,
      total_distance_km: 0,
      total_runs: 0,
      territories_owned: 0,
      wins: 0,
      losses: 0,
      avatar_color: colorForUser(user.id),
      avatar_url: null,
      avatar_code: null,
      avatar_thumbnail_url: null,
      outfit_loadout: {},
    });
  }
  return state.users.get(user.id)!;
};

const withRaceUsers = (race: LocalRace) => {
  const challenger = state.users.get(race.challenger_id);
  const opponent = state.users.get(race.opponent_id);
  return {
    ...race,
    challenger_username: challenger?.username || challenger?.name || 'Runner',
    challenger_color: challenger?.avatar_color || '#3B82F6',
    opponent_username: opponent?.username || opponent?.name || 'Runner',
    opponent_color: opponent?.avatar_color || '#22C55E',
  };
};

const listLeaderboard = (sortBy: string) => {
  const users = Array.from(state.users.values());
  if (sortBy === 'distance') {
    users.sort((a, b) => b.total_distance_km - a.total_distance_km);
  } else if (sortBy === 'wins') {
    users.sort((a, b) => b.wins - a.wins);
  } else {
    users.sort((a, b) => b.territories_owned - a.territories_owned);
  }
  return users.slice(0, 50);
};

const handleProfile = (method: string, auth: AuthPayload, init?: RequestInit) => {
  const user = requireUser(auth);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (method === 'GET') return jsonResponse({ user });

  if (method === 'PUT') {
    const body = getBody(init);
    const editableFields = [
      'username',
      'avatar_color',
      'avatar_url',
      'avatar_code',
      'avatar_thumbnail_url',
      'outfit_loadout',
    ] as const;

    for (const key of editableFields) {
      if (body[key] !== undefined) {
        // @ts-ignore index signature
        user[key] = body[key];
      }
    }
    state.users.set(user.id, user);
    return jsonResponse({ user });
  }

  return jsonResponse({ error: 'Method Not Allowed' }, 405);
};

const handleRuns = (method: string, auth: AuthPayload, init?: RequestInit) => {
  const user = requireUser(auth);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

  if (method === 'GET') {
    const runs = state.runs
      .filter((run) => run.user_id === user.id)
      .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
      .slice(0, 50);
    return jsonResponse({ runs });
  }

  if (method === 'POST') {
    const body = getBody(init);
    const now = new Date().toISOString();
    const run: LocalRun = {
      id: state.ids.run++,
      user_id: user.id,
      distance_km: Number(body.distance_km || 0),
      duration_seconds: Number(body.duration_seconds || 0),
      avg_pace: body.avg_pace ? Number(body.avg_pace) : null,
      territories_claimed: Number(body.territories_claimed || 0),
      started_at: body.started_at || now,
      ended_at: now,
      created_at: now,
    };

    state.runs.push(run);
    user.total_distance_km += run.distance_km;
    user.total_runs += 1;
    state.users.set(user.id, user);

    return jsonResponse({ run });
  }

  return jsonResponse({ error: 'Method Not Allowed' }, 405);
};

const applyDistanceToTile = ({
  runSessionId,
  user,
  gridLat,
  gridLng,
  distanceMeters,
  touchedAt,
}: {
  runSessionId: number;
  user: LocalUser;
  gridLat: number;
  gridLng: number;
  distanceMeters: number;
  touchedAt: string;
}) => {
  const tileKeyValue = tileKey(gridLat, gridLng);
  const contributionMap = state.territoryContributions.get(tileKeyValue) || new Map<string, number>();
  const subjectKey = contributionSubjectKey('user', user.id);
  contributionMap.set(subjectKey, (contributionMap.get(subjectKey) || 0) + distanceMeters);
  state.territoryContributions.set(tileKeyValue, contributionMap);

  const existingTerritory =
    state.territories.find((tile) => tile.grid_lat === gridLat && tile.grid_lng === gridLng) || null;
  const previousOwnerId = existingTerritory?.owner_id || null;
  const previousStrength = existingTerritory?.strength ?? 1;
  const ownership = resolveTopOwner(contributionMap, existingTerritory?.owner_id);
  if (!ownership) {
    return null;
  }

  const nextOwnerId = ownership.owner_id;
  const nextOwner = state.users.get(nextOwnerId);
  const nextOwnerUsername = nextOwner?.username || nextOwner?.name || 'Runner';
  const nextStrength = clamp(Math.floor(ownership.lead_m / 50) + 1, 1, 10);

  let wasClaimed = false;
  let wasCaptured = false;
  let wasStrengthened = false;

  if (!existingTerritory) {
    state.territories.push({
      id: state.ids.territory++,
      grid_lat: gridLat,
      grid_lng: gridLng,
      owner_id: nextOwnerId,
      owner_username: nextOwnerUsername,
      strength: nextStrength,
      last_run_at: touchedAt,
    });
    if (nextOwner) {
      nextOwner.territories_owned += 1;
    }
    wasClaimed = true;
  } else if (existingTerritory.owner_id !== nextOwnerId) {
    const previousOwner = state.users.get(existingTerritory.owner_id);
    if (previousOwner) {
      previousOwner.territories_owned = Math.max(0, previousOwner.territories_owned - 1);
    }
    if (nextOwner) {
      nextOwner.territories_owned += 1;
    }
    existingTerritory.owner_id = nextOwnerId;
    existingTerritory.owner_username = nextOwnerUsername;
    existingTerritory.strength = nextStrength;
    existingTerritory.last_run_at = touchedAt;
    wasCaptured = true;
  } else {
    wasStrengthened = nextStrength > previousStrength;
    existingTerritory.owner_username = nextOwnerUsername;
    existingTerritory.strength = nextStrength;
    existingTerritory.last_run_at = touchedAt;
  }

  upsertRunSessionTileStats({
    runSessionId,
    gridLat,
    gridLng,
    subjectType: 'user',
    subjectId: user.id,
    distanceMeters,
    wasClaimed,
    wasCaptured,
    wasStrengthened,
  });

  const ownerChanged = !existingTerritory || previousOwnerId !== nextOwnerId;
  const strengthChanged = !existingTerritory || previousStrength !== nextStrength;
  if (!ownerChanged && !strengthChanged) {
    return null;
  }

  return {
    grid_lat: gridLat,
    grid_lng: gridLng,
    owner_id: nextOwnerId,
    owner_username: nextOwnerUsername,
    strength: nextStrength,
    lead_m: Math.round(ownership.lead_m * 100) / 100,
    last_run_at: touchedAt,
  };
};

const processRunSessionChunk = ({
  user,
  runSessionId,
  seq,
  points,
}: {
  user: LocalUser;
  runSessionId: number;
  seq: number;
  points: unknown;
}) => {
  const runSession = state.runSessions.find((session) => session.id === runSessionId);
  if (!runSession || runSession.user_id !== user.id) {
    return { error: 'Run session not found', status: 404 };
  }
  if (runSession.status !== 'active') {
    return { error: 'Run session is not active', status: 409 };
  }
  if (!Number.isInteger(seq) || seq <= 0) {
    return { error: 'seq must be a positive integer', status: 400 };
  }

  if (seq <= runSession.last_seq) {
    const existingChunk = state.runSessionChunks.get(sessionChunkKey(runSessionId, seq));
    if (existingChunk) {
      return {
        applied_segments: existingChunk.applied_segments,
        rejected_segments: existingChunk.rejected_segments,
        changed_tiles: existingChunk.changed_tiles,
        live_stats: {
          territories_claimed: runSession.territories_claimed,
          territories_captured: runSession.territories_captured,
          territories_strengthened: runSession.territories_strengthened,
          total_segments_applied: runSession.total_segments_applied,
          total_segments_rejected: runSession.total_segments_rejected,
        },
        duplicate: true,
      };
    }
    return { error: 'Out-of-order chunk', status: 409, expected_seq: runSession.last_seq + 1 };
  }

  if (seq !== runSession.last_seq + 1) {
    return { error: 'Out-of-order chunk', status: 409, expected_seq: runSession.last_seq + 1 };
  }

  const normalizedPoints = normalizePoints(points);
  const tileDistanceMap = new Map<string, { grid_lat: number; grid_lng: number; distance_m: number }>();

  let previousPoint = runSession.last_point;
  let rejectedSegments = 0;
  let appliedSegments = 0;

  for (const point of normalizedPoints) {
    if (point.accuracy !== null && point.accuracy > MAX_POINT_ACCURACY_METERS) {
      rejectedSegments += 1;
      continue;
    }

    if (!previousPoint) {
      previousPoint = point;
      continue;
    }

    if (point.timestamp <= previousPoint.timestamp) {
      rejectedSegments += 1;
      continue;
    }

    const segmentDistanceMeters = haversineDistanceMeters(
      previousPoint.latitude,
      previousPoint.longitude,
      point.latitude,
      point.longitude
    );
    const elapsedSeconds = (point.timestamp - previousPoint.timestamp) / 1000;

    if (elapsedSeconds <= 0) {
      rejectedSegments += 1;
      continue;
    }

    const speedMps = segmentDistanceMeters / elapsedSeconds;
    if (segmentDistanceMeters > MAX_SEGMENT_DISTANCE_METERS || speedMps > MAX_SEGMENT_SPEED_MPS) {
      rejectedSegments += 1;
      previousPoint = point;
      continue;
    }

    if (segmentDistanceMeters < MIN_SEGMENT_DISTANCE_METERS) {
      previousPoint = point;
      continue;
    }

    const segmentAllocations = allocateSegmentAcrossTiles(previousPoint, point, segmentDistanceMeters);
    for (const [key, allocation] of Array.from(segmentAllocations.entries())) {
      const existing = tileDistanceMap.get(key);
      if (existing) {
        existing.distance_m += allocation.distance_m;
      } else {
        tileDistanceMap.set(key, { ...allocation });
      }
    }

    appliedSegments += 1;
    previousPoint = point;
  }

  const touchedAt = previousPoint
    ? new Date(previousPoint.timestamp).toISOString()
    : new Date().toISOString();
  const changedTiles: Array<Record<string, unknown>> = [];

  for (const allocation of Array.from(tileDistanceMap.values())) {
    const changedTile = applyDistanceToTile({
      runSessionId,
      user,
      gridLat: allocation.grid_lat,
      gridLng: allocation.grid_lng,
      distanceMeters: allocation.distance_m,
      touchedAt,
    });
    if (changedTile) {
      changedTiles.push(changedTile);
    }
  }

  const stats = recomputeRunSessionStats(runSessionId, user.id);
  runSession.last_seq = seq;
  runSession.last_point = previousPoint;
  runSession.territories_claimed = stats.territories_claimed;
  runSession.territories_captured = stats.territories_captured;
  runSession.territories_strengthened = stats.territories_strengthened;
  runSession.total_segments_applied += appliedSegments;
  runSession.total_segments_rejected += rejectedSegments;

  state.runSessionChunks.set(sessionChunkKey(runSessionId, seq), {
    point_count: normalizedPoints.length,
    applied_segments: appliedSegments,
    rejected_segments: rejectedSegments,
    changed_tiles: changedTiles,
  });

  return {
    applied_segments: appliedSegments,
    rejected_segments: rejectedSegments,
    changed_tiles: changedTiles,
    live_stats: {
      territories_claimed: runSession.territories_claimed,
      territories_captured: runSession.territories_captured,
      territories_strengthened: runSession.territories_strengthened,
      total_segments_applied: runSession.total_segments_applied,
      total_segments_rejected: runSession.total_segments_rejected,
    },
    duplicate: false,
  };
};

const handleRunsLiveStart = (method: string, auth: AuthPayload, init?: RequestInit) => {
  if (method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }
  const user = requireUser(auth);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

  const body = getBody(init);
  const started_at =
    typeof body.started_at === 'string' && body.started_at.trim().length > 0
      ? body.started_at
      : new Date().toISOString();

  const runSession: LocalRunSession = {
    id: state.ids.runSession++,
    user_id: user.id,
    status: 'active',
    started_at,
    ended_at: null,
    last_seq: 0,
    last_point: null,
    territories_claimed: 0,
    territories_captured: 0,
    territories_strengthened: 0,
    total_segments_applied: 0,
    total_segments_rejected: 0,
    run_id: null,
  };
  state.runSessions.push(runSession);
  return jsonResponse({
    run_session_id: runSession.id,
    status: runSession.status,
    started_at: runSession.started_at,
  });
};

const handleRunsLiveChunk = (method: string, auth: AuthPayload, init?: RequestInit) => {
  if (method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }
  const user = requireUser(auth);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

  const body = getBody(init);
  const runSessionId = Number(body.run_session_id);
  const seq = Number(body.seq);
  if (!Number.isFinite(runSessionId) || runSessionId <= 0) {
    return jsonResponse({ error: 'run_session_id is required' }, 400);
  }

  const result = processRunSessionChunk({
    user,
    runSessionId,
    seq,
    points: body.points,
  });

  if ('error' in result) {
    return jsonResponse(
      {
        error: result.error,
        ...(result.expected_seq ? { expected_seq: result.expected_seq } : {}),
      },
      result.status || 400
    );
  }

  return jsonResponse({
    applied_segments: result.applied_segments,
    rejected_segments: result.rejected_segments,
    changed_tiles: result.changed_tiles,
    live_stats: result.live_stats,
    duplicate: result.duplicate,
  });
};

const handleRunsLiveFinish = (method: string, auth: AuthPayload, init?: RequestInit) => {
  if (method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }
  const user = requireUser(auth);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

  const body = getBody(init);
  const runSessionId = Number(body.run_session_id);
  if (!Number.isFinite(runSessionId) || runSessionId <= 0) {
    return jsonResponse({ error: 'run_session_id is required' }, 400);
  }

  const runSession = state.runSessions.find((session) => session.id === runSessionId);
  if (!runSession || runSession.user_id !== user.id) {
    return jsonResponse({ error: 'Run session not found' }, 404);
  }

  if (runSession.status === 'finished') {
    const run = runSession.run_id ? state.runs.find((entry) => entry.id === runSession.run_id) : null;
    return jsonResponse({
      run: run || null,
      territory_summary: {
        territories_claimed: runSession.territories_claimed,
        territories_captured: runSession.territories_captured,
        territories_strengthened: runSession.territories_strengthened,
        total_segments_applied: runSession.total_segments_applied,
        total_segments_rejected: runSession.total_segments_rejected,
      },
      duplicate: true,
    });
  }

  const finalPoints = normalizePoints(body.final_points);
  if (finalPoints.length > 0) {
    const chunkResult = processRunSessionChunk({
      user,
      runSessionId,
      seq: runSession.last_seq + 1,
      points: finalPoints,
    });
    if ('error' in chunkResult) {
      return jsonResponse({ error: chunkResult.error }, chunkResult.status || 400);
    }
  }

  const finalDistanceKm = Math.max(0, toNumber(body.distance_km));
  const finalDurationSeconds = Math.max(0, Math.floor(toNumber(body.duration_seconds)));
  const finalAvgPace = Number.isFinite(Number(body.avg_pace)) ? Number(body.avg_pace) : null;

  let run: LocalRun | null = null;
  if (finalDistanceKm > 0.01) {
    const now = new Date().toISOString();
    run = {
      id: state.ids.run++,
      user_id: user.id,
      distance_km: Math.round(finalDistanceKm * 1000) / 1000,
      duration_seconds: finalDurationSeconds,
      avg_pace: finalAvgPace,
      territories_claimed: runSession.territories_claimed,
      started_at:
        typeof body.started_at === 'string' && body.started_at.trim().length > 0
          ? body.started_at
          : runSession.started_at,
      ended_at: now,
      created_at: now,
    };
    state.runs.push(run);
    user.total_distance_km += run.distance_km;
    user.total_runs += 1;
    runSession.run_id = run.id;
  }

  runSession.status = 'finished';
  runSession.ended_at = new Date().toISOString();

  return jsonResponse({
    run,
    territory_summary: {
      territories_claimed: runSession.territories_claimed,
      territories_captured: runSession.territories_captured,
      territories_strengthened: runSession.territories_strengthened,
      total_segments_applied: runSession.total_segments_applied,
      total_segments_rejected: runSession.total_segments_rejected,
    },
    duplicate: false,
  });
};

const handleFriends = (method: string, auth: AuthPayload, init?: RequestInit) => {
  const user = requireUser(auth);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

  if (method === 'GET') {
    const friends = state.friends
      .filter(
        (f) => (f.user_id === user.id || f.friend_id === user.id) && f.status === 'accepted'
      )
      .map((f) => {
        const friendUserId = f.user_id === user.id ? f.friend_id : f.user_id;
        const friend = state.users.get(friendUserId);
        return {
          ...f,
          friend_user_id: friendUserId,
          username: friend?.username || 'runner',
          name: friend?.name || 'Runner',
          image: friend?.image || null,
          total_distance_km: friend?.total_distance_km || 0,
          total_runs: friend?.total_runs || 0,
          territories_owned: friend?.territories_owned || 0,
          wins: friend?.wins || 0,
          avatar_color: friend?.avatar_color || '#3B82F6',
        };
      });

    const pending = state.friends
      .filter((f) => f.friend_id === user.id && f.status === 'pending')
      .map((f) => {
        const requester = state.users.get(f.user_id);
        return {
          id: f.id,
          requester_id: f.user_id,
          created_at: f.created_at,
          username: requester?.username || 'runner',
          name: requester?.name || 'Runner',
          image: requester?.image || null,
          avatar_color: requester?.avatar_color || '#3B82F6',
        };
      });

    return jsonResponse({ friends, pending });
  }

  if (method === 'POST') {
    const body = getBody(init);

    if (body.action === 'accept' && body.friend_request_id) {
      const target = state.friends.find(
        (f) => f.id === Number(body.friend_request_id) && f.friend_id === user.id
      );
      if (!target) return jsonResponse({ error: 'Friend request not found' }, 404);
      target.status = 'accepted';
      return jsonResponse({ friend: target });
    }

    if (body.action === 'decline' && body.friend_request_id) {
      const idx = state.friends.findIndex(
        (f) => f.id === Number(body.friend_request_id) && f.friend_id === user.id
      );
      if (idx >= 0) state.friends.splice(idx, 1);
      return jsonResponse({ success: true });
    }

    if (typeof body.friend_username === 'string' && body.friend_username.trim()) {
      const friend = Array.from(state.users.values()).find(
        (u) => u.username === body.friend_username.trim()
      );
      if (!friend) return jsonResponse({ error: 'User not found' }, 404);
      if (friend.id === user.id) return jsonResponse({ error: 'Cannot add yourself' }, 400);

      const exists = state.friends.some(
        (f) =>
          (f.user_id === user.id && f.friend_id === friend.id) ||
          (f.user_id === friend.id && f.friend_id === user.id)
      );
      if (exists) return jsonResponse({ error: 'Already friends or request pending' }, 400);

      const request = {
        id: state.ids.friend++,
        user_id: user.id,
        friend_id: friend.id,
        status: 'pending' as const,
        created_at: new Date().toISOString(),
      };
      state.friends.push(request);
      return jsonResponse({ friend: request });
    }
  }

  return jsonResponse({ error: 'Invalid request' }, 400);
};

const handleRaces = (method: string, auth: AuthPayload, url: URL, init?: RequestInit) => {
  const user = requireUser(auth);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

  if (method === 'GET') {
    const status = url.searchParams.get('status');
    const races = state.races
      .filter((r) => r.challenger_id === user.id || r.opponent_id === user.id)
      .filter((r) => (status ? r.status === status : true))
      .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
      .slice(0, 20)
      .map(withRaceUsers);
    return jsonResponse({ races });
  }

  const body = getBody(init);

  if (method === 'POST') {
    if (!body.opponent_id) {
      return jsonResponse({ error: 'opponent_id is required' }, 400);
    }
    requireUser({ user: { id: body.opponent_id } });
    const race: LocalRace = {
      id: state.ids.race++,
      challenger_id: user.id,
      opponent_id: String(body.opponent_id),
      race_type: body.race_type || 'distance',
      target_value: Number(body.target_value || 1),
      status: 'pending',
      challenger_distance: 0,
      opponent_distance: 0,
      winner_id: null,
      created_at: new Date().toISOString(),
      started_at: null,
      ended_at: null,
    };
    state.races.push(race);
    return jsonResponse({ race: withRaceUsers(race) });
  }

  if (method === 'PUT') {
    const raceId = Number(body.race_id);
    const race = state.races.find((r) => r.id === raceId);
    if (!race) return jsonResponse({ error: 'Race not found' }, 404);

    if (body.action === 'accept') {
      if (race.opponent_id !== user.id) {
        return jsonResponse({ error: 'Not your race to accept' }, 403);
      }
      race.status = 'active';
      race.started_at = new Date().toISOString();
      return jsonResponse({ race: withRaceUsers(race) });
    }

    if (body.action === 'decline') {
      race.status = 'declined';
      return jsonResponse({ race: withRaceUsers(race) });
    }

    if (body.action === 'update_distance') {
      const value = Number(body.distance || 0);
      if (race.challenger_id === user.id) {
        race.challenger_distance = value;
      } else if (race.opponent_id === user.id) {
        race.opponent_distance = value;
      }

      if (
        race.race_type === 'distance' &&
        (race.challenger_distance >= race.target_value ||
          race.opponent_distance >= race.target_value)
      ) {
        race.status = 'finished';
        race.ended_at = new Date().toISOString();
        race.winner_id =
          race.challenger_distance >= race.target_value ? race.challenger_id : race.opponent_id;
        const loserId = race.winner_id === race.challenger_id ? race.opponent_id : race.challenger_id;
        const winner = state.users.get(race.winner_id);
        const loser = state.users.get(loserId);
        if (winner) winner.wins += 1;
        if (loser) loser.losses += 1;
        return jsonResponse({ race: withRaceUsers(race), finished: true });
      }

      return jsonResponse({ race: withRaceUsers(race) });
    }
  }

  return jsonResponse({ error: 'Invalid request' }, 400);
};

const handleTerritories = (method: string, auth: AuthPayload, url: URL, init?: RequestInit) => {
  if (method === 'GET') {
    const minLat = Number(url.searchParams.get('minLat') || 0);
    const maxLat = Number(url.searchParams.get('maxLat') || 0);
    const minLng = Number(url.searchParams.get('minLng') || 0);
    const maxLng = Number(url.searchParams.get('maxLng') || 0);

    const territories = state.territories
      .filter(
        (t) =>
          t.grid_lat >= minLat &&
          t.grid_lat <= maxLat &&
          t.grid_lng >= minLng &&
          t.grid_lng <= maxLng
      )
      .slice(0, 500);
    return jsonResponse({ territories });
  }

  if (method === 'POST') {
    const user = requireUser(auth);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
    const body = getBody(init);
    const gridLat = Number(body.grid_lat);
    const gridLng = Number(body.grid_lng);

    if (!Number.isFinite(gridLat) || !Number.isFinite(gridLng)) {
      return jsonResponse({ error: 'grid_lat and grid_lng required' }, 400);
    }

    let territory = state.territories.find((t) => t.grid_lat === gridLat && t.grid_lng === gridLng);
    let claimed = false;

    if (!territory) {
      territory = {
        id: state.ids.territory++,
        grid_lat: gridLat,
        grid_lng: gridLng,
        owner_id: user.id,
        owner_username: user.username || user.name || 'Runner',
        strength: 1,
        last_run_at: new Date().toISOString(),
      };
      state.territories.push(territory);
      claimed = true;
      user.territories_owned += 1;
    } else if (territory.owner_id === user.id) {
      territory.strength = Math.min((territory.strength || 1) + 1, 10);
      territory.last_run_at = new Date().toISOString();
    } else {
      territory.strength = (territory.strength || 1) - 1;
      territory.last_run_at = new Date().toISOString();
      if (territory.strength <= 0) {
        const previousOwner = state.users.get(territory.owner_id);
        if (previousOwner) {
          previousOwner.territories_owned = Math.max(0, previousOwner.territories_owned - 1);
        }
        territory.owner_id = user.id;
        territory.owner_username = user.username || user.name || 'Runner';
        territory.strength = 1;
        user.territories_owned += 1;
        claimed = true;
      }
    }

    return jsonResponse({ territory, claimed });
  }

  return jsonResponse({ error: 'Method Not Allowed' }, 405);
};

export const shouldUseLocalApiFallback = () => {
  // Local API fallback must be an explicit opt-in. We do not silently switch
  // to in-memory state for QA/production-style environments.
  return process.env.EXPO_PUBLIC_FORCE_LOCAL_API === 'true';
};

export const handleLocalApiRequest = async ({
  url,
  init,
  auth,
}: {
  url: string;
  init?: RequestInit;
  auth: AuthPayload;
}): Promise<Response | null> => {
  if (!url) return null;

  const parsed = new URL(url, 'http://localhost');
  if (!parsed.pathname.startsWith('/api/')) {
    return null;
  }

  const method = (init?.method || 'GET').toUpperCase();
  const path = parsed.pathname;

  if (path === '/api/runs/live/start') return handleRunsLiveStart(method, auth, init);
  if (path === '/api/runs/live/chunk') return handleRunsLiveChunk(method, auth, init);
  if (path === '/api/runs/live/finish') return handleRunsLiveFinish(method, auth, init);
  if (path === '/api/profile') return handleProfile(method, auth, init);
  if (path === '/api/runs') return handleRuns(method, auth, init);
  if (path === '/api/friends') return handleFriends(method, auth, init);
  if (path === '/api/races') return handleRaces(method, auth, parsed, init);
  if (path === '/api/territories') return handleTerritories(method, auth, parsed, init);
  if (path === '/api/leaderboard') {
    const sortBy = parsed.searchParams.get('sort') || 'territories';
    return jsonResponse({ leaderboard: listLeaderboard(sortBy) });
  }
  if (path === '/api/auth/token') {
    const user = requireUser(auth);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
    return jsonResponse({
      jwt: auth?.jwt || `local-dev-token:${user.id}`,
      user: { id: user.id, email: user.email, name: user.name },
    });
  }
  if (path === '/api/auth/expo-web-success') {
    const user = requireUser(auth);
    if (!user) {
      return new Response(
        '<html><body><script>window.parent.postMessage({ type: "AUTH_ERROR", error: "Unauthorized" }, "*");</script></body></html>',
        { status: 401, headers: { 'Content-Type': 'text/html' } }
      );
    }
    const message = JSON.stringify({
      type: 'AUTH_SUCCESS',
      jwt: auth?.jwt || `local-dev-token:${user.id}`,
      user: { id: user.id, email: user.email, name: user.name },
    });
    return new Response(
      `<html><body><script>window.parent.postMessage(${message}, "*");</script></body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  return jsonResponse({ error: 'Not Found' }, 404);
};
