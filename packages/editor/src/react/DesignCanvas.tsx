import { Component, Suspense, useEffect, useMemo, type CSSProperties, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Box3, Vector3, type Material, type Mesh, type MeshStandardMaterial, type Object3D } from "three";
import type { DesignDocument, ProductDefinition } from "../design/schema";

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
}

interface PreparedModel {
  scene: Object3D;
  materialsByName: Map<string, Material[]>;
  center: [number, number, number];
  size: [number, number, number];
}

/** Clones the loaded scene and its materials, so one cached model can serve several canvases. */
function prepareModel(source: Object3D): PreparedModel {
  const scene = source.clone(true);
  const materialsByName = new Map<string, Material[]>();
  scene.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const cloned = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => m.clone());
    mesh.material = Array.isArray(mesh.material) ? cloned : (cloned[0] as Material);
    for (const material of cloned) {
      const list = materialsByName.get(material.name) ?? [];
      list.push(material);
      materialsByName.set(material.name, list);
    }
  });
  const box = new Box3().setFromObject(scene);
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  return { scene, materialsByName, center: center.toArray(), size: size.toArray() };
}

function ModelView({ design, product }: Pick<DesignCanvasProps, "design" | "product">) {
  const gltf = useGLTF(product.model.url, false);
  const prepared = useMemo(() => prepareModel(gltf.scene), [gltf]);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);

  // Frame the model once per loaded model.
  const { center, size } = prepared;
  useEffect(() => {
    const fov = "fov" in camera && typeof camera.fov === "number" ? camera.fov : 35;
    const extent = Math.max(size[0], size[1]);
    const distance = (1.3 * extent) / (2 * Math.tan((fov * Math.PI) / 360));
    camera.position.set(center[0], center[1] + size[1] * 0.05, center[2] + distance);
    camera.lookAt(center[0], center[1], center[2]);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, center, size, invalidate]);

  // Document to render: each zone colours the materials the product definition lists for it.
  useEffect(() => {
    for (const zone of product.zones) {
      const color = design.zones[zone.id];
      if (!color) continue;
      for (const name of zone.materials) {
        for (const material of prepared.materialsByName.get(name) ?? []) {
          (material as MeshStandardMaterial).color?.set(color.hex);
        }
      }
    }
    invalidate();
  }, [design.zones, product.zones, prepared, invalidate]);

  // Dispose of the cloned materials when the model goes away.
  useEffect(() => {
    const materials = [...prepared.materialsByName.values()].flat();
    return () => materials.forEach((m) => m.dispose());
  }, [prepared]);

  const distance = Math.max(size[0], size[1]);
  return (
    <>
      <primitive object={prepared.scene} />
      <OrbitControls
        makeDefault
        target={center}
        enablePan={false}
        minDistance={distance * 0.6}
        maxDistance={distance * 3}
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
          The 3D model could not be loaded: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Shows a product's 3D model with the design's zone colours applied.
 * Orbit with the mouse or touch. Renders only when something changes, to save battery.
 */
export function DesignCanvas({ design, product, className, style, onError }: DesignCanvasProps) {
  return (
    <div className={className} style={{ width: "100%", height: "100%", minHeight: 240, ...style }}>
      <ModelErrorBoundary onError={onError}>
        <Canvas
          flat
          frameloop="demand"
          dpr={[1, 2]}
          camera={{ fov: 35, near: 0.05, far: 50, position: [0, 0.4, 2] }}
          gl={{ antialias: true }}
        >
          <hemisphereLight args={["#ffffff", "#8a8a8a", 1.6]} />
          <directionalLight position={[2, 3, 4]} intensity={1.8} />
          <directionalLight position={[-3, 1, -3]} intensity={0.8} />
          <Suspense fallback={null}>
            <ModelView design={design} product={product} />
          </Suspense>
        </Canvas>
      </ModelErrorBoundary>
    </div>
  );
}
