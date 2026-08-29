import { deleteProjectFromStorage, listSavedProjects } from "../../store/projectStore";
import { useState } from "react";

interface Props {
  onClose: () => void;
  onOpen: (id: string) => void;
}

export function OpenProjectDialog({ onClose, onOpen }: Props) {
  const [projects, setProjects] = useState(listSavedProjects());

  const handleDelete = (id: string) => {
    deleteProjectFromStorage(id);
    setProjects(listSavedProjects());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-96 rounded-lg bg-white p-4 shadow-xl">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Öppna sparat projekt</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-slate-500">Inga sparade projekt hittades.</p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded border border-slate-200 px-2 py-1.5">
                <button type="button" className="flex-1 text-left text-sm hover:text-blue-700" onClick={() => onOpen(p.id)}>
                  {p.name}
                  <div className="text-xs text-slate-400">{new Date(p.updatedAt).toLocaleString("sv-SE")}</div>
                </button>
                <button type="button" className="ml-2 text-xs text-red-500 hover:underline" onClick={() => handleDelete(p.id)}>
                  Ta bort
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="rounded bg-slate-100 px-3 py-1.5 text-sm hover:bg-slate-200">
            Stäng
          </button>
        </div>
      </div>
    </div>
  );
}
