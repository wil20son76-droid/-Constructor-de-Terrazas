import type { ReactNode } from "react";
import type { Material, MaterialCategory } from "../../types";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-2 block text-sm">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-slate-200 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </div>
  );
}

export const inputClass = "w-full rounded border border-slate-300 px-2 py-1 text-sm";

export function MaterialSelect({
  materials,
  category,
  value,
  onChange,
}: {
  materials: Material[];
  category: MaterialCategory;
  value: string;
  onChange: (id: string) => void;
}) {
  const options = materials.filter((m) => m.category === category);
  return (
    <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((m) => (
        <option key={m.id} value={m.id}>
          {m.nameSv}
        </option>
      ))}
    </select>
  );
}

export function QuickButtons({
  values,
  current,
  onSelect,
  suffix = "",
}: {
  values: number[];
  current: number;
  onSelect: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onSelect(v)}
          className={`rounded border px-2 py-1 text-xs ${
            current === v ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 text-slate-600"
          }`}
        >
          {v}
          {suffix}
        </button>
      ))}
    </div>
  );
}
