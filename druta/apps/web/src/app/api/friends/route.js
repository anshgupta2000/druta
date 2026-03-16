import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

export async function GET(request) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const friends = await sql`
      SELECT f.id, f.status, f.created_at,
        CASE WHEN f.user_id = ${userId} THEN f.friend_id ELSE f.user_id END as friend_user_id,
        u.username, u.name, u.image, u.total_distance_km, u.total_runs, u.territories_owned, u.wins, u.avatar_color
      FROM friends f
      JOIN auth_users u ON u.id = CASE WHEN f.user_id = ${userId} THEN f.friend_id ELSE f.user_id END
      WHERE (f.user_id = ${userId} OR f.friend_id = ${userId})
        AND f.status = 'accepted'
      ORDER BY u.username
    `;

    const pending = await sql`
      SELECT f.id, f.user_id as requester_id, f.created_at,
        u.username, u.name, u.image, u.avatar_color
      FROM friends f
      JOIN auth_users u ON u.id = f.user_id
      WHERE f.friend_id = ${userId} AND f.status = 'pending'
      ORDER BY f.created_at DESC
    `;

    return Response.json({ friends, pending });
  } catch (err) {
    console.error("GET /api/friends error", err);
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
    const { friend_username, action, friend_request_id } = body;

    if (action === "accept" && friend_request_id) {
      const result = await sql`
        UPDATE friends SET status = 'accepted'
        WHERE id = ${friend_request_id} AND friend_id = ${userId}
        RETURNING *
      `;
      return Response.json({ friend: result?.[0] });
    }

    if (action === "decline" && friend_request_id) {
      await sql`DELETE FROM friends WHERE id = ${friend_request_id} AND friend_id = ${userId}`;
      return Response.json({ success: true });
    }

    if (friend_username) {
      const friendRows =
        await sql`SELECT id FROM auth_users WHERE username = ${friend_username} LIMIT 1`;
      const friend = friendRows?.[0];
      if (!friend) {
        return Response.json({ error: "User not found" }, { status: 404 });
      }
      if (friend.id === userId) {
        return Response.json({ error: "Cannot add yourself" }, { status: 400 });
      }

      // Check existing
      const existing = await sql`
        SELECT id FROM friends
        WHERE (user_id = ${userId} AND friend_id = ${friend.id})
          OR (user_id = ${friend.id} AND friend_id = ${userId})
        LIMIT 1
      `;
      if (existing.length > 0) {
        return Response.json(
          { error: "Already friends or request pending" },
          { status: 400 },
        );
      }

      const result = await sql`
        INSERT INTO friends (user_id, friend_id, status)
        VALUES (${userId}, ${friend.id}, 'pending')
        RETURNING *
      `;
      return Response.json({ friend: result?.[0] });
    }

    return Response.json({ error: "Invalid request" }, { status: 400 });
  } catch (err) {
    console.error("POST /api/friends error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
