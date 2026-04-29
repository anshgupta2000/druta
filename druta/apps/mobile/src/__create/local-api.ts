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
  territories_captured?: number;
  territories_strengthened?: number;
  changed_tiles?: Array<Record<string, unknown>>;
  elevation_gain_m?: number;
  elevation_loss_m?: number;
  route_data?: Array<Record<string, unknown>> | string | null;
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
  time_limit_minutes?: number;
  stake_zones?: number;
  winner_bonus_strength?: number;
  ready_challenger?: boolean;
  ready_opponent?: boolean;
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
const STREET_NAMES = ['Valencia', 'Mission', 'Market', 'Hayes', 'Castro', 'Divisadero', 'Folsom', 'Bryant', 'Oak', 'Page', 'Guerrero', 'Dolores'];
const CROSS_STREETS = ['8th', '12th', '16th', '18th', '20th', '24th', 'Duboce', 'Fell', 'Grove', 'Noe', 'Church', 'Van Ness'];
const localNotificationPreferences = new Map<string, Record<string, string>>();
const seededDemoUsers = new Set<string>();

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

const zoneLabel = (gridLat: number, gridLng: number) => {
  const hash = Math.abs(gridLat * 31 + gridLng * 17);
  return `${STREET_NAMES[hash % STREET_NAMES.length]} & ${
    CROSS_STREETS[(hash >> 2) % CROSS_STREETS.length]
  }`;
};

const daysSince = (value?: string | null) => {
  const ts = Date.parse(value || '');
  if (!Number.isFinite(ts)) return 999;
  return Math.max(0, (Date.now() - ts) / (24 * 60 * 60 * 1000));
};

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

const DEMO_RIVALS = [
  {
    id: 'demo-alex-k',
    username: 'alex_k',
    name: 'Alex K',
    email: 'alex_k@druta.local',
    total_distance_km: 612,
    total_runs: 126,
    territories_owned: 124,
    wins: 12,
    losses: 3,
    avatar_color: '#5B4BC4',
  },
  {
    id: 'demo-jruns',
    username: 'jruns',
    name: 'Jordan Runs',
    email: 'jruns@druta.local',
    total_distance_km: 438,
    total_runs: 94,
    territories_owned: 98,
    wins: 7,
    losses: 2,
    avatar_color: '#0F8D6E',
  },
  {
    id: 'demo-yuki-m',
    username: 'yuki_m',
    name: 'Yuki M',
    email: 'yuki_m@druta.local',
    total_distance_km: 302,
    total_runs: 62,
    territories_owned: 54,
    wins: 5,
    losses: 6,
    avatar_color: '#B84E1D',
  },
  {
    id: 'demo-max-run',
    username: 'max_run',
    name: 'Max Run',
    email: 'max_run@druta.local',
    total_distance_km: 246,
    total_runs: 51,
    territories_owned: 47,
    wins: 3,
    losses: 4,
    avatar_color: '#6236AD',
  },
] as const;

const upsertDemoRival = (rival: (typeof DEMO_RIVALS)[number]) => {
  const existing = state.users.get(rival.id);
  if (existing) {
    state.users.set(rival.id, {
      ...existing,
      ...rival,
      image: existing.image,
      avatar_url: existing.avatar_url,
      avatar_code: existing.avatar_code,
      avatar_thumbnail_url: existing.avatar_thumbnail_url,
      outfit_loadout: existing.outfit_loadout,
    });
    return;
  }

  state.users.set(rival.id, {
    ...rival,
    image: null,
    avatar_url: null,
    avatar_code: null,
    avatar_thumbnail_url: null,
    outfit_loadout: {},
  });
};

const addDemoFriend = (userId: string, friendId: string) => {
  const exists = state.friends.some(
    (friend) =>
      (friend.user_id === userId && friend.friend_id === friendId) ||
      (friend.user_id === friendId && friend.friend_id === userId)
  );
  if (exists) return;
  state.friends.push({
    id: state.ids.friend++,
    user_id: userId,
    friend_id: friendId,
    status: 'accepted',
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  });
};

