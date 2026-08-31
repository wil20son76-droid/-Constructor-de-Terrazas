import { useMemo, useState } from "react";
import { TopBar } from "./components/layout/TopBar";
import { LeftPanel } from "./components/layout/LeftPanel";
import { RightPanel } from "./components/panels/RightPanel";
import { PlanView, type VertexEditTool } from "./components/plan/PlanView";
import { OpenProjectDialog } from "./components/layout/OpenProjectDialog";
import { InspectorPanel } from "./components/debug/InspectorPanel";
import { activeLevel, useProjectStore } from "./store/projectStore";
import { useLevelCalculations } from "./hooks/useLevelCalculations";
import { editEdgeLength, insertPointOnEdge, isAxisAlignedRectangle, makeId, resizeRectangleEdge, splitPolygon, validatePolygon } from "./geometry";
import { bomToCsv, downloadCsv, downloadJson, printCurrentView, projectToJson } from "./export";
import { resolveInspectedElement, type SelectedElement } from "./deck/inspector";
import type { DeckSection, Stair } from "./types";

function App() {
  const store = useProjectStore();
  const { project, viewMode } = store;
  const level = activeLevel(project);
  const [openDialogVisible, setOpenDialogVisible] = useState(false);
  const [inspectMode, setInspectMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const [freeFormMode, setFreeFormMode] = useState(false);
  const [editTool, setEditTool] = useState<VertexEditTool>("none");
  const [splitTargetSectionId, setSplitTargetSectionId] = useState<string | null>(null);

  const handleConfirmSplit = (indexA: number, indexB: number) => {
    const trallMaterial = project.library.materials.find((m) => m.id === level.trallMaterialId);
    const boardWidthMm = trallMaterial?.widthMm ?? 120;
    const boardThicknessMm = trallMaterial?.thicknessMm ?? 28;
    const existingSections = level.sections ?? [];

    let nextSections: DeckSection[];
    try {
      if (existingSections.length === 0) {
        const [partA, partB] = splitPolygon(level.polygon.points, indexA, indexB);
        const base = {
          boardDirection: level.boardDirection,
          boardWidthMm,
          boardThicknessMm,
          boardGap: level.boardGap,
          materialId: level.trallMaterialId,
          fastenerSystemId: level.fastenerSystemId,
        };
        nextSections = [
          { id: makeId("section"), name: "Sektion 1", polygon: { id: makeId("poly"), points: partA }, ...base },
          { id: makeId("section"), name: "Sektion 2", polygon: { id: makeId("poly"), points: partB }, ...base },
        ];
      } else {
        const target = existingSections.find((s) => s.id === splitTargetSectionId);
        if (!target) return;
        const [partA, partB] = splitPolygon(target.polygon.points, indexA, indexB);
        const replacement: DeckSection[] = [
          { ...target, id: makeId("section"), polygon: { id: makeId("poly"), points: partA } },
          { ...target, id: makeId("section"), polygon: { id: makeId("poly"), points: partB } },
        ];
        nextSections = existingSections
          .flatMap((s) => (s.id === target.id ? replacement : [s]))
          .map((s, i) => ({ ...s, name: `Sektion ${i + 1}` }));
      }
    } catch {
      window.alert(
        "Kunde inte dela sektionen med de valda punkterna — en sektion med bara 3 hörn (en triangel) kan inte delas vidare på det sättet. Lägg till en punkt på en kant först om du behöver dela den.",
      );
      return;
    }

    store.updateActiveLevel((l) => ({ ...l, sections: nextSections }));
    setSplitTargetSectionId(nextSections[0].id);
  };

  const handleAddStair = (edgeIndex: number) => {
    const totalHeightMm = Math.max(level.heightAboveGround, 200);
    const stepCount = Math.max(1, Math.round(totalHeightMm / 180));
    const stair: Stair = {
      id: makeId("stair"),
      edgeIndex,
      widthMm: 900,
      totalHeightMm,
      stepCount,
      stepDepthMm: 280,
      trallMaterialId: level.trallMaterialId,
      regelMaterialId: level.regelMaterialId,
    };
    store.updateActiveLevel((l) => ({ ...l, stairs: [...l.stairs, stair] }));
  };

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
    materialOverrides: project.materialOverrides,
    cutOptimizationMode: project.settings.cutOptimizationMode,
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

  const geometryErrors = calc.validation.filter((v) => v.severity === "error");

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
          onStartFreeForm={() => {
            setEditTool("none");
            setFreeFormMode(true);
          }}
          editTool={editTool}
          onSetEditTool={(tool) => {
            setFreeFormMode(false);
            setEditTool(tool);
            setSplitTargetSectionId(tool === "dela-sektion" ? (level.sections?.[0]?.id ?? null) : null);
          }}
          sections={level.sections}
          splitTargetSectionId={splitTargetSectionId}
          onSetSplitTargetSectionId={setSplitTargetSectionId}
        />
        <main className="relative min-w-0 flex-1">
          {geometryErrors.length > 0 && (
            <div className="no-print absolute inset-x-3 top-3 z-10 rounded bg-red-50 px-3 py-2 text-xs text-red-800 shadow">
              <p className="font-semibold">Ogiltig geometri — materialberäkningar kan inte visas:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {geometryErrors.map((e) => (
                  <li key={e.id}>{e.message}</li>
                ))}
              </ul>
            </div>
          )}
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
            editTool={editTool}
            onMoveVertex={(index, point) =>
              store.updateActiveLevel((l) => {
                const nextPoints = l.polygon.points.map((p, i) => (i === index ? point : p));
                return { ...l, polygon: { ...l.polygon, points: nextPoints } };
              })
            }
            onInsertPointOnEdge={(edgeIndex, t) =>
              store.updateActiveLevel((l) => ({
                ...l,
                polygon: { ...l.polygon, points: insertPointOnEdge(l.polygon.points, edgeIndex, t) },
              }))
            }
            onDeleteVertex={(index) =>
              store.updateActiveLevel((l) => ({
                ...l,
                polygon: { ...l.polygon, points: l.polygon.points.filter((_, i) => i !== index) },
              }))
            }
            sections={level.sections}
            splitTargetSectionId={splitTargetSectionId}
            onSetSplitTargetSectionId={setSplitTargetSectionId}
            onConfirmSplit={handleConfirmSplit}
            onAddStair={handleAddStair}
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
