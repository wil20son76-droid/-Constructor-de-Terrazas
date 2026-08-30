import { useMemo, useState } from "react";
import { TopBar } from "./components/layout/TopBar";
import { LeftPanel } from "./components/layout/LeftPanel";
import { RightPanel } from "./components/panels/RightPanel";
import { PlanView } from "./components/plan/PlanView";
import { OpenProjectDialog } from "./components/layout/OpenProjectDialog";
import { InspectorPanel } from "./components/debug/InspectorPanel";
import { activeLevel, useProjectStore } from "./store/projectStore";
import { useLevelCalculations } from "./hooks/useLevelCalculations";
import { editEdgeLength, isAxisAlignedRectangle, makeId, resizeRectangleEdge, validatePolygon } from "./geometry";
import { bomToCsv, downloadCsv, downloadJson, printCurrentView, projectToJson } from "./export";
import { resolveInspectedElement, type SelectedElement } from "./deck/inspector";

function App() {
  const store = useProjectStore();
  const { project, viewMode } = store;
  const level = activeLevel(project);
  const [openDialogVisible, setOpenDialogVisible] = useState(false);
  const [inspectMode, setInspectMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const [freeFormMode, setFreeFormMode] = useState(false);

  const calc = useLevelCalculations({
    level,
    library: project.library,
    clientSuppliedMaterialIds: project.clientSuppliedMaterialIds,
    labourRates: project.labourRates,
    markup: project.markup,
    vatPercent: project.settings.vatPercent,
    rot: {
      rotEnabled: project.settings.rotEnabled,
      rotPercent: project.settings.rotPercent,
      rotMaxDeduction: project.settings.rotMaxDeduction,
      eligibility: project.settings.rotEligibility,
    },
    otherCostsTotal: project.otherCosts.reduce((s, c) => s + c.amount, 0),
  });

  const handleNew = () => {
    if (window.confirm("Skapa nytt projekt? Osparade ändringar försvinner.")) store.newProject();
  };

  const handleSave = () => {
    store.save();
    window.alert(`Projektet "${project.name}" sparades lokalt.`);
  };

  const handleToggleClientSupplied = (materialId: string) =>
    store.update((p) => ({
      ...p,
      clientSuppliedMaterialIds: p.clientSuppliedMaterialIds.includes(materialId)
        ? p.clientSuppliedMaterialIds.filter((id) => id !== materialId)
        : [...p.clientSuppliedMaterialIds, materialId],
    }));

  const inspectedDetail = useMemo(
    () =>
      selectedElement
        ? resolveInspectedElement(selectedElement, level, calc.geometry, calc.cutPlans, project.library)
        : null,
    [selectedElement, level, calc.geometry, calc.cutPlans, project.library],
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white text-slate-900">
      <TopBar
        projectName={project.name}
        viewMode={viewMode}
        canUndo={store.canUndo()}
        canRedo={store.canRedo()}
        onNew={handleNew}
        onSave={handleSave}
        onOpen={() => setOpenDialogVisible(true)}
        onUndo={store.undo}
        onRedo={store.redo}
        onSetView={store.setViewMode}
        onExportCsv={() => downloadCsv(`${project.name}-material.csv`, bomToCsv(calc.bomLines))}
        onExportJson={() => downloadJson(`${project.name}.json`, projectToJson(project))}
        onPrint={printCurrentView}
        inspectMode={inspectMode}
        onToggleInspect={() => {
          setInspectMode((v) => !v);
          setSelectedElement(null);
        }}
      />
      <div className="flex min-h-0 flex-1">
        <LeftPanel
          gridSizeMm={project.settings.gridSizeMm}
          snapEnabled={project.settings.snapEnabled}
          onSetGrid={(mm) => store.update((p) => ({ ...p, settings: { ...p.settings, gridSizeMm: mm } }))}
          onToggleSnap={() => store.update((p) => ({ ...p, settings: { ...p.settings, snapEnabled: !p.settings.snapEnabled } }))}
          onSetPolygon={(polygon) => store.updateActiveLevel((l) => ({ ...l, polygon, openings: [] }))}
          heightAboveGround={level.heightAboveGround}
          onSetHeight={(mm) => store.updateActiveLevel((l) => ({ ...l, heightAboveGround: mm }))}
          freeFormActive={freeFormMode}
          onStartFreeForm={() => setFreeFormMode(true)}
        />
        <main className="relative min-w-0 flex-1">
          <PlanView
            level={level}
            geometry={calc.geometry}
            viewMode={viewMode}
            gridSizeMm={project.settings.gridSizeMm}
            snapEnabled={project.settings.snapEnabled}
            netAreaM2={calc.area.netAreaM2}
            onEditEdge={(edgeIndex, newLength) =>
              store.updateActiveLevel((l) => {
                const points = isAxisAlignedRectangle(l.polygon.points)
                  ? resizeRectangleEdge(l.polygon.points, edgeIndex, newLength)
                  : editEdgeLength(l.polygon.points, edgeIndex, newLength);
                return { ...l, polygon: { ...l.polygon, points } };
              })
            }
            inspectMode={inspectMode}
            selected={selectedElement}
            onSelectElement={setSelectedElement}
            drawingMode={freeFormMode}
            onCancelDrawing={() => setFreeFormMode(false)}
            onFinishDrawing={(drawnPoints) => {
              const issues = validatePolygon(drawnPoints);
              const errors = issues.filter((i) => i.severity === "error");
              if (errors.length > 0) {
                window.alert(`Formen kunde inte skapas:\n${errors.map((e) => `• ${e.message}`).join("\n")}`);
                setFreeFormMode(false);
                return;
              }
              store.updateActiveLevel((l) => ({
                ...l,
                polygon: { id: makeId("poly"), points: drawnPoints },
                openings: [],
              }));
              setFreeFormMode(false);
            }}
          />
          {inspectMode && <InspectorPanel detail={inspectedDetail} onClose={() => setSelectedElement(null)} />}
        </main>
        <RightPanel
          viewMode={viewMode}
          project={project}
          level={level}
          library={project.library}
          area={calc.area}
          validation={calc.validation}
          jointCount={{
            joists: calc.geometry.joists.length,
            beams: calc.geometry.beams.length,
            footings: calc.geometry.footings.length,
            posts: calc.geometry.posts.length,
          }}
          regelCcInfo={calc.geometry.regelCcInfo}
          barlinaSpacingInfo={calc.geometry.barlinaSpacingInfo}
          bomLines={calc.bomLines}
          cutPlans={calc.cutPlans}
          costs={calc.costs}
          labourItems={calc.labourItems}
          onUpdateLevel={store.updateActiveLevel}
          onUpdateProject={store.update}
          onToggleClientSupplied={handleToggleClientSupplied}
        />
      </div>

      {openDialogVisible && (
        <OpenProjectDialog
          onClose={() => setOpenDialogVisible(false)}
          onOpen={(id) => {
            store.open(id);
            setOpenDialogVisible(false);
          }}
        />
      )}
    </div>
  );
}

export default App;
