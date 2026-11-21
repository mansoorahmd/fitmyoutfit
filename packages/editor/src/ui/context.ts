/**
 * What every tool panel gets from the shell: the data (product, palette,
 * fonts, templates, wording), the design and the ways to change it (each
 * change one undo step with its label), and the shell's services (camera,
 * status line, zone flash, typing mode). A React context, so tools stay small.
 */
import { createContext, useContext } from "react";
import type { FontCatalog } from "../design/font-catalog.js";
import type { Palette } from "../design/palette.js";
import type { DesignDocument, ProductDefinition } from "../design/schema.js";
import type { Template } from "../design/template.js";
import type { EditLabel } from "../state/history.js";
import type { TextFit } from "../texture/layers.js";
import type { GarmentView } from "../texture/garment-view.js";
import type { AssetUrlResolver } from "../react/asset-images.js";
import type { AssetUploader } from "../upload/logo-upload.js";
import type { EditorWording } from "./content.js";
import type { EditorLayout, PanelDetent } from "./layout.js";
import type { LogoNote } from "./checks.js";

export type ToolId = "design" | "colours" | "team" | "players" | "logos" | "text";

/** The host's asset storage (the store's uploads; the demo's device store). */
export interface EditorAssets {
  upload: AssetUploader;
  url: AssetUrlResolver;
  /** The file name a logo was uploaded with, when known ("Logo: crest.png"). */
  fileName?: (assetId: string) => string | null;
  /** E3c, S2: files a design brought back refers to that are not on this device (the coach is told; the item shows it). */
  missing?: readonly string[];
  /** E3c, S3: what the checks found about each stored file (a box behind the logo, "Keep it"), kept with the files. */
  notes?: () => Readonly<Record<string, LogoNote>>;
  saveNote?: (assetId: string, note: LogoNote) => void;
  /** E3c, S7: a file no design state in the undo and redo history refers to any more: delete it, revoke its URL. */
  release?: (assetId: string) => void;
}

/** A colour zone or a group of shapes, as the Colours tool chooses them. */
export type ColourTarget = { kind: "zone"; id: string } | { kind: "shapes"; id: string };

export interface EditorApi {
  product: ProductDefinition;
  palette: Palette;
  fonts: FontCatalog;
  templates: Template[];
  wording: EditorWording;
  assets: EditorAssets;
  layout: EditorLayout;
  detent: PanelDetent;
  setDetent(detent: PanelDetent): void;
  /** The design as it is (not a hover preview). */
  design: DesignDocument;
  /** The design as it is at this moment, even between two renders (an async flow adding several files). */
  latestDesign?(): DesignDocument;
  /** Applies an edit as one undo step. False (and "That change couldn't be made.") when the edit throws. */
  commit(edit: (design: DesignDocument) => DesignDocument, label: EditLabel): boolean;
  /** A gesture (typing): begin, preview as often as needed, end: one undo step. */
  begin(label: EditLabel): void;
  preview(edit: (design: DesignDocument) => DesignDocument): void;
  end(): void;
  /** Shows a design for a moment without recording it (a swatch hovered with a mouse); null to stop. */
  hoverPreview(edit: ((design: DesignDocument) => DesignDocument) | null): void;
  /** For each text and number item, whether it is shrunk to fit (from the last drawing). */
  textFits: TextFit[];
  fontsLoading: boolean;
  fontsFailed: boolean;
  /** The garment seen from the front, once the model has loaded (template cards); null before. */
  garmentView: GarmentView | null;
  /** Asks the camera to show a side or an item (it may refuse: the coach is turning the garment). */
  showSide(side: "front" | "back" | "left" | "right"): void;
  focusOn(layerId: string | null, options?: { zoom?: boolean }): void;
  /** Moves an item by a step in mm (one undo step); when the print area stops it, the area's lines show for a moment (E3e). */
  nudge(layerId: string, dx: number, dy: number): void;
  /** Shows a message in the status line; with `undo`, an Undo button beside it. */
  announce(text: string, options?: { undo?: boolean; ms?: number }): void;
  /** The Colours tool's chosen zone or shapes, and choosing one (with the flash on the model). */
  colourTarget: ColourTarget;
  chooseColourTarget(target: ColourTarget, flash?: boolean): void;
  /** E3f: the part tapped on the model (its row in the Colours tool is marked, and the part on the model); null: none. */
  markedPart?: ColourTarget | null;
  markPart?(target: ColourTarget | null): void;
  /** Recently used palette colour ids, newest first. */
  recentColours: string[];
  useColour(colourId: string): void;
  /** A text field has focus: on a phone the dock hides and the panel shrinks to the field (06-editor.md 3.3). */
  setTyping(layerId: string | null): void;
  /** Opens a tool (the start card's "See designs", for example); `turn: false` keeps the camera where it is. */
  openTool(tool: ToolId, detent?: PanelDetent, options?: { turn?: boolean }): void;
  reducedMotion: boolean;
  /** The selected item (06-editor.md 4.8, 5), or null. Not part of undo. */
  selectedId: string | null;
  /**
   * Selects an item (null: nothing). With `turn`, the camera turns to it (a row of "On this kit", a tool's
   * slot); with `openTool`, its tool opens. A tap on the model does neither turn nor move the camera.
   */
  select(layerId: string | null, options?: { turn?: boolean; openTool?: boolean }): void;
  /** What the upload checks found about each uploaded file this session (a box behind the logo), by asset id. */
  logoNotes: Readonly<Record<string, LogoNote>>;
  setLogoNote(assetId: string, note: LogoNote): void;
  /** E3c, S2: logo files the design refers to that are not on this device. */
  missingAssets?: ReadonlySet<string>;
  /** Snapping to guides while placing (on by default; Alt holds it off with a mouse). */
  snapping: boolean;
  setSnapping(on: boolean): void;
  /** Logs a timing for the performance log (06-editor.md 11.3; E3 logs, E5 measures). */
  markTiming(name: string): void;
  /**
   * The items whose letter or outline colour the coach chose this session (E3c, B4): never recoloured when a
   * design is applied; their readability fix keeps the letters and adds an outline. Optional for hosts' tests.
   */
  coachColoured?: ReadonlySet<string>;
  /** The design as it is applied (a template, team colours): names and numbers that would be hard to read get a readable colour. */
  readable?(design: DesignDocument): DesignDocument;
}

export const EditorContext = createContext<EditorApi | null>(null);

export function useEditor(): EditorApi {
  const api = useContext(EditorContext);
  if (!api) throw new Error("useEditor: a tool must be rendered inside EditorShell");
  return api;
}
