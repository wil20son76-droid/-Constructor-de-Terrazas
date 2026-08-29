import { useMemo } from "react";
import type { DeckLevel, MaterialLibrary } from "../types";
import { computeLevelBom, summarizeLevel } from "../materials";
import { computeLabourItems, totalLabourCost } from "../labour";
import { computeCostSummary, computeMaterialCost } from "../pricing";
import { validateLevel } from "../validation";
import type { LabourRates } from "../types";
import type { MarginConfig, RotConfig } from "../pricing";

export interface UseLevelCalculationsArgs {
  level: DeckLevel;
  library: MaterialLibrary;
  clientSuppliedMaterialIds: string[];
  labourRates: LabourRates;
  margin: MarginConfig;
  vatPercent: number;
  rot: RotConfig;
  otherCostsTotal: number;
}

export function useLevelCalculations(args: UseLevelCalculationsArgs) {
  const { level, library, clientSuppliedMaterialIds, labourRates, margin, vatPercent, rot, otherCostsTotal } = args;

  const bomResult = useMemo(
    () => computeLevelBom(level, library, clientSuppliedMaterialIds),
    [level, library, clientSuppliedMaterialIds],
  );

  const area = useMemo(() => summarizeLevel(level), [level]);

  const validation = useMemo(
    () => validateLevel(level, library, bomResult.geometry),
    [level, library, bomResult.geometry],
  );

  const labourItems = useMemo(
    () =>
      computeLabourItems(
        {
          area,
          footingCount: bomResult.geometry.footings.length,
          stairCount: level.stairs.length,
          edgeLengthM: level.edgeBoards.reduce((sum, run) => {
            return (
              sum +
              run.edgeIndices.reduce((s, idx) => {
                const a = level.polygon.points[idx];
                const b = level.polygon.points[(idx + 1) % level.polygon.points.length];
                if (!a || !b) return s;
                return s + Math.hypot(b.x - a.x, b.y - a.y) / 1000;
              }, 0)
            );
          }, 0),
        },
        labourRates,
      ),
    [area, bomResult.geometry.footings.length, level.stairs.length, level.edgeBoards, level.polygon, labourRates],
  );

  const materialCost = useMemo(() => computeMaterialCost(bomResult.bomLines), [bomResult.bomLines]);
  const labourCost = useMemo(() => totalLabourCost(labourItems), [labourItems]);

  const costs = useMemo(
    () => computeCostSummary(materialCost, labourCost, otherCostsTotal, margin, vatPercent, rot),
    [materialCost, labourCost, otherCostsTotal, margin, vatPercent, rot],
  );

  return { ...bomResult, area, validation, labourItems, costs };
}
