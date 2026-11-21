import {
  Component,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  Box3,
  CanvasTexture,
  DoubleSide,
  LinearFilter,
  Matrix4,
  NeutralToneMapping,
  Raycaster,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type DirectionalLight,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  type PerspectiveCamera,
} from "three";
import type { DesignDocument, Point, ProductDefinition } from "../design/schema.js";
import { buildSurfaceLookup, projectItem, projectPieceLine, type ItemOnScreen, type ScreenPoint, type SurfaceLookup } from "../texture/surface-lookup.js";
import { extractGarmentMeshes } from "./garment-geometry.js";
import { TAP_MAX_MS, pressAction, tapOutcome, travelledPast, type DragOnlySelected } from "./press-policy.js";
import { DraftPolicy, type GestureTiming } from "./draft-quality.js";
import { buildPickBvh, pickBvh, type PickBvh } from "./pick-bvh.js";
import { dragPosition, layerAtPoint, pieceAtMeshUv, round3, startLayerDrag, type LayerDrag } from "../design/placement.js";
import { backgroundAt } from "../design/readability.js";
import { DEFAULT_TEXTURE_SIZE, drawPatternTexture, pieceTransform, type DrawPatternResult } from "../texture/pattern-texture.js";
import { drawZoneHighlight, type ZoneHighlight } from "../texture/zone-highlight.js";
import { HoverTracker, hoverAllowed, type Hover } from "./hover.js";
import { FontWatcher, type FontSetLike, type FontStatus } from "../texture/fonts.js";
import { AssetImageCache, type AssetUrlResolver } from "./asset-images.js";
import { NO_INSETS, frameInFreeArea, type Framing, type ViewInsets } from "./camera.js";
import { CameraRig } from "./camera-rig.js";
import { makeFabric, type Fabric } from "./fabric.js";
import { loadModel, type LoadedModel, type ModelLoadProgress } from "./model-loader.js";
import { STUDIO_BACKGROUND, STUDIO_LIGHTS, studioLightPosition } from "./studio.js";

/** What it cost to redraw the pattern texture, for a caller that reports performance. */
export interface TextureDrawInfo extends DrawPatternResult {
  /** Time spent drawing the pieces and layers into the 2D canvas, in milliseconds. The GPU upload follows on the next frame. */
  drawMs: number;
}

/** A drag of a layer on the model. `position` is the layer's new centre in its piece's millimetres. */
export interface LayerDragEvent {
  phase: "start" | "move" | "end" | "cancel";
  layerId: string;
  pieceId: string;
  position: Point;
  /** The Alt key is held (a mouse): place freely, without snapping (06-editor.md 5.2). */
  free?: boolean;
  /** Screen px per piece mm where the item is (snapping takes 8 px or 6 mm, whichever is larger). */
  pxPerMm?: number;
  /**
   * On "end": false when the pointer never travelled past `DRAG_SLOP_PX` from the press (a click, not a move:
   * the item keeps its place and no undo step is made, whatever the camera did meanwhile).
   */
  moved?: boolean;
}

/** A line on a piece to draw over the model while placing (a snapping guide, or the print area's edge), in piece mm. */
export interface PieceGuide {
  pieceId: string;
  from: Point;
  to: Point;
  kind: "guide" | "area";
}

/**
 * The selected item as the camera sees it (N9), for the handles drawn over the
 * canvas: its box on the screen (CSS px from the canvas's top left), whether it
 * faces the camera, and the guides on the screen.
 */
export interface SelectionGeometry extends ItemOnScreen {
  layerId: string;
  /** Each guide as runs of screen points (a guide may leave the cloth and come back). */
  guides: Array<{ kind: PieceGuide["kind"]; runs: ScreenPoint[][] }>;
  /** The canvas's size in CSS px. */
  width: number;
  height: number;
}

/**
 * Every item on the screen (E3d): its projected corners and centre, and whether it faces the camera. The
 * interface keeps the turn handle off other items (R33) and draws a warning badge on unselected items (R15).
 */
export interface ItemBox {
  layerId: string;
  corners: ScreenPoint[];
  centre: ScreenPoint;
  facing: boolean;
}

/** Which side of the garment the camera looks at. "left" is the wearer's left. */
export type CameraSide = "front" | "back" | "left" | "right";

/** Where the camera is, for the interface's view buttons (06-editor.md 6.1). */
export interface CameraInfo {
  /** The side the camera faces, or null when the coach turned the garment freely. */
  side: CameraSide | null;
  canZoomIn: boolean;
  canZoomOut: boolean;
  /** E3f: the view is slid. */
  panned: boolean;
}

/** A tap on the model while zones are picked (N8): the piece, and the zone or group of shapes under the finger. */
export interface ZoneTap {
  pieceId: string;
  zoneId: string | null;
  /** The group of shapes on top there ("hoops"), when a shape is under the finger. */
  shapeGroup: string | null;
  /** E3f: where the tap was, in CSS px from the canvas's top left (a popover goes there). */
  x?: number;
  y?: number;
}

/**
 * E3f: what the mouse pointer is over on the model (`hover`): an item or a part of the garment, where (CSS px from
 * the canvas's top left), and for an item its box on the screen. Reported only when it changes.
 */
export type CanvasHover = Hover & { x: number; y: number; corners?: ScreenPoint[] };

/** Imperative controls, through `ref`. Every move is the coach's own action (06-editor.md 6.3); the host decides when. */
export interface DesignCanvasHandle {
  /** Turns the camera to one side of the garment, keeping the zoom. Animated (350 ms) unless `animate` is false or motion is reduced. */
  showSide(side: CameraSide, options?: { animate?: boolean }): void;
  /**
   * Turns to the side a layer is on; with `zoom`, also zooms in and moves the
   * layer's height into the middle of the free area (the item being typed).
   * `null` returns from such a zoom to the zoom before it.
   */
  focusOn(layerId: string | null, options?: { zoom?: boolean; animate?: boolean }): void;
  zoomIn(): void;
  zoomOut(): void;
  /** Back to the front, at the fitting distance. */
  resetView(): void;
  /** Turns the garment round by `degrees` (the stage's arrow keys). */
  turnBy(degrees: number): void;
  /** The side the camera faces now, or null. */
  getSide(): CameraSide | null;
  /**
   * Shows a design on the model at once, outside React (E3c, S1): the previews of a drag, a resize or a turn,
   * so the host does not re-render on every pointer move. The texture and the selection's handles follow it.
   * `null` ends the preview; with `redraw` the `design` prop is drawn again at once (a cancelled gesture),
   * otherwise the next `design` prop is (the gesture's result, committed by the host).
   */
  preview(design: DesignDocument | null, options?: { redraw?: boolean }): void;
}

