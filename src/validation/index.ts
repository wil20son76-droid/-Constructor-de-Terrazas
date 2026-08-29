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
import type { DeckLevel, MaterialLibrary, ValidationIssue } from "../types";
import { makeId } from "../geometry";
import type { LevelGeometryResult } from "../materials";

export const STRUCTURAL_DISCLAIMER =
  "Kontrollera dimensioneringen mot gällande konstruktionskrav och leverantörens monteringsanvisningar.";

const MAX_REASONABLE_PLINT_SPACING_MM = 2000;
const MAX_REASONABLE_BARLINA_SPACING_MM = 2400;

export function validateLevel(
  level: DeckLevel,
  library: MaterialLibrary,
  geometry: LevelGeometryResult,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const warn = (message: string) => issues.push({ id: makeId("issue"), severity: "warning", message });
  const error = (message: string) => issues.push({ id: makeId("issue"), severity: "error", message });

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

  return issues;
}
