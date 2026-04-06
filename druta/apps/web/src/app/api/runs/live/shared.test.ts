import { describe, expect, it } from "vitest";
import {
  __internal,
  haversineDistanceMeters,
  latLngToGrid,
} from "./shared.js";

describe("territory live geometry", () => {
  it("maps lat/lng into integer 200m grid coordinates", () => {
    const grid = latLngToGrid(37.7749, -122.4194);
    expect(Number.isInteger(grid.gridLat)).toBe(true);
    expect(Number.isInteger(grid.gridLng)).toBe(true);
  });

  it("computes haversine distance in meters", () => {
    const distance = haversineDistanceMeters(0, 0, 0.001, 0);
    expect(distance).toBeGreaterThan(100);
    expect(distance).toBeLessThan(120);
  });

  it("allocates the full segment distance across tile samples", () => {
    const start = { latitude: 37.7749, longitude: -122.4194 };
    const end = { latitude: 37.7759, longitude: -122.4184 };
    const distance = haversineDistanceMeters(
      start.latitude,
      start.longitude,
      end.latitude,
      end.longitude,
    );

    const allocations = __internal.allocateSegmentAcrossTiles(start, end, distance);
    const allocatedDistance = Array.from(allocations.values()).reduce(
      (sum, tile) => sum + tile.distance_m,
      0,
    );

    expect(allocatedDistance).toBeGreaterThan(distance * 0.995);
    expect(allocatedDistance).toBeLessThan(distance * 1.005);
  });
});

describe("territory ownership tie-breaking", () => {
  it("keeps incumbent owner when tied for top distance", () => {
    const contributions = [
      { subject_id: "alpha", distance_m: 120 },
      { subject_id: "beta", distance_m: 120 },
      { subject_id: "charlie", distance_m: 40 },
    ];

    const ownership = __internal.resolveTopOwner(contributions, "beta");
    expect(ownership?.owner_id).toBe("beta");
    expect(ownership?.lead_m).toBe(0);
  });

  it("falls back to lowest user_id when tied and no incumbent", () => {
    const contributions = [
      { subject_id: "zeta", distance_m: 90 },
      { subject_id: "alpha", distance_m: 90 },
      { subject_id: "beta", distance_m: 50 },
    ];

    const ownership = __internal.resolveTopOwner(contributions, null);
    expect(ownership?.owner_id).toBe("alpha");
  });

  it("derives lead from first and second place distances", () => {
    const contributions = [
      { subject_id: "owner", distance_m: 250 },
      { subject_id: "challenger", distance_m: 130 },
    ];

    const ownership = __internal.resolveTopOwner(contributions, "owner");
    expect(ownership?.owner_id).toBe("owner");
    expect(ownership?.lead_m).toBe(120);
  });
});
