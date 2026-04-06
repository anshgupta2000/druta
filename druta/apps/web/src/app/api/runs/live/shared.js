import sql from "@/app/api/utils/sql";

export const LIVE_SUBJECT_TYPE_USER = "user";
export const RUN_SESSION_ACTIVE = "active";
export const RUN_SESSION_FINISHED = "finished";

const GRID_SIZE_METERS = 200;
const METERS_PER_DEGREE_LAT = 111320;
const MIN_SEGMENT_DISTANCE_METERS = 1;
const MAX_POINT_ACCURACY_METERS = 80;
const MAX_SEGMENT_SPEED_MPS = 12;
const MAX_SEGMENT_DISTANCE_METERS = 450;
const SEGMENT_ALLOCATION_STEP_METERS = 20;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseChangedTiles = (value) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const toTimestampMs = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizePoint = (point) => {
  if (!point || typeof point !== "object") {
    return null;
  }

  const latitude = Number(point.latitude);
  const longitude = Number(point.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const timestamp = toTimestampMs(point.timestamp);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const accuracyRaw = point.accuracy;
  const accuracy =
    typeof accuracyRaw === "number" && Number.isFinite(accuracyRaw)
      ? Math.max(0, accuracyRaw)
      : null;

  return {
    latitude,
    longitude,
    timestamp,
    accuracy,
  };
};

const normalizePoints = (points) => {
  if (!Array.isArray(points)) {
    return [];
  }
  const normalized = [];
  for (const point of points) {
    const parsed = normalizePoint(point);
    if (parsed) {
      normalized.push(parsed);
    }
  }
  return normalized;
};

export const haversineDistanceMeters = (lat1, lng1, lat2, lng2) => {
  const toRad = (value) => (value * Math.PI) / 180;
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

export const latLngToGrid = (lat, lng) => {
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180);
  const gridLat = Math.floor((lat * METERS_PER_DEGREE_LAT) / GRID_SIZE_METERS);
  const gridLng = Math.floor((lng * metersPerDegreeLng) / GRID_SIZE_METERS);
  return { gridLat, gridLng };
};

const getTileKey = (gridLat, gridLng) => `${gridLat}:${gridLng}`;

const getChunkSummary = (chunkRow, sessionRow) => {
  return {
    applied_segments: toNumber(chunkRow?.applied_segments),
    rejected_segments: toNumber(chunkRow?.rejected_segments),
    changed_tiles: parseChangedTiles(chunkRow?.changed_tiles),
    live_stats: {
      territories_claimed: toNumber(sessionRow?.territories_claimed),
      territories_captured: toNumber(sessionRow?.territories_captured),
      territories_strengthened: toNumber(sessionRow?.territories_strengthened),
      total_segments_applied: toNumber(sessionRow?.total_segments_applied),
      total_segments_rejected: toNumber(sessionRow?.total_segments_rejected),
    },
    duplicate: true,
  };
};

const allocateSegmentAcrossTiles = (start, end, distanceMeters) => {
  const stepCount = Math.max(1, Math.ceil(distanceMeters / SEGMENT_ALLOCATION_STEP_METERS));
  const segmentDistance = distanceMeters / stepCount;
  const tileDistances = new Map();

  for (let index = 0; index < stepCount; index += 1) {
    const t1 = index / stepCount;
    const t2 = (index + 1) / stepCount;
    const mid = (t1 + t2) / 2;
    const lat = start.latitude + (end.latitude - start.latitude) * mid;
    const lng = start.longitude + (end.longitude - start.longitude) * mid;
    const { gridLat, gridLng } = latLngToGrid(lat, lng);
    const key = getTileKey(gridLat, gridLng);
    const current = tileDistances.get(key);
    if (current) {
      current.distance_m += segmentDistance;
    } else {
      tileDistances.set(key, {
        grid_lat: gridLat,
        grid_lng: gridLng,
        distance_m: segmentDistance,
      });
    }
  }

  return tileDistances;
};

const mergeTileDistanceMaps = (targetMap, sourceMap) => {
  for (const [key, value] of sourceMap.entries()) {
    const existing = targetMap.get(key);
    if (existing) {
      existing.distance_m += value.distance_m;
    } else {
      targetMap.set(key, { ...value });
    }
  }
};

const normalizeDbPoint = (dbPoint) => {
  if (!dbPoint) {
    return null;
  }
  if (typeof dbPoint === "string") {
    try {
      return normalizePoint(JSON.parse(dbPoint));
    } catch {
      return null;
    }
  }
  return normalizePoint(dbPoint);
};

const resolveTopOwner = (contributions, currentOwnerId) => {
  if (!contributions || contributions.length === 0) {
    return null;
  }

  const sorted = contributions
    .map((entry) => ({
      subject_id: String(entry.subject_id),
      distance_m: toNumber(entry.distance_m),
    }))
    .sort((a, b) => {
      if (b.distance_m !== a.distance_m) {
        return b.distance_m - a.distance_m;
      }
      return a.subject_id.localeCompare(b.subject_id);
    });

  const maxDistance = sorted[0].distance_m;
  const contenders = sorted
    .filter((entry) => entry.distance_m === maxDistance)
    .map((entry) => entry.subject_id);

  let ownerId;
  if (contenders.length === 1) {
    ownerId = contenders[0];
  } else if (currentOwnerId && contenders.includes(String(currentOwnerId))) {
    ownerId = String(currentOwnerId);
  } else {
    ownerId = [...contenders].sort((a, b) => a.localeCompare(b))[0];
  }

  const ownerContribution = sorted.find((entry) => entry.subject_id === ownerId);
  const secondContribution = sorted.find((entry) => entry.subject_id !== ownerId);
  const ownerDistance = ownerContribution ? ownerContribution.distance_m : 0;
  const secondDistance = secondContribution ? secondContribution.distance_m : 0;

  return {
    owner_id: ownerId,
    owner_distance_m: ownerDistance,
    second_distance_m: secondDistance,
    lead_m: Math.max(0, ownerDistance - secondDistance),
  };
};

const toIsoFromMs = (timestamp) => {
  if (!Number.isFinite(timestamp)) {
    return new Date().toISOString();
  }
  return new Date(timestamp).toISOString();
};

const resolveUsernameFactory = () => {
  const cache = new Map();
  return async (userId) => {
    const cacheKey = String(userId || "");
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }
    const rows = await sql`
      SELECT username, name
      FROM auth_users
      WHERE id = ${cacheKey}
      LIMIT 1
    `;
    const value = rows?.[0]?.username || rows?.[0]?.name || "Runner";
    cache.set(cacheKey, value);
    return value;
  };
};

