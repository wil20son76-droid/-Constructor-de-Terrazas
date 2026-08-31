/**
 * Approximate visual colors for the 3D client view, keyed off free-text
 * material names (there's no color field on `Material` — see
 * `src/types/index.ts`). Purely cosmetic; never used by BOM/pricing.
 */

const FALLBACK_WOOD_COLOR = "#8a6240";

export function colorForTrallMaterialName(name: string | undefined): string {
  const n = (name ?? "").toLowerCase();
  if (n.includes("kebony")) return "#3d2817";
  if (n.includes("thermowood") || n.includes("termo")) return "#6b4226";
  if (n.includes("tryckimpregnerad") || n.includes("impregnerad")) return "#c7b899";
  if (n.includes("komposit") || n.includes("composite")) return "#6e6a63";
  return FALLBACK_WOOD_COLOR;
}

export type GroundType = "grass" | "gravel" | "concrete" | "neutral";

const GROUND_COLORS: Record<GroundType, string> = {
  grass: "#5b8c4a",
  gravel: "#b8ad97",
  concrete: "#c7c7c7",
  neutral: "#d9d9d4",
};

export function colorForGroundType(groundType: GroundType): string {
  return GROUND_COLORS[groundType];
}
