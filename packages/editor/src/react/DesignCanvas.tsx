import { Component, Suspense, useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import {
  Box3,
  CanvasTexture,
  SRGBColorSpace,
  Vector3,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
} from "three";
import type { DesignDocument, ProductDefinition } from "../design/schema.js";
import { DEFAULT_TEXTURE_SIZE, drawPatternTexture, type DrawPatternResult } from "../texture/pattern-texture.js";
import { orbitLimits } from "./camera.js";

/** What it cost to redraw the pattern texture, for a caller that reports performance. */
export interface TextureDrawInfo extends DrawPatternResult {
  /** Time spent drawing the pieces into the 2D canvas, in milliseconds. The GPU upload follows on the next frame. */
  drawMs: number;
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
}

const FOV = 35;

interface PreparedModel {
  scene: Object3D;
  /** Every cloned material, to dispose of. */
  materials: Material[];
  /** The materials of the meshes that carry pattern pieces: they get the pattern texture. */
  pieceMaterials: MeshStandardMaterial[];
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
        for (const material of cloned) {
          if ("map" in material && "color" in material) pieceMaterials.push(material as MeshStandardMaterial);
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
  return { scene, materials, pieceMaterials, center: center.toArray(), size: size.toArray() };
}

interface PatternSurface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: CanvasTexture;
  size: number;
}

// Three.js objects are changed in place, outside React's state, by these two
// helpers (called from effects only).

/** The texture carries the colours, so the materials it is put on are white. */
function applyPatternTexture(materials: readonly MeshStandardMaterial[], texture: CanvasTexture): void {
  for (const material of materials) {
    material.map = texture;
    material.color.set("#ffffff");
    material.needsUpdate = true;
  }
}

/** Draws the pieces with the design's colours into the canvas and marks the texture for upload. */
function redrawPattern(surface: PatternSurface, product: ProductDefinition, design: DesignDocument): TextureDrawInfo {
  const start = performance.now();
  const result = drawPatternTexture(surface.ctx, product, design, { size: surface.size });
  const drawMs = performance.now() - start;
  surface.texture.needsUpdate = true;
  return { ...result, drawMs };
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

function ModelView({
  design,
  product,
  textureSize,
  onTextureDrawn,
}: Pick<DesignCanvasProps, "design" | "product" | "textureSize" | "onTextureDrawn">) {
  const gltf = useGLTF(product.model.url, false);
  const prepared = useMemo(() => prepareModel(gltf.scene, product), [gltf, product]);
  const camera = useThree((state) => state.camera);
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
    const direction = new Vector3(0, 0.12, 1).normalize().multiplyScalar(fit);
    camera.position.set(center[0] + direction.x, center[1] + direction.y, center[2] + direction.z);
    camera.lookAt(center[0], center[1], center[2]);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, center, fit, prepared, invalidate]);

  // The pieces' materials show the pattern texture.
  useEffect(() => {
    applyPatternTexture(prepared.pieceMaterials, surface.texture);
    invalidate();
  }, [prepared, surface, invalidate]);

  // Document to render: redraw the pattern from the product and the design on every change.
  // The model is not reloaded; only the texture is redrawn and uploaded again.
  const onDrawn = useRef(onTextureDrawn);
  useEffect(() => {
    onDrawn.current = onTextureDrawn;
  });
  useEffect(() => {
    const info = redrawPattern(surface, product, design);
    invalidate();
    onDrawn.current?.(info);
  }, [design, product, surface, invalidate]);

  // Dispose of the cloned materials when the model goes away.
  useEffect(() => {
    const materials = prepared.materials;
    return () => materials.forEach((m) => m.dispose());
  }, [prepared]);

  return (
    <>
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
 * coloured per zone, are drawn into a texture from the product definition and
 * the design every time the design changes.
 * Drag (one finger) to turn the garment, wheel or pinch to zoom. Renders only
 * when something changes, to save battery.
 */
export function DesignCanvas({
  design,
  product,
  className,
  style,
  onError,
  textureSize,
  onTextureDrawn,
}: DesignCanvasProps) {
  return (
    <div className={className} style={{ width: "100%", height: "100%", minHeight: 240, ...style }}>
      <ModelErrorBoundary onError={onError}>
        <Canvas
          flat
          frameloop="demand"
          dpr={[1, 2]}
          camera={{ fov: FOV, near: 0.05, far: 50, position: [0, 0.4, 2] }}
          gl={{ antialias: true }}
        >
          <hemisphereLight args={["#ffffff", "#8a8a8a", 1.6]} />
          <directionalLight position={[2, 3, 4]} intensity={1.8} />
          <directionalLight position={[-3, 2, -4]} intensity={1.4} />
          <Suspense fallback={null}>
            <ModelView design={design} product={product} textureSize={textureSize} onTextureDrawn={onTextureDrawn} />
          </Suspense>
        </Canvas>
      </ModelErrorBoundary>
    </div>
  );
}
