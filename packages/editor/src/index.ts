/**
 * Entry point `@fitmyoutfit/editor`: the React component and the texture
 * drawing, plus everything from the design entry point. Code that only needs
 * the design document (for example a server) should import
 * `@fitmyoutfit/editor/design` instead, which does not load React or Three.js.
 */
export { DesignCanvas, type DesignCanvasProps, type TextureDrawInfo } from "./react/DesignCanvas.js";
export { orbitLimits, type OrbitLimits } from "./react/camera.js";
export * from "./texture/pattern-texture.js";
export * from "./state/history.js";
export * from "./design/index.js";