export interface DesignCanvasProps {
  /** The design to show. The canvas only reads it; edit it with the functions from the design entry point. */
  design: DesignDocument;
  /** The garment model and its pattern pieces and colour zones. */
  product: ProductDefinition;
  className?: string;
  /** The canvas fills its container, so give the container (or this style) a height. */
  style?: CSSProperties;
  /** Called when the model fails to load. */
  onError?: (error: Error) => void;
  /**
   * Shown instead of the model when it fails to load. Default: a short
   * developer message. An interface passes its own (or null, and shows its own).
   */
  errorFallback?: ReactNode;
  /**
   * Edge of the square pattern texture in pixels (default 2048, lowered to the
   * device's limit). 2048 costs about 21 MiB of GPU memory with mipmaps; 1024 a quarter of that.
   */
  textureSize?: number;
  /** Called after each redraw of the pattern texture. */
  onTextureDrawn?: (info: TextureDrawInfo) => void;
  /** The layer outlined as selected on the model. */
  selectedLayerId?: string | null;
  /** Called with a layer's id when the customer taps (or, with a mouse, presses) it on the model; null for a tap on empty fabric or the stage. */
  onSelectLayer?: (layerId: string | null) => void;
  /**
   * Who may drag an item that is not selected (N10). true (default, E3f): nobody; a drag that starts on an
   * unselected item turns the garment for every pointer, and a click or tap selects it first. "touch": only touch
   * does so, a mouse presses and drags at once. false: direct drag for every pointer.
   */
  dragOnlySelected?: DragOnlySelected;
  /** Draw the selected layer's outline into the texture (default true). An interface that draws handles over the canvas passes false. */
  outlineSelected?: boolean;
  /**
   * Called with the selected item's box on the screen whenever it changes (the
   * camera moved, the item changed), and null when nothing is selected or the
   * item is not on the cloth. Computed only while something is selected; the
   * model's UV lookup is built once, the first time it is needed.
   */
  onSelectionGeometry?: (geometry: SelectionGeometry | null) => void;
  /**
   * E3d: called with every item's box on the screen (no outline) whenever the camera or the design changed. Given
   * this, the UV lookup is built once the model is ready, whether or not anything is selected.
   */
  onItemBoxes?: (boxes: ItemBox[]) => void;
  /**
   * E3d (R22, 07-editor-review 4.6): when an item is selected and its box on the screen is shorter than this on its
   * longer side (CSS px), the camera zooms in on it until it is (or to the zoom limit); letting it go zooms back.
   * Zooming in by hand then aims at the selected item (R24). Off when not given.
   */
  selectionMinPx?: number;
  /** Lines to draw over the model with the selection (snapping guides, the print area), projected along the cloth. */
  guides?: readonly PieceGuide[];
  /**
   * True while the coach moves, resizes or turns an item (06-editor.md 5.3, N11). If frames then take
   * longer than 33 ms, the texture is drawn at half size until the gesture ends, then once at full size.
   * "always" draws every gesture at half size; "never" keeps full size.
   */
  gesture?: boolean;
  draftQuality?: "auto" | "always" | "never";
  /** Each gesture's timings: frame times during it, whether draft quality was used, and the time to full quality after it. */
  onGestureTiming?: (timing: GestureTiming) => void;
  /**
   * When given, layers can be dragged on the model. Called at the start, for
   * every move (at most once per frame) and at the end of a drag. A layer
   * stays on its own piece. Apply the moves as one undo step (begin, preview, end).
   */
  onLayerDrag?: (event: LayerDragEvent) => void;
  /**
   * Supplied by the host: where to load an asset's image from (the store's
   * storage URL; the demo's in-memory object URL). Without it, logos show as placeholders.
   */
  assetUrl?: AssetUrlResolver;
  /** The font set to load fonts with. Default: `document.fonts`. The host declares the faces (for example with @fontsource CSS). */
  fonts?: FontSetLike | null;
  /** Called when fonts start loading, arrive, fail or are not declared at all. */
  onFontStatus?: (status: FontStatus) => void;
  /** How much larger than its box a layer is for a tap, in mm (fingers are wide). Default 8. */
  touchSlopMm?: number;
  /**
   * How much of the canvas a panel covers (CSS px per edge): the garment is
   * framed in the rest, re-framed over 200 ms when it changes (N7).
   */
  viewInsets?: ViewInsets;
  /** Cut instead of animating camera moves (the host follows `prefers-reduced-motion`). */
  reducedMotion?: boolean;
  /** Called when the side the camera faces, or whether it can zoom further, changes. */
  onCameraChange?: (info: CameraInfo) => void;
  /** Called when the coach starts and stops turning or zooming the garment by hand (the camera keeps still for a while after). */
  onUserTurn?: (phase: "start" | "end", moved: boolean) => void;
  /**
   * Taps choose zones instead of layers (the Colours tool, N8): a tap on the
   * model calls `onZoneTap` with the zone (or shapes) under the finger, and
   * layers are neither selected nor dragged. Drags still turn the garment.
   */
  pickZones?: boolean;
  /**
   * A tap on a part of the garment (E3f): from any tool, not only while `pickZones` is set. A tap on an item selects
   * it as before; a tap on bare fabric calls this with the part; a tap on the stage calls it with null.
   */
  onZoneTap?: (tap: ZoneTap | null) => void;
  /**
   * E3f: with a mouse, the item or part under the pointer is shown (the part marked softly on the model; the hand
   * cursor) and reported to `onHover` when it changes (null: nothing). The canvas asks for a new frame only when
   * what is under the pointer changes.
   */
  hover?: boolean;
  onHover?: (hover: CanvasHover | null) => void;
  /** A zone or group of shapes to show on the model (the zone flash; editor only). */
  highlight?: ZoneHighlight | null;
  /** The model's download progress (N17). */
  onLoadProgress?: (progress: ModelLoadProgress) => void;
  /** Called once the model has loaded (the host can build template cards from its geometry). */
  onModelReady?: (model: LoadedModel) => void;
  /** Called when the browser takes the 3D context away (memory pressure), and when it gives it back (N16). */
  onContextLost?: () => void;
  onContextRestored?: () => void;
  ref?: Ref<DesignCanvasHandle>;
}

const FOV = 35;

/** E3f: the hover texture's edge (px), and how strongly the hovered part is marked (a soft veil and edge). */
const HOVER_TEXTURE_SIZE = 512;
const HOVER_ALPHA = 0.5;

/** How far a tap may move and still be a tap, in CSS pixels. */
const TAP_SLOP_PX = 8;

/**
 * Edge of the inside texture (the colour zones without prints, for the inside
 * of the garment) in pixels. Small on purpose: 256 KB, and the inside is only
 * seen in shade through the openings.
 */
const INSIDE_TEXTURE_SIZE = 256;

interface PreparedModel {
  scene: Object3D;
  /** Every cloned material, to dispose of. */
  materials: Material[];
  /** The materials of the meshes that carry pattern pieces: they get the pattern texture. */
  pieceMaterials: MeshStandardMaterial[];
  /** The meshes that carry pattern pieces, with the name the product uses for them. */
  pieceMeshes: Map<Mesh, string>;
  /** The pieces' materials, made into cloth (fabric.ts). */
  fabrics: Fabric[];
  center: [number, number, number];
  size: [number, number, number];
}

/** The name a model object was given in the file (Three.js may sanitise `name`; GLTFLoader keeps the original in `userData`). */
function fileName(object: Object3D): string {
  const original = (object.userData as { name?: unknown }).name;
  return typeof original === "string" ? original : object.name;
}

/**
 * Clones the loaded scene and its materials, so one cached model can serve
 * several canvases, and finds the meshes the product's pattern pieces name.
 */
function prepareModel(source: Object3D, product: ProductDefinition): PreparedModel {
  const scene = source.clone(true);
  const meshNames = new Set(product.pieces.map((p) => p.mesh));
  const found = new Set<string>();
  const materials: Material[] = [];
  const pieceMaterials: MeshStandardMaterial[] = [];
  const pieceMeshes = new Map<Mesh, string>();
  const fabrics: Fabric[] = [];
  scene.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const cloned = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => m.clone());
    mesh.material = Array.isArray(mesh.material) ? cloned : (cloned[0] as Material);
    materials.push(...cloned);
    // The mesh itself, or the group above it (a mesh with several primitives), may carry the piece's name.
    for (let owner: Object3D | null = mesh; owner; owner = owner.parent) {
      const name = fileName(owner);
      if (meshNames.has(name)) {
        found.add(name);
        pieceMeshes.set(mesh, name);
        for (const material of cloned) {
          if ("map" in material && "color" in material) pieceMaterials.push(material as MeshStandardMaterial);
          // A garment is one layer of cloth: both sides are drawn, the inside shaded as the inside.
          material.side = DoubleSide;
          fabrics.push(makeFabric(material, mesh.geometry));
        }
        break;
      }
    }
  });
  const missing = [...meshNames].filter((name) => !found.has(name));
  if (missing.length > 0) {
    throw new Error(
      `the model has no mesh named ${missing.map((n) => `"${n}"`).join(", ")}, which the product's pattern pieces refer to`,
    );
  }
  const box = new Box3().setFromObject(scene);
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  return { scene, materials, pieceMaterials, pieceMeshes, fabrics, center: center.toArray(), size: size.toArray() };
}

