import { describe, expect, it } from "vitest";
import type { LabourRates } from "../types";
import { computeLabourItems, estimateDurationDays, totalLabourCost } from "./index";

const rates: LabourRates = {
  stommeHoursPerM2: 0.6,
  trallHoursPerM2: 0.5,
  plintHoursPerUnit: 0.5,
  stairHoursPerUnit: 3,
  kantbradaHoursPerMeter: 0.2,
  hourlyRate: 450,
  workerCount: 2,
};

describe("computeLabourItems", () => {
  it("scales each item by its own rate and only includes non-zero items", () => {
    const items = computeLabourItems(
      { area: { grossAreaM2: 98, netAreaM2: 98, openingsAreaM2: 0, perimeterM: 42 }, footingCount: 10, stairCount: 0, edgeLengthM: 0 },
      rates,
    );
    const stomme = items.find((i) => i.description.startsWith("Stomme"));
    expect(stomme?.hours).toBeCloseTo(98 * 0.6, 6);
    expect(stomme?.cost).toBeCloseTo(98 * 0.6 * 450, 6);
    expect(items.some((i) => i.description === "Trappa")).toBe(false); // stairCount 0 -> omitted
  });

  it("total cost does not scale with crew size (workerCount only affects duration)", () => {
    const input = { area: { grossAreaM2: 10, netAreaM2: 10, openingsAreaM2: 0, perimeterM: 10 }, footingCount: 0, stairCount: 0, edgeLengthM: 0 };
    const oneWorker = totalLabourCost(computeLabourItems(input, { ...rates, workerCount: 1 }));
    const fourWorkers = totalLabourCost(computeLabourItems(input, { ...rates, workerCount: 4 }));
    expect(oneWorker).toBe(fourWorkers);
  });
});

describe("estimateDurationDays", () => {
  it("halves the duration when doubling the crew", () => {
    expect(estimateDurationDays(160, 2)).toBeCloseTo(10, 6);
    expect(estimateDurationDays(160, 4)).toBeCloseTo(5, 6);
  });
});
