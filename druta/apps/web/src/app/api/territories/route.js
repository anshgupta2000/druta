import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

// Get territories for a bounding box
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const minLat = parseInt(searchParams.get("minLat")) || 0;
    const maxLat = parseInt(searchParams.get("maxLat")) || 0;
    const minLng = parseInt(searchParams.get("minLng")) || 0;
    const maxLng = parseInt(searchParams.get("maxLng")) || 0;

    const territories = await sql`
      SELECT id, grid_lat, grid_lng, owner_id, owner_username, strength, last_run_at
      FROM territories
      WHERE grid_lat >= ${minLat} AND grid_lat <= ${maxLat}
        AND grid_lng >= ${minLng} AND grid_lng <= ${maxLng}
      ORDER BY grid_lat, grid_lng
      LIMIT 500
    `;

    return Response.json({ territories });
  } catch (err) {
    console.error("GET /api/territories error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// Claim or strengthen a territory
export async function POST(request) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { grid_lat, grid_lng, distance_in_grid } = body;

    if (grid_lat === undefined || grid_lng === undefined) {
      return Response.json(
        { error: "grid_lat and grid_lng required" },
        { status: 400 },
      );
    }

    // Get user info
    const userRows =
      await sql`SELECT username, avatar_color FROM auth_users WHERE id = ${userId} LIMIT 1`;
    const user = userRows?.[0];
    const username = user?.username || "Runner";

    // Check if territory exists
    const existing = await sql`
      SELECT id, owner_id, strength FROM territories
      WHERE grid_lat = ${grid_lat} AND grid_lng = ${grid_lng} LIMIT 1
    `;

    let result;
    let claimed = false;
    const runDistance = distance_in_grid || 0.1;

    if (existing.length === 0) {
      // New territory - claim it
      result = await sql`
        INSERT INTO territories (grid_lat, grid_lng, owner_id, owner_username, strength, last_run_at)
        VALUES (${grid_lat}, ${grid_lng}, ${userId}, ${username}, 1, NOW())
        RETURNING *
      `;
      claimed = true;
    } else {
      const territory = existing[0];
      if (territory.owner_id === userId) {
        // Own territory - strengthen it (max 10)
        const newStrength = Math.min((territory.strength || 1) + 1, 10);
        result = await sql`
          UPDATE territories SET strength = ${newStrength}, last_run_at = NOW()
          WHERE id = ${territory.id} RETURNING *
        `;
      } else {
        // Enemy territory - try to take it
        const newStrength = (territory.strength || 1) - 1;
        if (newStrength <= 0) {
          // Conquered!
          result = await sql`
            UPDATE territories SET owner_id = ${userId}, owner_username = ${username}, strength = 1, last_run_at = NOW()
            WHERE id = ${territory.id} RETURNING *
          `;
          claimed = true;
          // Decrease previous owner territory count
          if (territory.owner_id) {
            await sql`UPDATE auth_users SET territories_owned = GREATEST(0, territories_owned - 1) WHERE id = ${territory.owner_id}`;
          }
        } else {
          result = await sql`
            UPDATE territories SET strength = ${newStrength}, last_run_at = NOW()
            WHERE id = ${territory.id} RETURNING *
          `;
        }
      }
    }

    // Update user territory count if claimed
    if (claimed) {
      await sql`UPDATE auth_users SET territories_owned = territories_owned + 1 WHERE id = ${userId}`;
    }

    return Response.json({ territory: result?.[0], claimed });
  } catch (err) {
    console.error("POST /api/territories error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
