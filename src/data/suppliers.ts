import type { Supplier } from "../types";

/**
 * Swedish building-material suppliers. Prices are entered manually by the
 * user for now; `id` is stable so a future price-import integration can
 * key off it without touching the rest of the data model.
 */
export const defaultSuppliers: Supplier[] = [
  { id: "sup_beijer", name: "Beijer Byggmaterial" },
  { id: "sup_bauhaus", name: "Bauhaus" },
  { id: "sup_hornbach", name: "Hornbach" },
  { id: "sup_byggmax", name: "Byggmax" },
  { id: "sup_krauta", name: "K-Rauta" },
  { id: "sup_xlbygg", name: "XL-BYGG" },
  { id: "sup_optimera", name: "Optimera" },
  { id: "sup_woody", name: "Woody Bygghandel" },
  { id: "sup_kebony", name: "Kebony" },
];
