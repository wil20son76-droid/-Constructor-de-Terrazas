import type { ViewMode } from "../../store/projectStore";

interface TopBarProps {
  projectName: string;
  viewMode: ViewMode;
  canUndo: boolean;
  canRedo: boolean;
  onNew: () => void;
  onSave: () => void;
  onOpen: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSetView: (mode: ViewMode) => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  onPrint: () => void;
}

const viewTabs: { id: ViewMode; label: string }[] = [
  { id: "terrass", label: "Vista terrass" },
  { id: "struktur", label: "Vista struktur" },
  { id: "material", label: "Vista material" },
  { id: "kostnad", label: "Vista kostnad" },
];

function TopBarButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-200 disabled:opacity-40"
    >
      {label}
    </button>
  );
}

export function TopBar(props: TopBarProps) {
  return (
    <div className="no-print flex h-12 shrink-0 items-center justify-between border-b border-slate-300 bg-slate-100 px-3">
      <div className="flex items-center gap-1">
        <span className="mr-3 text-sm font-semibold text-slate-800">{props.projectName}</span>
        <TopBarButton label="Nytt projekt" onClick={props.onNew} />
        <TopBarButton label="Spara" onClick={props.onSave} />
        <TopBarButton label="Öppna" onClick={props.onOpen} />
        <div className="mx-1 h-5 w-px bg-slate-300" />
        <button
          type="button"
          disabled={!props.canUndo}
          onClick={props.onUndo}
          className="rounded px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-200 disabled:opacity-30"
        >
          ↶ Ångra
        </button>
        <button
          type="button"
          disabled={!props.canRedo}
          onClick={props.onRedo}
          className="rounded px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-200 disabled:opacity-30"
        >
          ↷ Gör om
        </button>
      </div>

      <div className="flex items-center gap-1 rounded-lg bg-slate-200 p-1">
        {viewTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => props.onSetView(tab.id)}
            className={`rounded px-3 py-1 text-sm ${
              props.viewMode === tab.id ? "bg-white font-medium text-blue-700 shadow-sm" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <TopBarButton label="Exportera CSV" onClick={props.onExportCsv} />
        <TopBarButton label="Exportera JSON" onClick={props.onExportJson} />
        <TopBarButton label="Skriv ut" onClick={props.onPrint} />
      </div>
    </div>
  );
}
