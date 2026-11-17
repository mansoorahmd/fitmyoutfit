/**
 * The 3D view's camera (N7): framing in the free area, animated turns and
 * zooms, a focus on the item being typed, and what the coach does by hand.
 * A plain object the canvas owns, changed in place between frames (React
 * state would re-render on every animation frame). The maths is in camera.ts.
 */
import type { PerspectiveCamera } from "three";
import type { DesignDocument, ProductDefinition } from "../design/schema.js";
import { layerSide } from "../design/roles.js";
import {
  CAMERA_REFRAME_MS,
  CAMERA_TURN_MS,
  SIDE_AZIMUTH,
  SIDE_POLAR,
  canZoom,
  easeInOut,
  easeOut,
  focusOffsetY,
  orbitOf,
  orbitPosition,
  sideFromAzimuth,
  tweenOrbit,
  zoomedDistance,
  type Framing,
  type Orbit,
  type ViewSideName,
} from "./camera.js";

interface Offset {
  x: number;
  y: number;
}

export interface CameraRigInfo {
  side: ViewSideName | null;
  canZoomIn: boolean;
  canZoomOut: boolean;
}

export interface CameraRigConfig {
  framing: Framing;
  viewport: { width: number; height: number };
  reducedMotion: boolean;
  onChange?: (info: CameraRigInfo) => void;
  fovDegrees: number;
  /** The point the camera looks at and turns round moved (E3d, R24): the orbit controls take it as their target. */
  onTarget?: (target: [number, number, number]) => void;
}

/**
 * E3d (07-editor-review R24, 4.6): how far the camera's target moves from the garment's centre towards `goal` (world
 * units along the garment's vertical axis) at a zoom (`factor`: the distance over the fitting distance). Nothing
 * at the rest framing or further out; all of it from 0.75 in; never so far that the garment's centre leaves the
 * view (`halfView`: half the free area's height in world units at that distance, 0.85 of it at most).
 */
export function aimFor(goal: number, factor: number, halfView: number): number {
  const weight = Math.min(1, Math.max(0, (1 - factor) / 0.25));
  const limit = 0.85 * Math.max(0, halfView);
  return Math.max(-limit, Math.min(limit, goal * weight));
}

type V3 = [number, number, number];

/**
 * The same in three dimensions (an item off the centre line, a logo on the left chest): up and down as `aimFor`
 * against half the free height, across (x and z together) against half the free width.
 */
export function aimVectorFor(goal: V3, factor: number, halfHeight: number, halfWidth: number): V3 {
  const y = aimFor(goal[1], factor, halfHeight);
  const weight = Math.min(1, Math.max(0, (1 - factor) / 0.25));
  const across = Math.hypot(goal[0], goal[2]) * weight;
  const limit = 0.85 * Math.max(0, halfWidth);
  const k = across > limit && across > 0 ? limit / across : 1;
  return [goal[0] * weight * k, y, goal[2] * weight * k];
}

const ZERO: V3 = [0, 0, 0];
const near = (a: V3, b: V3, eps: number) => Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps && Math.abs(a[2] - b[2]) < eps;

export class CameraRig {
  private anim: { from: Orbit; to: Orbit; fromOffset: Offset; toOffset: Offset; fromAim: V3; toAim: V3; start: number; duration: number; ease: (t: number) => number } | null = null;
  /** E3d (R24): the target's offset from the garment's centre (world units), and what it aims at. */
  private aim: V3 = ZERO;
  private item: V3 | null = null;
  private pointerY: number | null = null;
  /** E3d (4.6): the closest the camera may come while an item is selected (its box and handles stay in view). */
  private itemMin = 0;
  /** E3d (R22): the zoom before the camera zoomed in on a small selected item (restored when it is let go). */
  private itemZoom: { restore: number; factor: number } | null = null;
  /** The coach's zoom, as a share of the fitting distance (1: fits the free area). */
  private zoomFactor = 1;
  /** The extra offset of a focus on an item, and the zoom before it. */
  private focus: { offset: Offset; restoreZoom: number } | null = null;
  private offset: Offset = { x: 0, y: 0 };
  private lastInfo = "";
  private turnStart: Orbit | null = null;
  private model: unknown = null;
  private config: CameraRigConfig | null = null;
  private center: [number, number, number] = [0, 0, 0];
  private size: [number, number, number] = [1, 1, 1];

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly invalidate: () => void,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** Takes the latest framing and settings, and re-frames when the free area or the model changed. */
  update(model: unknown, center: [number, number, number], size: [number, number, number], config: CameraRigConfig): void {
    const previous = this.config;
    this.config = config;
    this.center = center;
    this.size = size;
    if (this.model !== model) {
      this.model = model;
      this.zoomFactor = 1;
      this.focus = null;
      this.anim = null;
      this.aim = ZERO;
      this.itemZoom = null;
      this.pointerY = null;
      this.place({ azimuth: SIDE_AZIMUTH.front, polar: SIDE_POLAR, distance: config.framing.fit }, { ...config.framing.offset });
      this.invalidate();
      this.report();
      return;
    }
    const resized = !previous || previous.viewport.width !== config.viewport.width || previous.viewport.height !== config.viewport.height;
    const moved = !previous || resized || previous.framing.fit !== config.framing.fit || previous.framing.offset.x !== config.framing.offset.x || previous.framing.offset.y !== config.framing.offset.y;
    if (!moved) return;
    const orbit = this.anim ? this.anim.to : this.orbit();
    // A new canvas size takes effect at once (the projection must match the canvas); a panel moving is animated.
    this.moveTo({ ...orbit, distance: config.framing.fit * this.zoomFactor }, this.targetOffset(), resized ? 0 : CAMERA_REFRAME_MS, easeOut);
  }

