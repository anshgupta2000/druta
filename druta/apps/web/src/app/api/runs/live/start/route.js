import { auth } from "@/auth";
import { ensureAuthUser } from "@/app/api/utils/users";
import { createRunSession } from "@/app/api/runs/live/shared";

export async function POST(request) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await ensureAuthUser(session.user);
    const userId = profile?.id || session.user.id;

    const body = await request.json().catch(() => ({}));
    const startedAt =
      typeof body?.started_at === "string" && body.started_at.trim().length > 0
        ? body.started_at
        : new Date().toISOString();

    const created = await createRunSession({ userId, startedAt });
    return Response.json({
      run_session_id: created?.id,
      status: created?.status || "active",
      started_at: created?.started_at || startedAt,
    });
  } catch (err) {
    console.error("POST /api/runs/live/start error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
