import type { FastenerSystem } from "../types";

export const defaultFastenerSystems: FastenerSystem[] = [
  {
    id: "fsys_visible",
    type: "visible_skruv",
    name: "Synlig skruv",
    screwsPerIntersection: 2,
    screwMaterialId: "mat_skruv_trallskruv",
  },
  {
    id: "fsys_dold",
    type: "dold_infastning",
    name: "Dold infästning",
    screwsPerIntersection: 1,
    screwMaterialId: "mat_skruv_trallskruv",
  },
  {
    id: "fsys_stepclip",
    type: "step_clip",
    name: "Step-Clip",
    screwsPerIntersection: 0,
    clipsPerIntersection: 2,
    clipMaterialId: "mat_beslag_stepclip",
  },
  {
    id: "fsys_tclip",
    type: "t_clips",
    name: "T-clips",
    screwsPerIntersection: 0,
    clipsPerIntersection: 2,
    clipMaterialId: "mat_beslag_tclip",
  },
];