const setContribution = (
  gridLat: number,
  gridLng: number,
  userId: string,
  distanceMeters: number
) => {
  const key = tileKey(gridLat, gridLng);
  const contributionMap = state.territoryContributions.get(key) || new Map<string, number>();
  contributionMap.set(contributionSubjectKey('user', userId), distanceMeters);
  state.territoryContributions.set(key, contributionMap);
};

const upsertDemoTerritory = ({
  gridLat,
  gridLng,
  ownerId,
  ownerUsername,
  strength,
  ageDays,
  rivalId,
}: {
  gridLat: number;
  gridLng: number;
  ownerId: string;
  ownerUsername: string;
  strength: number;
  ageDays: number;
  rivalId?: string;
}) => {
  let territory = state.territories.find(
    (tile) => tile.grid_lat === gridLat && tile.grid_lng === gridLng
  );
  const lastRunAt = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000).toISOString();
  if (!territory) {
    territory = {
      id: state.ids.territory++,
      grid_lat: gridLat,
      grid_lng: gridLng,
      owner_id: ownerId,
      owner_username: ownerUsername,
      strength,
      last_run_at: lastRunAt,
    };
    state.territories.push(territory);
  } else {
    territory.owner_id = ownerId;
    territory.owner_username = ownerUsername;
    territory.strength = Math.max(1, Math.min(10, strength));
    territory.last_run_at = lastRunAt;
  }

  setContribution(gridLat, gridLng, ownerId, strength * 85 + 220);
  if (rivalId) {
    setContribution(gridLat, gridLng, rivalId, strength <= 3 ? strength * 80 + 185 : strength * 55);
  }
};

