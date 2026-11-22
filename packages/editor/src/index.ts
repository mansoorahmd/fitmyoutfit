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
export * from "./texture/garment-view.js";
export * from "./state/history.js";
export * from "./upload/logo-upload.js";
export * from "./upload/memory-store.js";
export * from "./design/index.js";

// The interface (task E3a-2): the editor a coach uses, and its parts a host needs.
export { EditorShell, type EditorShellProps, type EditorSlots, type EditorTiming } from "./ui/EditorShell.js";
export { ResumePrompt, DoneNotice } from "./ui/dialogs.js";
// The team list in the Players tab (08-team-list.md section 12): what a host gives the editor and gets back.
export {
  DEFAULT_TEAM_NOUN,
  DEFAULT_TEAM_SIZES,
  type EditorLine,
  type SavedTeamList,
  type TeamListHost,
  type TeamListMinimum,
  type TeamListNoun,
  type TeamListReport,
  type TeamListSize,
} from "./team-list/types.js";
export { readSavedList, readSavedListWithNotes, FIELD_MAX, type ReadNote as SavedListReadNote, type SavedListRead } from "./team-list/saved.js";
export { groupGarments, planGarmentChange, type GarmentChange, type GarmentChoice, type GarmentGroup, type GarmentPlan } from "./ui/garment.js";
export { EDITOR_WORDING, mergeWording, fill, changeWords, type EditorWording, type WordingOverrides } from "./ui/content.js";
export { EDITOR_CSS } from "./ui/styles.js";
export type { EditorAssets, ToolId } from "./ui/context.js";
export { chooseLayout, panelHeights, stageInsets, type EditorLayout, type PanelDetent } from "./ui/layout.js";
export { hasWebGL2 } from "./ui/webgl.js";
export * from "./storage/device-store.js";
export {
  frameInFreeArea,
  sideFromAzimuth,
  zoomedDistance,
  canZoom,
  mayMoveCamera,
  NO_INSETS,
  type ViewInsets,
  type Framing,
} from "./react/camera.js";
export { loadModel, type LoadedModel, type ModelLoadProgress } from "./react/model-loader.js";
export { extractGarmentMeshes } from "./react/garment-geometry.js";
export * from "./texture/flat-view.js";
export * from "./texture/zone-highlight.js";