  /** Advances an animation; called every frame. */
  frame(): void {
    const anim = this.anim;
    if (!anim) {
      this.followAim();
      return;
    }
    const t = Math.min(1, (this.now() - anim.start) / anim.duration);
    const k = anim.ease(t);
    this.aim = [0, 1, 2].map((i) => anim.fromAim[i]! + (anim.toAim[i]! - anim.fromAim[i]!) * k) as V3;
    this.place(tweenOrbit(anim.from, anim.to, k), { x: anim.fromOffset.x + (anim.toOffset.x - anim.fromOffset.x) * k, y: anim.fromOffset.y + (anim.toOffset.y - anim.fromOffset.y) * k });
    if (t >= 1) {
      this.anim = null;
      this.report();
    } else this.invalidate();
  }

  get animating(): boolean {
    return this.anim !== null;
  }

  showSide(side: ViewSideName, animate = true): void {
    const from = this.anim ? this.anim.to : this.orbit();
    this.moveTo({ azimuth: SIDE_AZIMUTH[side], polar: SIDE_POLAR, distance: from.distance }, this.targetOffset(), animate ? CAMERA_TURN_MS : 0, easeInOut);
  }

  /** Turns to a layer's side; with `zoom`, zooms in on its height. `null`: back from such a zoom. */
  focusOn(design: DesignDocument, product: ProductDefinition, layerId: string | null, options: { zoom?: boolean; animate?: boolean } = {}): void {
    const f = this.config?.framing;
    if (!f) return;
    if (layerId === null) {
      if (!this.focus) return;
      this.zoomFactor = this.focus.restoreZoom;
      this.focus = null;
      const from = this.anim ? this.anim.to : this.orbit();
      this.moveTo({ ...from, distance: f.fit * this.zoomFactor }, this.targetOffset(), CAMERA_REFRAME_MS, easeOut);
      return;
    }
    const layer = design.layers.find((l) => l.id === layerId);
    if (!layer) return;
    const side = layerSide(product, layer) ?? "front";
    const from = this.anim ? this.anim.to : this.orbit();
    let distance = from.distance;
    if (options.zoom) {
      const piece = product.pieces.find((p) => p.id === layer.pieceId);
      const restoreZoom = this.focus?.restoreZoom ?? this.zoomFactor;
      this.zoomFactor = Math.max(f.minDistance / f.fit, 0.62);
      distance = f.fit * this.zoomFactor;
      const fraction = piece ? layer.position.y / piece.height : 0.5;
      this.focus = { offset: { x: 0, y: focusOffsetY(this.size[1], fraction, distance, this.config!.fovDegrees, f.free.height) }, restoreZoom };
    }
    this.moveTo({ azimuth: SIDE_AZIMUTH[side], polar: SIDE_POLAR, distance }, this.targetOffset(), options.animate === false ? 0 : CAMERA_TURN_MS, easeInOut);
  }

  zoom(direction: "in" | "out"): void {
    const f = this.config?.framing;
    if (!f) return;
    const from = this.anim ? this.anim.to : this.orbit();
    const distance = zoomedDistance(from.distance, direction, { minDistance: Math.min(from.distance, this.minDistance()), maxDistance: f.maxDistance });
    this.zoomFactor = distance / f.fit;
    this.pointerY = null;
    this.moveTo({ ...from, distance }, this.targetOffset(), CAMERA_REFRAME_MS, easeOut);
  }

