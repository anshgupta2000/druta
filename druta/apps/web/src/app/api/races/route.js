import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { ensureAuthUser } from "@/app/api/utils/users";

function isParticipant(race, userId) {
  return race.challenger_id === userId || race.opponent_id === userId;
}

export async function GET(request) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const profile = await ensureAuthUser(session.user);
    const userId = profile?.id || session.user.id;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let races;
    if (status) {
      races = await sql`
        SELECT r.*,
          c.username as challenger_username, c.avatar_color as challenger_color,
          o.username as opponent_username, o.avatar_color as opponent_color
        FROM races r
        LEFT JOIN auth_users c ON r.challenger_id = c.id
        LEFT JOIN auth_users o ON r.opponent_id = o.id
        WHERE (r.challenger_id = ${userId} OR r.opponent_id = ${userId})
          AND r.status = ${status}
        ORDER BY r.created_at DESC LIMIT 20
      `;
    } else {
      races = await sql`
        SELECT r.*,
          c.username as challenger_username, c.avatar_color as challenger_color,
          o.username as opponent_username, o.avatar_color as opponent_color
        FROM races r
        LEFT JOIN auth_users c ON r.challenger_id = c.id
        LEFT JOIN auth_users o ON r.opponent_id = o.id
        WHERE r.challenger_id = ${userId} OR r.opponent_id = ${userId}
        ORDER BY r.created_at DESC LIMIT 20
      `;
    }

    return Response.json({ races });
  } catch (err) {
    console.error("GET /api/races error", err);
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
    const { opponent_id, race_type, target_value } = body;

    if (!opponent_id) {
      return Response.json(
        { error: "opponent_id is required" },
        { status: 400 },
      );
    }

    const result = await sql`
      INSERT INTO races (challenger_id, opponent_id, race_type, target_value, status)
      VALUES (${userId}, ${opponent_id}, ${race_type || "distance"}, ${target_value || 1}, 'pending')
      RETURNING *
    `;

    return Response.json({ race: result?.[0] });
  } catch (err) {
    console.error("POST /api/races error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const profile = await ensureAuthUser(session.user);
    const userId = profile?.id || session.user.id;
    const body = await request.json();
    const { race_id, action, distance } = body;

    if (!race_id) {
      return Response.json({ error: "race_id required" }, { status: 400 });
    }

    const raceRows = await sql`SELECT * FROM races WHERE id = ${race_id} LIMIT 1`;
    const race = raceRows?.[0];
    if (!race) {
      return Response.json({ error: "Race not found" }, { status: 404 });
    }

    if (!isParticipant(race, userId)) {
      return Response.json({ error: "Not authorized for this race" }, { status: 403 });
    }

    const isFinalized = race.status === "finished" || race.status === "declined";
    if (isFinalized) {
      return Response.json(
        { error: `Race is already ${race.status}` },
        { status: 409 },
      );
    }

    if (action === "accept") {
      if (race.opponent_id !== userId) {
        return Response.json(
          { error: "Not your race to accept" },
          { status: 403 },
        );
      }
      if (race.status !== "pending") {
        return Response.json(
          { error: "Only pending races can be accepted" },
          { status: 409 },
        );
      }
      const result = await sql`
        UPDATE races SET status = 'active', started_at = NOW()
        WHERE id = ${race_id} RETURNING *
      `;
      return Response.json({ race: result?.[0] });
    }

    if (action === "decline") {
      if (race.opponent_id !== userId) {
        return Response.json(
          { error: "Not your race to decline" },
          { status: 403 },
        );
      }
      if (race.status !== "pending") {
        return Response.json(
          { error: "Only pending races can be declined" },
          { status: 409 },
        );
      }
      const result = await sql`
        UPDATE races SET status = 'declined'
        WHERE id = ${race_id} RETURNING *
      `;
      return Response.json({ race: result?.[0] });
    }

    if (action === "update_distance") {
      if (race.status !== "active") {
        return Response.json(
          { error: "Distance can only be updated for active races" },
          { status: 409 },
        );
      }

      const isChallenger = race.challenger_id === userId;

      let updateQuery;
      if (isChallenger) {
        updateQuery =
          await sql`UPDATE races SET challenger_distance = ${distance || 0} WHERE id = ${race_id} RETURNING *`;
      } else {
        updateQuery =
          await sql`UPDATE races SET opponent_distance = ${distance || 0} WHERE id = ${race_id} RETURNING *`;
      }

      const updatedRace = updateQuery?.[0];

      if (updatedRace && race.race_type === "distance") {
        const targetKm = race.target_value;
        const cDist = isChallenger ? distance || 0 : updatedRace.challenger_distance;
        const oDist = isChallenger ? updatedRace.opponent_distance : distance || 0;

        if (cDist >= targetKm || oDist >= targetKm) {
          const winnerId = cDist >= targetKm ? race.challenger_id : race.opponent_id;
          const loserId = winnerId === race.challenger_id ? race.opponent_id : race.challenger_id;

          await sql`UPDATE races SET status = 'finished', winner_id = ${winnerId}, ended_at = NOW() WHERE id = ${race_id}`;
          await sql`UPDATE auth_users SET wins = wins + 1 WHERE id = ${winnerId}`;
          await sql`UPDATE auth_users SET losses = losses + 1 WHERE id = ${loserId}`;

          const finalRace = await sql`
            SELECT r.*, c.username as challenger_username, o.username as opponent_username
            FROM races r
            LEFT JOIN auth_users c ON r.challenger_id = c.id
            LEFT JOIN auth_users o ON r.opponent_id = o.id
            WHERE r.id = ${race_id}
          `;
          return Response.json({ race: finalRace?.[0], finished: true });
        }
      }

      return Response.json({ race: updatedRace });
    }

    if (action === "forfeit") {
      if (race.status !== "active") {
        return Response.json(
          { error: "Only active races can be forfeited" },
          { status: 409 },
        );
      }

      const winnerId = race.challenger_id === userId ? race.opponent_id : race.challenger_id;
      const loserId = userId;

      await sql`UPDATE races SET status = 'finished', winner_id = ${winnerId}, ended_at = NOW() WHERE id = ${race_id}`;
      await sql`UPDATE auth_users SET wins = wins + 1 WHERE id = ${winnerId}`;
      await sql`UPDATE auth_users SET losses = losses + 1 WHERE id = ${loserId}`;

      const finalRace = await sql`
        SELECT r.*, c.username as challenger_username, o.username as opponent_username
        FROM races r
        LEFT JOIN auth_users c ON r.challenger_id = c.id
        LEFT JOIN auth_users o ON r.opponent_id = o.id
        WHERE r.id = ${race_id}
      `;
      return Response.json({ race: finalRace?.[0], finished: true, forfeited: true });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("PUT /api/races error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
