import { auth } from "@/auth";
import { ensureAuthUser } from "@/app/api/utils/users";
import { finishRunSession } from "@/app/api/runs/live/shared";

export async function POST(request) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await ensureAuthUser(session.user);
    const userId = profile?.id || session.user.id;

    const body = await request.json().catch(() => ({}));
    const runSessionId = Number(body?.run_session_id);

    if (!Number.isFinite(runSessionId) || runSessionId <= 0) {
      return Response.json({ error: "run_session_id is required" }, { status: 400 });
    }

    const result = await finishRunSession({
      userId,
      runSessionId,
      distanceKm: body?.distance_km,
      durationSeconds: body?.duration_seconds,
      avgPace: body?.avg_pace,
      startedAt: body?.started_at,
      finalPoints: Array.isArray(body?.final_points) ? body.final_points : [],
    });

    if (result?.error) {
      return Response.json({ error: result.error }, { status: result.status || 400 });
    }

    return Response.json({
      run: result.run,
      territory_summary: result.territory_summary,
      duplicate: Boolean(result.duplicate),
    });
  } catch (err) {
    console.error("POST /api/runs/live/finish error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
