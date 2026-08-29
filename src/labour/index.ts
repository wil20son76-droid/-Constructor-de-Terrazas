/**
 * Labour (arbetstid) calculation engine.
 *
 * Productivity figures (hours per m², hours per unit, ...) are entirely
 * user-configurable via LabourRates — no universal productivity is
 * assumed, per the spec's explicit requirement. Each rate is interpreted
 * as total person-hours needed for that task, independent of crew size;
 * `workerCount` is only used to estimate elapsed project duration, never
 * to multiply cost (a bigger crew changes the timeline, not the total
 * person-hours billed).
 */
import type { AreaSummary } from "../geometry";
import type { LabourItem, LabourRates } from "../types";
import { makeId } from "../geometry";

export interface LabourInput {
  area: AreaSummary;
  footingCount: number;
  stairCount: number;
  edgeLengthM: number;
}

export function computeLabourItems(input: LabourInput, rates: LabourRates): LabourItem[] {
  const items: LabourItem[] = [];

  const addItem = (description: string, hours: number) => {
    if (hours <= 0) return;
    items.push({
      id: makeId("labour"),
      description,
      hours,
      hourlyRate: rates.hourlyRate,
      cost: hours * rates.hourlyRate,
    });
  };

  addItem("Stomme (reglar, bärlinor)", input.area.netAreaM2 * rates.stommeHoursPerM2);
  addItem("Trallläggning", input.area.netAreaM2 * rates.trallHoursPerM2);
  addItem("Plintar/stolpar", input.footingCount * rates.plintHoursPerUnit);
  addItem("Trappa", input.stairCount * rates.stairHoursPerUnit);
  addItem("Kant-/sargbräda", input.edgeLengthM * rates.kantbradaHoursPerMeter);

  return items;
}

export function totalLabourCost(items: LabourItem[]): number {
  return items.reduce((sum, i) => sum + i.cost, 0);
}

export function totalLabourHours(items: LabourItem[]): number {
  return items.reduce((sum, i) => sum + i.hours, 0);
}

/** Estimated calendar duration in working days (8h/day) given a crew size. */
export function estimateDurationDays(totalHours: number, workerCount: number): number {
  const crew = Math.max(1, workerCount);
  return totalHours / crew / 8;
}