interface PatternSurface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: CanvasTexture;
  size: number;
}

// Three.js objects are changed in place, outside React's state, by these
// helpers (called from effects and event handlers only).

/** The texture carries the colours, so the materials it is put on are white. */
function applyPatternTexture(materials: readonly MeshStandardMaterial[], texture: CanvasTexture): void {
  for (const material of materials) {
    material.map = texture;
    material.color.set("#ffffff");
    material.needsUpdate = true;
  }
}

/** E3f: the hover texture is black (adds no light) until a part is drawn into it; the cloth's emissive channel shows it. */
function clearHoverSurface(surface: PatternSurface): void {
  surface.ctx.setTransform(1, 0, 0, 1, 0, 0);
  surface.ctx.fillStyle = "#000000";
  surface.ctx.fillRect(0, 0, surface.size, surface.size);
  surface.texture.needsUpdate = true;
}

/** E3f: puts the hover texture on the pieces' emissive channel (white light through a black texture is none), or takes it off. */
function setHoverMap(materials: readonly MeshStandardMaterial[], texture: CanvasTexture | null): void {
  for (const material of materials) {
    material.emissive.set(texture ? "#ffffff" : "#000000");
    material.emissiveMap = texture;
    material.needsUpdate = true;
  }
}

/** Draws the pieces and layers into the canvas and marks the texture for upload. */
function redrawPattern(
  surface: PatternSurface,
  product: ProductDefinition,
  design: DesignDocument,
  images: AssetImageCache | null,
  selectedLayerId: string | null,
  highlight: ZoneHighlight | null = null,
): TextureDrawInfo {
  const start = performance.now();
  const result = drawPatternTexture(surface.ctx, product, design, { size: surface.size, images: images?.lookup, selectedLayerId, highlight });
  const drawMs = performance.now() - start;
  surface.texture.needsUpdate = true;
  return { ...result, drawMs };
}

/** Sets the imperative handle the outer component forwards. */
function setHandle(target: { current: DesignCanvasHandle | null }, value: DesignCanvasHandle | null): void {
  target.current = value;
}

function defaultFontSet(): FontSetLike | null {
  return typeof document !== "undefined" && document.fonts ? (document.fonts as unknown as FontSetLike) : null;
}

/** The 2D canvas the pattern is drawn into, and the texture that shows it on the model. */
function usePatternSurface(requestedSize: number | undefined, options: { mipmaps?: boolean } = {}): PatternSurface {
  const gl = useThree((state) => state.gl);
  const size = Math.max(64, Math.min(requestedSize ?? DEFAULT_TEXTURE_SIZE, gl.capabilities.maxTextureSize));
  const mipmaps = options.mipmaps;
  const surface = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("this browser cannot draw the pattern texture (no 2D canvas)");
    const texture = new CanvasTexture(canvas);
    // glTF UVs have V pointing down, like the canvas: no flip.
    texture.flipY = false;
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    if (mipmaps === false) {
      // A draft: no mipmap chain to build on every upload (slightly rougher when far away, for a moment).
      texture.generateMipmaps = false;
      texture.minFilter = LinearFilter;
    }
    return { canvas, ctx, texture, size };
  }, [size, gl, mipmaps]);
  useEffect(() => () => surface.texture.dispose(), [surface]);
  return surface;
}

/**
 * E3d (07-editor-review 4.6): the closest camera distance at which an item's box on the screen, outset and with
 * its handles, still fits the free stage: 25 px round it (the 8 px outset, half a 14 px handle, and 10 px for the
 * box being off its centre in perspective, measured at the founder's window), and across,
 * room for the turn handle on its stem at the end side (where it goes when the height is short, selection-box.ts).
 * `corners`: its box now, seen from `distance`; it grows as 1 / distance. 0 when the free stage is too small.
 */
export function itemFitDistance(corners: readonly { x: number; y: number }[], distance: number, free: { width: number; height: number }): number {
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  const roomH = free.height - 2 * 25;
  const roomW = free.width - 2 * 25 - 70;
  if (roomH <= 0 || roomW <= 0 || !(distance > 0)) return 0;
  return distance * Math.max(h / roomH, w / roomW);
}

/**
 * An item that lies this much (as a factor of the free stage's half height or width, with 12 px of air) outside the
 * free stage makes the camera come back; less than 5% is left alone (a pixel or two from perspective).
 */
export const ITEM_OVERFLOW_BACKOFF = 1.05;

/**
 * E3e: by what factor the camera must come back for the item itself to lie inside the free stage (`free`: its
 * rectangle in canvas px, which leaves out the credit line, the contextual bar and the view buttons), with 12 px of
 * air. 1 when it does. The box seen from further away shrinks towards the middle of the free stage in proportion.
 * Only the item's own corners count: its handles may stand a little outside (the overlay clips them there); an item
 * that is itself under the bar or off the stage is what this is for.
 */
export function itemOverflowFactor(corners: readonly { x: number; y: number }[], free: { x: number; y: number; width: number; height: number }): number {
  const air = 12;
  const cx = free.x + free.width / 2;
  const cy = free.y + free.height / 2;
  const up = Math.min(...corners.map((c) => c.y));
  const down = Math.max(...corners.map((c) => c.y));
  const left = Math.min(...corners.map((c) => c.x));
  const right = Math.max(...corners.map((c) => c.x));
  const halfH = free.height / 2 - air;
  const halfW = free.width / 2 - air;
  if (!(halfH > 0) || !(halfW > 0)) return 1;
  const worst = Math.max((cy - up) / halfH, (down - cy) / halfH, (cx - left) / halfW, (right - cx) / halfW);
  return Number.isFinite(worst) && worst > 1 ? worst : 1;
}

/** The longer side of an item's box on the screen (its edges' lengths, CSS px). */
export function itemLongSide(corners: readonly { x: number; y: number }[]): number {
  let longest = 0;
  for (let k = 0; k < corners.length; k++) {
    const a = corners[k]!;
    const b = corners[(k + 1) % corners.length]!;
    longest = Math.max(longest, Math.hypot(b.x - a.x, b.y - a.y));
  }
  return longest;
}

/** E3f: the middle of the fingers that are down (where a two-finger slide is measured). */
export function slideCentre(points: Iterable<{ x: number; y: number }>): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
    n++;
  }
  return n > 0 ? { x: x / n, y: y / n } : { x: 0, y: 0 };
}

