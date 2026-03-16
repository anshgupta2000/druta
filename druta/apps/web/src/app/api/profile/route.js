import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    const rows =
      await sql`SELECT id, name, email, image, username, total_distance_km, total_runs, territories_owned, wins, losses, avatar_color, avatar_url, avatar_code, avatar_thumbnail_url, outfit_loadout FROM auth_users WHERE id = ${userId} LIMIT 1`;
    const user = rows?.[0] || null;
    return Response.json({ user });
  } catch (err) {
    console.error("GET /api/profile error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    const body = await request.json();
    const {
      username,
      avatar_color,
      avatar_url,
      avatar_code,
      avatar_thumbnail_url,
      outfit_loadout,
    } = body || {};

    const setClauses = [];
    const values = [];

    if (typeof username === "string" && username.trim().length > 0) {
      values.push(username.trim());
      setClauses.push("username = $" + values.length);
    }
    if (typeof avatar_color === "string" && avatar_color.trim().length > 0) {
      values.push(avatar_color.trim());
      setClauses.push("avatar_color = $" + values.length);
    }
    if (typeof avatar_url === "string") {
      values.push(avatar_url.trim());
      setClauses.push("avatar_url = $" + values.length);
    }
    if (typeof avatar_code === "string") {
      values.push(avatar_code.trim());
      setClauses.push("avatar_code = $" + values.length);
    }
    if (typeof avatar_thumbnail_url === "string") {
      values.push(avatar_thumbnail_url.trim());
      setClauses.push("avatar_thumbnail_url = $" + values.length);
    }
    if (outfit_loadout !== undefined && outfit_loadout !== null) {
      values.push(JSON.stringify(outfit_loadout));
      setClauses.push("outfit_loadout = $" + values.length + "::jsonb");
    }

    if (setClauses.length === 0) {
      return Response.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

    values.push(userId);
    const finalQuery = `UPDATE auth_users SET ${setClauses.join(", ")} WHERE id = $${values.length} RETURNING id, name, email, image, username, total_distance_km, total_runs, territories_owned, wins, losses, avatar_color, avatar_url, avatar_code, avatar_thumbnail_url, outfit_loadout`;
    const result = await sql(finalQuery, values);
    const updated = result?.[0] || null;
    return Response.json({ user: updated });
  } catch (err) {
    console.error("PUT /api/profile error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
