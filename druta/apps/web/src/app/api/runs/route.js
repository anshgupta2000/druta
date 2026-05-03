import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { ensureAuthUser } from "@/app/api/utils/users";

const MAX_FALLBACK_DISTANCE_KM = 200;
const MAX_FALLBACK_DURATION_SECONDS = 24 * 60 * 60;

function sanitizeFallbackRunPayload(body = {}) {
  const distanceRaw = Number(body?.distance_km);
  const durationRaw = Number(body?.duration_seconds);
  const avgPaceRaw = Number(body?.avg_pace);

  const distance_km = Number.isFinite(distanceRaw)
    ? Math.min(Math.max(distanceRaw, 0), MAX_FALLBACK_DISTANCE_KM)
    : 0;
  const duration_seconds = Number.isFinite(durationRaw)
    ? Math.min(Math.max(Math.round(durationRaw), 0), MAX_FALLBACK_DURATION_SECONDS)
    : 0;
  const avg_pace = Number.isFinite(avgPaceRaw) && avgPaceRaw > 0 ? avgPaceRaw : null;

  const startedAtDate = body?.started_at ? new Date(body.started_at) : null;
  const started_at =
    startedAtDate && !Number.isNaN(startedAtDate.getTime())
      ? startedAtDate.toISOString()
      : new Date().toISOString();

  const routeDataInput = body?.route_data;
  const route_data =
    typeof routeDataInput === "string" && routeDataInput.length <= 250_000
      ? routeDataInput
      : null;

  return {
    distance_km,
    duration_seconds,
    avg_pace,
    started_at,
    route_data,
    territories_claimed: 0,
    is_verified: false,
  };
}

export const __internal = {
  sanitizeFallbackRunPayload,
};

export async function GET(request) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const profile = await ensureAuthUser(session.user);
    const userId = profile?.id || session.user.id;
    const runs = await sql`
      SELECT id, distance_km, duration_seconds, avg_pace, territories_claimed, started_at, ended_at
      FROM runs WHERE user_id = ${userId}
      ORDER BY created_at DESC LIMIT 50
    `;
    return Response.json({ runs });
  } catch (err) {
    console.error("GET /api/runs error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const profile = await ensureAuthUser(session.user);
    const userId = profile?.id || session.user.id;
    const body = await request.json();

    const sanitizedRun = sanitizeFallbackRunPayload(body);

    const result = await sql`
      INSERT INTO runs (user_id, distance_km, duration_seconds, avg_pace, territories_claimed, route_data, started_at, ended_at)
      VALUES (${userId}, ${sanitizedRun.distance_km}, ${sanitizedRun.duration_seconds}, ${sanitizedRun.avg_pace}, ${sanitizedRun.territories_claimed}, ${sanitizedRun.route_data}, ${sanitizedRun.started_at}, NOW())
      RETURNING *
    `;

    return Response.json({ run: result?.[0], is_verified: false });
  } catch (err) {
    console.error("POST /api/runs error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