/** The latest value, for event handlers that must not be re-attached on every render. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

type ModelViewProps = Omit<DesignCanvasProps, "className" | "style" | "onError" | "ref" | "errorFallback" | "onLoadProgress" | "onModelReady"> & {
  model: LoadedModel;
  handle: { current: DesignCanvasHandle | null };
};

function ModelView({
  model,
  design,
  product,
  textureSize,
  onTextureDrawn,
  selectedLayerId,
  onSelectLayer,
  onLayerDrag,
  dragOnlySelected = true,
  outlineSelected = true,
  onSelectionGeometry,
  onItemBoxes,
  selectionMinPx,
  guides,
  gesture = false,
  draftQuality = "auto",
  onGestureTiming,
  assetUrl,
  fonts,
  onFontStatus,
  touchSlopMm = 8,
  viewInsets = NO_INSETS,
  reducedMotion = false,
  onCameraChange,
  onUserTurn,
  pickZones = false,
  onZoneTap,
  hover = false,
  onHover,
  highlight = null,
  onContextLost,
  onContextRestored,
  handle,
}: ModelViewProps) {
  const prepared = useMemo(() => prepareModel(model.scene, product), [model, product]);
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const gl = useThree((state) => state.gl);
  const controls = useThree((state) => state.controls) as unknown as { enabled: boolean; update(): void } | null;
  const getState = useThree((state) => state.get);
  /** Pointers down on the stage now (the camera never zooms by itself under a finger, 6.3). */
  const pointersDown = useRef(new Set<number>());
  const invalidate = useThree((state) => state.invalidate);
  const viewSize = useThree((state) => state.size);
  const surface = usePatternSurface(textureSize);
  // Draft quality (5.3, N11): a half-size surface drawn while a gesture runs slowly; full size again on release.
  const draftSurface = usePatternSurface(Math.max(64, Math.floor((textureSize ?? DEFAULT_TEXTURE_SIZE) / 2)), { mipmaps: false });
  const [draft] = useState(() => new DraftPolicy());
  const showing = useRef<CanvasTexture | null>(null);
  const gestureTiming = useLatest(onGestureTiming);
  const gestureNow = useLatest(gesture);

  const { center, size } = prepared;
  const framing: Framing = frameInFreeArea(size, FOV, viewSize, viewInsets);
  const fit = framing.fit;

  // The camera (camera-rig.ts): framed in the free area, re-framed when it changes, animated moves.
  const [rig] = useState(() => new CameraRig(camera, invalidate));
  const callbacks = useLatest({ onCameraChange, onUserTurn });
  useEffect(() => {
    rig.update(prepared, center, size, {
      framing,
      viewport: { width: viewSize.width, height: viewSize.height },
      reducedMotion,
      fovDegrees: FOV,
      onChange: (info) => callbacks.current.onCameraChange?.(info),
      // R24: the orbit controls turn round the point the camera aims at.
      onTarget: (t) => (getState().controls as unknown as { target?: { set(x: number, y: number, z: number): void } } | null)?.target?.set(t[0], t[1], t[2]),
    });
  });
  useFrame(() => rig.frame());
  // Frame times while a gesture runs (the draft policy watches them).
  useFrame(() => draft.frame(performance.now()));

  // The layer and design the commands need, read when a command runs.
  const latest = useLatest({ design, product, onSelectLayer, onLayerDrag, touchSlopMm, controls, pickZones, onZoneTap, selectedLayerId, dragOnlySelected, free: framing.free, hover, onHover });

  // The selected item on the screen (N9): the UV lookup is built once per model, the first time something is
  // selected; then the box is projected in the frame loop, only while something is selected (the canvas renders
  // on demand, so this runs only when the camera or the design changed), and reported only when it changed.
  const lookup = useRef<{ model: PreparedModel; lookup: SurfaceLookup } | null>(null);
  const lastProjected = useRef<SelectionGeometry | null>(null);
  const geometryOut = useLatest(onSelectionGeometry);
  const boxesOut = useLatest(onItemBoxes);
  const lastBoxes = useRef<string>("");
  const lastGeometry = useRef<string>("");
  const previewDesign = useRef<DesignDocument | null>(null);
  const projectedLines = useRef<{ key: string; lines: SelectionGeometry["guides"] } | null>(null);
  const previewHandler = useRef<DesignCanvasHandle["preview"]>(() => undefined);
  const selectionInputs = useLatest({ design, product, selectedLayerId, guides, viewSize, selectionMinPx });
  const framingNow = useLatest(framing);
  /** The selected item's closest zoom (4.6), for the orbit controls' own limit (wheel, pinch). */
  const [itemMin, setItemMin] = useState(0);
  /** The item the camera last considered zooming in on (R22): once per selection. */
  const zoomedFor = useRef<string | null>(null);
  useEffect(() => {
    lastGeometry.current = "";
    invalidate();
  }, [selectedLayerId, guides, invalidate]);
  const surfaceLookup = (p: ProductDefinition): SurfaceLookup | null => {
    if (lookup.current?.model !== prepared) {
      try {
        lookup.current = { model: prepared, lookup: buildSurfaceLookup(extractGarmentMeshes(prepared.scene, p)) };
      } catch (error) {
        console.error("[editor] the model's UV lookup:", error);
        return null;
      }
    }
    return lookup.current.lookup;
  };
  const surfaceLookupRef = useLatest(surfaceLookup);
  // Every item's box (E3d), when the interface asks for it: only when the camera or the design changed.
  useFrame(({ camera: cam }) => {
    const report = boxesOut.current;
    // During a gesture only the selected item moves (its box has its own path): the others' boxes stand (speed).
    if (!report || gestureNow.current) return;
    const { design: fromProps, product: p, viewSize: vs } = selectionInputs.current;
    const d = previewDesign.current ?? fromProps;
    cam.updateMatrixWorld();
    const key = JSON.stringify([cam.matrixWorld.elements, cam.projectionMatrix.elements, vs.width, vs.height, d.layers.map((l) => [l.id, l.pieceId, l.position, l.size, l.rotation])]);
    if (key === lastBoxes.current) return;
    lastBoxes.current = key;
    const surface = surfaceLookup(p);
    if (!surface) return;
    const viewProjection = cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse).elements;
    const screen = { viewProjection, position: cam.position.toArray() as [number, number, number], width: vs.width, height: vs.height };
    const boxes: ItemBox[] = [];
    for (const layer of d.layers) {
      const piece = p.pieces.find((x) => x.id === layer.pieceId);
      const on = piece ? projectItem(surface, piece, layer, screen, { outline: false }) : null;
      if (on) boxes.push({ layerId: layer.id, corners: on.corners, centre: on.centre, facing: on.facing });
    }
    report(boxes);
  });
  useFrame(({ camera: cam }) => {
    const report = geometryOut.current;
    if (!report) return;
    const { design: fromProps, product: p, selectedLayerId: id, guides: g, viewSize: vs } = selectionInputs.current;
    const d = previewDesign.current ?? fromProps;
    const layer = id ? d.layers.find((l) => l.id === id) : undefined;
    const piece = layer ? p.pieces.find((x) => x.id === layer.pieceId) : undefined;
    if (!layer || !piece) {
      zoomedFor.current = null;
      rig.setItem(null);
      setItemMin((old) => (old === 0 ? old : 0));
      if (lastGeometry.current !== "none") {
        lastGeometry.current = "none";
        lastProjected.current = null;
        report(null);
      }
      return;
    }
    cam.updateMatrixWorld();
    const key = JSON.stringify([cam.matrixWorld.elements, cam.projectionMatrix.elements, layer.position, layer.size, layer.rotation, layer.pieceId, g, vs.width, vs.height]);
    if (key === lastGeometry.current) return;
    lastGeometry.current = key;
    const surface = surfaceLookup(p);
    if (!surface) {
      report(null);
      return;
    }
    const viewProjection = cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse).elements;
    const screen = { viewProjection, position: cam.position.toArray() as [number, number, number], width: vs.width, height: vs.height };
    const on = projectItem(surface, piece, layer, screen);
    if (!on) {
      lastProjected.current = null;
      report(null);
      return;
    }
    // R24: zooming in aims at the selected item. R22: a small item is zoomed in on once, when nothing is pressed.
    // Not while the item is being dragged, resized or turned: the camera does not chase it (E3e; it moved every frame).
    if (!gestureNow.current && pointersDown.current.size === 0) rig.setItem(on.centreWorld);
    // 4.6: the closest zoom keeps the item, its outset box and its handles inside the free stage.
    // The box grows as the camera nears the item; the rig's distances are to the point it turns round (nearer or
    // farther by the same amount), so the limit is moved by the difference.
    const toItem = cam.position.distanceTo(new Vector3(...on.centreWorld));
    const fits = itemFitDistance(on.corners, toItem, framingNow.current.free);
    // Never further than the rest framing: selecting an item never pushes the camera back past it.
    const limit = fits > 0 ? Math.min(framingNow.current.fit, Math.max(0, fits + (rig.distance() - toItem))) : 0;
    rig.setItemLimit(limit);
    // The orbit controls' own limit (wheel, pinch) follows, but not during a gesture (no re-render per frame).
    if (!gestureNow.current) setItemMin((old) => (Math.abs(old - limit) > 0.01 * Math.max(old, limit) ? limit : old));
    const minPx = selectionInputs.current.selectionMinPx;
    // Only once it faces the camera and no camera move runs (a selection from a list turns the garment first).
    if (zoomedFor.current !== layer.id && on.facing && !rig.animating && pointersDown.current.size === 0 && !gestureNow.current) {
      zoomedFor.current = layer.id;
      if (minPx) rig.zoomToItem(itemLongSide(on.corners), minPx, rig.distance() - toItem);
    }
    // E3e: the zoom the camera made on a small item left it outside the free stage (high on the garment, under the
    // credit line or where the bar goes): back off (it stops by itself at the rest framing).
    if (zoomedFor.current === layer.id && on.facing && !rig.animating && pointersDown.current.size === 0 && !gestureNow.current) {
      const need = itemOverflowFactor(on.corners, framingNow.current.free);
      if (need > ITEM_OVERFLOW_BACKOFF) rig.backOffFromItem(need);
    }
    // The lines (print area, guides) move only with the camera or when they change: projected again only then (S1).
    const linesKey = JSON.stringify([cam.matrixWorld.elements, cam.projectionMatrix.elements, g, vs.width, vs.height]);
    if (projectedLines.current?.key !== linesKey) {
      projectedLines.current = {
        key: linesKey,
        lines: (g ?? []).flatMap((line) => {
          const linePiece = p.pieces.find((x) => x.id === line.pieceId);
          return linePiece ? [{ kind: line.kind, runs: projectPieceLine(surface, linePiece, line.from, line.to, screen) }] : [];
        }),
      };
    }
    const lines = projectedLines.current.lines;
    const geometry: SelectionGeometry = { ...on, layerId: layer.id, guides: lines, width: vs.width, height: vs.height };
    lastProjected.current = geometry;
    report(geometry);
  });

  // Camera commands, for the host's buttons and tools.
  useEffect(() => {
    setHandle(handle, {
      showSide: (side, options) => rig.showSide(side, options?.animate !== false),
      focusOn: (layerId, options) => rig.focusOn(latest.current.design, latest.current.product, layerId, options),
      zoomIn: () => rig.zoom("in"),
      zoomOut: () => rig.zoom("out"),
      resetView: () => rig.reset(),
      turnBy: (degrees) => rig.turnBy(degrees),
      getSide: () => rig.side(),
      preview: (d, options) => previewHandler.current(d, options),
    });
    return () => setHandle(handle, null);
  }, [handle, rig, latest, previewHandler]);

  // The pieces' materials show the pattern texture; their inside shows the colour zones only.
  const inside = usePatternSurface(INSIDE_TEXTURE_SIZE);
  useEffect(() => {
    applyPatternTexture(prepared.pieceMaterials, surface.texture);
    showing.current = surface.texture;
    for (const fabric of prepared.fabrics) fabric.setInsideMap(inside.texture);
    invalidate();
  }, [prepared, surface, inside, invalidate]);

  // The inside texture: the zones without layers, redrawn only when a zone colour changes.
  const { zones } = design;
  const zonesOnly = useMemo<DesignDocument>(
    () => ({
      schemaVersion: 3,
      product: { id: product.id },
      palette: product.palette,
      teamColors: product.teamColors,
      teamName: "",
      samplePlayer: { name: "", number: "" },
      template: null,
      zones,
      fonts: [],
      shapes: [],
      layers: [],
    }),
    [zones, product],
  );
  const [restored, setRestored] = useState(0);
  useEffect(() => {
    redrawPattern(inside, product, zonesOnly, null, null);
    invalidate();
  }, [zonesOnly, product, inside, invalidate, restored]);

  // E3f: the part under the mouse is marked softly through a small second texture on the cloth's emissive channel,
  // drawn only when what is under the pointer changes: the garment's own texture is not redrawn for a hover.
  const hoverSurface = usePatternSurface(HOVER_TEXTURE_SIZE, { mipmaps: false });
  useEffect(() => {
    if (!hover) return;
    clearHoverSurface(hoverSurface);
    setHoverMap(prepared.pieceMaterials, hoverSurface.texture);
    invalidate();
    return () => setHoverMap(prepared.pieceMaterials, null);
  }, [hover, hoverSurface, prepared, invalidate]);
  const drawHover = useLatest((h: Hover | null) => {
    clearHoverSurface(hoverSurface);
    if (h?.kind === "part") drawZoneHighlight(hoverSurface.ctx, product, design, { zoneId: h.zoneId, shapeGroup: h.shapeGroup, alpha: HOVER_ALPHA }, (piece) => pieceTransform(piece, hoverSurface.size), hoverSurface.size / DEFAULT_TEXTURE_SIZE);
    invalidate();
  });

  // Fonts: load what the text needs, and redraw when it arrives (never stay in a fallback silently).
  const [fontsVersion, setFontsVersion] = useState(0);
  const fontStatusRef = useLatest(onFontStatus);
  const [watcher, setWatcher] = useState<FontWatcher | null>(null);
  useEffect(() => {
    const fontSet = fonts === undefined ? defaultFontSet() : fonts;
    if (!fontSet) return;
    const created = new FontWatcher(fontSet, (status) => {
      setFontsVersion((v) => v + 1);
      fontStatusRef.current?.(status);
    });
    setWatcher(created);
    return () => created.dispose();
  }, [fonts, fontStatusRef]);
  useEffect(() => {
    if (watcher) fontStatusRef.current?.(watcher.watch(design));
  }, [watcher, design, fontStatusRef]);

  // Logo images: load from the host's URLs, and redraw when one arrives.
  const [imagesVersion, setImagesVersion] = useState(0);
  // (Created once; it holds only image elements, so it needs no clean-up beyond garbage collection.)
  const [images] = useState(() => new AssetImageCache(() => setImagesVersion((v) => v + 1)));
  useEffect(() => images.watch(design, assetUrl), [images, design, assetUrl]);

  // Document to render: redraw the pattern from the product and the design on every change,
  // when fonts or images arrive, when the selection or the highlight changes, and after the
  // 3D context comes back. The model is not reloaded.
  const onDrawn = useLatest(onTextureDrawn);
  const outlinedLayerId = outlineSelected ? (selectedLayerId ?? null) : null;
  // A gesture's preview, drawn outside React (S1); the selection's handles follow it too.
  const drawPreview = useLatest((d: DesignDocument) => {
    const target = draft.useDraft(gestureNow.current, draftQuality) ? draftSurface : surface;
    const info = redrawPattern(target, product, d, images, outlinedLayerId, highlight);
    draft.drawn(info.drawMs);
    if (showing.current !== target.texture) {
      applyPatternTexture(prepared.pieceMaterials, target.texture);
      showing.current = target.texture;
    }
    invalidate();
  });
  const fullRedraw = useLatest(() => {
    const info = redrawPattern(surface, product, design, images, outlinedLayerId, highlight);
    applyPatternTexture(prepared.pieceMaterials, surface.texture);
    showing.current = surface.texture;
    invalidate();
    onDrawn.current?.(info);
  });
  useEffect(() => {
    previewHandler.current = (d, options) => {
      previewDesign.current = d;
      // Ended without a redraw: the host's next design follows at once; the handles stay where they are till then.
      if (!d && !options?.redraw) return;
      if (d) drawPreview.current(d);
      else fullRedraw.current();
      lastGeometry.current = "";
      invalidate();
    };
  });
  useEffect(() => {
    // A new design from the host replaces any gesture preview.
    previewDesign.current = null;
    // During a slow gesture, the half-size surface; otherwise (and once on release) the full one.
    const useDraft = draft.useDraft(gestureNow.current, draftQuality);
    const target = useDraft ? draftSurface : surface;
    const info = redrawPattern(target, product, design, images, outlinedLayerId, highlight);
    draft.drawn(info.drawMs);
    if (showing.current !== target.texture) {
      applyPatternTexture(prepared.pieceMaterials, target.texture);
      showing.current = target.texture;
    }
    invalidate();
    onDrawn.current?.(info);
  }, [design, product, surface, invalidate, images, outlinedLayerId, fontsVersion, imagesVersion, onDrawn, highlight, restored, draftQuality, draft, draftSurface, prepared, gestureNow]);

  // A gesture's start and end: the policy starts and stops watching; after the end, the full-size frame's time.
  useEffect(() => {
    if (gesture) {
      draft.start(performance.now());
      return;
    }
    const timing = draft.end(performance.now());
    if (!timing) return;
    const ended = performance.now();
    // Back to full quality: one drawing at full size, if the gesture drew drafts.
    if (showing.current !== surface.texture) fullRedraw.current();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        gestureTiming.current?.({ ...timing, fullQualityMs: performance.now() - ended });
      }),
    );
  }, [gesture, draft, gestureTiming, surface, fullRedraw]);

  // The 3D context can be taken away (a phone under memory pressure) and given back (N16).
  const contextEvents = useLatest({ onContextLost, onContextRestored });
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => {
      event.preventDefault(); // lets the browser give the context back
      contextEvents.current.onContextLost?.();
    };
    const back = () => {
      surface.texture.needsUpdate = true;
      inside.texture.needsUpdate = true;
      setRestored((n) => n + 1);
      invalidate();
      contextEvents.current.onContextRestored?.();
    };
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", back);
    return () => {
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", back);
    };
  }, [gl, surface, inside, invalidate, contextEvents]);

  // Pointer on the model. A capture listener on the canvas's parent sees the pointer before the
  // orbit controls (on the canvas) do: a press on a layer becomes a drag; with `pickZones`, a tap
  // chooses the zone under the finger; anything else is left to the orbit controls.
  useEffect(() => {
    const canvas = gl.domElement;
    const host = canvas.parentElement ?? canvas;
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    const meshes = [...prepared.pieceMeshes.keys()];
    const down = pointersDown.current;
    down.clear();
    // E3f: sliding the view: the right button or Shift + drag (a mouse), or two fingers dragged together (touch).
    const fingers = new Map<number, { x: number; y: number }>();
    let slide: { mouse: number | null; x: number; y: number } | null = null;
    const onSlideMove = (event: PointerEvent) => {
      if (!slide) return;
      if (slide.mouse === event.pointerId) {
        rig.panBy(event.clientX - slide.x, event.clientY - slide.y);
        slide.x = event.clientX;
        slide.y = event.clientY;
        return;
      }
      const finger = fingers.get(event.pointerId);
      if (!finger || slide.mouse !== null || fingers.size !== 2) return;
      finger.x = event.clientX;
      finger.y = event.clientY;
      const c = slideCentre(fingers.values());
      rig.panBy(c.x - slide.x, c.y - slide.y);
      slide.x = c.x;
      slide.y = c.y;
    };
    const stopSlide = () => {
      slide = null;
      window.removeEventListener("pointermove", onSlideMove);
      canvas.style.cursor = "";
    };
    const onContextMenu = (event: Event) => event.target === canvas && event.preventDefault();
    let drag: {
      pointerId: number;
      state: LayerDrag;
      position: Point;
      pending: Point | null;
      pointer: { clientX: number; clientY: number } | null;
      frame: number | null;
      free: boolean;
      pxPerMm: number;
      /** Where the press was (client px), and whether the pointer has gone past the slop since (B3). */
      origin: { x: number; y: number };
      moved: boolean;
    } | null = null;
    let tap: { pointerId: number; x: number; y: number; time: number; selects: string | null } | null = null;

    // Screen px per mm at the item, from the last projection (for snapping distances); 2 until known.
    const pxPerMmAt = (layerId: string) => {
      const g = lastProjected.current;
      return g && g.layerId === layerId ? g.pxPerMm : 2;
    };

    // Picking (S1): a bounding-volume hierarchy per mesh, built when the browser is idle after the model is
    // ready; until then (and if it fails) three.js's own raycast, which tests every triangle.
    let bvhs: Map<Mesh, PickBvh> | null = null;
    const buildBvhs = () => {
      try {
        const built = new Map<Mesh, PickBvh>();
        for (const mesh of meshes) {
          const position = mesh.geometry.getAttribute("position");
          const uv = mesh.geometry.getAttribute("uv");
          const positions = new Float32Array(position.count * 3);
          for (let v = 0; v < position.count; v++) {
            positions[3 * v] = position.getX(v);
            positions[3 * v + 1] = position.getY(v);
            positions[3 * v + 2] = position.getZ(v);
          }
          let uvs: Float32Array | null = null;
          if (uv) {
            uvs = new Float32Array(uv.count * 2);
            for (let v = 0; v < uv.count; v++) {
              uvs[2 * v] = uv.getX(v);
              uvs[2 * v + 1] = uv.getY(v);
            }
          }
          const index = mesh.geometry.getIndex();
          built.set(mesh, buildPickBvh(positions, index ? (index.array as ArrayLike<number>) : null, uvs));
        }
        bvhs = built;
      } catch (error) {
        console.error("[editor] picking tree:", error);
      }
    };
    const idle = (globalThis as { requestIdleCallback?: (fn: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
    const bvhTimer = idle ? null : setTimeout(buildBvhs, 300);
    const bvhIdle = idle ? idle(buildBvhs, { timeout: 2000 }) : null;
    const inverse = new Matrix4();
    const localO = new Vector3();
    const localT = new Vector3();
    const pick = (): { object: Mesh; uv: { x: number; y: number } | null } | null => {
      if (!bvhs) {
        const [first] = raycaster.intersectObjects(meshes, false);
        return first ? { object: first.object as Mesh, uv: first.uv ?? null } : null;
      }
      let best: { object: Mesh; uv: { x: number; y: number } | null; distance: number } | null = null;
      for (const [mesh, bvh] of bvhs) {
        if (!mesh.visible) continue;
        inverse.copy(mesh.matrixWorld).invert();
        // The ray into the mesh's own space, keeping its length scale, so distances compare across meshes.
        localO.copy(raycaster.ray.origin).applyMatrix4(inverse);
        localT.copy(raycaster.ray.origin).add(raycaster.ray.direction).applyMatrix4(inverse).sub(localO);
        const hit = pickBvh(bvh, [localO.x, localO.y, localO.z], [localT.x, localT.y, localT.z]);
        if (hit && (!best || hit.distance < best.distance)) best = { object: mesh, uv: hit.uv, distance: hit.distance };
      }
      return best;
    };

    const hitAt = (event: { clientX: number; clientY: number }) => {
      const rect = canvas.getBoundingClientRect();
      ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const first = pick();
      const name = first && prepared.pieceMeshes.get(first.object as Mesh);
      if (!first?.uv || !name) return null;
      return pieceAtMeshUv(latest.current.product, name, { u: first.uv.x, v: first.uv.y });
    };

    const emit = (phase: LayerDragEvent["phase"], position: Point) => {
      if (!drag) return;
      latest.current.onLayerDrag?.({ phase, layerId: drag.state.layerId, pieceId: drag.state.pieceId, position, free: drag.free, pxPerMm: drag.pxPerMm, ...(phase === "end" ? { moved: drag.moved } : {}) });
    };

    // The ray to the model is cast once per frame, for the latest pointer position (pointer events can come
    // faster than frames, and a ray against the whole garment is the costly part of a move).
    const flush = () => {
      if (!drag) return;
      drag.frame = null;
      const at = drag.pointer;
      drag.pointer = null;
      if (at) {
        const next = dragPosition(latest.current.product, drag.state, hitAt(at));
        if (next) drag.pending = { x: round3(next.x), y: round3(next.y) };
      }
      if (drag.pending) {
        drag.position = drag.pending;
        drag.pending = null;
        emit("move", drag.position);
      }
    };

    const onMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      drag.free = event.altKey;
      // Until the pointer really travels, nothing moves (a click is not a move, B3).
      if (!drag.moved && !travelledPast(drag.origin, { x: event.clientX, y: event.clientY })) return;
      drag.moved = true;
      drag.pointer = { clientX: event.clientX, clientY: event.clientY };
      drag.frame ??= requestAnimationFrame(flush);
    };

    const finish = (event: PointerEvent, phase: "end" | "cancel") => {
      down.delete(event.pointerId);
      fingers.delete(event.pointerId);
      if (slide && (slide.mouse === event.pointerId || (slide.mouse === null && fingers.size < 2))) stopSlide();
      // Anything waiting for the pointer to lift (R22's zoom on a small item) gets a frame.
      if (down.size === 0) invalidate();
      if (tap && event.pointerId === tap.pointerId) {
        const t = tap;
        tap = null;
        const still = Math.hypot(event.clientX - t.x, event.clientY - t.y) <= TAP_SLOP_PX && performance.now() - t.time < TAP_MAX_MS;
        if (phase === "end" && still) {
          const hit = hitAt(event);
          const { design: current, product: currentProduct, onZoneTap: zoneTap, pickZones: zonesNow, onSelectLayer: select } = latest.current;
          // A tap selects the item under it (select first), or deselects on empty fabric or the stage.
          const outcome = tapOutcome({ pickZones: zonesNow, selects: t.selects, onFabric: Boolean(hit) });
          select?.(outcome.select);
          // E3f: a tap on bare fabric (no item under it) chooses the part from any tool; on the stage, it lets go.
          if (zoneTap && outcome.part) {
            if (hit) {
              const background = backgroundAt(currentProduct, current, hit.piece.id, hit.point);
              const rect = canvas.getBoundingClientRect();
              zoneTap({
                pieceId: hit.piece.id,
                zoneId: background?.kind === "zone" ? background.zoneId : null,
                shapeGroup: background?.kind === "shape" ? background.group : null,
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
              });
            } else zoneTap(null);
          }
        }
      }
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (drag.frame !== null) cancelAnimationFrame(drag.frame);
      if (phase === "end" && (drag.moved || travelledPast(drag.origin, { x: event.clientX, y: event.clientY }))) {
        drag.moved = true;
        drag.pointer ??= { clientX: event.clientX, clientY: event.clientY };
        flush();
      }
      emit(phase, drag.position);
      drag = null;
      window.removeEventListener("pointermove", onMove);
      const controlsNow = latest.current.controls;
      if (controlsNow) controlsNow.enabled = true;
      canvas.style.cursor = "";
    };
    // E3f: hover (a mouse only). The ray is cast at most once per frame for the latest position; the scene is
    // redrawn only when the thing under the pointer changes (HoverTracker).
    let hoverAt: { x: number; y: number; layerId: string | null } = { x: 0, y: 0, layerId: null };
    let shownPart = false;
    const itemCorners = (layerId: string): ScreenPoint[] | undefined => {
      const { design: current, product: p } = latest.current;
      const layer = current.layers.find((l) => l.id === layerId);
      const piece = layer ? p.pieces.find((x) => x.id === layer.pieceId) : undefined;
      const surface = piece ? surfaceLookupRef.current(p) : null;
      if (!layer || !piece || !surface) return undefined;
      camera.updateMatrixWorld();
      const rect = canvas.getBoundingClientRect();
      const viewProjection = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse).elements;
      return projectItem(surface, piece, layer, { viewProjection, position: camera.position.toArray() as [number, number, number], width: rect.width, height: rect.height }, { outline: false })?.corners;
    };
    const tracker = new HoverTracker((h) => {
      if (h?.kind === "part" || shownPart) drawHover.current(h);
      shownPart = h?.kind === "part";
      canvas.style.cursor = h ? (h.kind === "item" && h.selected ? "grab" : "pointer") : "";
      latest.current.onHover?.(h ? { ...h, x: hoverAt.x, y: hoverAt.y, ...(h.kind === "item" ? { corners: itemCorners(h.layerId) } : {}) } : null);
    });
    let hoverEvent: { clientX: number; clientY: number } | null = null;
    let hoverFrame: number | null = null;
    const runHover = () => {
      hoverFrame = null;
      const at = hoverEvent;
      hoverEvent = null;
      if (!at || !latest.current.hover) return;
      const hit = hitAt(at);
      if (!hit) {
        tracker.set(null);
        return;
      }
      const { design: current, product: p, touchSlopMm: slop, selectedLayerId: selectedNow } = latest.current;
      const rect = canvas.getBoundingClientRect();
      const under = layerAtPoint(current, hit.piece.id, hit.point, slop);
      hoverAt = { x: at.clientX - rect.left, y: at.clientY - rect.top, layerId: under?.id ?? null };
      if (under) {
        tracker.set({ kind: "item", layerId: under.id, selected: under.id === selectedNow });
        return;
      }
      const background = backgroundAt(p, current, hit.piece.id, hit.point);
      tracker.set(background ? { kind: "part", zoneId: background.kind === "zone" ? background.zoneId : null, shapeGroup: background.kind === "shape" ? background.group : null } : null);
    };
    const onHoverMove = (event: PointerEvent) => {
      if (!latest.current.hover) return;
      if (event.target !== canvas || !hoverAllowed(event, { dragging: drag !== null, placing: gestureNow.current, sliding: slide !== null })) {
        tracker.set(null);
        return;
      }
      hoverEvent = { clientX: event.clientX, clientY: event.clientY };
      hoverFrame ??= requestAnimationFrame(runHover);
    };
    const onHoverEnd = () => {
      hoverEvent = null;
      tracker.set(null);
    };
    const onUp = (event: PointerEvent) => finish(event, "end");
    const onCancel = (event: PointerEvent) => finish(event, "cancel");

    const onDown = (event: PointerEvent) => {
      const busy = down.size > 0;
      down.add(event.pointerId);
      onHoverEnd();
      if (event.pointerType === "touch") {
        fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (fingers.size === 2) {
          const c = slideCentre(fingers.values());
          slide = { mouse: null, x: c.x, y: c.y };
          window.addEventListener("pointermove", onSlideMove);
        }
      }
      const { design: current, onSelectLayer: select, onLayerDrag: dragHandler, touchSlopMm: slop, pickZones: zones } = latest.current;
      if (drag) {
        // A second finger during a drag ends the drag (cancelled: the item goes back; two fingers move the
        // camera, never the item), and is kept from the orbit controls, which did not see the first finger.
        event.stopPropagation();
        const first = drag;
        if (first.frame !== null) cancelAnimationFrame(first.frame);
        emit("cancel", first.position);
        drag = null;
        down.delete(first.pointerId);
        window.removeEventListener("pointermove", onMove);
        const controlsNow = latest.current.controls;
        if (controlsNow) controlsNow.enabled = true;
        canvas.style.cursor = "";
        return;
      }
      if (busy) {
        tap = null; // two fingers: a pinch, not a tap
        return;
      }
      // Presses on the handles drawn over the canvas are theirs, not the model's.
      if (event.target !== canvas) return;
      if (event.pointerType !== "touch" && (event.button === 2 || (event.button === 0 && event.shiftKey))) {
        // E3f: slide the view; the orbit controls (turning) never see this press, nor does an item.
        event.stopPropagation();
        event.preventDefault();
        slide = { mouse: event.pointerId, x: event.clientX, y: event.clientY };
        canvas.style.cursor = "move";
        window.addEventListener("pointermove", onSlideMove);
        return;
      }
      if (event.button !== 0) return;
      const hit = zones ? null : hitAt(event);
      const under = hit ? layerAtPoint(current, hit.piece.id, hit.point, slop) : null;
      const action = pressAction({
        pointerType: event.pointerType,
        hitLayerId: under?.id ?? null,
        selectedId: latest.current.selectedLayerId ?? null,
        dragOnlySelected: latest.current.dragOnlySelected,
        pickZones: zones,
        canDrag: Boolean(dragHandler),
      });
      if (action.kind === "turn") {
        // Left to the orbit controls (they turn the garment if it moves); a tap selects or chooses the zone.
        if (select || zones) tap = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), selects: action.tapSelects };
        return;
      }
      const layer = under;
      if (!hit || !layer) return;
      event.stopPropagation();
      event.preventDefault();
      select?.(layer.id);
      if (!dragHandler) return;
      drag = {
        pointerId: event.pointerId,
        state: startLayerDrag(layer, hit.point),
        position: layer.position,
        pending: null,
        pointer: null,
        frame: null,
        free: event.altKey,
        pxPerMm: pxPerMmAt(layer.id),
        origin: { x: event.clientX, y: event.clientY },
        moved: false,
      };
      const controlsNow = latest.current.controls;
      if (controlsNow) controlsNow.enabled = false;
      canvas.style.cursor = "grabbing";
      window.addEventListener("pointermove", onMove);
      emit("start", layer.position);
    };

    // R24: without a selection the wheel zooms towards the height under the pointer (the controls do the zoom).
    const onWheel = (event: WheelEvent) => {
      onHoverEnd();
      if (latest.current.selectedLayerId) return;
      const r = canvas.getBoundingClientRect();
      const free = latest.current.free;
      rig.aimAtPointer((event.clientY - r.top - free.y) / Math.max(1, free.height));
    };
    host.addEventListener("wheel", onWheel, { capture: true, passive: true });
    host.addEventListener("pointerdown", onDown, { capture: true });
    host.addEventListener("contextmenu", onContextMenu);
    host.addEventListener("pointermove", onHoverMove);
    host.addEventListener("pointerleave", onHoverEnd);
    window.addEventListener("pointerup", onUp, { capture: true });
    window.addEventListener("pointercancel", onCancel, { capture: true });
    return () => {
      if (bvhTimer !== null) clearTimeout(bvhTimer);
      if (bvhIdle !== null) (globalThis as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(bvhIdle);
      host.removeEventListener("wheel", onWheel, { capture: true });
      host.removeEventListener("pointerdown", onDown, { capture: true });
      host.removeEventListener("contextmenu", onContextMenu);
      host.removeEventListener("pointermove", onHoverMove);
      host.removeEventListener("pointerleave", onHoverEnd);
      if (hoverFrame !== null) cancelAnimationFrame(hoverFrame);
      stopSlide();
      window.removeEventListener("pointerup", onUp, { capture: true });
      window.removeEventListener("pointercancel", onCancel, { capture: true });
      window.removeEventListener("pointermove", onMove);
      if (drag?.frame != null) cancelAnimationFrame(drag.frame);
    };
  }, [gl, camera, prepared, latest, lastProjected, rig, invalidate, drawHover, gestureNow, surfaceLookupRef]);

  // Dispose of the cloned materials when the model goes away.
  useEffect(() => {
    const materials = prepared.materials;
    return () => materials.forEach((m) => m.dispose());
  }, [prepared]);

  // The coach turning or zooming by hand: stop any camera move of ours, and tell the host.
  const onStart = () => {
    rig.userStart();
    callbacks.current.onUserTurn?.("start", false);
  };
  const onEnd = () => {
    const moved = rig.userEnd();
    callbacks.current.onUserTurn?.("end", moved);
  };

  return (
    <>
      <StudioLights target={center} distance={fit} />
      <primitive object={prepared.scene} />
      <OrbitControls
        makeDefault
        target={center}
        enablePan={false}
        minDistance={Math.min(framing.maxDistance, Math.max(framing.minDistance, selectedLayerId ? itemMin : 0))}
        maxDistance={framing.maxDistance}
        minPolarAngle={framing.minPolarAngle}
        maxPolarAngle={framing.maxPolarAngle}
        enableDamping={false}
        onStart={onStart}
        onEnd={onEnd}
      />
    </>
  );
}

