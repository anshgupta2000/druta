import { auth } from "@/auth";
import { ensureAuthUser } from "@/app/api/utils/users";
import { processRunSessionChunk } from "@/app/api/runs/live/shared";

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
    const seq = Number(body?.seq);
    const points = Array.isArray(body?.points) ? body.points : [];

    if (!Number.isFinite(runSessionId) || runSessionId <= 0) {
      return Response.json({ error: "run_session_id is required" }, { status: 400 });
    }

    const result = await processRunSessionChunk({
      userId,
      runSessionId,
      seq,
      points,
    });

    if (result?.error) {
      return Response.json(
        {
          error: result.error,
          ...(result.expected_seq ? { expected_seq: result.expected_seq } : {}),
        },
        { status: result.status || 400 },
      );
    }

    return Response.json({
      applied_segments: result.applied_segments,
      rejected_segments: result.rejected_segments,
      changed_tiles: result.changed_tiles,
      live_stats: result.live_stats,
      duplicate: Boolean(result.duplicate),
    });
  } catch (err) {
    console.error("POST /api/runs/live/chunk error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
