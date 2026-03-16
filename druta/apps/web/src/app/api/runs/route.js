import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

export async function GET(request) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
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
    const userId = session.user.id;
    const body = await request.json();
    const {
      distance_km,
      duration_seconds,
      avg_pace,
      territories_claimed,
      route_data,
    } = body;

    const result = await sql`
      INSERT INTO runs (user_id, distance_km, duration_seconds, avg_pace, territories_claimed, route_data, started_at, ended_at)
      VALUES (${userId}, ${distance_km || 0}, ${duration_seconds || 0}, ${avg_pace || null}, ${territories_claimed || 0}, ${route_data || null}, ${body.started_at || new Date().toISOString()}, NOW())
      RETURNING *
    `;

    // Update user stats
    await sql`
      UPDATE auth_users
      SET total_distance_km = total_distance_km + ${distance_km || 0},
          total_runs = total_runs + 1
      WHERE id = ${userId}
    `;

    return Response.json({ run: result?.[0] });
  } catch (err) {
    console.error("POST /api/runs error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
