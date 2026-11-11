import {
  Component,
  Suspense,
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
import { OrbitControls, useGLTF } from "@react-three/drei";
import {
  Box3,
  CanvasTexture,
  DoubleSide,
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
} from "three";
import type { DesignDocument, Point, ProductDefinition } from "../design/schema.js";
import { dragPosition, layerAtPoint, pieceAtMeshUv, round3, startLayerDrag, type LayerDrag } from "../design/placement.js";
import { DEFAULT_TEXTURE_SIZE, drawPatternTexture, type DrawPatternResult } from "../texture/pattern-texture.js";
import { FontWatcher, type FontSetLike, type FontStatus } from "../texture/fonts.js";
import { AssetImageCache, type AssetUrlResolver } from "./asset-images.js";
import { orbitLimits } from "./camera.js";
import { makeFabric, type Fabric } from "./fabric.js";
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
}

/** Which side of the garment the camera looks at. "left" is the wearer's left. */
export type CameraSide = "front" | "back" | "left" | "right";

/** Imperative controls, through `ref`. */
export interface DesignCanvasHandle {
  /** Turns the camera to look at one side of the garment, keeping the zoom. */
  showSide(side: CameraSide): void;
}

export interface DesignCanvasProps {
  /** The design to show. The canvas only reads it; edit it with the functions from the design entry point. */
  design: DesignDocument;
  /** The garment model and its pattern pieces and colour zones. */
  product: ProductDefinition;
  className?: string;
  /** The canvas fills its container, so give the container (or this style) a height. */
  style?: CSSProperties;
  /** Called when the model fails to load. The canvas shows a short message instead. */
  onError?: (error: Error) => void;
  /**
   * Edge of the square pattern texture in pixels (default 2048, lowered to the
   * device's limit). 2048 costs about 21 MiB of GPU memory with mipmaps; 1024 a quarter of that.
   */
  textureSize?: number;
  /** Called after each redraw of the pattern texture. */
  onTextureDrawn?: (info: TextureDrawInfo) => void;
  /** The layer outlined as selected on the model. */
  selectedLayerId?: string | null;
  /** Called with a layer's id when the customer taps (or presses) it on the model. */
  onSelectLayer?: (layerId: string) => void;
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
  ref?: Ref<DesignCanvasHandle>;
}

const FOV = 35;

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

/** Draws the pieces and layers into the canvas and marks the texture for upload. */
function redrawPattern(
  surface: PatternSurface,
  product: ProductDefinition,
  design: DesignDocument,
  images: AssetImageCache | null,
  selectedLayerId: string | null,
): TextureDrawInfo {
  const start = performance.now();
  const result = drawPatternTexture(surface.ctx, product, design, { size: surface.size, images: images?.lookup, selectedLayerId });
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
function usePatternSurface(requestedSize: number | undefined): PatternSurface {
  const gl = useThree((state) => state.gl);
  const size = Math.max(64, Math.min(requestedSize ?? DEFAULT_TEXTURE_SIZE, gl.capabilities.maxTextureSize));
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
    return { canvas, ctx, texture, size };
  }, [size, gl]);
  useEffect(() => () => surface.texture.dispose(), [surface]);
  return surface;
}

