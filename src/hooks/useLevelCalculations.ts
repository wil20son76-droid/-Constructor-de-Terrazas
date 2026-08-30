import { useMemo } from "react";
import type { DeckLevel, MaterialLibrary } from "../types";
import { computeLevelBom, summarizeLevel } from "../materials";
import { classifyEdges, filterEdgeBoardEligible } from "../deck/edgeClassification";
import { computeLabourItems, totalLabourCost } from "../labour";
import { computeCostSummary, computeMaterialCost } from "../pricing";
import { validateLevel } from "../validation";
import type { LabourRates } from "../types";
import type { MarkupConfig, RotConfig } from "../pricing";

export interface UseLevelCalculationsArgs {
  level: DeckLevel;
  library: MaterialLibrary;
  clientSuppliedMaterialIds: string[];
  labourRates: LabourRates;
  markup: MarkupConfig;
  vatPercent: number;
  rot: RotConfig;
  otherCostsTotal: number;
}

export function useLevelCalculations(args: UseLevelCalculationsArgs) {
  const { level, library, clientSuppliedMaterialIds, labourRates, markup, vatPercent, rot, otherCostsTotal } = args;

  const bomResult = useMemo(
    () => computeLevelBom(level, library, clientSuppliedMaterialIds),
    [level, library, clientSuppliedMaterialIds],
  );

  const area = useMemo(() => summarizeLevel(level), [level]);

  const validation = useMemo(
    () => validateLevel(level, library, bomResult.geometry, bomResult.cutPlans),
    [level, library, bomResult.geometry, bomResult.cutPlans],
  );

  const labourItems = useMemo(() => {
    const edgeClassification = classifyEdges(level);
    const edgeLengthM = level.edgeBoards.reduce((sum, run) => {
      const eligible = filterEdgeBoardEligible(run.edgeIndices, edgeClassification);
      return (
        sum +
        eligible.reduce((s, idx) => {
          const a = level.polygon.points[idx];
          const b = level.polygon.points[(idx + 1) % level.polygon.points.length];
          if (!a || !b) return s;
          return s + Math.hypot(b.x - a.x, b.y - a.y) / 1000;
        }, 0)
      );
    }, 0);

    return computeLabourItems(
      {
        area,
        footingCount: bomResult.geometry.footings.length,
        stairCount: level.stairs.length,
        edgeLengthM,
      },
      labourRates,
    );
  }, [area, bomResult.geometry.footings.length, level, labourRates]);

  const materialCost = useMemo(() => computeMaterialCost(bomResult.bomLines), [bomResult.bomLines]);
  const labourCost = useMemo(() => totalLabourCost(labourItems), [labourItems]);

  const costs = useMemo(
    () => computeCostSummary(materialCost, labourCost, otherCostsTotal, markup, vatPercent, rot),
    [materialCost, labourCost, otherCostsTotal, markup, vatPercent, rot],
  );

  return { ...bomResult, area, validation, labourItems, costs };
}
