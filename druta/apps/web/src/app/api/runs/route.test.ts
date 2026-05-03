import { describe, expect, it } from "vitest";
import { __internal } from "./route.js";

describe("/api/runs fallback sanitization", () => {
  it("ignores forged territory and verification fields", () => {
    const payload = __internal.sanitizeFallbackRunPayload({
      distance_km: 5.4,
      duration_seconds: 1800,
      territories_claimed: 999,
      is_verified: true,
    });

    expect(payload.territories_claimed).toBe(0);
    expect(payload.is_verified).toBe(false);
  });

  it("clamps and normalizes malformed payload fields", () => {
    const payload = __internal.sanitizeFallbackRunPayload({
      distance_km: 999999,
      duration_seconds: -10,
      avg_pace: -2,
      started_at: "not-a-date",
      route_data: { bad: true },
    });

    expect(payload.distance_km).toBe(200);
    expect(payload.duration_seconds).toBe(0);
    expect(payload.avg_pace).toBeNull();
    expect(payload.route_data).toBeNull();
    expect(new Date(payload.started_at).toString()).not.toBe("Invalid Date");
  });
});
