import { beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock, authMock, ensureAuthUserMock } = vi.hoisted(() => ({
  sqlMock: vi.fn(),
  authMock: vi.fn(),
  ensureAuthUserMock: vi.fn(),
}));

vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/users", () => ({ ensureAuthUser: ensureAuthUserMock }));

import { PUT } from "./route.js";

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/races", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("PUT /api/races authorization and state guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "u1" } });
    ensureAuthUserMock.mockResolvedValue({ id: "u1" });
  });

  it("rejects outsider mutation attempts", async () => {
    sqlMock.mockResolvedValueOnce([
      { id: "r1", challenger_id: "c1", opponent_id: "o1", status: "active" },
    ]);

    const res = await PUT(makeRequest({ race_id: "r1", action: "update_distance", distance: 2 }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Not authorized for this race" });
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it("rejects updates for finished races", async () => {
    sqlMock.mockResolvedValueOnce([
      { id: "r1", challenger_id: "u1", opponent_id: "o1", status: "finished" },
    ]);

    const res = await PUT(makeRequest({ race_id: "r1", action: "update_distance", distance: 2 }));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Race is already finished" });
  });

  it("allows valid participant update path", async () => {
    sqlMock
      .mockResolvedValueOnce([
        {
          id: "r1",
          challenger_id: "u1",
          opponent_id: "o1",
          status: "active",
          race_type: "distance",
          target_value: 5,
        },
      ])
      .mockResolvedValueOnce([
        { id: "r1", challenger_distance: 3, opponent_distance: 1, status: "active" },
      ]);

    const res = await PUT(makeRequest({ race_id: "r1", action: "update_distance", distance: 3 }));

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.race.challenger_distance).toBe(3);
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });
});