/** The studio's lights (see studio.ts): a sky light, and directional lights that follow the camera. */
function StudioLights({ target, distance }: { target: [number, number, number]; distance: number }) {
  const lights = useRef<Array<DirectionalLight | null>>([]);
  useFrame(({ camera }) => {
    const cameraAt = camera.position.toArray() as [number, number, number];
    STUDIO_LIGHTS.lights.forEach((spec, k) => {
      const light = lights.current[k];
      if (!light) return;
      light.position.set(...studioLightPosition(spec, cameraAt, target, distance));
      light.target.position.set(...target);
      light.target.updateMatrixWorld();
    });
  });
  return (
    <>
      <hemisphereLight args={[STUDIO_LIGHTS.sky.color, STUDIO_LIGHTS.sky.ground, STUDIO_LIGHTS.sky.intensity]} />
      {STUDIO_LIGHTS.lights.map((spec, k) => (
        <directionalLight
          key={spec.name}
          ref={(light) => {
            lights.current[k] = light;
          }}
          color={spec.color}
          intensity={spec.intensity}
        />
      ))}
    </>
  );
}

class ModelErrorBoundary extends Component<
  { onError?: (error: Error) => void; fallback?: ReactNode; children: ReactNode },
  { error: Error | null }
> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }

  override render() {
    if (this.state.error) {
      if (this.props.fallback !== undefined) return this.props.fallback;
      return (
        <div role="alert" style={{ padding: 16, font: "14px system-ui, sans-serif" }}>
          The 3D model could not be shown: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

/** Throws a load error inside the error boundary, so a failed model and a failed 3D context end in one place. */
function Throw({ error }: { error: Error }): never {
  throw error;
}

/**
 * Shows a product's 3D model with the design drawn on it: the pattern pieces,
 * coloured per zone, and the design's text, numbers and logos, drawn into a
 * texture from the product definition and the design every time the design
 * changes. Drag (one finger) to turn the garment, wheel or pinch to zoom.
 * With `onLayerDrag`, pressing a layer drags it instead. Renders only when
 * something changes, to save battery.
 */
export function DesignCanvas({ className, style, onError, errorFallback, onLoadProgress, onModelReady, ref, ...view }: DesignCanvasProps) {
  const handle = useRef<DesignCanvasHandle | null>(null);
  useImperativeHandle(
    ref,
    () => ({
      showSide: (side, options) => handle.current?.showSide(side, options),
      focusOn: (layerId, options) => handle.current?.focusOn(layerId, options),
      zoomIn: () => handle.current?.zoomIn(),
      zoomOut: () => handle.current?.zoomOut(),
      resetView: () => handle.current?.resetView(),
      turnBy: (degrees) => handle.current?.turnBy(degrees),
      getSide: () => handle.current?.getSide() ?? null,
      preview: (design, options) => handle.current?.preview(design, options),
    }),
    [],
  );
  const url = view.product.model.url;
  const [loaded, setLoaded] = useState<{ url: string; model: LoadedModel | null; error: Error | null } | null>(null);
  const callbacks = useLatest({ onLoadProgress, onModelReady });
  useEffect(() => {
    let alive = true;
    const { promise, unsubscribe } = loadModel(url, { onProgress: (p) => callbacks.current.onLoadProgress?.(p) });
    promise.then(
      (model) => {
        if (!alive) return;
        setLoaded({ url, model, error: null });
        callbacks.current.onModelReady?.(model);
      },
      (error: Error) => {
        if (alive) setLoaded({ url, model: null, error });
      },
    );
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [url, callbacks]);
  const current = loaded?.url === url ? loaded : null;
  return (
    <div className={className} style={{ width: "100%", height: "100%", minHeight: 240, background: STUDIO_BACKGROUND, ...style }}>
      <ModelErrorBoundary onError={onError} fallback={errorFallback}>
        {current?.error ? (
          <Throw error={current.error} />
        ) : (
          <Canvas
            frameloop="demand"
            dpr={[1, 2]}
            camera={{ fov: FOV, near: 0.05, far: 50, position: [0, 0.4, 2] }}
            // Neutral tone mapping (Khronos PBR Neutral) keeps the palette's colours true where the light is
            // even, and rolls highlights off softly instead of clipping them to flat white.
            gl={{ antialias: true, preserveDrawingBuffer: false, toneMapping: NeutralToneMapping }}
          >
            {current?.model && <ModelView {...view} model={current.model} handle={handle} />}
          </Canvas>
        )}
      </ModelErrorBoundary>
    </div>
  );
}