const ensureDemoWorldForUser = (user: LocalUser) => {
  if (seededDemoUsers.has(user.id) || user.id.startsWith('demo-')) return;
  seededDemoUsers.add(user.id);

  DEMO_RIVALS.forEach(upsertDemoRival);

  addDemoFriend(user.id, 'demo-jruns');
  addDemoFriend(user.id, 'demo-yuki-m');

  if (user.total_runs === 0) {
    user.total_distance_km = Math.max(user.total_distance_km, 284);
    user.total_runs = Math.max(user.total_runs, 47);
    user.wins = Math.max(user.wins, 7);
    user.losses = Math.max(user.losses, 2);
  }

  const center = latLngToGrid(37.7599, -122.4148);
  let ownedSeeded = 0;
  let rivalSeeded = 0;
  for (let row = -5; row <= 4; row += 1) {
    for (let col = -4; col <= 4; col += 1) {
      const gridLat = center.gridLat + row;
      const gridLng = center.gridLng + col;
      const contested = (row + col) % 5 === 0;
      const rivalBand = row >= 3 || col >= 3 || (row === -4 && col <= -2);
      if (!rivalBand && ownedSeeded < 58) {
        upsertDemoTerritory({
          gridLat,
          gridLng,
          ownerId: user.id,
          ownerUsername: user.username || user.name || 'you',
          strength: contested ? 2 : 4 + Math.abs((row + col) % 4),
          ageDays: contested ? 3.25 : Math.abs((row * col) % 3) + 0.3,
          rivalId: contested ? 'demo-alex-k' : undefined,
        });
        ownedSeeded += 1;
      } else if (rivalSeeded < 24) {
        const rival = DEMO_RIVALS[(rivalSeeded + Math.abs(row)) % DEMO_RIVALS.length];
        upsertDemoTerritory({
          gridLat,
          gridLng,
          ownerId: rival.id,
          ownerUsername: rival.username,
          strength: 2 + Math.abs((row - col) % 5),
          ageDays: Math.abs((row + col) % 4) + 0.5,
          rivalId: user.id,
        });
        rivalSeeded += 1;
      }
    }
  }

  user.territories_owned = Math.max(user.territories_owned, 58);
  state.users.set(user.id, user);

  const hasSeedRuns = state.runs.some((run) => run.user_id === user.id);
  if (!hasSeedRuns) {
    const samples = [
      { distance_km: 4.2, duration_seconds: 1266, avg_pace: 5.01, zones: 11, captured: 2, daysAgo: 0.1 },
      { distance_km: 6.1, duration_seconds: 1844, avg_pace: 5.04, zones: 7, captured: 1, daysAgo: 1 },
      { distance_km: 3.8, duration_seconds: 1198, avg_pace: 5.15, zones: 4, captured: 0, daysAgo: 3 },
    ];
    for (const sample of samples) {
      const startedAt = new Date(Date.now() - sample.daysAgo * 24 * 60 * 60 * 1000).toISOString();
      state.runs.push({
        id: state.ids.run++,
        user_id: user.id,
        distance_km: sample.distance_km,
        duration_seconds: sample.duration_seconds,
        avg_pace: sample.avg_pace,
        territories_claimed: sample.zones,
        territories_captured: sample.captured,
        territories_strengthened: Math.max(0, sample.zones - sample.captured),
        changed_tiles: [],
        elevation_gain_m: 42,
        elevation_loss_m: 37,
        route_data: null,
        started_at: startedAt,
        ended_at: new Date(Date.parse(startedAt) + sample.duration_seconds * 1000).toISOString(),
        created_at: startedAt,
      });
    }
  }

  const hasIncomingRace = state.races.some(
    (race) => race.opponent_id === user.id && race.challenger_id === 'demo-alex-k'
  );
  if (!hasIncomingRace) {
    state.races.push({
      id: state.ids.race++,
      challenger_id: 'demo-alex-k',
      opponent_id: user.id,
      race_type: 'distance',
      target_value: 5,
      time_limit_minutes: 45,
      stake_zones: 5,
      winner_bonus_strength: 3,
      ready_challenger: true,
      ready_opponent: false,
      status: 'pending',
      challenger_distance: 0,
      opponent_distance: 0,
      winner_id: null,
      created_at: new Date(Date.now() - 38 * 60 * 1000).toISOString(),
      started_at: null,
      ended_at: null,
    });
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
  const localUser = state.users.get(user.id)!;
  ensureDemoWorldForUser(localUser);
  return localUser;
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
  DEMO_RIVALS.forEach(upsertDemoRival);
  const users = Array.from(state.users.values());
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weeklyStatsFor = (userId: string) => {
    const weeklyRuns = state.runs.filter(
      (run) => run.user_id === userId && runTimestamp(run) >= sevenDaysAgo
    );
    return {
      weekly_zones: weeklyRuns.reduce((sum, run) => sum + (run.territories_claimed || 0), 0),
      weekly_distance_km: weeklyRuns.reduce((sum, run) => sum + (run.distance_km || 0), 0),
    };
  };
  if (sortBy === 'weekly') {
    users.sort((a, b) => {
      return weeklyStatsFor(b.id).weekly_zones - weeklyStatsFor(a.id).weekly_zones;
    });
  } else if (sortBy === 'distance') {
    users.sort((a, b) => b.total_distance_km - a.total_distance_km);
  } else if (sortBy === 'wins') {
    users.sort((a, b) => b.wins - a.wins);
  } else {
    users.sort((a, b) => b.territories_owned - a.territories_owned);
  }
  return users.slice(0, 50).map((user) => ({ ...user, ...weeklyStatsFor(user.id) }));
};

const getLeaderboardRank = (userId: string) => {
  const users = Array.from(state.users.values());
  users.sort((a, b) => {
    if (b.territories_owned !== a.territories_owned) {
      return b.territories_owned - a.territories_owned;
    }
    return a.id.localeCompare(b.id);
  });
  const index = users.findIndex((entry) => entry.id === userId);
  return index >= 0 ? index + 1 : null;
};

const runTimestamp = (run: Pick<LocalRun, 'started_at' | 'created_at'>) => {
  const started = Date.parse(run.started_at || '');
  if (Number.isFinite(started)) return started;
  const created = Date.parse(run.created_at || '');
  if (Number.isFinite(created)) return created;
  return 0;
};

const buildProfileCoreStats = (user: LocalUser) => {
  const userRuns = state.runs.filter((run) => run.user_id === user.id);
  const userTerritories = state.territories.filter((tile) => tile.owner_id === user.id);
  const totalStrength = userTerritories.reduce((sum, tile) => sum + (tile.strength || 0), 0);
  const totalClaimed = userRuns.reduce((sum, run) => sum + (run.territories_claimed || 0), 0);
  const bestRunClaimed = userRuns.reduce(
    (maxValue, run) => Math.max(maxValue, run.territories_claimed || 0),
    0,
  );
  const runsWithClaims = userRuns.filter((run) => (run.territories_claimed || 0) > 0).length;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const claimedLast7d = userRuns.reduce((sum, run) => {
    return runTimestamp(run) >= sevenDaysAgo
      ? sum + (run.territories_claimed || 0)
      : sum;
  }, 0);
  const sortedRuns = [...userRuns].sort((a, b) => runTimestamp(b) - runTimestamp(a));
  const recentRun = sortedRuns[0] || null;
  const claimRatePercent =
    user.total_runs > 0 ? Number(((runsWithClaims / user.total_runs) * 100).toFixed(1)) : 0;

  return {
    zones_owned: user.territories_owned || 0,
    total_strength: totalStrength,
    average_strength:
      (user.territories_owned || 0) > 0
        ? Number((totalStrength / user.territories_owned).toFixed(1))
        : 0,
    leaderboard_rank: getLeaderboardRank(user.id),
    total_claimed: totalClaimed,
    best_run_claimed: bestRunClaimed,
    runs_with_claims: runsWithClaims,
    claimed_last_7d: claimedLast7d,
    claim_rate_percent: claimRatePercent,
    recent_run: recentRun
      ? {
          id: recentRun.id,
          distance_km: recentRun.distance_km,
          duration_seconds: recentRun.duration_seconds,
          avg_pace: recentRun.avg_pace,
          territories_claimed: recentRun.territories_claimed,
          started_at: recentRun.started_at,
          ended_at: recentRun.ended_at,
        }
      : null,
  };
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

const handleProfileCoreStats = (method: string, auth: AuthPayload) => {
  if (method !== 'GET') return jsonResponse({ error: 'Method Not Allowed' }, 405);
  const user = requireUser(auth);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  return jsonResponse({ core_stats: buildProfileCoreStats(user) });
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
      territories_captured: Number(body.territories_captured || 0),
      territories_strengthened: Number(body.territories_strengthened || 0),
      changed_tiles: Array.isArray(body.changed_tiles) ? body.changed_tiles : [],
      elevation_gain_m: Number(body.elevation_gain_m || 0),
      elevation_loss_m: Number(body.elevation_loss_m || 0),
      route_data: body.route_data || null,
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
  const previousOwnerUsername = existingTerritory?.owner_username || null;
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
    previous_owner_id: previousOwnerId,
    previous_owner_username: previousOwnerUsername,
    strength: nextStrength,
    lead_m: Math.round(ownership.lead_m * 100) / 100,
    last_run_at: touchedAt,
    was_claimed: wasClaimed,
    was_captured: wasCaptured,
    was_strengthened: wasStrengthened,
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
    const changedTiles = Array.from(state.runSessionChunks.entries())
      .filter(([key]) => key.startsWith(`${runSessionId}:`))
      .flatMap(([, chunk]) => chunk.changed_tiles || []);
    return jsonResponse({
      run: run || null,
      territory_summary: {
        territories_claimed: runSession.territories_claimed,
        territories_captured: runSession.territories_captured,
        territories_strengthened: runSession.territories_strengthened,
        total_segments_applied: runSession.total_segments_applied,
        total_segments_rejected: runSession.total_segments_rejected,
      },
      changed_tiles: changedTiles,
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
  const changedTiles = Array.from(state.runSessionChunks.entries())
    .filter(([key]) => key.startsWith(`${runSessionId}:`))
    .flatMap(([, chunk]) => chunk.changed_tiles || []);
  if (finalDistanceKm > 0.01) {
    const now = new Date().toISOString();
    run = {
      id: state.ids.run++,
      user_id: user.id,
      distance_km: Math.round(finalDistanceKm * 1000) / 1000,
      duration_seconds: finalDurationSeconds,
      avg_pace: finalAvgPace,
      territories_claimed: runSession.territories_claimed,
      territories_captured: runSession.territories_captured,
      territories_strengthened: runSession.territories_strengthened,
      changed_tiles: changedTiles,
      elevation_gain_m: Number(body.elevation_gain_m || 0),
      elevation_loss_m: Number(body.elevation_loss_m || 0),
      route_data: Array.isArray(body.route_data) ? body.route_data : finalPoints,
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
    changed_tiles: changedTiles,
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
      time_limit_minutes: Number(body.time_limit_minutes || 45),
      stake_zones: Number(body.stake_zones || 5),
      winner_bonus_strength: Number(body.winner_bonus_strength || 3),
      ready_challenger: false,
      ready_opponent: false,
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
      return jsonResponse({ race: withRaceUsers(race) });
    }

    if (body.action === 'decline') {
      race.status = 'declined';
      return jsonResponse({ race: withRaceUsers(race) });
    }

    if (body.action === 'ready') {
      if (race.challenger_id === user.id) {
        race.ready_challenger = true;
      } else if (race.opponent_id === user.id) {
        race.ready_opponent = true;
      }
      if (race.ready_challenger && race.ready_opponent && !race.started_at) {
        race.started_at = new Date().toISOString();
      }
      return jsonResponse({ race: withRaceUsers(race) });
    }

    if (body.action === 'forfeit') {
      const winnerId = race.challenger_id === user.id ? race.opponent_id : race.challenger_id;
      race.status = 'finished';
      race.winner_id = winnerId;
      race.ended_at = new Date().toISOString();
      const winner = state.users.get(winnerId);
      const loser = state.users.get(user.id);
      if (winner) winner.wins += 1;
      if (loser) loser.losses += 1;
      return jsonResponse({ race: withRaceUsers(race), finished: true });
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

const handleTerritoryDetail = (method: string, auth: AuthPayload, url: URL) => {
  if (method !== 'GET') return jsonResponse({ error: 'Method Not Allowed' }, 405);
  const user = requireUser(auth);
  const gridLat = Number(url.searchParams.get('gridLat'));
  const gridLng = Number(url.searchParams.get('gridLng'));
  if (!Number.isFinite(gridLat) || !Number.isFinite(gridLng)) {
    return jsonResponse({ error: 'gridLat and gridLng are required' }, 400);
  }

  const territory = state.territories.find((t) => t.grid_lat === gridLat && t.grid_lng === gridLng);
  const contributionMap = state.territoryContributions.get(tileKey(gridLat, gridLng)) || new Map();
  const contributors = Array.from(contributionMap.entries())
    .map(([subjectKey, distance_m]) => {
      const id = subjectKey.split(':').slice(1).join(':');
      const contributor = state.users.get(id);
      return {
        id,
        username: contributor?.username || contributor?.name || 'Runner',
        distance_m: Math.round(distance_m),
        avatar_color: contributor?.avatar_color || colorForUser(id),
      };
    })
    .sort((a, b) => b.distance_m - a.distance_m)
    .slice(0, 5);

  const ownerId = territory?.owner_id || contributors[0]?.id || null;
  const ownerContribution = contributors.find((entry) => entry.id === ownerId);
  const rival = contributors.find((entry) => entry.id !== ownerId) || null;
  const strength = territory?.strength || (ownerId ? 1 : 0);
  const daysUntilDecay = Math.max(0, Math.ceil(4 - daysSince(territory?.last_run_at)));
  const leadM = Math.max(0, (ownerContribution?.distance_m || 0) - (rival?.distance_m || 0));
  const underThreat = Boolean(rival) && (leadM <= 120 || strength <= 3 || daysUntilDecay <= 1);

  return jsonResponse({
    zone: {
      id: territory?.id || null,
      grid_lat: gridLat,
      grid_lng: gridLng,
      label: zoneLabel(gridLat, gridLng),
      owner_id: ownerId,
      owner_username: territory?.owner_username || ownerContribution?.username || null,
      is_owned: user ? ownerId === user.id : false,
      strength,
      last_run_at: territory?.last_run_at || null,
      times_reinforced: strength,
      lead_m: leadM,
      days_until_decay: daysUntilDecay,
      under_threat: underThreat,
      status: !ownerId ? 'neutral' : underThreat ? 'under_threat' : user && ownerId === user.id ? 'yours' : 'rival',
      closest_rival: rival,
      top_contributors: contributors,
    },
  });
};

const handleActivity = (method: string, auth: AuthPayload) => {
  if (method !== 'GET') return jsonResponse({ error: 'Method Not Allowed' }, 405);
  const user = requireUser(auth);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

  const runs = state.runs
    .filter((run) => run.user_id === user.id)
    .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
    .slice(0, 20);
  const raceEvents = state.races
    .filter((race) => race.opponent_id === user.id && race.status === 'pending')
    .map((race) => {
      const challenger = state.users.get(race.challenger_id);
      return {
        id: `race-${race.id}`,
        user_id: user.id,
        actor_id: race.challenger_id,
        actor_username: challenger?.username || challenger?.name || 'Runner',
        event_type: 'race_challenge',
        title: `${challenger?.username || challenger?.name || 'Runner'} challenged you`,
        body: `${race.target_value} km · winner raids ${race.stake_zones || 5} zones`,
        grid_lat: null,
        grid_lng: null,
        metadata: { race_id: race.id },
        created_at: race.created_at,
      };
    });

  return jsonResponse({
    events: [
      ...raceEvents,
      ...runs.map((run) => ({
        id: `run-${run.id}`,
        user_id: user.id,
        actor_id: user.id,
        actor_username: user.username || user.name || 'you',
        event_type: 'run_completed',
        title: `+${run.territories_claimed || 0} zones on your run`,
        body: `${run.distance_km.toFixed(1)} km · ${run.territories_captured || 0} captured`,
        grid_lat: null,
        grid_lng: null,
        metadata: { run_id: run.id },
        created_at: run.started_at,
      })),
    ].sort((a, b) => (a.created_at > b.created_at ? -1 : 1)),
  });
};

const handleNotificationPreferences = (method: string, auth: AuthPayload, init?: RequestInit) => {
  const user = requireUser(auth);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const defaults = {
    zone_stolen: 'always',
    zone_under_threat: 'daily_max_3',
    zone_decaying: 'weekly_digest',
    race_challenge: 'always',
    rival_rank_move: 'once_a_day',
    quiet_hours_start: '22:00',
    quiet_hours_end: '07:00',
  };
  const current = localNotificationPreferences.get(user.id) || defaults;

  if (method === 'GET') {
    return jsonResponse({ preferences: { user_id: user.id, ...current } });
  }

  if (method === 'PUT') {
    const body = getBody(init);
    const next = { ...current };
    for (const key of Object.keys(defaults)) {
      if (typeof body[key] === 'string') {
        next[key] = body[key];
      }
    }
    localNotificationPreferences.set(user.id, next);
    return jsonResponse({ preferences: { user_id: user.id, ...next } });
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
  if (path === '/api/profile/core-stats') return handleProfileCoreStats(method, auth);
  if (path === '/api/profile') return handleProfile(method, auth, init);
  if (path === '/api/runs') return handleRuns(method, auth, init);
  if (path === '/api/friends') return handleFriends(method, auth, init);
  if (path === '/api/races') return handleRaces(method, auth, parsed, init);
  if (path === '/api/territories') return handleTerritories(method, auth, parsed, init);
  if (path === '/api/territories/detail') return handleTerritoryDetail(method, auth, parsed);
  if (path === '/api/activity') return handleActivity(method, auth);
  if (path === '/api/notifications/preferences') {
    return handleNotificationPreferences(method, auth, init);
  }
  if (path === '/api/leaderboard') {
    const sortBy = parsed.searchParams.get('sort') || 'territories';
    const scope = parsed.searchParams.get('scope') || 'global';
    return jsonResponse({ leaderboard: listLeaderboard(scope === 'week' ? 'weekly' : sortBy) });
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
