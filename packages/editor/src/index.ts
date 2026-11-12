/**
 * Entry point `@fitmyoutfit/editor`: the React component and the texture
 * drawing, plus everything from the design entry point. Code that only needs
 * the design document (for example a server) should import
 * `@fitmyoutfit/editor/design` instead, which does not load React or Three.js.
 */
export {
  DesignCanvas,
  type CameraSide,
  type DesignCanvasHandle,
  type DesignCanvasProps,
  type LayerDragEvent,
  type TextureDrawInfo,
} from "./react/DesignCanvas.js";
export { useDesignHistory, type DesignHistory } from "./react/useDesignHistory.js";
export { AssetImageCache, type AssetUrlResolver } from "./react/asset-images.js";
export { orbitLimits, type OrbitLimits } from "./react/camera.js";
export * from "./texture/pattern-texture.js";
export * from "./texture/layers.js";
export * from "./texture/fonts.js";
export * from "./texture/thumbnail.js";
export * from "./state/history.js";
export * from "./upload/logo-upload.js";
export * from "./upload/memory-store.js";
export * from "./design/index.js";