const recomputeSessionStats = async (runSessionId, userId) => {
  const statsRows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE was_claimed) AS territories_claimed,
      COUNT(*) FILTER (WHERE was_captured) AS territories_captured,
      COUNT(*) FILTER (WHERE was_strengthened) AS territories_strengthened
    FROM run_session_tile_contributions
    WHERE run_session_id = ${runSessionId}
      AND subject_type = ${LIVE_SUBJECT_TYPE_USER}
      AND subject_id = ${userId}
  `;

  const stats = statsRows?.[0] || {};
  return {
    territories_claimed: toNumber(stats.territories_claimed),
    territories_captured: toNumber(stats.territories_captured),
    territories_strengthened: toNumber(stats.territories_strengthened),
  };
};

const upsertContributionForTile = async ({
  runSessionId,
  gridLat,
  gridLng,
  userId,
  distanceMeters,
  touchedAt,
  resolveUsername,
}) => {
  await sql`
    INSERT INTO territory_contributions (grid_lat, grid_lng, subject_type, subject_id, distance_m)
    VALUES (${gridLat}, ${gridLng}, ${LIVE_SUBJECT_TYPE_USER}, ${userId}, ${distanceMeters})
    ON CONFLICT (grid_lat, grid_lng, subject_type, subject_id)
    DO UPDATE SET
      distance_m = territory_contributions.distance_m + EXCLUDED.distance_m,
      updated_at = NOW()
  `;

  const contributionRows = await sql`
    SELECT subject_id, distance_m
    FROM territory_contributions
    WHERE grid_lat = ${gridLat}
      AND grid_lng = ${gridLng}
      AND subject_type = ${LIVE_SUBJECT_TYPE_USER}
    ORDER BY distance_m DESC, subject_id ASC
  `;

  const territoryRows = await sql`
    SELECT id, owner_id, owner_username, strength
    FROM territories
    WHERE grid_lat = ${gridLat}
      AND grid_lng = ${gridLng}
    LIMIT 1
  `;

  const existingTerritory = territoryRows?.[0] || null;
  const ownership = resolveTopOwner(contributionRows, existingTerritory?.owner_id);

  if (!ownership) {
    return null;
  }

  const ownerId = ownership.owner_id;
  const ownerUsername = await resolveUsername(ownerId);
  const nextStrength = clamp(Math.floor(ownership.lead_m / 50) + 1, 1, 10);

  let wasClaimed = false;
  let wasCaptured = false;
  let wasStrengthened = false;

  if (!existingTerritory) {
    await sql`
      INSERT INTO territories (grid_lat, grid_lng, owner_id, owner_username, strength, last_run_at, created_at, updated_at)
      VALUES (${gridLat}, ${gridLng}, ${ownerId}, ${ownerUsername}, ${nextStrength}, ${touchedAt}, NOW(), NOW())
    `;
    await sql`
      UPDATE auth_users
      SET territories_owned = territories_owned + 1
      WHERE id = ${ownerId}
    `;
    wasClaimed = true;
  } else if (String(existingTerritory.owner_id) !== String(ownerId)) {
    await sql`
      UPDATE territories
      SET owner_id = ${ownerId},
          owner_username = ${ownerUsername},
          strength = ${nextStrength},
          last_run_at = ${touchedAt},
          updated_at = NOW()
      WHERE id = ${existingTerritory.id}
    `;
    await sql`
      UPDATE auth_users
      SET territories_owned = GREATEST(0, territories_owned - 1)
      WHERE id = ${existingTerritory.owner_id}
    `;
    await sql`
      UPDATE auth_users
      SET territories_owned = territories_owned + 1
      WHERE id = ${ownerId}
    `;
    wasCaptured = true;
  } else {
    const previousStrength = toNumber(existingTerritory.strength, 1);
    wasStrengthened = nextStrength > previousStrength;
    await sql`
      UPDATE territories
      SET owner_username = ${ownerUsername},
          strength = ${nextStrength},
          last_run_at = ${touchedAt},
          updated_at = NOW()
      WHERE id = ${existingTerritory.id}
    `;
  }

  await sql`
    INSERT INTO run_session_tile_contributions (
      run_session_id,
      grid_lat,
      grid_lng,
      subject_type,
      subject_id,
      distance_m,
      was_claimed,
      was_captured,
      was_strengthened
    )
    VALUES (
      ${runSessionId},
      ${gridLat},
      ${gridLng},
      ${LIVE_SUBJECT_TYPE_USER},
      ${userId},
      ${distanceMeters},
      ${wasClaimed},
      ${wasCaptured},
      ${wasStrengthened}
    )
    ON CONFLICT (run_session_id, grid_lat, grid_lng, subject_type, subject_id)
    DO UPDATE SET
      distance_m = run_session_tile_contributions.distance_m + EXCLUDED.distance_m,
      was_claimed = run_session_tile_contributions.was_claimed OR EXCLUDED.was_claimed,
      was_captured = run_session_tile_contributions.was_captured OR EXCLUDED.was_captured,
      was_strengthened = run_session_tile_contributions.was_strengthened OR EXCLUDED.was_strengthened,
      updated_at = NOW()
  `;

  const ownerChanged = !existingTerritory || String(existingTerritory.owner_id) !== String(ownerId);
  const strengthChanged = !existingTerritory || toNumber(existingTerritory.strength, 1) !== nextStrength;

  if (!ownerChanged && !strengthChanged) {
    return null;
  }

  return {
    grid_lat: gridLat,
    grid_lng: gridLng,
    owner_id: ownerId,
    owner_username: ownerUsername,
    strength: nextStrength,
    lead_m: Math.round(ownership.lead_m * 100) / 100,
    last_run_at: touchedAt,
  };
};

export const getRunSessionForUser = async ({ runSessionId, userId }) => {
  const rows = await sql`
    SELECT *
    FROM run_sessions
    WHERE id = ${runSessionId}
      AND user_id = ${userId}
    LIMIT 1
  `;
  return rows?.[0] || null;
};

export const createRunSession = async ({ userId, startedAt }) => {
  const safeStartedAt = startedAt || new Date().toISOString();
  const result = await sql`
    INSERT INTO run_sessions (user_id, status, started_at)
    VALUES (${userId}, ${RUN_SESSION_ACTIVE}, ${safeStartedAt})
    RETURNING id, status, started_at, created_at
  `;
  return result?.[0] || null;
};

const fetchChunk = async ({ runSessionId, seq }) => {
  const chunkRows = await sql`
    SELECT run_session_id, seq, point_count, applied_segments, rejected_segments, changed_tiles
    FROM run_session_chunks
    WHERE run_session_id = ${runSessionId}
      AND seq = ${seq}
    LIMIT 1
  `;
  return chunkRows?.[0] || null;
};

export const processRunSessionChunk = async ({ userId, runSessionId, seq, points }) => {
  const session = await getRunSessionForUser({ runSessionId, userId });
  if (!session) {
    return {
      error: "Run session not found",
      status: 404,
    };
  }

  if (session.status !== RUN_SESSION_ACTIVE) {
    return {
      error: "Run session is not active",
      status: 409,
    };
  }

  const currentLastSeq = toNumber(session.last_seq, 0);
  if (!Number.isInteger(seq) || seq <= 0) {
    return {
      error: "seq must be a positive integer",
      status: 400,
    };
  }

  if (seq <= currentLastSeq) {
    const chunk = await fetchChunk({ runSessionId, seq });
    if (chunk) {
      return getChunkSummary(chunk, session);
    }

    return {
      error: "Out-of-order chunk",
      status: 409,
      expected_seq: currentLastSeq + 1,
    };
  }

  if (seq !== currentLastSeq + 1) {
    return {
      error: "Out-of-order chunk",
      status: 409,
      expected_seq: currentLastSeq + 1,
    };
  }

  const chunkInsertRows = await sql`
    INSERT INTO run_session_chunks (run_session_id, seq, point_count)
    VALUES (${runSessionId}, ${seq}, 0)
    ON CONFLICT (run_session_id, seq)
    DO NOTHING
    RETURNING id
  `;

  if (!chunkInsertRows || chunkInsertRows.length === 0) {
    const chunk = await fetchChunk({ runSessionId, seq });
    const latestSession = await getRunSessionForUser({ runSessionId, userId });
    return getChunkSummary(chunk, latestSession || session);
  }

  const normalizedPoints = normalizePoints(points);
  const tileDistanceMap = new Map();

  let rejectedSegments = 0;
  let appliedSegments = 0;
  let previousPoint = normalizeDbPoint(session.last_point);

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
      point.longitude,
    );
    const elapsedSeconds = (point.timestamp - previousPoint.timestamp) / 1000;

    if (elapsedSeconds <= 0) {
      rejectedSegments += 1;
      continue;
    }

    const speed = segmentDistanceMeters / elapsedSeconds;

    if (
      segmentDistanceMeters > MAX_SEGMENT_DISTANCE_METERS ||
      speed > MAX_SEGMENT_SPEED_MPS
    ) {
      rejectedSegments += 1;
      previousPoint = point;
      continue;
    }

    if (segmentDistanceMeters < MIN_SEGMENT_DISTANCE_METERS) {
      previousPoint = point;
      continue;
    }

    const segmentTiles = allocateSegmentAcrossTiles(
      previousPoint,
      point,
      segmentDistanceMeters,
    );
    mergeTileDistanceMaps(tileDistanceMap, segmentTiles);

    appliedSegments += 1;
    previousPoint = point;
  }

  const changedTiles = [];
  const resolveUsername = resolveUsernameFactory();
  const touchedAt = toIsoFromMs(previousPoint?.timestamp);

  for (const tile of tileDistanceMap.values()) {
    const changedTile = await upsertContributionForTile({
      runSessionId,
      gridLat: tile.grid_lat,
      gridLng: tile.grid_lng,
      userId,
      distanceMeters: tile.distance_m,
      touchedAt,
      resolveUsername,
    });

    if (changedTile) {
      changedTiles.push(changedTile);
    }
  }

  const stats = await recomputeSessionStats(runSessionId, userId);

  const lastPointPayload = previousPoint ? JSON.stringify(previousPoint) : null;
  const updatedRows = await sql`
    UPDATE run_sessions
    SET
      last_seq = ${seq},
      last_point = ${lastPointPayload}::jsonb,
      territories_claimed = ${stats.territories_claimed},
      territories_captured = ${stats.territories_captured},
      territories_strengthened = ${stats.territories_strengthened},
      total_segments_applied = total_segments_applied + ${appliedSegments},
      total_segments_rejected = total_segments_rejected + ${rejectedSegments},
      updated_at = NOW()
    WHERE id = ${runSessionId}
      AND user_id = ${userId}
    RETURNING *
  `;

  const updatedSession = updatedRows?.[0] || session;

  const changedTilesPayload = JSON.stringify(changedTiles);
  await sql`
    UPDATE run_session_chunks
    SET
      point_count = ${normalizedPoints.length},
      applied_segments = ${appliedSegments},
      rejected_segments = ${rejectedSegments},
      changed_tiles = ${changedTilesPayload}::jsonb
    WHERE run_session_id = ${runSessionId}
      AND seq = ${seq}
  `;

  return {
    applied_segments: appliedSegments,
    rejected_segments: rejectedSegments,
    changed_tiles: changedTiles,
    live_stats: {
      territories_claimed: toNumber(updatedSession.territories_claimed),
      territories_captured: toNumber(updatedSession.territories_captured),
      territories_strengthened: toNumber(updatedSession.territories_strengthened),
      total_segments_applied: toNumber(updatedSession.total_segments_applied),
      total_segments_rejected: toNumber(updatedSession.total_segments_rejected),
    },
    duplicate: false,
  };
};

const getRunByIdForUser = async ({ runId, userId }) => {
  if (!runId) {
    return null;
  }
  const rows = await sql`
    SELECT id, distance_km, duration_seconds, avg_pace, territories_claimed, started_at, ended_at
    FROM runs
    WHERE id = ${runId}
      AND user_id = ${userId}
    LIMIT 1
  `;
  return rows?.[0] || null;
};

export const finishRunSession = async ({
  userId,
  runSessionId,
  distanceKm,
  durationSeconds,
  avgPace,
  startedAt,
  finalPoints,
}) => {
  let session = await getRunSessionForUser({ runSessionId, userId });
  if (!session) {
    return {
      error: "Run session not found",
      status: 404,
    };
  }

  if (session.status === RUN_SESSION_FINISHED) {
    const existingRun = await getRunByIdForUser({
      runId: session.run_id,
      userId,
    });

    return {
      run: existingRun,
      territory_summary: {
        territories_claimed: toNumber(session.territories_claimed),
        territories_captured: toNumber(session.territories_captured),
        territories_strengthened: toNumber(session.territories_strengthened),
        total_segments_applied: toNumber(session.total_segments_applied),
        total_segments_rejected: toNumber(session.total_segments_rejected),
      },
      duplicate: true,
    };
  }

  const extraPoints = normalizePoints(finalPoints);
  if (extraPoints.length > 0) {
    const nextSeq = toNumber(session.last_seq, 0) + 1;
    const chunkResult = await processRunSessionChunk({
      userId,
      runSessionId,
      seq: nextSeq,
      points: extraPoints,
    });

    if (chunkResult?.error) {
      return chunkResult;
    }

    session = await getRunSessionForUser({ runSessionId, userId });
  }

  const finalDistanceKm = Math.max(0, toNumber(distanceKm));
  const finalDurationSeconds = Math.max(0, Math.floor(toNumber(durationSeconds)));
  const finalAvgPace = Number.isFinite(Number(avgPace)) ? Number(avgPace) : null;

  let run = null;

  if (finalDistanceKm > 0.01) {
    const runRows = await sql`
      INSERT INTO runs (user_id, distance_km, duration_seconds, avg_pace, territories_claimed, route_data, started_at, ended_at)
      VALUES (
        ${userId},
        ${Math.round(finalDistanceKm * 1000) / 1000},
        ${finalDurationSeconds},
        ${finalAvgPace},
        ${toNumber(session.territories_claimed)},
        ${null},
        ${startedAt || session.started_at || new Date().toISOString()},
        NOW()
      )
      RETURNING id, distance_km, duration_seconds, avg_pace, territories_claimed, started_at, ended_at
    `;
    run = runRows?.[0] || null;

    await sql`
      UPDATE auth_users
      SET total_distance_km = total_distance_km + ${Math.round(finalDistanceKm * 1000) / 1000},
          total_runs = total_runs + 1
      WHERE id = ${userId}
    `;
  }

  await sql`
    UPDATE run_sessions
    SET
      status = ${RUN_SESSION_FINISHED},
      ended_at = NOW(),
      run_id = ${run?.id || null},
      updated_at = NOW()
    WHERE id = ${runSessionId}
      AND user_id = ${userId}
  `;

  const refreshed = await getRunSessionForUser({ runSessionId, userId });

  return {
    run,
    territory_summary: {
      territories_claimed: toNumber(refreshed?.territories_claimed),
      territories_captured: toNumber(refreshed?.territories_captured),
      territories_strengthened: toNumber(refreshed?.territories_strengthened),
      total_segments_applied: toNumber(refreshed?.total_segments_applied),
      total_segments_rejected: toNumber(refreshed?.total_segments_rejected),
    },
    duplicate: false,
  };
};

export const __internal = {
  resolveTopOwner,
  allocateSegmentAcrossTiles,
};
