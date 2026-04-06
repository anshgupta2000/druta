import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { ensureAuthUser } from "@/app/api/utils/users";

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

export async function GET() {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await ensureAuthUser(session.user);
    const userId = user?.id || session.user.id;

    const [strengthRow] = await sql`
      SELECT
        COALESCE(SUM(strength), 0)::int AS total_strength
      FROM territories
      WHERE owner_id = ${userId}
    `;

    const [claimsRow] = await sql`
      SELECT
        COALESCE(SUM(territories_claimed), 0)::int AS total_claimed,
        COALESCE(MAX(territories_claimed), 0)::int AS best_run_claimed,
        COALESCE(SUM(CASE WHEN territories_claimed > 0 THEN 1 ELSE 0 END), 0)::int AS runs_with_claims,
        COALESCE(SUM(territories_claimed) FILTER (WHERE started_at >= NOW() - INTERVAL '7 days'), 0)::int AS claimed_last_7d
      FROM runs
      WHERE user_id = ${userId}
    `;

    const [recentRun] = await sql`
      SELECT
        id, distance_km, duration_seconds, avg_pace, territories_claimed, started_at, ended_at
      FROM runs
      WHERE user_id = ${userId}
      ORDER BY COALESCE(started_at, created_at) DESC
      LIMIT 1
    `;

    const [leaderboardRow] = await sql`
      WITH ranked AS (
        SELECT
          id,
          RANK() OVER (ORDER BY territories_owned DESC, id ASC) AS rank
        FROM auth_users
        WHERE username IS NOT NULL
      )
      SELECT rank
      FROM ranked
      WHERE id = ${userId}
      LIMIT 1
    `;

    const zonesOwned = toNumber(user?.territories_owned);
    const totalRuns = toNumber(user?.total_runs);
    const totalStrength = toNumber(strengthRow?.total_strength);
    const totalClaimed = toNumber(claimsRow?.total_claimed);
    const runsWithClaims = toNumber(claimsRow?.runs_with_claims);
    const claimRate =
      totalRuns > 0
        ? Number(((runsWithClaims / totalRuns) * 100).toFixed(1))
        : 0;

    return Response.json({
      core_stats: {
        zones_owned: zonesOwned,
        total_strength: totalStrength,
        average_strength:
          zonesOwned > 0 ? Number((totalStrength / zonesOwned).toFixed(1)) : 0,
        leaderboard_rank: leaderboardRow?.rank
          ? toNumber(leaderboardRow.rank)
          : null,
        total_claimed,
        best_run_claimed: toNumber(claimsRow?.best_run_claimed),
        runs_with_claims: runsWithClaims,
        claimed_last_7d: toNumber(claimsRow?.claimed_last_7d),
        claim_rate_percent: claimRate,
        recent_run: recentRun
          ? {
              id: recentRun.id,
              distance_km: toNumber(recentRun.distance_km),
              duration_seconds: toNumber(recentRun.duration_seconds),
              avg_pace: recentRun.avg_pace,
              territories_claimed: toNumber(recentRun.territories_claimed),
              started_at: recentRun.started_at,
              ended_at: recentRun.ended_at,
            }
          : null,
      },
    });
  } catch (err) {
    console.error("GET /api/profile/core-stats error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
