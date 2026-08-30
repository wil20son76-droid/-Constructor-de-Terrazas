import { lShapePolygon, rectanglePolygon, uShapePolygon } from "../../geometry";
import type { DeckPolygon, DeckSection } from "../../types";
import type { VertexEditTool } from "../plan/PlanView";

interface LeftPanelProps {
  gridSizeMm: number;
  snapEnabled: boolean;
  onSetGrid: (mm: number) => void;
  onToggleSnap: () => void;
  onSetPolygon: (polygon: DeckPolygon) => void;
  heightAboveGround: number;
  onSetHeight: (mm: number) => void;
  freeFormActive?: boolean;
  onStartFreeForm?: () => void;
  editTool?: VertexEditTool;
  onSetEditTool?: (tool: VertexEditTool) => void;
  sections?: DeckSection[];
  splitTargetSectionId?: string | null;
  onSetSplitTargetSectionId?: (id: string) => void;
}

const gridOptions = [100, 500, 1000];
const heightPresets = [0, 200, 400, 600, 1000, 1500];

const editToolOptions: { tool: VertexEditTool; label: string; icon: string }[] = [
  { tool: "select", label: "Välj/Flytta", icon: "✥" },
  { tool: "add-point", label: "Lägg till punkt", icon: "➕" },
  { tool: "add-point-on-edge", label: "Lägg till punkt på kant", icon: "⊹" },
  { tool: "delete-point", label: "Ta bort punkt", icon: "✕" },
  { tool: "measure", label: "Mät avstånd", icon: "📏" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-200 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </div>
  );
}

export function LeftPanel(props: LeftPanelProps) {
  return (
    <div className="no-print h-full w-56 shrink-0 overflow-y-auto border-r border-slate-300 bg-white">
      <Section title="Skapa form">
        <div className="grid grid-cols-1 gap-1.5">
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1.5 text-left text-sm hover:bg-slate-50"
            onClick={() => props.onSetPolygon(rectanglePolygon(14000, 7000))}
          >
            ▭ Rektangel
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1.5 text-left text-sm hover:bg-slate-50"
            onClick={() => props.onSetPolygon(lShapePolygon(14000, 7000, 5000, 3000))}
          >
            ⌐ L-form
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1.5 text-left text-sm hover:bg-slate-50"
            onClick={() => props.onSetPolygon(uShapePolygon(14000, 7000, 5000, 3000))}
          >
            ⊔ U-form
          </button>
          <button
            type="button"
            className={`rounded border px-2 py-1.5 text-left text-sm ${
              props.freeFormActive ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 hover:bg-slate-50"
            }`}
            onClick={() => props.onStartFreeForm?.()}
          >
            ✏️ Fri form — Rita själv
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          {props.freeFormActive
            ? "Klicka i planen för att lägga till punkter (P1, P2, P3 …). Avsluta med dubbelklick eller knappen \"Slutför form\"."
            : "Klicka på en måttsättning i planen för att ange exakt längd."}
        </p>
      </Section>

      <Section title="Redigera form">
        <div className="grid grid-cols-1 gap-1.5">
          {editToolOptions.map(({ tool, label, icon }) => {
            const active = props.editTool === tool;
            return (
              <button
                key={tool}
                type="button"
                className={`rounded border px-2 py-1.5 text-left text-sm ${
                  active ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 hover:bg-slate-50"
                }`}
                onClick={() => props.onSetEditTool?.(active ? "none" : tool)}
              >
                {icon} {label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          {props.editTool === "select" && "Dra en punkt för att flytta den (respekterar snap)."}
          {props.editTool === "add-point" && "Klicka på en kant för att lägga till en punkt exakt där."}
          {props.editTool === "add-point-on-edge" && "Klicka en kant, bekräfta sedan med knappen som visas."}
          {props.editTool === "delete-point" && "Klicka på en punkt för att ta bort den (minst 3 kvar)."}
          {props.editTool === "measure" && "Klicka två punkter i planen för att mäta avståndet."}
          {(!props.editTool || props.editTool === "none") && "Välj ett verktyg för att redigera formens punkter."}
        </p>
      </Section>

      <Section title="Sektioner">
        <button
          type="button"
          className={`w-full rounded border px-2 py-1.5 text-left text-sm ${
            props.editTool === "dela-sektion" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 hover:bg-slate-50"
          }`}
          onClick={() => props.onSetEditTool?.(props.editTool === "dela-sektion" ? "none" : "dela-sektion")}
        >
          ✂️ Dela sektion
        </button>
        {props.editTool === "dela-sektion" && (props.sections?.length ?? 0) > 0 && (
          <label className="mt-2 block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Dela vidare i</span>
            <select
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
              value={props.splitTargetSectionId ?? ""}
              onChange={(e) => props.onSetSplitTargetSectionId?.(e.target.value)}
            >
              {(props.sections ?? []).map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="mt-2 text-xs text-slate-400">
          {props.editTool === "dela-sektion"
            ? "Klicka två punkter i planen för att dra en delningslinje, bekräfta sedan. Varje sektion kan få egen trallriktning nedan."
            : "Dela terrassen i oberoende trallsektioner, var och en med egen riktning och material."}
        </p>
      </Section>

      <Section title="Trappa">
        <button
          type="button"
          className={`w-full rounded border px-2 py-1.5 text-left text-sm ${
            props.editTool === "add-stair" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 hover:bg-slate-50"
          }`}
          onClick={() => props.onSetEditTool?.(props.editTool === "add-stair" ? "none" : "add-stair")}
        >
          🪜 Lägg till trappa
        </button>
        <p className="mt-2 text-xs text-slate-400">
          {props.editTool === "add-stair"
            ? "Klicka på valfri kant i planen för att fästa en trappa där."
            : "Fäst en trappa på valfri kant. Redigera bredd/höjd/steg under fliken Vista struktur."}
        </p>
      </Section>

      <Section title="Rutnät">
        <div className="flex gap-1">
          {gridOptions.map((mm) => (
            <button
              key={mm}
              type="button"
              onClick={() => props.onSetGrid(mm)}
              className={`flex-1 rounded border px-1.5 py-1 text-xs ${
                props.gridSizeMm === mm ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 text-slate-600"
              }`}
            >
              {mm} mm
            </button>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={props.snapEnabled} onChange={props.onToggleSnap} />
          Snap till rutnät
        </label>
      </Section>

      <Section title="Höjd över mark">
        <div className="grid grid-cols-3 gap-1">
          {heightPresets.map((mm) => (
            <button
              key={mm}
              type="button"
              onClick={() => props.onSetHeight(mm)}
              className={`rounded border px-1 py-1 text-xs ${
                props.heightAboveGround === mm ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 text-slate-600"
              }`}
            >
              {mm}
            </button>
          ))}
        </div>
        <input
          type="number"
          value={props.heightAboveGround}
          onChange={(e) => props.onSetHeight(Number(e.target.value) || 0)}
          className="mt-2 w-full rounded border border-slate-300 px-2 py-1 text-sm"
        />
      </Section>

      <Section title="Navigering">
        <p className="text-xs text-slate-500">Scrolla för att zooma. Dra i planen för att panorera.</p>
      </Section>
    </div>
  );
}
