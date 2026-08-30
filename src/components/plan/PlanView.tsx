import { useMemo, useRef, useState } from "react";
import type { DeckLevel } from "../../types";
import type { LevelGeometryResult } from "../../materials";
import { boundingBox, snapToGrid } from "../../geometry";
import type { ViewMode } from "../../store/projectStore";
import type { SelectedElement } from "../../deck/inspector";
import { formatM2, formatMm } from "../../utils/format";

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Vertex/edge editing tools ("Redigera form"). "none" is the default —
 * plain pan/zoom + click-a-dimension-to-edit-length, unchanged from before
 * this feature existed. Picking any other tool is an explicit opt-in.
 */
export type VertexEditTool = "none" | "select" | "add-point" | "add-point-on-edge" | "delete-point" | "measure";

interface PlanViewProps {
  level: DeckLevel;
  geometry: LevelGeometryResult;
  viewMode: ViewMode;
  gridSizeMm: number;
  snapEnabled: boolean;
  netAreaM2: number;
  onEditEdge: (edgeIndex: number, newLengthMm: number) => void;
  inspectMode?: boolean;
  selected?: SelectedElement | null;
  onSelectElement?: (el: SelectedElement) => void;
  /** "Fri form" / "Rita själv": click-to-add-vertex polygon drawing. */
  drawingMode?: boolean;
  onFinishDrawing?: (points: { x: number; y: number }[]) => void;
  onCancelDrawing?: () => void;
  /** "Redigera form": vertex select/move, add/delete point, measure. */
  editTool?: VertexEditTool;
  onMoveVertex?: (index: number, point: { x: number; y: number }) => void;
  onInsertPointOnEdge?: (edgeIndex: number, t: number) => void;
  onDeleteVertex?: (index: number) => void;
}

/** Parametric position (clamped 0..1) of the closest point on segment a->b to p. */
function projectToSegmentT(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return 0;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  return Math.min(1, Math.max(0, t));
}

