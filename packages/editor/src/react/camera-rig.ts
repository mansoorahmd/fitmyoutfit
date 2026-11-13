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
}

export class CameraRig {
  private anim: { from: Orbit; to: Orbit; fromOffset: Offset; toOffset: Offset; start: number; duration: number; ease: (t: number) => number } | null = null;
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
    if (!anim) return;
    const t = Math.min(1, (this.now() - anim.start) / anim.duration);
    const k = anim.ease(t);
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
    const distance = zoomedDistance(from.distance, direction, f);
    this.zoomFactor = distance / f.fit;
    this.moveTo({ ...from, distance }, this.targetOffset(), CAMERA_REFRAME_MS, easeOut);
  }

  reset(): void {
    const f = this.config?.framing;
    if (!f) return;
    this.zoomFactor = 1;
    this.focus = null;
    this.moveTo({ azimuth: SIDE_AZIMUTH.front, polar: SIDE_POLAR, distance: f.fit }, this.targetOffset(), CAMERA_TURN_MS, easeInOut);
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

  private orbit(): Orbit {
    return orbitOf(this.center, this.camera.position.toArray() as [number, number, number]);
  }

  private place(orbit: Orbit, offset: Offset): void {
    const camera = this.camera;
    camera.position.set(...orbitPosition(this.center, orbit));
    camera.lookAt(this.center[0], this.center[1], this.center[2]);
    const viewport = this.config?.viewport ?? { width: 1, height: 1 };
    if (Math.abs(offset.x) < 0.01 && Math.abs(offset.y) < 0.01) camera.clearViewOffset();
    else camera.setViewOffset(viewport.width, viewport.height, offset.x, offset.y, viewport.width, viewport.height);
    camera.updateProjectionMatrix();
    this.offset = offset;
  }

  private moveTo(to: Orbit, toOffset: Offset, duration: number, ease: (t: number) => number): void {
    const ms = this.config?.reducedMotion ? 0 : duration;
    if (ms <= 0) {
      this.anim = null;
      this.place(to, toOffset);
      this.invalidate();
      this.report();
      return;
    }
    this.anim = { from: this.orbit(), to, fromOffset: { ...this.offset }, toOffset, start: this.now(), duration: ms, ease };
    this.invalidate();
  }

  private report(): void {
    const f = this.config?.framing;
    if (!f) return;
    const orbit = this.orbit();
    const zoom = canZoom(orbit.distance, f);
    const info: CameraRigInfo = { side: sideFromAzimuth(orbit.azimuth), canZoomIn: zoom.in, canZoomOut: zoom.out };
    const key = JSON.stringify(info);
    if (key === this.lastInfo) return;
    this.lastInfo = key;
    this.config?.onChange?.(info);
  }
}
