import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ComponentRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { DeckLevel, MaterialLibrary } from "../../types";
import type { LevelGeometryResult } from "../../materials";
import { classifyEdges } from "../../deck/edgeClassification";
import {
  boardThicknessMmFor,
  boardTransform,
  fasciaStripTransforms,
  groundBoundsFor,
  mmToM,
  stairStepTransforms,
  type LateralStyle,
  type Transform3D,
} from "../../three/deckTransforms";
import { colorForGroundType, colorForTrallMaterialName, type GroundType } from "../../three/materialColors";

export type QuickView = "perspective" | "front" | "back" | "left" | "right" | "top";

export interface ViewCommand {
  view: QuickView;
  nonce: number;
}

interface SceneBounds {
  center: [number, number, number];
  radius: number;
  heightM: number;
  widthM: number;
  depthM: number;
}

/**
 * One `THREE.InstancedMesh` for a group of same-color oriented boxes
 * (deck boards, stair blocks, fascia strips). Rebuilding a fresh instance
 * count on every data change is intentional — the geometry it draws
 * always reflects the caller's current, already-computed transforms, with
 * no separate "update" step (no data is ever recalculated here).
 */
function InstancedBoxes({ transforms, color }: { transforms: Transform3D[]; color: string }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    transforms.forEach((t, i) => {
      dummy.position.set(t.position[0], t.position[1], t.position[2]);
      dummy.rotation.set(0, t.rotationY, 0);
      dummy.scale.set(Math.max(t.size[0], 0.001), Math.max(t.size[1], 0.001), Math.max(t.size[2], 0.001));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [transforms]);

  if (transforms.length === 0) return null;
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, transforms.length]} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} roughness={0.85} metalness={0.05} />
    </instancedMesh>
  );
}

function Ground({ bounds, groundType }: { bounds: SceneBounds; groundType: GroundType }) {
  return (
    <mesh position={[bounds.center[0], -0.01, bounds.center[2]]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[bounds.widthM, bounds.depthM]} />
      <meshStandardMaterial color={colorForGroundType(groundType)} roughness={1} />
    </mesh>
  );
}

function viewCameraPosition(view: QuickView, bounds: SceneBounds): [number, number, number] {
  const [cx, cy, cz] = bounds.center;
  const r = Math.max(bounds.radius, 1);
  const eyeY = cy + bounds.heightM * 0.6 + r * 0.15;
  switch (view) {
    case "front":
      return [cx, eyeY, cz + r * 1.7];
    case "back":
      return [cx, eyeY, cz - r * 1.7];
    case "left":
      return [cx - r * 1.7, eyeY, cz];
    case "right":
      return [cx + r * 1.7, eyeY, cz];
    case "top":
      return [cx, cy + r * 2.6, cz + 0.001];
    case "perspective":
    default:
      return [cx + r * 1.2, cy + bounds.heightM + r * 0.95, cz + r * 1.2];
  }
}

/** Camera + OrbitControls, driven by quick-view commands from the DOM overlay outside the Canvas. */
function CameraRig({ command, bounds }: { command: ViewCommand | null; bounds: SceneBounds }) {
  const { camera } = useThree();
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);

  const applyView = useCallback(
    (view: QuickView) => {
      const [px, py, pz] = viewCameraPosition(view, bounds);
      const [tx, ty, tz] = [bounds.center[0], bounds.center[1] + bounds.heightM * 0.3, bounds.center[2]];
      camera.position.set(px, py, pz);
      camera.lookAt(tx, ty, tz);
      const controls = controlsRef.current;
      if (controls) {
        controls.target.set(tx, ty, tz);
        controls.update();
      }
    },
    [camera, bounds],
  );

  // Re-frame once whenever the model's bounds change (new shape/height), and
  // whenever the DOM overlay issues a quick-view command (including "Återställ vy").
  useEffect(() => {
    applyView("perspective");
  }, [applyView]);
  useEffect(() => {
    if (command) applyView(command.view);
  }, [command, applyView]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      maxPolarAngle={Math.PI * 0.49}
      minDistance={Math.max(bounds.radius * 0.15, 0.5)}
      maxDistance={Math.max(bounds.radius * 8, 20)}
    />
  );
}