function polygonPointsAttr(points: { x: number; y: number }[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

function bboxWithPadding(points: { x: number; y: number }[], paddingRatio = 0.25): ViewBox {
  const bbox = boundingBox(points);
  const w = Math.max(bbox.maxX - bbox.minX, 1000);
  const h = Math.max(bbox.maxY - bbox.minY, 1000);
  const pad = Math.max(w, h) * paddingRatio;
  return { x: bbox.minX - pad, y: bbox.minY - pad, w: w + pad * 2, h: h + pad * 2 };
}

export function PlanView({
  level,
  geometry,
  viewMode,
  gridSizeMm,
  snapEnabled,
  netAreaM2,
  onEditEdge,
  inspectMode = false,
  selected = null,
  onSelectElement,
  drawingMode = false,
  onFinishDrawing,
  onCancelDrawing,
  editTool = "none",
  onMoveVertex,
  onInsertPointOnEdge,
  onDeleteVertex,
}: PlanViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewBox, setViewBox] = useState<ViewBox>(() => bboxWithPadding(level.polygon.points));
  const [dragging, setDragging] = useState<{ startX: number; startY: number; origin: ViewBox } | null>(null);
  const [editingEdge, setEditingEdge] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  // Cleared by the Avbryt/Slutför handlers below whenever drawingMode ends,
  // so no extra reset-on-prop-change wiring is needed.
  const [drawPoints, setDrawPoints] = useState<{ x: number; y: number }[]>([]);
  const [drawCursor, setDrawCursor] = useState<{ x: number; y: number } | null>(null);
  const dragMovedRef = useRef(false);

  // "Välj/Flytta": drag a vertex to move it. Only committed to the store on
  // mouseup (via onMoveVertex) — the preview point is purely local so a drag
  // doesn't spam the undo history with one entry per mousemove.
  const [draggingVertexIndex, setDraggingVertexIndex] = useState<number | null>(null);
  const [vertexDragPreview, setVertexDragPreview] = useState<{ x: number; y: number } | null>(null);

  // "Lägg till punkt på kant": select an edge, then confirm via a floating button.
  const [selectedEdgeForInsert, setSelectedEdgeForInsert] = useState<number | null>(null);

  // "Mät avstånd": click two points to measure the distance between them.
  const [measurePoints, setMeasurePoints] = useState<{ x: number; y: number }[]>([]);
  const [measureCursor, setMeasureCursor] = useState<{ x: number; y: number } | null>(null);

  const fitToView = () => setViewBox(bboxWithPadding(level.polygon.points));

  const screenToWorld = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.w;
    const y = viewBox.y + ((clientY - rect.top) / rect.height) * viewBox.h;
    return { x, y };
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    const before = screenToWorld(e.clientX, e.clientY);
    const newW = viewBox.w * factor;
    const newH = viewBox.h * factor;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const ratioX = (e.clientX - rect.left) / rect.width;
    const ratioY = (e.clientY - rect.top) / rect.height;
    const newX = before.x - ratioX * newW;
    const newY = before.y - ratioY * newH;
    setViewBox({ x: newX, y: newY, w: newW, h: newH });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as SVGElement).dataset.role === "dimension") return;
    dragMovedRef.current = false;
    setDragging({ startX: e.clientX, startY: e.clientY, origin: viewBox });
  };

  const snapPoint = (p: { x: number; y: number }) =>
    snapEnabled && gridSizeMm ? { x: snapToGrid(p.x, gridSizeMm), y: snapToGrid(p.y, gridSizeMm) } : p;

  const handleMouseMove = (e: React.MouseEvent) => {
    if (drawingMode) {
      setDrawCursor(screenToWorld(e.clientX, e.clientY));
    }
    if (editTool === "measure" && measurePoints.length === 1) {
      setMeasureCursor(screenToWorld(e.clientX, e.clientY));
    }
    if (draggingVertexIndex !== null) {
      setVertexDragPreview(snapPoint(screenToWorld(e.clientX, e.clientY)));
      return;
    }
    if (!dragging) return;
    dragMovedRef.current = true;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const dx = ((e.clientX - dragging.startX) / rect.width) * dragging.origin.w;
    const dy = ((e.clientY - dragging.startY) / rect.height) * dragging.origin.h;
    setViewBox({ ...dragging.origin, x: dragging.origin.x - dx, y: dragging.origin.y - dy });
  };

  const handleMouseUp = () => {
    setDragging(null);
    if (draggingVertexIndex !== null && vertexDragPreview) {
      onMoveVertex?.(draggingVertexIndex, vertexDragPreview);
    }
    setDraggingVertexIndex(null);
    setVertexDragPreview(null);
  };

  const startVertexDrag = (index: number, e: React.MouseEvent) => {
    if (editTool !== "select") return;
    e.stopPropagation();
    setDraggingVertexIndex(index);
    setVertexDragPreview(points[index]);
  };

  const handleVertexClick = (index: number, e: React.MouseEvent) => {
    if (editTool !== "delete-point") return;
    e.stopPropagation();
    if (points.length <= 3) {
      window.alert("En yta måste ha minst 3 punkter — kan inte ta bort fler.");
      return;
    }
    onDeleteVertex?.(index);
  };

  const handleEdgeClick = (edgeIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (editTool === "add-point-on-edge") {
      setSelectedEdgeForInsert(edgeIndex);
    } else if (editTool === "add-point") {
      const world = screenToWorld(e.clientX, e.clientY);
      const t = projectToSegmentT(world, points[edgeIndex], points[(edgeIndex + 1) % points.length]);
      onInsertPointOnEdge?.(edgeIndex, t);
    }
  };

  const handleBackgroundClickForMeasure = (e: React.MouseEvent) => {
    if (editTool !== "measure") return;
    const world = screenToWorld(e.clientX, e.clientY);
    setMeasurePoints((prev) => (prev.length >= 2 ? [world] : [...prev, world]));
  };

  const addDrawPoint = (clientX: number, clientY: number) => {
    const world = screenToWorld(clientX, clientY);
    const snapped = snapEnabled && gridSizeMm ? { x: snapToGrid(world.x, gridSizeMm), y: snapToGrid(world.y, gridSizeMm) } : world;
    setDrawPoints((prev) => [...prev, snapped]);
  };

  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as SVGElement).dataset.role === "dimension") return;
    if (dragMovedRef.current) return; // was a pan drag, not a click
    if (drawingMode) {
      addDrawPoint(e.clientX, e.clientY);
      return;
    }
    handleBackgroundClickForMeasure(e);
  };

  const finishDrawing = (points: { x: number; y: number }[]) => {
    // Dedupe near-identical consecutive points (e.g. from a double-click landing twice on the same spot).
    const deduped = points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > 1);
    if (deduped.length >= 3) onFinishDrawing?.(deduped);
    setDrawPoints([]);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!drawingMode) return;
    e.preventDefault();
    finishDrawing(drawPoints);
  };

  const gridLines = useMemo(() => {
    if (!gridSizeMm) return { vertical: [], horizontal: [] };
    const startX = Math.floor(viewBox.x / gridSizeMm) * gridSizeMm;
    const endX = viewBox.x + viewBox.w;
    const startY = Math.floor(viewBox.y / gridSizeMm) * gridSizeMm;
    const endY = viewBox.y + viewBox.h;
    const vertical: number[] = [];
    const horizontal: number[] = [];
    const maxLines = 400;
    for (let x = startX; x <= endX && vertical.length < maxLines; x += gridSizeMm) vertical.push(x);
    for (let y = startY; y <= endY && horizontal.length < maxLines; y += gridSizeMm) horizontal.push(y);
    return { vertical, horizontal };
  }, [viewBox, gridSizeMm]);

  const strokePx = viewBox.w / 900; // roughly constant visual thickness
  const fontPx = viewBox.w / 70;

  const points = level.polygon.points;
  // While a vertex is being dragged, the outline/edges follow the local live
  // preview so the shape visibly tracks the drag; the store isn't touched
  // until mouseup (see handleMouseUp).
  const displayPoints =
    draggingVertexIndex !== null && vertexDragPreview
      ? points.map((p, i) => (i === draggingVertexIndex ? vertexDragPreview : p))
      : points;
  const edges = displayPoints.map((p, i) => ({ a: p, b: displayPoints[(i + 1) % displayPoints.length], index: i }));

  const commitEdit = () => {
    if (editingEdge === null) return;
    const parsed = Number(editValue.replace(/\s/g, "").replace(",", "."));
    if (!Number.isNaN(parsed) && parsed > 0) {
      const snapped = snapEnabled ? snapToGrid(parsed, gridSizeMm) : parsed;
      onEditEdge(editingEdge, snapped);
    }
    setEditingEdge(null);
  };

  const showStructure = viewMode === "struktur";
  const showBoards = viewMode === "terrass" || viewMode === "struktur";

  return (
    <div className="relative h-full w-full bg-slate-50">
      <svg
        ref={svgRef}
        className="h-full w-full touch-none"
        style={drawingMode || editTool === "measure" ? { cursor: "crosshair" } : undefined}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        <g>
          {gridLines.vertical.map((x) => (
            <line key={`gv-${x}`} x1={x} y1={viewBox.y} x2={x} y2={viewBox.y + viewBox.h} stroke="#e2e8f0" strokeWidth={strokePx * 0.4} />
          ))}
          {gridLines.horizontal.map((y) => (
            <line key={`gh-${y}`} x1={viewBox.x} y1={y} x2={viewBox.x + viewBox.w} y2={y} stroke="#e2e8f0" strokeWidth={strokePx * 0.4} />
          ))}
        </g>

        <polygon
          points={polygonPointsAttr(displayPoints)}
          fill={showStructure ? "#f8fafc" : "#dbeafe"}
          stroke="#1e3a8a"
          strokeWidth={strokePx}
        />

        {level.openings.map((o) => (
          <polygon key={o.id} points={polygonPointsAttr(o.points)} fill="#f8fafc" stroke="#94a3b8" strokeWidth={strokePx * 0.6} />
        ))}

        {showBoards &&
          geometry.boards.map((b, i) => {
            const isSelected = inspectMode && selected?.type === "trall" && selected.index === i;
            return (
              <line
                key={b.id}
                x1={b.start.x}
                y1={b.start.y}
                x2={b.end.x}
                y2={b.end.y}
                stroke={isSelected ? "#2563eb" : showStructure ? "#fcd34d" : "#92400e"}
                strokeWidth={isSelected ? Math.max(b.widthMm, strokePx * 2) : Math.max(b.widthMm * 0.8, strokePx)}
                strokeOpacity={isSelected ? 1 : showStructure ? 0.5 : 0.85}
                onClick={inspectMode ? () => onSelectElement?.({ type: "trall", index: i }) : undefined}
                style={inspectMode ? { cursor: "pointer" } : undefined}
              />
            );
          })}

        {showStructure &&
          geometry.joists.map((j, i) => {
            const isSelected = inspectMode && selected?.type === "regel" && selected.index === i;
            return (
              <line
                key={j.id}
                x1={j.start.x}
                y1={j.start.y}
                x2={j.end.x}
                y2={j.end.y}
                stroke={isSelected ? "#2563eb" : "#16a34a"}
                strokeWidth={isSelected ? strokePx * 4 : strokePx * 2}
                onClick={inspectMode ? () => onSelectElement?.({ type: "regel", index: i }) : undefined}
                style={inspectMode ? { cursor: "pointer" } : undefined}
              />
            );
          })}

        {showStructure &&
          geometry.beams.map((b, i) => {
            const isSelected = inspectMode && selected?.type === "barlina" && selected.index === i;
            return (
              <line
                key={b.id}
                x1={b.start.x}
                y1={b.start.y}
                x2={b.end.x}
                y2={b.end.y}
                stroke={isSelected ? "#2563eb" : "#dc2626"}
                strokeWidth={isSelected ? strokePx * 4.5 : strokePx * 2.5}
                onClick={inspectMode ? () => onSelectElement?.({ type: "barlina", index: i }) : undefined}
                style={inspectMode ? { cursor: "pointer" } : undefined}
              />
            );
          })}

        {showStructure &&
          geometry.footings.map((f, i) => {
            const isSelected = inspectMode && selected?.type === "plint" && selected.index === i;
            return (
              <g
                key={f.id}
                onClick={inspectMode ? () => onSelectElement?.({ type: "plint", index: i }) : undefined}
                style={inspectMode ? { cursor: "pointer" } : undefined}
              >
                <circle cx={f.position.x} cy={f.position.y} r={isSelected ? strokePx * 9 : strokePx * 6} fill={isSelected ? "#2563eb" : "#1e293b"} />
                <text x={f.position.x} y={f.position.y - strokePx * 8} fontSize={fontPx * 0.6} textAnchor="middle" fill="#1e293b">
                  {f.label}
                </text>
              </g>
            );
          })}

        {/* Dimension labels per edge */}
        {edges.map((edge) => {
          const midX = (edge.a.x + edge.b.x) / 2;
          const midY = (edge.a.y + edge.b.y) / 2;
          const len = Math.hypot(edge.b.x - edge.a.x, edge.b.y - edge.a.y);
          const isEditing = editingEdge === edge.index;
          return (
            <g key={`dim-${edge.index}`}>
              {isEditing ? (
                <foreignObject x={midX - 60} y={midY - 14} width={120} height={28}>
                  <input
                    autoFocus
                    className="w-full rounded border border-blue-500 bg-white px-1 text-center text-xs"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") setEditingEdge(null);
                    }}
                    onBlur={commitEdit}
                  />
                </foreignObject>
              ) : (
                <text
                  data-role="dimension"
                  x={midX}
                  y={midY}
                  fontSize={fontPx * 0.7}
                  textAnchor="middle"
                  fill="#1e3a8a"
                  className="cursor-pointer select-none"
                  style={{ paintOrder: "stroke", stroke: "white", strokeWidth: fontPx * 0.15 }}
                  onClick={() => {
                    setEditingEdge(edge.index);
                    setEditValue(String(Math.round(len)));
                  }}
                >
                  {formatMm(len)}
                </text>
              )}
            </g>
          );
        })}

        {/* "Lägg till punkt" / "Lägg till punkt på kant": clickable edge hit-areas. */}
        {(editTool === "add-point" || editTool === "add-point-on-edge") && (
          <g>
            {edges.map((edge) => (
              <line
                key={`edge-hit-${edge.index}`}
                data-role="edge-hit"
                data-index={edge.index}
                x1={edge.a.x}
                y1={edge.a.y}
                x2={edge.b.x}
                y2={edge.b.y}
                stroke={selectedEdgeForInsert === edge.index ? "#16a34a" : "transparent"}
                strokeWidth={selectedEdgeForInsert === edge.index ? strokePx * 3 : strokePx * 10}
                pointerEvents="stroke"
                style={{ cursor: "pointer" }}
                onClick={(e) => handleEdgeClick(edge.index, e)}
              />
            ))}
          </g>
        )}

        {/* "Välj/Flytta" / "Ta bort punkt": vertex handles. */}
        {(editTool === "select" || editTool === "delete-point") && (
          <g>
            {points.map((p, i) => {
              const pos = draggingVertexIndex === i && vertexDragPreview ? vertexDragPreview : p;
              return (
                <g key={`vertex-${i}`}>
                  <circle
                    data-role="vertex-handle"
                    data-index={i}
                    cx={pos.x}
                    cy={pos.y}
                    r={strokePx * 6}
                    fill={editTool === "delete-point" ? "#dc2626" : "#2563eb"}
                    stroke="white"
                    strokeWidth={strokePx * 0.8}
                    style={{ cursor: editTool === "select" ? "grab" : "pointer" }}
                    onMouseDown={(e) => startVertexDrag(i, e)}
                    onClick={(e) => handleVertexClick(i, e)}
                  />
                  <text x={pos.x} y={pos.y - strokePx * 9} fontSize={fontPx * 0.55} textAnchor="middle" fill="#1e3a8a">
                    P{i + 1}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {/* "Mät avstånd": click two points to measure the distance between them. */}
        {editTool === "measure" &&
          measurePoints.length > 0 &&
          (() => {
            const p1 = measurePoints[0];
            const p2 = measurePoints[1] ?? measureCursor;
            if (!p2) return null;
            const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            return (
              <g pointerEvents="none">
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke="#dc2626"
                  strokeDasharray={`${strokePx * 3} ${strokePx * 2}`}
                  strokeWidth={strokePx}
                />
                <circle cx={p1.x} cy={p1.y} r={strokePx * 4} fill="#dc2626" />
                <circle cx={p2.x} cy={p2.y} r={strokePx * 4} fill="#dc2626" />
                <text
                  x={midX}
                  y={midY - strokePx * 8}
                  fontSize={fontPx * 0.7}
                  textAnchor="middle"
                  fill="#dc2626"
                  style={{ paintOrder: "stroke", stroke: "white", strokeWidth: fontPx * 0.15 }}
                >
                  {formatMm(dist)}
                </text>
              </g>
            );
          })()}

        {drawingMode && (
          <g pointerEvents="none">
            {drawPoints.length > 0 && drawCursor && (
              <line
                x1={drawPoints[drawPoints.length - 1].x}
                y1={drawPoints[drawPoints.length - 1].y}
                x2={drawCursor.x}
                y2={drawCursor.y}
                stroke="#2563eb"
                strokeDasharray={`${strokePx * 3} ${strokePx * 2}`}
                strokeWidth={strokePx}
              />
            )}
            {drawPoints.map((p, i) => (
              <line
                key={`draw-seg-${i}`}
                x1={drawPoints[i - 1]?.x ?? p.x}
                y1={drawPoints[i - 1]?.y ?? p.y}
                x2={p.x}
                y2={p.y}
                stroke="#2563eb"
                strokeWidth={strokePx}
              />
            ))}
            {drawPoints.length >= 3 && (
              <line
                x1={drawPoints[drawPoints.length - 1].x}
                y1={drawPoints[drawPoints.length - 1].y}
                x2={drawPoints[0].x}
                y2={drawPoints[0].y}
                stroke="#93c5fd"
                strokeDasharray={`${strokePx * 3} ${strokePx * 2}`}
                strokeWidth={strokePx}
              />
            )}
            {drawPoints.map((p, i) => (
              <g key={`draw-pt-${i}`}>
                <circle cx={p.x} cy={p.y} r={strokePx * 5} fill="#2563eb" stroke="white" strokeWidth={strokePx * 0.6} />
                <text x={p.x} y={p.y - strokePx * 8} fontSize={fontPx * 0.6} textAnchor="middle" fill="#1e3a8a">
                  P{i + 1}
                </text>
              </g>
            ))}
          </g>
        )}
      </svg>

      <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-white/90 px-3 py-1.5 text-xs shadow">
        Nettoarea: <strong>{formatM2(netAreaM2)}</strong>
      </div>

      {drawingMode ? (
        <div className="absolute bottom-3 right-3 flex items-center gap-2">
          <span className="rounded bg-white/90 px-2 py-1 text-xs text-slate-600 shadow">{drawPoints.length} punkt(er)</span>
          <button
            type="button"
            onClick={() => {
              setDrawPoints([]);
              onCancelDrawing?.();
            }}
            className="rounded bg-white px-2 py-1 text-xs shadow hover:bg-slate-100"
          >
            Avbryt
          </button>
          <button
            type="button"
            disabled={drawPoints.length < 3}
            onClick={() => finishDrawing(drawPoints)}
            className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white shadow disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Slutför form
          </button>
        </div>
      ) : editTool === "add-point-on-edge" && selectedEdgeForInsert !== null ? (
        <div className="absolute bottom-3 right-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedEdgeForInsert(null)}
            className="rounded bg-white px-2 py-1 text-xs shadow hover:bg-slate-100"
          >
            Avbryt
          </button>
          <button
            type="button"
            onClick={() => {
              onInsertPointOnEdge?.(selectedEdgeForInsert, 0.5);
              setSelectedEdgeForInsert(null);
            }}
            className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white shadow"
          >
            Lägg till punkt (mitten)
          </button>
        </div>
      ) : editTool === "measure" && measurePoints.length > 0 ? (
        <button
          type="button"
          onClick={() => setMeasurePoints([])}
          className="absolute bottom-3 right-3 rounded bg-white px-2 py-1 text-xs shadow hover:bg-slate-100"
        >
          Rensa mätning
        </button>
      ) : (
        <button
          type="button"
          onClick={fitToView}
          className="absolute bottom-3 right-3 rounded bg-white px-2 py-1 text-xs shadow hover:bg-slate-100"
        >
          Zooma till allt
        </button>
      )}
    </div>
  );
}