  reset(): void {
    const f = this.config?.framing;
    if (!f) return;
    this.zoomFactor = 1;
    this.focus = null;
    this.pointerY = null;
    this.itemZoom = null;
    this.moveTo({ azimuth: SIDE_AZIMUTH.front, polar: SIDE_POLAR, distance: f.fit }, this.targetOffset(), CAMERA_TURN_MS, easeInOut);
  }

  /**
   * E3d (R24): the selected item's centre (world), or null. Zooming in then aims at it; without one, the wheel
   * aims at the point under the pointer (`aimAtPointer`) and the buttons at the garment's centre. Letting the
   * item go gives back a zoom the camera made for it (R22).
   */
  setItem(world: readonly [number, number, number] | null): void {
    const next: V3 | null = world === null ? null : [world[0] - this.center[0], world[1] - this.center[1], world[2] - this.center[2]];
    if (next === null ? this.item === null : this.item !== null && near(next, this.item, 1e-6)) return;
    const released = next === null && this.item !== null;
    this.item = next;
    if (next === null) this.itemMin = 0;
    if (next !== null) this.pointerY = null;
    if (released) this.releaseItemZoom();
    this.invalidate();
  }

  /**
   * E3d (4.6): the distance under which the selected item's box and handles would no longer fit the free stage
   * (0: no limit). Zooming in stops there; the zoom buttons say so.
   */
  setItemLimit(distance: number): void {
    if (Math.abs(distance - this.itemMin) <= 0.01 * Math.max(distance, this.itemMin)) return;
    this.itemMin = distance;
    this.report();
  }

  /** The camera's distance to the point it turns round. */
  distance(): number {
    return this.orbit().distance;
  }

  /** The closest the camera may come now: the framing's limit, or the selected item's (never past the farthest). */
  minDistance(): number {
    const f = this.config?.framing;
    if (!f) return 0;
    return Math.min(f.maxDistance, Math.max(f.minDistance, this.itemMin));
  }

  /** E3d (R24): the wheel zooms towards the height under the pointer (`fraction`: 0 the free area's top, 1 its bottom). */
  aimAtPointer(fraction: number): void {
    if (!this.config || this.item !== null) return;
    const half = this.halfView(this.orbit().distance);
    this.pointerY = this.aim[1] + (0.5 - Math.min(1, Math.max(0, fraction))) * 2 * half;
  }

  /**
   * E3d (R22, 4.6): zooms in on the selected item until its box is `minPx` on its longer side (or the zoom limit),
   * when it is smaller (`longPx` now). `nearer`: how much nearer the camera the item is than the point it turns
   * round (its box grows with the camera's distance to it; zoomed in, the camera aims at the item itself). The
   * zoom before is restored when the item is let go, unless the coach zoomed in between.
   */
  zoomToItem(longPx: number, minPx: number, nearer = 0): void {
    const f = this.config?.framing;
    if (!f || longPx <= 0 || longPx >= minPx || this.focus) return;
    const from = this.anim ? this.anim.to : this.orbit();
    // 3% past the minimum: perspective on a turned piece leaves the box a pixel or two short otherwise.
    const distance = Math.max(this.minDistance(), ((from.distance - nearer) * longPx) / (minPx * 1.03));
    if (distance >= from.distance - 1e-6) return;
    const restore = this.itemZoom?.restore ?? this.zoomFactor;
    this.zoomFactor = distance / f.fit;
    this.itemZoom = { restore, factor: this.zoomFactor };
    this.moveTo({ ...from, distance }, this.targetOffset(), CAMERA_REFRAME_MS * 1.5, easeOut);
  }

  private releaseItemZoom(): void {
    const f = this.config?.framing;
    const held = this.itemZoom;
    this.itemZoom = null;
    if (!f || !held || Math.abs(this.zoomFactor - held.factor) > 1e-3) return;
    this.zoomFactor = held.restore;
    const from = this.anim ? this.anim.to : this.orbit();
    this.moveTo({ ...from, distance: f.fit * this.zoomFactor }, this.targetOffset(), CAMERA_REFRAME_MS, easeOut);
  }

  /** Half the free area's height (or width) in world units at a distance. */
  private halfView(distance: number, across = false): number {
    const f = this.config?.framing;
    const viewport = this.config?.viewport;
    if (!f || !viewport) return 0;
    return distance * Math.tan(((this.config?.fovDegrees ?? 35) * Math.PI) / 360) * ((across ? f.free.width : f.free.height) / Math.max(1, viewport.height));
  }