export interface DeckSceneProps {
  level: DeckLevel;
  geometry: LevelGeometryResult;
  library: MaterialLibrary;
  groundType: GroundType;
  lateralStyle: LateralStyle;
  viewCommand: ViewCommand | null;
}

/**
 * The actual 3D scene contents (must render inside a `<Canvas>`). Reads
 * ONLY already-computed results (`geometry.boards`, `geometry.stairs`,
 * `level.polygon`) — it never recalculates board layout, stair quantities,
 * or anything else the 2D engine already produced.
 */
export function DeckScene({ level, geometry, library, groundType, lateralStyle, viewCommand }: DeckSceneProps) {
  const deckTopMm = level.heightAboveGround;

  const boardsByColor = useMemo(() => {
    const groups = new Map<string, Transform3D[]>();
    for (const board of geometry.boards) {
      const thicknessMm = boardThicknessMmFor(board, level, library);
      const materialId = board.materialId ?? level.trallMaterialId;
      const material = library.materials.find((m) => m.id === materialId);
      const color = colorForTrallMaterialName(material?.nameSv ?? material?.name);
      const transform = boardTransform(board, thicknessMm, deckTopMm);
      const list = groups.get(color);
      if (list) list.push(transform);
      else groups.set(color, [transform]);
    }
    return groups;
  }, [geometry.boards, level, library, deckTopMm]);

  const stairsByColor = useMemo(() => {
    const groups = new Map<string, Transform3D[]>();
    for (const { stair, result } of geometry.stairs) {
      const material = library.materials.find((m) => m.id === stair.trallMaterialId);
      const color = colorForTrallMaterialName(material?.nameSv ?? material?.name);
      const steps = stairStepTransforms(level.polygon.points, stair, result, deckTopMm);
      const list = groups.get(color);
      if (list) list.push(...steps);
      else groups.set(color, steps);
    }
    return groups;
  }, [geometry.stairs, level.polygon.points, library, deckTopMm]);

  const fasciaTransforms = useMemo(() => {
    const classification = classifyEdges(level);
    return fasciaStripTransforms(level.polygon.points, classification, level.heightAboveGround, lateralStyle);
  }, [level, lateralStyle]);

  const fasciaColor = useMemo(() => {
    const trallMaterial = library.materials.find((m) => m.id === level.trallMaterialId);
    return colorForTrallMaterialName(trallMaterial?.nameSv ?? trallMaterial?.name);
  }, [library, level.trallMaterialId]);

  const bounds = useMemo<SceneBounds>(() => {
    const groundBoundsMm = groundBoundsFor(level.polygon.points);
    return {
      center: [mmToM(groundBoundsMm.centerMm.x), 0, mmToM(groundBoundsMm.centerMm.y)],
      radius: Math.max(mmToM(groundBoundsMm.widthMm), mmToM(groundBoundsMm.depthMm)) / 2,
      heightM: mmToM(level.heightAboveGround),
      widthM: mmToM(groundBoundsMm.widthMm),
      depthM: mmToM(groundBoundsMm.depthMm),
    };
  }, [level.polygon.points, level.heightAboveGround]);

  return (
    <>
      <color attach="background" args={["#dceefc"]} />
      <hemisphereLight args={["#dceefc", "#4a5a3f", 0.6]} />
      <ambientLight intensity={0.45} />
      <directionalLight
        position={[bounds.center[0] + bounds.radius, bounds.radius * 1.6 + 3, bounds.center[2] + bounds.radius]}
        intensity={1.15}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-bounds.radius * 1.5}
        shadow-camera-right={bounds.radius * 1.5}
        shadow-camera-top={bounds.radius * 1.5}
        shadow-camera-bottom={-bounds.radius * 1.5}
      />
      <Ground bounds={bounds} groundType={groundType} />
      {Array.from(boardsByColor.entries()).map(([color, transforms]) => (
        <InstancedBoxes key={`board-${color}`} transforms={transforms} color={color} />
      ))}
      {Array.from(stairsByColor.entries()).map(([color, transforms]) => (
        <InstancedBoxes key={`stair-${color}`} transforms={transforms} color={color} />
      ))}
      {fasciaTransforms.length > 0 && <InstancedBoxes transforms={fasciaTransforms} color={fasciaColor} />}
      <CameraRig command={viewCommand} bounds={bounds} />
    </>
  );
}
