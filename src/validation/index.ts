/**
 * Configuration validation.
 *
 * These checks only flag internally-inconsistent or unusually large
 * values relative to simple heuristics and the user's own material
 * data (e.g. a board's `recommendedRegelSpacingMm`). They are NOT a
 * substitute for structural engineering sign-off, and the app must
 * never claim a design is code-compliant based on these checks alone —
 * see STRUCTURAL_DISCLAIMER below, which every consumer of this module
 * should surface next to any validation results.
 */
import type { CutPlanResult, DeckLevel, MaterialLibrary, ValidationIssue } from "../types";
import { makeId, validatePolygon } from "../geometry";
import type { LevelGeometryResult } from "../materials";

export const STRUCTURAL_DISCLAIMER =
  "Kontrollera dimensioneringen mot gällande konstruktionskrav och leverantörens monteringsanvisningar.";

const MAX_REASONABLE_PLINT_SPACING_MM = 2000;
const MAX_REASONABLE_BARLINA_SPACING_MM = 2400;

export function validateLevel(
  level: DeckLevel,
  library: MaterialLibrary,
  geometry: LevelGeometryResult,
  cutPlans: CutPlanResult[] = [],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const warn = (message: string) => issues.push({ id: makeId("issue"), severity: "warning", message });
  const error = (message: string) => issues.push({ id: makeId("issue"), severity: "error", message });

  // Geometry: a self-intersecting, zero-area or otherwise broken shape
  // makes every downstream calculation meaningless, so this is checked
  // first and blocks trusting the BOM (see App.tsx/MaterialsPanel, which
  // hide the material list while any error-severity issue is present).
  for (const issue of validatePolygon(level.polygon.points)) {
    if (issue.severity === "error") error(`Formens geometri: ${issue.message}`);
    else warn(`Formens geometri: ${issue.message}`);
  }
  for (const section of level.sections ?? []) {
    for (const issue of validatePolygon(section.polygon.points)) {
      if (issue.severity === "error") error(`${section.name}: ${issue.message}`);
      else warn(`${section.name}: ${issue.message}`);
    }
  }

  const trallMaterial = library.materials.find((m) => m.id === level.trallMaterialId);
  if (trallMaterial?.recommendedRegelSpacingMm && level.regelSpacing > trallMaterial.recommendedRegelSpacingMm) {
    warn(
      `Regelavståndet (CC ${level.regelSpacing} mm) är större än rekommenderat CC ${trallMaterial.recommendedRegelSpacingMm} mm för ${trallMaterial.nameSv}.`,
    );
  }

  if (level.plintMaxSpacing > MAX_REASONABLE_PLINT_SPACING_MM) {
    warn(`Avståndet mellan plintar (${level.plintMaxSpacing} mm) är ovanligt stort.`);
  }

  if (level.barlinaMaxSpacing > MAX_REASONABLE_BARLINA_SPACING_MM) {
    warn(`Spannlängden för reglar mellan bärlinor (${level.barlinaMaxSpacing} mm) är ovanligt stor.`);
  }

  if (geometry.beams.length < 2) {
    error("Endast en bärlina kunde placeras ut — kontrollera terrassens mått och bärlinornas maxavstånd.");
  }

  if (geometry.joists.length < 2) {
    error("Endast en regel kunde placeras ut — kontrollera terrassens mått och regelavståndet.");
  }

  if (level.heightAboveGround > 0 && geometry.postHeightMm === 0 && level.heightAboveGround < 300) {
    warn("Låg höjd över mark — kontrollera om plint kan monteras direkt under bärlina utan stolpe.");
  }

  const regelMaterial = library.materials.find((m) => m.id === level.regelMaterialId);
  const regelMaxLength = Math.max(...(regelMaterial?.availableLengthsMm ?? [Infinity]));
  if (geometry.joists.some((j) => j.lengthMm > regelMaxLength)) {
    warn(
      `Minst en regel (upp till ${Math.round(Math.max(...geometry.joists.map((j) => j.lengthMm)))} mm) är längre än längsta tillgängliga längd (${regelMaxLength} mm) för ${regelMaterial?.nameSv ?? "valt regelmaterial"} och skulle behöva skarvas.`,
    );
  }

  const barlinaMaterial = library.materials.find((m) => m.id === level.barlinaMaterialId);
  const barlinaMaxLength = Math.max(...(barlinaMaterial?.availableLengthsMm ?? [Infinity]));
  if (geometry.beams.some((b) => b.lengthMm > barlinaMaxLength)) {
    warn(
      `Minst en bärlina är längre än längsta tillgängliga längd (${barlinaMaxLength} mm) för ${barlinaMaterial?.nameSv ?? "valt bärlinamaterial"} och skulle behöva skarvas över en plint/stolpe.`,
    );
  }

  // Safety net: CC real must never exceed the configured maximum. This is
  // guaranteed by construction in computeUniformSpacing, but is checked
  // here too so a future regression fails loudly instead of silently.
  if (geometry.regelCcInfo.realSpacingMm > level.regelSpacing + 1e-6) {
    error(
      `Internt fel: beräknat regel-CC (${geometry.regelCcInfo.realSpacingMm.toFixed(1)} mm) överskrider konfigurerat max-CC (${level.regelSpacing} mm).`,
    );
  }
  if (geometry.barlinaSpacingInfo.realSpacingMm > level.barlinaMaxSpacing + 1e-6) {
    error(
      `Internt fel: beräknat bärlina-avstånd (${geometry.barlinaSpacingInfo.realSpacingMm.toFixed(1)} mm) överskrider konfigurerat max-avstånd (${level.barlinaMaxSpacing} mm).`,
    );
  }
  for (const spacing of geometry.plintSpacingInfoByBeam) {
    if (spacing.realSpacingMm > level.plintMaxSpacing + 1e-6) {
      error(
        `Internt fel: beräknat plintavstånd (${spacing.realSpacingMm.toFixed(1)} mm) överskrider konfigurerat max-avstånd (${level.plintMaxSpacing} mm).`,
      );
      break;
    }
  }

  // Trall splices: a row longer than the longest available board length
  // needs multiple boards butt-jointed together.
  const trallCutPlan = cutPlans.find((p) => p.materialId === level.trallMaterialId);
  if (trallCutPlan && trallCutPlan.spliceCount > 0) {
    warn(
      `${trallCutPlan.spliceCount} trallrad(er) är längre än längsta tillgängliga trallängd och behöver skarvas med flera brädor per rad.`,
    );
  }

  return issues;
}