/** The latest value, for event handlers that must not be re-attached on every render. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

const SIDE_DIRECTIONS: Record<CameraSide, [number, number, number]> = {
  front: [0, 0.12, 1],
  back: [0, 0.12, -1],
  left: [1, 0.12, 0],
  right: [-1, 0.12, 0],
};

type ModelViewProps = Omit<DesignCanvasProps, "className" | "style" | "onError" | "ref"> & {
  handle: { current: DesignCanvasHandle | null };
};

function ModelView({
  design,
  product,
  textureSize,
  onTextureDrawn,
  selectedLayerId,
  onSelectLayer,
  onLayerDrag,
  assetUrl,
  fonts,
  onFontStatus,
  touchSlopMm = 8,
  handle,
}: ModelViewProps) {
  const gltf = useGLTF(product.model.url, false);
  const prepared = useMemo(() => prepareModel(gltf.scene, product), [gltf, product]);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const controls = useThree((state) => state.controls) as unknown as { enabled: boolean; update(): void } | null;
  const invalidate = useThree((state) => state.invalidate);
  const viewSize = useThree((state) => state.size);
  const surface = usePatternSurface(textureSize);

  const { center, size } = prepared;
  const limits = orbitLimits(size, FOV, viewSize.width / Math.max(1, viewSize.height));

  // Frame the model from the front, once per loaded model.
  const fit = limits.fit;
  const framed = useRef<PreparedModel | null>(null);
  useEffect(() => {
    if (framed.current === prepared) return;
    framed.current = prepared;
    const direction = new Vector3(...SIDE_DIRECTIONS.front).normalize().multiplyScalar(fit);
    camera.position.set(center[0] + direction.x, center[1] + direction.y, center[2] + direction.z);
    camera.lookAt(center[0], center[1], center[2]);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, center, fit, prepared, invalidate]);

  // Camera presets, for the host's buttons.
  useEffect(() => {
    setHandle(handle, {
      showSide(side) {
        const target = new Vector3(...center);
        const distance = camera.position.distanceTo(target) || fit;
        const direction = new Vector3(...SIDE_DIRECTIONS[side]).normalize().multiplyScalar(distance);
        camera.position.copy(target).add(direction);
        camera.lookAt(target);
        controls?.update();
        invalidate();
      },
    });
    return () => setHandle(handle, null);
  }, [handle, camera, center, fit, controls, invalidate]);

  // The pieces' materials show the pattern texture; their inside shows the colour zones only.
  const inside = usePatternSurface(INSIDE_TEXTURE_SIZE);
  useEffect(() => {
    applyPatternTexture(prepared.pieceMaterials, surface.texture);
    for (const fabric of prepared.fabrics) fabric.setInsideMap(inside.texture);
    invalidate();
  }, [prepared, surface, inside, invalidate]);

  // The inside texture: the zones without layers, redrawn only when a zone colour changes.
  const { zones } = design;
  const zonesOnly = useMemo<DesignDocument>(
    () => ({ schemaVersion: 2, product: { id: product.id }, palette: product.palette, zones, fonts: [], layers: [] }),
    [zones, product],
  );
  useEffect(() => {
    redrawPattern(inside, product, zonesOnly, null, null);
    invalidate();
  }, [zonesOnly, product, inside, invalidate]);

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
  // when fonts or images arrive, and when the selection changes. The model is not reloaded.
  const onDrawn = useLatest(onTextureDrawn);
  useEffect(() => {
    const info = redrawPattern(surface, product, design, images, selectedLayerId ?? null);
    invalidate();
    onDrawn.current?.(info);
  }, [design, product, surface, invalidate, images, selectedLayerId, fontsVersion, imagesVersion, onDrawn]);

  // Dragging layers on the model. A capture listener on the canvas's parent sees the pointer
  // before the orbit controls (on the canvas) do; a press on a layer becomes a drag, anything
  // else is left to the orbit controls.
  const latest = useLatest({ design, product, onSelectLayer, onLayerDrag, touchSlopMm, controls });
  useEffect(() => {
    const canvas = gl.domElement;
    const host = canvas.parentElement ?? canvas;
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    const meshes = [...prepared.pieceMeshes.keys()];
    const down = new Set<number>();
    let drag: { pointerId: number; state: LayerDrag; position: Point; pending: Point | null; frame: number | null } | null = null;

    const hitAt = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const [first] = raycaster.intersectObjects(meshes, false);
      const name = first && prepared.pieceMeshes.get(first.object as Mesh);
      if (!first?.uv || !name) return null;
      return pieceAtMeshUv(latest.current.product, name, { u: first.uv.x, v: first.uv.y });
    };

    const emit = (phase: LayerDragEvent["phase"], position: Point) => {
      if (!drag) return;
      latest.current.onLayerDrag?.({ phase, layerId: drag.state.layerId, pieceId: drag.state.pieceId, position });
    };

    const flush = () => {
      if (!drag) return;
      drag.frame = null;
      if (drag.pending) {
        drag.position = drag.pending;
        drag.pending = null;
        emit("move", drag.position);
      }
    };

    const onMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      const next = dragPosition(latest.current.product, drag.state, hitAt(event));
      if (!next) return;
      drag.pending = { x: round3(next.x), y: round3(next.y) };
      drag.frame ??= requestAnimationFrame(flush);
    };

    const finish = (event: PointerEvent, phase: "end" | "cancel") => {
      down.delete(event.pointerId);
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (drag.frame !== null) cancelAnimationFrame(drag.frame);
      if (phase === "end") flush();
      emit(phase, drag.position);
      drag = null;
      window.removeEventListener("pointermove", onMove);
      const controlsNow = latest.current.controls;
      if (controlsNow) controlsNow.enabled = true;
      canvas.style.cursor = "";
    };
    const onUp = (event: PointerEvent) => finish(event, "end");
    const onCancel = (event: PointerEvent) => finish(event, "cancel");

    const onDown = (event: PointerEvent) => {
      const busy = down.size > 0;
      down.add(event.pointerId);
      const { design: current, onSelectLayer: select, onLayerDrag: dragHandler, touchSlopMm: slop } = latest.current;
      if (drag) {
        // A second finger during a drag: ignore it, and keep it from the orbit controls.
        event.stopPropagation();
        return;
      }
      if (busy || event.button !== 0 || (!select && !dragHandler)) return;
      const hit = hitAt(event);
      if (!hit) return;
      const layer = layerAtPoint(current, hit.piece.id, hit.point, slop);
      if (!layer) return;
      event.stopPropagation();
      event.preventDefault();
      select?.(layer.id);
      if (!dragHandler) return;
      drag = { pointerId: event.pointerId, state: startLayerDrag(layer, hit.point), position: layer.position, pending: null, frame: null };
      const controlsNow = latest.current.controls;
      if (controlsNow) controlsNow.enabled = false;
      canvas.style.cursor = "grabbing";
      window.addEventListener("pointermove", onMove);
      emit("start", layer.position);
    };

    host.addEventListener("pointerdown", onDown, { capture: true });
    window.addEventListener("pointerup", onUp, { capture: true });
    window.addEventListener("pointercancel", onCancel, { capture: true });
    return () => {
      host.removeEventListener("pointerdown", onDown, { capture: true });
      window.removeEventListener("pointerup", onUp, { capture: true });
      window.removeEventListener("pointercancel", onCancel, { capture: true });
      window.removeEventListener("pointermove", onMove);
      if (drag?.frame != null) cancelAnimationFrame(drag.frame);
    };
  }, [gl, camera, prepared, latest]);

  // Dispose of the cloned materials when the model goes away.
  useEffect(() => {
    const materials = prepared.materials;
    return () => materials.forEach((m) => m.dispose());
  }, [prepared]);

  return (
    <>
      <StudioLights target={center} distance={fit} />
      <primitive object={prepared.scene} />
      <OrbitControls
        makeDefault
        target={center}
        enablePan={false}
        minDistance={limits.minDistance}
        maxDistance={limits.maxDistance}
        minPolarAngle={limits.minPolarAngle}
        maxPolarAngle={limits.maxPolarAngle}
        enableDamping={false}
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
  { onError?: (error: Error) => void; children: ReactNode },
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
      return (
        <div role="alert" style={{ padding: 16, font: "14px system-ui, sans-serif" }}>
          The 3D model could not be shown: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Shows a product's 3D model with the design drawn on it: the pattern pieces,
 * coloured per zone, and the design's text, numbers and logos, drawn into a
 * texture from the product definition and the design every time the design
 * changes. Drag (one finger) to turn the garment, wheel or pinch to zoom.
 * With `onLayerDrag`, pressing a layer drags it instead. Renders only when
 * something changes, to save battery.
 */
export function DesignCanvas({ className, style, onError, ref, ...view }: DesignCanvasProps) {
  const handle = useRef<DesignCanvasHandle | null>(null);
  useImperativeHandle(ref, () => ({ showSide: (side) => handle.current?.showSide(side) }), []);
  return (
    <div className={className} style={{ width: "100%", height: "100%", minHeight: 240, background: STUDIO_BACKGROUND, ...style }}>
      <ModelErrorBoundary onError={onError}>
        <Canvas
          frameloop="demand"
          dpr={[1, 2]}
          camera={{ fov: FOV, near: 0.05, far: 50, position: [0, 0.4, 2] }}
          // Neutral tone mapping (Khronos PBR Neutral) keeps the palette's colours true where the light is
          // even, and rolls highlights off softly instead of clipping them to flat white.
          gl={{ antialias: true, preserveDrawingBuffer: false, toneMapping: NeutralToneMapping }}
        >
          <Suspense fallback={null}>
            <ModelView {...view} handle={handle} />
          </Suspense>
        </Canvas>
      </ModelErrorBoundary>
    </div>
  );
}
