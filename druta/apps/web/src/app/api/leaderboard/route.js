import sql from "@/app/api/utils/sql";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sortBy = searchParams.get("sort") || "territories";

    let leaderboard;
    if (sortBy === "distance") {
      leaderboard = await sql`
        SELECT id, username, name, image, total_distance_km, total_runs, territories_owned, wins, losses, avatar_color
        FROM auth_users
        WHERE username IS NOT NULL
        ORDER BY total_distance_km DESC
        LIMIT 50
      `;
    } else if (sortBy === "wins") {
      leaderboard = await sql`
        SELECT id, username, name, image, total_distance_km, total_runs, territories_owned, wins, losses, avatar_color
        FROM auth_users
        WHERE username IS NOT NULL
        ORDER BY wins DESC
        LIMIT 50
      `;
    } else {
      leaderboard = await sql`
        SELECT id, username, name, image, total_distance_km, total_runs, territories_owned, wins, losses, avatar_color
        FROM auth_users
        WHERE username IS NOT NULL
        ORDER BY territories_owned DESC
        LIMIT 50
      `;
    }

    return Response.json({ leaderboard });
  } catch (err) {
    console.error("GET /api/leaderboard error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
