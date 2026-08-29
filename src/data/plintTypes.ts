import type { PlintType } from "../types";

export const defaultPlintTypes: PlintType[] = [
  { id: "plinttype_betong", name: "Concrete footing block", nameSv: "Betongplint", materialId: "mat_plint_betong" },
  { id: "plinttype_markskruv", name: "Ground screw", nameSv: "Markskruv", materialId: "mat_plint_markskruv" },
  {
    id: "plinttype_betongplatta",
    name: "Footing on concrete slab",
    nameSv: "Plint på betongplatta",
    materialId: "mat_plint_betongplatta",
  },
  {
    id: "plinttype_justerbar",
    name: "Adjustable deck foot",
    nameSv: "Justerbar terrassfot",
    materialId: "mat_plint_justerbar",
  },
];
