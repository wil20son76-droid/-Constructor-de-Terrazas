import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import type * as THREE from "three";
import type { DeckLevel, MaterialLibrary, ValidationIssue } from "../../types";
import type { LevelGeometryResult } from "../../materials";
import { downloadDataUrl } from "../../export";
import type { GroundType } from "../../three/materialColors";
import type { LateralStyle } from "../../three/deckTransforms";
import { DeckScene, type QuickView, type ViewCommand } from "./DeckScene";

interface Deck3DViewProps {
  level: DeckLevel;
  geometry: LevelGeometryResult;
  library: MaterialLibrary;
  validation: ValidationIssue[];
  projectName: string;
  areaM2: number;
  mainMaterialName: string;
  kundvy: boolean;
  onToggleKundvy: () => void;
}

const quickViews: { id: QuickView; label: string }[] = [
  { id: "perspective", label: "Perspektiv" },
  { id: "front", label: "Framifrån" },
  { id: "back", label: "Bakifrån" },
  { id: "left", label: "Vänster" },
  { id: "right", label: "Höger" },
  { id: "top", label: "Ovanifrån" },
];

const groundOptions: { id: GroundType; label: string }[] = [
  { id: "grass", label: "Gräs" },
  { id: "gravel", label: "Grus" },
  { id: "concrete", label: "Betong" },
  { id: "neutral", label: "Neutral" },
];

const lateralOptions: { id: LateralStyle; label: string }[] = [
  { id: "none", label: "Ingen" },
  { id: "horizontal", label: "Horisontell" },
  { id: "vertical", label: "Vertikal" },
];

function CompactButton({ label, active, onClick, title }: { label: string; active?: boolean; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded px-2 py-1 text-xs ${active ? "bg-blue-600 text-white" : "bg-white/90 text-slate-700 hover:bg-white"}`}
    >
      {label}
    </button>
  );
}

/**
 * Read-only 3D presentation view: consumes the SAME already-calculated
 * `geometry`/`level`/`library` the 2D plan and BOM use — it never
 * recomputes board layout, stair quantities, or anything structural.
 * Re-rendering on prop change is the only "sync" mechanism (no manual
 * "Uppdatera 3D" button), matching how the rest of the app already works.
 */
export function Deck3DView(props: Deck3DViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const [groundType, setGroundType] = useState<GroundType>("grass");
  const [lateralStyle, setLateralStyle] = useState<LateralStyle>("horizontal");
  const [viewCommand, setViewCommand] = useState<ViewCommand | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const viewCommandCounter = useRef(0);

  useEffect(() => {
    const handleChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  const requestView = (view: QuickView) => {
    viewCommandCounter.current += 1;
    setViewCommand({ view, nonce: viewCommandCounter.current });
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current?.requestFullscreen();
    }
  };

  const saveImage = () => {
    const gl = rendererRef.current;
    if (!gl) return;
    const dataUrl = gl.domElement.toDataURL("image/png");
    downloadDataUrl(`${props.projectName}-3d.png`, dataUrl);
  };

  const errors = props.validation.filter((v) => v.severity === "error");

  return (
    <div ref={containerRef} className="relative h-full w-full bg-slate-100">
      {errors.length > 0 ? (
        <div className="flex h-full items-center justify-center p-6">
          <div className="max-w-md rounded bg-red-50 p-4 text-center text-sm text-red-800">
            <p className="font-semibold">3D-vyn kan inte visas eftersom geometrin är ogiltig.</p>
            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-left text-xs">
              {errors.map((e) => (
                <li key={e.id}>{e.message}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <Canvas
          shadows
          gl={{ preserveDrawingBuffer: true, antialias: true }}
          camera={{ fov: 45, near: 0.1, far: 1000 }}
          onCreated={(state) => {
            rendererRef.current = state.gl;
          }}
        >
          <DeckScene
            level={props.level}
            geometry={props.geometry}
            library={props.library}
            groundType={groundType}
            lateralStyle={lateralStyle}
            viewCommand={viewCommand}
          />
        </Canvas>
      )}

      {props.kundvy ? (
        <div className="no-print pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
          <div className="pointer-events-auto rounded bg-white/90 px-3 py-2 text-sm shadow">
            <p className="font-semibold text-slate-800">{props.projectName}</p>
            <p className="text-slate-600">
              {props.areaM2.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} m² · {props.mainMaterialName}
            </p>
          </div>
          <button
            type="button"
            onClick={props.onToggleKundvy}
            className="pointer-events-auto rounded bg-white/90 px-3 py-2 text-sm text-slate-700 shadow hover:bg-white"
          >
            Avsluta kundvy
          </button>
        </div>
      ) : (
        errors.length === 0 && (
          <div className="no-print absolute inset-x-2 bottom-2 flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 rounded bg-black/10 p-1 backdrop-blur-sm">
              {quickViews.map((v) => (
                <CompactButton key={v.id} label={v.label} onClick={() => requestView(v.id)} />
              ))}
              <CompactButton label="Återställ vy" onClick={() => requestView("perspective")} />
            </div>
            <div className="flex flex-wrap gap-1 rounded bg-black/10 p-1 backdrop-blur-sm">
              {groundOptions.map((g) => (
                <CompactButton key={g.id} label={g.label} active={groundType === g.id} onClick={() => setGroundType(g.id)} title="Marktyp" />
              ))}
            </div>
            <div className="flex flex-wrap gap-1 rounded bg-black/10 p-1 backdrop-blur-sm">
              {lateralOptions.map((l) => (
                <CompactButton key={l.id} label={l.label} active={lateralStyle === l.id} onClick={() => setLateralStyle(l.id)} title="Lateral" />
              ))}
            </div>
            <div className="flex flex-wrap gap-1 rounded bg-black/10 p-1 backdrop-blur-sm">
              <CompactButton label="Kundvy" onClick={props.onToggleKundvy} />
              <CompactButton label={isFullscreen ? "Stäng helskärm" : "Helskärm"} onClick={toggleFullscreen} />
              <CompactButton label="Spara bild" onClick={saveImage} />
            </div>
          </div>
        )
      )}
    </div>
  );
}
