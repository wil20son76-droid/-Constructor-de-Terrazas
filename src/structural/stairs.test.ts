import { describe, expect, it } from "vitest";
import type { Stair } from "../types";
import { computeStair } from "./stairs";

describe("computeStair", () => {
  it("computes riser height and stringer length from Pythagoras", () => {
    const stair: Stair = {
      id: "s1",
      edgeIndex: 0,
      widthMm: 1000,
      totalHeightMm: 900,
      stepCount: 6,
      stepDepthMm: 300,
      trallMaterialId: "trall1",
      regelMaterialId: "regel1",
    };
    const result = computeStair(stair, 120, 5);
    expect(result.riserHeightMm).toBeCloseTo(150, 6);
    const run = 6 * 300;
    expect(result.stringerLengthMm).toBeCloseTo(Math.sqrt(run * run + 900 * 900), 6);
    expect(result.stringerCount).toBeGreaterThanOrEqual(2);
    expect(result.treadBoardCount).toBeGreaterThan(0);
    expect(result.screwCount).toBe(stair.stepCount * result.stringerCount * 3);
  });
});
