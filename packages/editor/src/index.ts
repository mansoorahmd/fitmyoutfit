/**
 * Entry point `@fitmyoutfit/editor`: the React component, plus everything from
 * the design entry point. Code that only needs the design document (for
 * example a server) should import `@fitmyoutfit/editor/design` instead, which
 * does not load React or Three.js.
 */
export { DesignCanvas, type DesignCanvasProps } from "./react/DesignCanvas.js";
export * from "./design/index.js";
