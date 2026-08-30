import { describe, expect, it } from "vitest";
import { computeFootings } from "./index";
import type { Beam } from "../types";

function makeBeam(id: string, x1: number, y: number, x2: number): Beam {
  return { id, materialId: "barlina1", start: { x: x1, y }, end: { x: x2, y }, lengthMm: x2 - x1 };
}

describe("computeFootings", () => {
  it("distributes footings along each beam with uniform spacing <= max, numbered sequentially, tagged with beamId", () => {
    const beams = [makeBeam("beam1", 0, 0, 1000), makeBeam("beam2", 0, 900, 1000)];
    const { footings, spacingInfoByBeam } = computeFootings(beams, "plint1", 500);
    // Each beam is 1000mm; maxSpacing=500 -> numberOfSpaces=ceil(1000/500)=2, realSpacing=500, 3 footings each.
    expect(spacingInfoByBeam).toHaveLength(2);
    for (const s of spacingInfoByBeam) {
      expect(s.numberOfSpaces).toBe(2);
      expect(s.realSpacingMm).toBe(500);
      expect(s.realSpacingMm).toBeLessThanOrEqual(500);
    }
    expect(footings).toHaveLength(6);
    expect(footings.filter((f) => f.beamId === "beam1")).toHaveLength(3);
    expect(footings.filter((f) => f.beamId === "beam2")).toHaveLength(3);
  });

  it("numbers footings sequentially across all beams (P1, P2, ...)", () => {
    const beams = [makeBeam("beam1", 0, 0, 1000), makeBeam("beam2", 0, 500, 1000)];
    const { footings } = computeFootings(beams, "plint1", 1000);
    expect(footings.map((f) => f.label)).toEqual(["P1", "P2", "P3", "P4"]);
  });

  it("matches the spec's example: plintMaxSpacing=1800mm on a 14000mm bärlina", () => {
    const beam = makeBeam("beamA", 0, 0, 14000);
    const { footings, spacingInfoByBeam } = computeFootings([beam], "plint1", 1800);
    // numberOfSpaces = ceil(14000/1800) = ceil(7.778) = 8, realSpacing = 14000/8 = 1750, 9 footings.
    expect(spacingInfoByBeam[0].numberOfSpaces).toBe(8);
    expect(spacingInfoByBeam[0].realSpacingMm).toBeCloseTo(1750, 6);
    expect(spacingInfoByBeam[0].realSpacingMm).toBeLessThanOrEqual(1800);
    expect(footings).toHaveLength(9);
    // First and last footing sit exactly at the beam's ends.
    expect(footings[0].position.x).toBeCloseTo(0, 6);
    expect(footings[8].position.x).toBeCloseTo(14000, 6);
  });

  it("places footings on the actual beam geometry (real x/y positions), not just counts", () => {
    const beam = makeBeam("beamB", 100, 200, 1100); // offset beam, still 1000mm long
    const { footings } = computeFootings([beam], "plint1", 500);
    for (const f of footings) {
      expect(f.position.y).toBeCloseTo(200, 6);
      expect(f.position.x).toBeGreaterThanOrEqual(100 - 1e-6);
      expect(f.position.x).toBeLessThanOrEqual(1100 + 1e-6);
    }
  });
});