  /** The aim for a camera distance: towards the item (or the pointer); none while typing zooms in (it has its own offset). */
  private aimAt(distance: number): V3 {
    const f = this.config?.framing;
    if (!f || this.focus) return ZERO;
    const goal: V3 = this.item ?? [0, this.pointerY ?? 0, 0];
    return aimVectorFor(goal, distance / f.fit, this.halfView(distance), this.halfView(distance, true));
  }

  /** After a zoom by hand (wheel, pinch) or a new aim: the target follows at once, the camera keeping its angle. */
  private followAim(): void {
    const orbit = this.orbit();
    const want = this.aimAt(orbit.distance);
    if (near(want, this.aim, 1e-5)) return;
    this.aim = want;
    this.place(orbit, this.offset);
    this.invalidate();
  }

  turnBy(degrees: number): void {
    const from = this.anim ? this.anim.to : this.orbit();
    this.moveTo({ ...from, azimuth: from.azimuth + (degrees * Math.PI) / 180 }, this.targetOffset(), CAMERA_REFRAME_MS, easeOut);
  }

  side(): ViewSideName | null {
    return sideFromAzimuth(this.orbit().azimuth);
  }

  /** The coach started turning or zooming by hand: our own move stops. */
  userStart(): void {
    this.anim = null;
    this.turnStart = this.orbit();
  }

  /** The coach let go. Returns whether the camera actually moved (a tap does not). */
  userEnd(): boolean {
    const start = this.turnStart;
    this.turnStart = null;
    const now = this.orbit();
    const moved = !!start && (Math.abs(start.azimuth - now.azimuth) > 1e-3 || Math.abs(start.polar - now.polar) > 1e-3 || Math.abs(start.distance - now.distance) > 1e-4);
    if (moved && this.config) {
      this.zoomFactor = now.distance / this.config.framing.fit;
      if (this.focus) {
        this.focus = null;
        this.place(now, this.targetOffset());
      }
    }
    this.report();
    return moved;
  }

  private targetOffset(): Offset {
    const f = this.config?.framing.offset ?? { x: 0, y: 0 };
    const focus = this.focus?.offset ?? { x: 0, y: 0 };
    return { x: f.x + focus.x, y: f.y + focus.y };
  }

  /** The point the camera looks at: the garment's centre, moved by the aim (R24). */
  private target(): [number, number, number] {
    return [this.center[0] + this.aim[0], this.center[1] + this.aim[1], this.center[2] + this.aim[2]];
  }

  private orbit(): Orbit {
    return orbitOf(this.target(), this.camera.position.toArray() as [number, number, number]);
  }

  private place(orbit: Orbit, offset: Offset): void {
    const camera = this.camera;
    const target = this.target();
    camera.position.set(...orbitPosition(target, orbit));
    camera.lookAt(target[0], target[1], target[2]);
    this.config?.onTarget?.(target);
    const viewport = this.config?.viewport ?? { width: 1, height: 1 };
    if (Math.abs(offset.x) < 0.01 && Math.abs(offset.y) < 0.01) camera.clearViewOffset();
    else camera.setViewOffset(viewport.width, viewport.height, offset.x, offset.y, viewport.width, viewport.height);
    camera.updateProjectionMatrix();
    this.offset = offset;
  }

  private moveTo(to: Orbit, toOffset: Offset, duration: number, ease: (t: number) => number): void {
    const ms = this.config?.reducedMotion ? 0 : duration;
    const toAim = this.aimAt(to.distance);
    if (ms <= 0) {
      this.anim = null;
      this.aim = toAim;
      this.place(to, toOffset);
      this.invalidate();
      this.report();
      return;
    }
    this.anim = { from: this.orbit(), to, fromOffset: { ...this.offset }, toOffset, fromAim: this.aim, toAim, start: this.now(), duration: ms, ease };
    this.invalidate();
  }

  private report(): void {
    const f = this.config?.framing;
    if (!f) return;
    const orbit = this.orbit();
    const zoom = canZoom(orbit.distance, { minDistance: this.minDistance(), maxDistance: f.maxDistance });
    const info: CameraRigInfo = { side: sideFromAzimuth(orbit.azimuth), canZoomIn: zoom.in, canZoomOut: zoom.out };
    const key = JSON.stringify(info);
    if (key === this.lastInfo) return;
    this.lastInfo = key;
    this.config?.onChange?.(info);
  }
}
