import type { AreaSummary } from "../../geometry";
import type { UniformSpacingResult } from "../../structural";
import type { BomLine, CostSummary, CutPlanResult, DeckLevel, LabourItem, Material, MaterialLibrary, Project, ValidationIssue } from "../../types";
import type { ViewMode } from "../../store/projectStore";
import { DeckPropertiesPanel } from "./DeckPropertiesPanel";
import { StructurePanel } from "./StructurePanel";
import { MaterialsPanel } from "./MaterialsPanel";
import { CostsPanel } from "./CostsPanel";

interface Props {
  viewMode: ViewMode;
  project: Project;
  level: DeckLevel;
  library: MaterialLibrary;
  area: AreaSummary;
  validation: ValidationIssue[];
  jointCount: { joists: number; beams: number; footings: number; posts: number };
  regelCcInfo: UniformSpacingResult;
  barlinaSpacingInfo: UniformSpacingResult;
  bomLines: BomLine[];
  cutPlans: CutPlanResult[];
  costs: CostSummary;
  labourItems: LabourItem[];
  onUpdateLevel: (fn: (level: DeckLevel) => DeckLevel) => void;
  onUpdateProject: (fn: (project: Project) => Project) => void;
  onToggleClientSupplied: (materialId: string) => void;
  priceLibrary: Material[];
  onUpsertLibraryMaterial: (material: Material) => void;
  onDuplicateLibraryMaterial: (id: string) => void;
  onRemoveLibraryMaterial: (id: string) => void;
  onSetLibraryMaterialActive: (id: string, active: boolean) => void;
  onSetProjectMaterialOverride: (materialId: string, price: { price: number; priceUnit: string; vatMode: string; supplier?: string }, locked: boolean) => void;
  onExportPricesCsv: () => void;
  onImportPricesCsv: (file: File) => void;
}

export function RightPanel(props: Props) {
  return (
    <div className="no-print h-full w-80 shrink-0 overflow-hidden border-l border-slate-300 bg-white">
      {props.viewMode === "terrass" && (
        <DeckPropertiesPanel level={props.level} library={props.library} area={props.area} onUpdate={props.onUpdateLevel} />
      )}
      {props.viewMode === "struktur" && (
        <StructurePanel
          level={props.level}
          library={props.library}
          validation={props.validation}
          jointCount={props.jointCount}
          regelCcInfo={props.regelCcInfo}
          barlinaSpacingInfo={props.barlinaSpacingInfo}
          onUpdate={props.onUpdateLevel}
        />
      )}
      {props.viewMode === "material" && (
        <MaterialsPanel
          bomLines={props.bomLines}
          cutPlans={props.cutPlans}
          clientSuppliedMaterialIds={props.project.clientSuppliedMaterialIds}
          onToggleClientSupplied={props.onToggleClientSupplied}
          validation={props.validation}
          priceLibrary={props.priceLibrary}
          onUpsertLibraryMaterial={props.onUpsertLibraryMaterial}
          onDuplicateLibraryMaterial={props.onDuplicateLibraryMaterial}
          onRemoveLibraryMaterial={props.onRemoveLibraryMaterial}
          onSetLibraryMaterialActive={props.onSetLibraryMaterialActive}
          onSetProjectMaterialOverride={props.onSetProjectMaterialOverride}
          onExportPricesCsv={props.onExportPricesCsv}
          onImportPricesCsv={props.onImportPricesCsv}
        />
      )}
      {props.viewMode === "kostnad" && (
        <CostsPanel project={props.project} costs={props.costs} labourItems={props.labourItems} onUpdateProject={props.onUpdateProject} />
      )}
    </div>
  );
}
