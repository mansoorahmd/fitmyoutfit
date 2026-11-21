# @fitmyoutfit/editor

The 3D design editor for the store. It is a standalone React + Three.js package: no Medusa, no Next.js. The storefront embeds it; a future platform could reuse it.

**A design is data, not an image.** A design is a versioned JSON document. Previews, proof renders and production files are all generated from it, so it never holds flattened pixels.

Status: step E3d (the finish after the designer's review, `docs/design/07-editor-review.md`) on top of E3c; see "Step E3d: what changed" below. Before it, step E3a-2 done: the interface a coach uses (`EditorShell`, see "The interface" below), phone first, on top of step E3a-1 (the engine for it). On top of E1 (vector pattern pieces drawn onto the 3D model, orbit camera, colour per zone) and E2 (text in Latin, Arabic and Urdu, jersey numbers, logo uploads with checks, dragging, resizing, rotating, ordering, undo and redo): team colours, roles on items, placement presets in the product data, shapes, templates with thumbnails, text outlines, the palette with families and the CIEDE2000 colour-code match, readability, long-name reports and undo labels. The document format is `schemaVersion` **3** (see "Format version 3" below); a version 2 design is upgraded by `upgradeDesign`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Demo page at http://localhost:5173 (this computer only) |
| `npm run dev:lan` | The same, but also reachable from other devices on your network, for example a phone on the same Wi-Fi. Opt-in, because it exposes the dev server |
| `npm run build` | Library build to `dist/` (ES modules, a CommonJS build of the `design` entry, and `.d.ts` files), then checks the entry points, including real consumer projects (see below) |
| `npm run build:demo` | Builds the demo page to `dist-demo/` (not part of the library) |
| `npm run lint` / `typecheck` / `test` | ESLint, `tsc --noEmit`, Vitest (runs once) |
| `npm run generate:schema` | Rewrites `schema/*.json` from the zod schemas |
| `npm run generate:model` | Rewrites the placeholder GLB from `scripts/generate-placeholder-jersey.ts` (run with `tsx`), built from the pattern pieces in the product definition |
| `npm run generate:templates` | Rewrites the sample templates (`samples/templates/<product>/`) from `scripts/make-sample-templates.ts`, measuring body heights on the committed models |
| `node scripts/audit/editor-audit.mjs` | The page audits of the review's rules (section 4), against a running demo; see "Step E3d: what changed" |
| `npm run process:stand-in -- <source.glb>` | Rewrites a stand-in model and its product definition from its downloaded source file (the jersey or the T-shirt, picked by the file's SHA-256); see "Stand-in models" |

To run the demo on another port: `npm run dev -w packages/editor -- --port 5184 --strictPort` from the repository root. The demo shows **the interface a coach uses** (`EditorShell`, below) on the stand-in football jersey (`?product=stand-in-tshirt` or `?product=placeholder-jersey` for the others), saving the design on the device (it offers "Continue your last design?" on return). The model's credit line is on the stage (a licence duty). Everything for developers (the engine's plain controls of E2 and E3a-1, the design JSON, the texture, the flat pattern, the font licences, the product switch) is on the developer page: add `?dev=1`.

## Using it

```ts
// The React component (loads React, Three.js, react-three-fiber)
import { DesignCanvas } from "@fitmyoutfit/editor";

// Only the document functions and types (zod is the only import: no React, no Three.js).
// Use this on the server, for example in the backend, to validate designs.
import { createDesign, validateDesign, setZoneColor } from "@fitmyoutfit/editor/design";

// The JSON Schema files
import designSchema from "@fitmyoutfit/editor/design.schema.json";
```

```tsx
<DesignCanvas design={design} product={product} style={{ height: 480 }} />
// Optional: textureSize (default 2048), onTextureDrawn({ size, pieces, fills, layers, missingImages, drawMs }), onError,
// selectedLayerId, onSelectLayer(id), onLayerDrag({ phase, layerId, pieceId, position }),
// assetUrl(asset) => url, fonts (default document.fonts), onFontStatus({ loading, missing, failed }),
// touchSlopMm (default 8),
// E3a-2: viewInsets { top, right, bottom, left } (CSS px a panel covers: the garment is framed in the rest),
// reducedMotion, onCameraChange({ side, canZoomIn, canZoomOut }), onUserTurn(phase, moved),
// pickZones + onZoneTap({ pieceId, zoneId, shapeGroup }), highlight { zoneId | shapeGroup, alpha },
// onLoadProgress({ loaded, total, fraction }), onModelReady(model), onContextLost, onContextRestored,
// errorFallback (shown instead of the developer message when the model fails),
// ref: { showSide(side, { animate }), focusOn(layerId | null, { zoom }), zoomIn(), zoomOut(), resetView(), turnBy(degrees), getSide() }
```

Most hosts do not use `DesignCanvas` directly any more: they mount `EditorShell` (next section).

A full editor (the demo is one) keeps the design in `useDesignHistory`, applies every edit through the design functions, and passes `onLayerDrag` events to `begin`, `preview` and `end`. See "Layers on the model" below.

Drag (one finger) turns the garment, wheel or pinch zooms. There is no panning: the camera always looks at the garment's centre, the zoom stops between 0.45 and 1.6 times the distance at which the whole garment fits the view (whatever the screen's shape), and the view stays between 50 degrees above and 22 degrees below the garment's middle. So the garment cannot be lost off screen.

Two kinds of consumer, both supported:

- **The root entry (`@fitmyoutfit/editor`, the React component)** is ES module only and is meant for bundlers: Next.js and Vite. In Next.js, render `DesignCanvas` from a client component. Nothing in the package touches `window` or `document` when imported, so importing it on the server is safe.
- **The `/design` entry** works from **both ES modules and CommonJS**, with TypeScript `"moduleResolution": "Node16"`, `"NodeNext"` or `"Bundler"`. The Medusa backend (a CommonJS project on Node16 resolution) can `require("@fitmyoutfit/editor/design")` or `import` it, on Node 20 and 22, and get correct types.

How that works, because it is easy to break: `exports["./design"]` has an `import` branch (`dist/design.js`, declarations in `dist/types/`) and a `require` branch (`dist/cjs/design.cjs`, declarations in `dist/cjs/types/`). The package is `"type": "module"`, so TypeScript reads every `.d.ts` in it as an ES module and rejects it from a CommonJS file. `dist/cjs/package.json` (`{"type": "commonjs"}`) makes the CommonJS copy of the declarations read as CommonJS. Relative imports in the source carry a `.js` extension (`from "./schema.js"`) so the emitted declarations resolve under Node16. Keep writing them that way.

`npm run build` ends with `scripts/check-entrypoints.mjs`. It packs the package as it would be published and installs it into a throw-away project (under `node_modules/.cache/`), then checks:

- a CommonJS project with `"module": "Node16"` type-checks an import of `createDesign`, `validateDesign` and `DesignDocument`, compiles it and runs it; and a plain `require()` of the entry;
- an ES module project with `"module": "NodeNext"` does the same;
- a `Bundler` project type-checks both entries.

It runs on the Node version that runs the build. To check Node 20, run the build or `node scripts/check-entrypoints.mjs` under Node 20. A regression in `exports`, in the declarations or in the CommonJS build fails the build.

### Peer dependencies

`react` and `react-dom` are peer dependencies at `^19.0.0` (React 18 is not supported). `three` is `>=0.170.0`. `@react-three/fiber`, `@react-three/drei` and `zod` are normal dependencies.

Heads-up: `@react-three/fiber` 9 itself declares `react >=19 <19.4`. Our own range is wider (`^19.0.0`), so when React 19.4 or later is released, npm will print a peer-dependency warning from `@react-three/fiber`, not from this package. That is expected: either wait for a `@react-three/fiber` release that widens the range, or pin React to 19.3.x in the app. Re-check this when upgrading React.

## The interface (steps E3a-2 and E3b)

`EditorShell` (`src/ui/`) is the editor a coach uses, built to `docs/design/06-editor.md`: phone first, team first, one red button ("Done"). It is a React component on the root entry; it imports nothing from the storefront or Medusa. Everything comes in as props, so the store mounts it on its own route and fills its slots.

```tsx
import { EditorShell, createDesign, applyTemplate } from "@fitmyoutfit/editor";

<div style={{ height: "100dvh" }}>
  <EditorShell
    product={product}            // the product definition (data)
    palette={palette}            // the print-tested palette (data)
    fonts={fontCatalog}          // the font catalogue (data); the host declares the font faces
    templates={templates}        // the product's templates (none: no Design tab)
    initialDesign={design}       // a new design (first template applied) or one brought back
    showStartCard                // a new design only: team colours and name first (7.2)
    productName="Jersey"         // the top bar and the stage's description
    assets={{ upload, url, fileName }}  // the host's asset storage (logo uploads)
    onDesignChange={(design, { started }) => autosave.schedule(design)}
    saveState={saveState}        // "saving" | "saved" | "failed" | null: the top bar says so
    onDone={(design) => ...}     // the Done panel's "Save and go back": save, then back to the product page
    onClose={() => history.back()}  // asked first only when the last save failed
    slots={{ brand, price, primaryAction, share, account, credit, creditShort }}  // the host's own components
    wording={{ frame: { done: "..." } }}  // replace any sentence (translations, confirmed copy)
    // optional: showHint, fontSet, textureSize, flatView, injectStyles (default true), draftQuality,
    //           onTiming, onGestureTiming, logTimings, className, style
  />
</div>
```

- **Size and layouts.** The shell fills its container and picks its layout from its own size (06-editor.md 3.1): **compact** (width under 1024 px, height 500 px or more: six tabs in a dock at the bottom, a bottom panel with a normal height of at most 232 px and an expanded height, the stage at least 288 px tall at 360 x 640), **short** (a phone in landscape: a rail on the right, a 320 px side panel), **wide** (1024 px and up: a rail on the left and a 360 px panel that is always open). The garment is always framed in the free area above or beside the panel (`viewInsets`), between the credit line and the view buttons. Give the page `interactive-widget=resizes-content` in its viewport meta, so the layout shrinks when the phone keyboard opens (the demo's `index.html` does).
- **Host slots.** `brand` (top left, wide), `price` (before Done on wide screens, and in the Done panel: the store's regional price line), `primaryAction` (the Done panel's main button, "Add to team order" once team orders exist; a node, or a function of the design; without it the panel offers "Save and go back", which calls `onDone`), `share` (top bar on wide screens and the Done panel; hidden until given, 9.3), `account` (later), `credit` (the model's credit on one line at the top edge of the stage, never over the garment; required for a CC BY model) and `creditShort` (its short form for a narrow stage, with a button that opens the full credit).
- **The Done panel** (9.2, 9.3; `DonePanel.tsx`): "Done" opens it (a native modal `<dialog>`: from the bottom on a phone at the panel's expanded height, 400 px on the right on a desktop, the garment framed in the rest). It shows the kit in one line, the things to check (every open warning, naming its item: hard to read, cut off at the seam, may print blurry, prints as a box; each with Show, which closes the panel, selects the item and turns the camera to it), the price slot and the main action. Warnings never block. While it is open the top bar's Done is inactive with a check, so the panel's button is the one red button. The proof pictures are E5.
- **Tools.** Design (template cards drawn from the model in the team's colours, tap to try, one undo step), Colours (parts and the template's shapes as chips, tap the kit to choose a part with a flash, team colours with swap and edit, recent colours, families, "Match a colour code"), Team (the team name, where, style), Players (the sample player, the switches, style, digits, coach-grade number errors, "Long names get smaller to fit"), Logos (the drop zone and picker, the checks' refusals in the coach's words, the usual places, a card per logo with Replace, Remove, Where and a size stepper, the box warning with Keep it, the blurry warning with Make it sharp) and Text (free lines with font, colour, outline, size and Start, Centre, End alignment whose icons turn round for right-to-left text). Readability warnings name their item ("Number on the back is hard to read on Navy.") with a one-tap fix, in Team and Players.
- **Selection and handles** (5; `SelectionOverlay.tsx`, `SelectedItem.tsx`, `OnThisKit.tsx`). Tap an item on the model to select it; with a mouse, press and drag in one go; on touch a drag that starts on an unselected item turns the garment (`dragOnlySelected: "touch"`, `react/press-policy.ts`). The selected item's box is drawn over the canvas as SVG, following the cloth, with four corner handles (resize evenly) and a turn handle (snaps at 0, 15, 45 and 90 degrees; Alt: free), 44 px hit areas; when it faces away, "Turn to edit" turns the garment to it. While placing, the print area's edges and the snapping guides are drawn along the cloth; snapping (centre line, presets, other items' centres and edges; 6 mm or 8 px) is held off with Alt or the "Snap to guides" switch. The contextual bar (name, Delete, Duplicate for logos and text, More: Bring forward, Send back, Edit; Done) sits at the top of the stage on a phone, never over the item (`contextBarPlacement` moves it to the bottom of the free area when the item reaches into its band), and heads the panel on a desktop. Fine-tune (closed by default) and the keys (arrows 1 mm, Shift 10; `[` `]` 10%; with Shift 15 degrees; Delete; Esc) do everything without dragging. "On this kit" (the stage's button, top right) lists every item top first with its place, a warning badge and a menu; a row selects the item, turns the camera and opens its tool; the design's shapes are listed as locked. Inside a tool, `useEditor()` gives `selectedId` and `select(id, { turn, openTool })`.
- **States.** The shell renders at once; tools are inactive until the model and the design's fonts are ready ("Almost ready…"); the model's download shows a silhouette and a percentage, "Still loading…" after 8 s, a failure with "Try again" and "Use the flat view" after 30 s without progress or on an error. Without WebGL 2 (or after the 3D context is lost twice) the flat view shows the front, back and sleeves as cut, and every tool still works. Undo and redo (top bar, Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y) are announced in the status line, naming what changed ("Undone: Body front colour", "Logo position").
- **Accessibility.** Tabs are a tablist (arrows move, Enter opens); panels are labelled regions; Back and Esc close a phone panel; the stage is an image with a description of the kit in words, arrows turn it and + and - zoom; focus rings on every control; reduced motion turns every animation into a cut (camera, panel, flash).
- **Wording.** Every sentence is in `src/ui/content.ts` (`EDITOR_WORDING`), grouped as section 14 of the specification and marked DRAFT WORDING; new sentences are marked NEW. Components hold none (a test checks). `mergeWording` merges a host's replacements.
- **Tokens and the stylesheet.** The package ships its stylesheet as `EDITOR_CSS`; the shell puts it in the page (React hoists the style tag) unless `injectStyles={false}`. Every colour and font reads the store's CSS variables first, with fallbacks: `--c-surface`, `--c-surface-alt`, `--c-ink`, `--c-ink-muted`, `--c-inverse`, `--c-on-inverse`, `--c-on-inverse-muted`, `--c-primary`, `--c-primary-hover`, `--c-border`, `--c-border-strong`, `--c-success`, `--c-error`, `--c-error-surface`, `--c-success-surface`, `--c-focus`, and the editor's own `--c-stage-top`, `--c-stage-bottom`, `--c-stage-deep-top`, `--c-stage-deep-bottom`, `--c-stage-shadow`, `--c-warning`, `--c-warning-surface`, `--c-overlay-control`; fonts `--font-heading` (Barlow Condensed), `--font-body` (Inter), `--font-arabic` (Noto Sans Arabic). The package does not load the interface fonts; the host does (the demo page loads Barlow Condensed and Inter, see "Fonts"). Everything is scoped under `.fmo-editor`, with logical properties, so a right-to-left interface later is a translation.
- **Dialogs for the host.** `ResumePrompt` ("Continue your last design?") and `DoneNotice` (a short confirmation a host can show after "Save and go back"; the demo does, standing in for the product page), in the editor's look and wording.

### The canvas's selection API (N9, N10, N11)

`DesignCanvas` (the engine component the shell wraps) takes, besides the E2 props:

- `dragOnlySelected` ("touch" by default; true or false for every pointer) and `onSelectLayer(id | null)` (a tap on empty fabric or the stage gives null).
- `onSelectionGeometry(geometry | null)`: the selected item on the screen, recomputed only when the camera or the item changed, and only while something is selected: `{ layerId, centre, corners, cornerSources, outline, top, turn, angle, facing, mirrored, pxPerMm, guides, width, height }` in CSS px from the canvas's top left. It comes from the **UV-to-surface lookup** (`src/texture/surface-lookup.ts`, pure): the model's triangles indexed once by UV (a 128 x 128 grid; 13 to 40 ms for the jersey's 103,000 triangles on a desktop), a lookup from a UV point to the 3D point, normal and tangents, and `projectItem` with the camera's view-projection matrix. Corners off the cut shape or across a seam are placed on the tangent plane at the item's centre (`cornerSources: "plane"`): there the handle sits a little off the cloth where the garment curves away. Occlusion (a sleeve in front of a side panel) is not tested, only facing (75 degrees).
- `guides`: lines on pieces (`{ pieceId, from, to, kind: "guide" | "area" }`) projected along the cloth into the geometry.
- `outlineSelected` (default true): false leaves the selection outline out of the texture (the shell draws handles instead, so selecting costs no repaint).
- `gesture`, `draftQuality` ("auto", "always", "never") and `onGestureTiming`: while an item is moved, resized or turned, frames are timed; after two slow frames in three (over 33 ms) the texture is drawn at half size without mipmaps until the gesture ends, then once at full size (`src/react/draft-quality.ts`). Each gesture reports its frame times, whether a draft was drawn, and the time back to full quality. During a drag the ray to the model is cast once per frame.
- `LayerDragEvent` carries `free` (Alt held) and `pxPerMm` (for the snapping reach).

The design-level helpers are on the `/design` entry: `printAreaOf`, `clampIntoArea`, `clampToPrintArea`, `maxScaleInArea`, `isClipped`, `moveInside` (print-area.ts); `snapPosition`, `snapLines`, `snapReachMm`, `printAreaLines` (snapping.ts); `nudgeLayer`, `scaleLayerBy`, `rotateLayerBy`, `rotateLayerTo`, `centreLayer`, `duplicateLayer`, `canDuplicate`, `bringForward`, `sendBack` (item-edits.ts). The interface's own rules are in `src/ui`: `checks.ts` (`itemChecks`, `designChecks`: the Done panel's summary), `logos.ts` (the usual places, size words, `makeLogoSharp`, `replaceLogoAsset`), `selection.ts` (`toolForLayer`, `contextBarPlacement`), `handles.ts` (the gesture maths).

### Saving on the device (N19)

Optional helpers on the root entry (`src/storage/device-store.ts`); the host decides to use them (the demo does; the store will save to accounts later):

```ts
const kv = await openIndexedDbStore().catch(() => createMemoryKeyValueStore()); // refused (private browsing): memory, and "Not saved"
const designs = new DeviceDesignStore(kv);
const assets = createDeviceAssetStore(designs);             // { upload, url, fileName, restore }: logo files kept as blobs
const saved = await designs.loadDesign(product);           // the last design for this product, upgraded and validated, or null
if (saved) await assets.restore(designAssetIds(saved.design)); // object URLs for its logos before showing it
const autosave = createAutosave({ save: (d) => designs.saveDesign(product.id, d), onState: setSaveState }); // 1 s after the last change
// "Start again": await designs.clearDesign(product.id) (also removes logo files no saved design uses)
// Other tabs: watchOtherTabs(product.id, () => showReloadNotice())
```

### The camera and the cards

- `src/react/camera.ts` (`frameInFreeArea`, `sideFromAzimuth`, `zoomedDistance`, `tweenOrbit`, `mayMoveCamera`, `focusOffsetY`) and `src/react/camera-rig.ts` (`CameraRig`): plain maths and a plain object the canvas owns. Turns take 350 ms (ease in and out), re-framing 200 ms; with reduced motion they cut. The interface moves the camera only in answer to the coach's own action, never while a finger or the mouse is down on the stage, and not within 1.5 s of the coach turning the garment by hand (06-editor.md 6.3).
- `src/react/model-loader.ts` (`loadModel`): the GLB is downloaded once per URL with byte progress and parsed by three's GLTFLoader (no WebGL needed). A failed load is forgotten, so "Try again" loads afresh.
- **Template cards** (`src/texture/garment-view.ts`, `drawTemplateCard`): `renderGarmentView` rasterises the loaded model's triangles once per product (about 0.1 s for the stand-in jersey on a desktop, in software, no WebGL) into a small buffer of UV, light and inside-or-outside per sample; `composeGarmentView` then paints any design onto it by looking up the design's texture drawn at 512 px. So a card shows a jersey with its sleeves and collar, shaded as the model is, instead of the flat front piece (which, for the stand-in jersey's front that wraps round under the side panels, read like a dress). A card costs a texture drawing (512 px) and a lookup per pixel: 8 to 50 ms each on a desktop in this repository's measurements, over the specification's 5 ms budget; cards are drawn one per task, lazily as they scroll in, and a card whose picture would not change is not drawn again. `drawTemplateThumbnail` (the flat front) stays for tests.
- **The zone flash** (`src/texture/zone-highlight.ts`): a light veil over the part and a white band with an ink line along its edge, drawn into the texture (editor only, never for proofs) for 600 ms, or still for 1.5 s with reduced motion.
- **The flat view** (`FlatView.tsx`): when 3D cannot run, the garment's front and back as the design cards draw them (the same software render of the model's triangles, at the view's size; no WebGL), stacked on a tall phone and side by side on a wide stage, the inside of the neck without prints. Tapping an item selects it (a hit test through the view's UVs); moving is by the presets and fine-tune. Until the model's geometry has been read, the pieces are drawn flat as cut (`flatViewProduct`).

## Step E3c: what changed

- **One print-area rule** (`fitLayerToArea`, `design/print-area.ts`): an item's whole turned box is inside its piece's print area. If it cannot fit at its size it is scaled down (box and font size together) to the largest size that fits, then moved in; the shrink is reported (`collectFitNotices`) and the status line says "Made smaller so it fits where it prints." It also keeps an item at least the product's **smallest size for its kind** (`minItemSize` in the product definition: placeholder data, the shorter side of the box: text 10 mm, numbers 25 mm, logos and clipart 15 mm; 5 mm without it). Every edit that can change an item's place, size or turn goes through it: dragging, the corner and turn handles, nudges, size and turn steps, "Centre on the shirt", duplicate, the "Where" chips (`placeAtPreset`), size steps (`setSizeStep`), new role slots, new logos, logo replacement and "Make it sharp", applying a template (`fitDesignToAreas`), and a design the editor opens (restored or upgraded). `limitScale` keeps a resize between the minimum and the area.
- **Print areas cover only visible cloth.** The stand-ins' areas are measured on the committed models by `scripts/measure-print-areas.ts` (read-only): inside the piece's cut outline (never under the jersey's side panels), facing the piece's side within 75 degrees, symmetric about the centre line. The values are in the source records and the product definitions, changed together (the generator cannot run without the downloaded source models; it copies `printAreas`, `minItemSize` and `placementOrder` from the records). The jersey's "Name on back" box is 318 mm wide so it fits its area. The `.glb` files are unchanged.
- **Where new items go** is product data: `placementOrder` (`logo`, `text`) lists the presets a new logo or line of text takes first (the first free one); presets not listed follow in the order of `placements`. A kit carries at most one logo per place that takes logos (`logoLimit`); several files dropped at once are added in turn.
- **Gestures end through one path** (`ui/item-gestures.ts`): release commits; a system cancel, lost pointer capture, the handle disappearing (the item turned away), the tab hidden, the window blurred or a second finger cancel; choosing another tool, item or the Done panel commits. Each clears the print-area lines, the guides and the placing state. A press and release that travels less than 4 CSS px (`DRAG_SLOP_PX`) is never a move nor an undo step. The one-time hint's room is kept after the hint goes, so dismissing it never re-frames the garment.
- **The readability fix always passes** (`readabilityRemedy`, `applyReadabilityRemedy`, `makeReadable`): team colours first (letters, then outline), then the palette's best (white or black). The button says what it does ("Use white letters", "Add white outline"); for letters whose colour the coach chose, it keeps them and adds an outline. Whenever a design is applied (the start card's colours, a template, a team-colour change or swap), every name, number and text slot that would fail gets a readable colour, except colours the coach chose in this session (kept in memory only: after a reload, a later design switch may recolour them).
- **Phone photos**: a JPEG's EXIF orientation is read (`exifOrientation`, `uprightSize`); a turned photo is accepted and referenced at the size it is seen at.
- **Text fields** refuse emoji and picture symbols (`design/typed-text.ts`: `hasPictographs`, `stripPictographs`, `singleLine`, `checkTypedText`); a saved design holding them shows "Remove them", and the Done panel lists it. Tabs and line breaks become single spaces.
- **Files on the device**: the upload checks' findings are kept with the file (`SavedAsset.notes`), so "prints as a box" survives a reload; a file no design state in the undo and redo history refers to is deleted, its object URL revoked and its cached image dropped (`assetsNoLongerUsed`, the host's `assets.release`); when a saved design is restored the files it does not use are deleted (`pruneAssets`); a restored design whose logo file is missing is told to the coach (`assets.missing`), its card offers "Add it again" and "Remove", and the Done panel lists it. A full device storage gets its own sentence and "Try again".
- **Speed** (S1): picking on the model goes through a bounding-volume hierarchy (`react/pick-bvh.ts`, built when the browser is idle); the previews of a drag, resize or turn are drawn by the canvas outside React (`DesignCanvasHandle.preview`) and committed once on release; readability remembers what lies under each sample; template cards apply the template and draw when the browser is idle; palette swatches and icons are memoised.
- Undo labels name what changed ("Undone: Body front colour", "Logo position", "Logo replaced").

## Step E3d: what changed

The finish after the designer's review of the running editor (`docs/design/07-editor-review.md`, findings R1 to R40, rules 4.1 to 4.11).

- **The stylesheet's tokens** (`src/ui/styles.ts`). Type: `--fmo-type-panel-title` (20/26, 22/28 on a desktop), `-section` (700 15/20), `-label` (600 14/20), `-body` (400 15/21), `-button` (600 15/20), `-primary` (700 18/18, heading face), `-tab` (500 14/20), `-chip` (400 14/20), `-small` (400 13/18), `-credit` (400 11/16); every `font` the stylesheet sets is one of them or a named exception (a test lists them). The panel grid: `--fmo-panel-pad` (16 px) for every panel, the start card, the Done panel and the help box; the panel body's scrollbar gutter is stable and its width (`--fmo-gutter`, measured by `ui/finish.ts`) comes out of the end padding, so content ends 16 px in whether or not a panel scrolls. Floating controls on the stage share one look (`--fmo-float-fill`, `--fmo-float-line`, `--fmo-float-shadow`). The element reset is `:where(...) button` so it never outranks a component class (R8). The fallbacks equal the store's tokens (03-direction). Spacing: 4, 8, 12, 16, 24 only. Rows of swatches and chips wrap on desktops and in landscape; on phones they scroll with no bar and fade at the end.
- **The start card** has one left edge (the step number inline, D1); the pick order is on the swatches; a first tap on an item closes it as Skip and opens the item's tool (R1).
- **The selection box** (`ui/selection-box.ts`): four straight lines between the item's projected corners, outset 8 px, at least 44 px a side; handles on its corners; the turn handle on a stem above, or below, or at the end side when it would touch another item, the top row, the view row or "On this kit"; guides never through the item; the overlay is clipped to the free stage. A warning badge sits only on unselected items, as a button named by its warning ("Needs a look: ...") that selects the item; the selected item's warning heads its panel with its fix (R15, `SelectedWarnings`).
- **The stage's framing rule** (`react/camera.ts`, `garmentFitDistance`): at rest the garment fills about 0.78 of the free stage (the stage without the credit line, the hint or bar row and the view row; the stage publishes the camera's insets as `data-free` for audits); an upright phone with nothing open binds on the width. Zooming in aims at the selected item, or at the height under the pointer (`CameraRig.setItem`, `aimAtPointer`, `aimVectorFor`), and stops where the item's box and handles still fit (`itemFitDistance`); a selected item shorter than 120 px (phones) or 160 px (desktops) is zoomed in on and given back when let go. Closest zoom: 0.35 of the fitting distance.
- **Phones and landscape**: one sheet at a time (Done closes the tool panel and gives it back, `sheetUnderDone`); the Done sheet is as tall as its content; in landscape the Done panel covers the tool panel and the rail and scrolls as one with the main action in view; the stage's contextual bar ends before a side panel; the hint goes at the first selection, tool change or after 8 s and never shares the top row.
- **Items that cover each other** (`ui/overlap.ts`): the item drawn above another on its piece, whose box overlaps it, gets "covers the team name" with "Move it clear" (moved up or down inside its area, or made smaller).
- **Dialogs** keep the focus on their safe action (`data-dialog-focus`): "Continue" in "Continue your last design?", the main action in the Done panel.
- **The bundle**: `scripts/minify-editor-css.ts` (a Vite plugin in the demo and library builds) takes the comments and indentation out of the stylesheet string.
- **Page audits** (`scripts/audit/`, read-only, no packages): with the demo running (`npm run dev -w packages/editor -- --port 5184 --strictPort`), `node packages/editor/scripts/audit/editor-audit.mjs --url=http://localhost:5184 --out=<folder> [--product=stand-in-tshirt] [--sizes=360x640m,390x844m,820x1180m,844x390m,1366x768,1920x1000] [--shots]` opens its own headless Chrome (`CHROME` overrides the path; `--no-gpu` uses SwiftShader) and walks, at each size, the start card, the rest framing, every tool, the number and the team name selected, and the Done panel. In each state it checks the panel grid (4.1: every full-width block on the content's edges, the title and the header icon's glyph too), the spacing scale (4.2), the type tokens (4.3), the selection box (4.5: four points, handles on its corners, off the item and off the stage's controls), the framing (4.6: the garment painted against a magenta stage and read back; R5's 120 px on the small phone; R22's item size), what sits on the stage (4.7: no two controls overlap, one message in the top row) and native controls (4.8: no sideways scrolling on desktops and in landscape, the panel's bar at most 8 px). It writes `audit-<product>-<size>.json` per size and prints each broken rule; exit code 1 when one is broken, 2 when a page could not be audited. The rules the stylesheet itself can be held to are unit tests (`src/ui/rules.test.ts`).

## Step E3f: what changed

The editor made easier for a customer who is not technical (the founder's third round of use).

- **Colours as a heading with its swatches under it** (`ui/ColourRows.tsx`, `ui/ColoursTool.tsx`). Nothing is chosen first. The team colours are three rows, "Main colour", "Second colour", "Accent colour" (optional, with "None"), on the start card and in "Edit team colours"; a colour another row already uses is dimmed and cannot be picked (its name says which row has it). The Colours tool is one row per part of the kit (and per group of a template's shapes): the part's name and the colour it has, the team's colours first, then the common ones; "All colours" opens the rest and "Match a colour code" in that row. On phones a row is one line that swipes with an end fade; on desktops the swatches wrap. The start card's main button sits under the scrolling colours and name, so it stays in view.
- **Click the model** (`react/hover.ts`, `ui/PartPopover.tsx`, `ui/HoverMarks.tsx`). With a mouse, the item under the pointer gets a thin outline of its box (drawn over the canvas from its projected corners) and a part of the garment is marked softly on the model with a small label of its name by the pointer; the pointer is a hand. The part is drawn into a 512 px second texture on the cloth's emissive channel, only when what is under the pointer changes (`HoverTracker`); the garment's own texture is not redrawn and a move over the same thing asks for no frame. A click or tap on a part, from any tool, opens its row: a popover by the click on desktops (`partTapAction`; Escape or a click elsewhere closes it), the Colours tool on that part's row on phones and in landscape, the part marked on the model. A click on an item selects it as before.
- **Turning and sliding** (`react/press-policy.ts`, `react/camera-rig.ts`). A drag turns the model wherever it starts, unless it starts on the selected item or a handle: for a mouse too (before, a mouse press on an unselected item selected and dragged it at once; `dragOnlySelected: "touch"` still gives that to a host). Sliding: two fingers dragged together, the right button, or Shift + drag. The rig owns the slide (`CameraRig.panBy`, the orbit controls still do not pan), limited to half the garment's size from its centre (`clampPan`), and Reset brings it back; the shadow under the hem is hidden while the view is slid.

## The design document

One source of truth: the zod schemas in `src/design/schema.ts`. The TypeScript types are inferred from them (`DesignDocument`, `Layer`, ...) and the JSON Schema files in `schema/` are generated from them (`npm run generate:schema`). A test fails if a committed schema file is stale, and another runs the committed JSON Schema (with Ajv) and the code validator over the same documents to check they agree.

```jsonc
{
  "schemaVersion": 3,
  "product": { "id": "stand-in-jersey" },
  "palette": { "id": "placeholder-palette", "version": 1 },
  "teamColors": {
    "main": { "id": "placeholder-red", "hex": "#C8102E" },
    "second": { "id": "placeholder-royal", "hex": "#1F4E9C", "requested": "#1A5FB4" }
  },
  "teamName": "LAHORE LIONS",
  "samplePlayer": { "name": "محمد علی", "number": "٧" },
  "template": { "id": "hoops", "version": 1 },
  "zones": {
    "body_front": { "id": "placeholder-red", "hex": "#C8102E", "teamColor": "main" },
    "collar": { "id": "placeholder-white", "hex": "#FFFFFF" }
  },
  "fonts": [{ "id": "oswald-700", "family": "Oswald", "weight": 700, "style": "normal", "fallbackFontIds": ["noto-sans-arabic-700"] }],
  "shapes": [
    { "id": "shape-1", "kind": "shape", "group": "hoops", "pieceId": "front", "path": "M -40 512.3 L 0 512.3 L 10 512.1 ... Z",
      "fill": { "id": "placeholder-royal", "hex": "#1F4E9C", "teamColor": "second" }, "locked": true }
  ],
  "layers": [
    {
      "id": "player-name-1", "kind": "text", "role": "player-name", "preset": "back-name", "pieceId": "back",
      "position": { "x": 244, "y": 128 }, "size": { "width": 340, "height": 72.8 }, "rotation": 0,
      "value": "محمد علی", "direction": "auto", "fontId": "oswald-700", "fontSize": 52,
      "fill": { "id": "placeholder-royal", "hex": "#1F4E9C", "teamColor": "second" }, "align": "center",
      "outline": { "color": { "id": "placeholder-red", "hex": "#C8102E", "teamColor": "main" }, "width": 1.56 }
    },
    {
      "id": "crest", "kind": "logo", "role": "crest", "preset": "left-chest", "pieceId": "front",
      "position": { "x": 440, "y": 200 }, "size": { "width": 80, "height": 80 }, "rotation": 0,
      "asset": { "assetId": "upload-7f3a", "mediaType": "image/png", "width": 600, "height": 600 }
    }
  ]
}
```

Layer kinds: `text` and `number` (value, font, size, fill, alignment, optional outline), and `logo` and `clipart` (an `asset` reference). Every layer has a `role` and may name the placement `preset` it was put at (see "Format version 3"). Layers are listed bottom to top: later layers are drawn over earlier ones, and `moveLayer` changes the order.

- A `text` value is one line of Unicode text, 1 to 200 UTF-16 code units, in any script: Latin, Arabic and Urdu names and mixed text such as `Ali علي 10`. It is stored in **Unicode NFC**, so a name typed with a combining accent and the same name typed with the precomposed letter are the same string and compare equal with `===` (the roster checks will rely on that). `addLayer` and `updateLayer` normalise; `validateDesign` refuses text that is not NFC rather than changing it silently. No line breaks, tabs or other control characters, and not only spaces. Bidi marks (LRM, RLM, ALM) are allowed.
- A text layer's `direction` is `"auto"`, `"ltr"` or `"rtl"`. `"auto"` follows the text: the first strong letter decides (Unicode bidi rules P2 and P3), so `محمد علی` reads right to left and `Ali علي` left to right. Digits are never strong letters.
- `align` is `"start"`, `"center"` or `"end"`, **by reading direction**: start is the left edge of the box for left-to-right text and the right edge for right-to-left text.
- A `number` value is a jersey number: see "Jersey numbers" below. In short, a string of 1 or 2 digits worth 0 to 99, in English, Arabic or Urdu digits, one system per number, stored exactly as typed (`"7"`, `"07"`, `"٧"`).
- `rotation` is any finite number of degrees. It is stored as given, not wrapped to 0 to 360 (`725.5` stays `725.5`). A value that is not a finite number is rejected.
- `position` may lie outside the piece (negative, or beyond the piece size) and is accepted by the format. Dragging in the editor keeps the centre inside the piece's box; whatever reaches past the piece's outline is clipped when drawn.

### Format version 3 (step E3a): what changed

Decision 009-14: one clean version, and a plain function that upgrades version 2. What a design holds now, beyond version 2:

- `teamColors`: Main, Second and an optional Accent, each a palette colour (with the code the coach asked for in `requested` when it came from the colour-code match).
- Colours (zones, shapes, fills, outlines) may **follow a team colour** (`teamColor: "main"`). Such a colour always holds the team colour's `id` and `hex` (checked), so the document paints without a lookup and changing a team colour is one edit that rewrites every follower. A colour may also keep `requested`: the code typed by the coach, never printed; `id` and `hex` are always the palette colour (decision 009-6).
- `role` on every layer (N1): `team-name`, `player-name`, `player-number`, `crest`, `sponsor`, `text`, `graphic`; the kind limits the roles (a number is `player-number` or a fixed number with role `text`; logos and clipart are `crest`, `sponsor` or `graphic`).
- `teamName` and `samplePlayer` (name, number): **every team-name layer shows `teamName`, every player-name and player-number layer the sample player's** (checked). So the roster preview swaps two values (`designForPlayer`), and turning the team name off keeps its text. The team name and the player's name may be empty; a player-number layer needs a number.
- `preset` on a layer: the product's placement preset it was put at (checked against the product: it must exist, be on the layer's piece and take its role).
- `outline` on text and number layers: `{ color, width }`, width in mm (at most 20).
- `shapes`: stripes, hoops, a sash: `{ id, kind: "shape", group, pieceId, path, fill, locked }`, SVG path data in piece millimetres, drawn over the zones and under the layers, clipped to the piece; one id space with the layers. A shape that lies wholly outside its piece is refused.
- `template`: the template last applied (`{ id, version }`) or null.

Validation (`validateDesign(input, { product, palette })`) refuses, with readable paths: a role the kind cannot have, an unknown preset or one on another piece or for another role, a shape outside any piece, an off-palette colour or a palette colour with another code (when given the palette), a team-colour reference to a team colour the design has no (an Accent that is not set), a follower that does not hold its team colour, a role layer that does not show the design's value.

**Upgrading** (`upgradeDesign(input, options)`, `upgrade.ts`): a version 2 design gains team colours (Main from its first zone, Second from the first zone of another colour), an empty team name, no template, no shapes; text layers get the role `text` (guessing a team name from positions is what roles stop), logos `crest`, clipart `graphic`; number layers become `player-number` when they all show one number (which becomes the sample player's), otherwise fixed numbers (`text`). Nothing else changes, and `src/test/v2-paint.test.ts` checks that the three version 2 sample designs recorded in commit 95a6b32 paint the same pixels and the same text calls after the upgrade. `validateDesign` refuses a version 2 document and names `upgradeDesign`; version 1 stays refused.

### Format version 2 (step E2): what changed, and why old documents are refused

A version 1 document is refused with `format version 1 is not supported`; no migration exists because no version 1 design was ever saved in production, and a version 1 logo cannot be migrated (it did not record its pixel size). Changes:

- text layers: `align` is `start`, `center` or `end` (was `left`, `center`, `right`); a required `direction`; NFC, one line, not blank;
- fonts: optional `fallbackFontIds` (other fonts of the document, tried in order for characters the font lacks); `family` may not contain quotes, backslashes, semicolons, braces or angle brackets, because it goes into a CSS font string;
- asset references: required `width` and `height` in pixels (used for the DPI check); `image/webp` added; a `logo` takes PNG, JPEG or WebP only (customer uploads), `clipart` may also be SVG (our own curated files);
- product definitions kept their own `schemaVersion` 1 in E2; E3a made them version 2 (see "Product definitions are data").

### Pattern-piece coordinates

- A **pattern piece** is a flat 2D panel of the garment (front, back, a sleeve). Its size is in the product definition.
- Units are **millimetres**, at real garment scale, never screen pixels or UV values.
- The origin is the piece's **top-left corner**, X to the right, **Y down** (the same orientation as SVG and as glTF UVs).
- A layer's `position` is its **centre**. `size` is its unrotated box. `rotation` is in **degrees, clockwise**, about the centre.
- A product definition maps each piece to a mesh in the model and to a rectangle in the model's UV space (`uv`: x, y, width, height, glTF convention, origin top-left). Piece to UV is then a linear map: `u = uv.x + (px / piece.width) * uv.width`, and the same for V. The 3D view and the proof renders use that map; the stored numbers never change.
- `fontSize` is the em size in mm.

### Colours

A colour is `{ "id": "<palette colour id>", "hex": "#RRGGBB" }`: a palette reference plus the HEX copied from the palette when it was picked. HEX is always **upper case, 6 digits**. Storing the HEX makes the document renderable without the palette and keeps old designs readable if a palette later changes; the document-level `palette` (id and version) says which palette the ids belong to. Zones hold one colour each, keyed by zone id. Zones, text fills, outlines and shapes use the same colour shape, which in format version 3 may also say which team colour it follows (`teamColor`) and which code the coach asked for (`requested`, never printed).

### Assets and vectors

`logo` and `clipart` layers hold `asset: { assetId, mediaType, width, height }`, a reference to a file in asset storage and its pixel size. The image's bytes are never in the document (a test adds an uploaded logo and checks the JSON). SVG stays SVG; PNG, JPEG and WebP are kept as the original file. Nothing is rasterised or re-encoded into the document. A text layer stays text (value, font reference), not outlines.

### Functions (`@fitmyoutfit/editor/design`)

- `createDesign(product)`: empty design, every zone at its default colour.
- `validateDesign(input, { product? })`: returns `{ ok: true, value }` or `{ ok: false, errors: [{ path, message }] }`. **Never throws**: a value that cannot even be read (a throwing getter, a Proxy that throws) comes back as one error with an empty `path` and the message `a design could not be read (<reason>)`. With `product`, it also checks that zones and pattern pieces exist. Rules that need several parts of the document (unique ids, `fontId` listed in `fonts`) run only after the structure is valid.
- `validateProductDefinition(input)` (also never throws), `assertValidDesign(input)`.
- Edits, all immutable (they return a new document, never change the input, and throw `DesignError`, never a raw `TypeError`, with readable messages for invalid input, including a wrong argument such as `undefined` or `null`): `setZoneColor`, `addLayer`, `updateLayer`, `removeLayer`, `moveLayer(design, id, toIndex)` (0 is the bottom; clamped), `addFont` (its `fallbackFontIds` must already be in the document), `addCatalogFont(design, catalog, fontId)` (adds a catalogue font after its fallbacks). `updateLayer` replaces nested objects (`position`, `size`) whole and cannot change `id` or `kind`.
- New layers with first placements: `newTextLayer`, `newNumberLayer`, `newLogoLayer` (a logo starts as wide as prints sharp at the minimum DPI, at most 100 mm), `nextLayerId`.
- Text: `normalizeText`, `isNormalizedText`, `resolveTextDirection`, `firstStrongDirection`, `physicalAlign`.
- Placement in piece millimetres: `pieceAtMeshUv(product, meshName, uv)` (a hit on the model to a point on the mesh's piece), `layerAtPoint`, `isPointInLayer`, `layerCorners`, `startLayerDrag` and `dragPosition` (keeps the grab offset, ignores other pieces, keeps the centre in the piece), `scaleLayer` (box and font size together), `normalizeRotation`.
- Upload checks (see "Logo uploads"): `checkLogoFile`, `readImageHeader`, `sniffImageType`, `fileSizeIssue`, `analyseTransparency`, `logoLayerDpi`, `logoLayerWarnings`, `DEFAULT_UPLOAD_LIMITS`.
- Font catalogue: `validateFontCatalog`, `fontRefFromCatalog`, `fontCatalogSchema`.
  - A text or number layer must use a font listed in `design.fonts`: `addLayer` and `updateLayer` refuse an unknown `fontId`. Add the font first with `addFont`.
  - A number layer's value must follow the jersey number rule (below), in `validateDesign` and in `addLayer` and `updateLayer`, with the same readable message. Pass `{ jerseyNumberRules }` (next to `{ product }`) to use other rules than the default data.
  - Pass `{ product }` as the last argument (`addLayer(design, layer, { product })`, `updateLayer(design, id, patch, { product })`, `setZoneColor(design, zone, colour, { product })`) to also refuse a `pieceId` or zone that the product does not have, or a product that is not the one the design is for. Without it only the document is checked, because the document does not carry the product's pieces.
  - **Fonts that no layer uses any more stay in `fonts`** after `removeLayer` or after a layer switches font. They are harmless, the next layer can reuse them, and nothing removes data behind the caller's back. A later "tidy up" step (for example when saving) can drop them.
- A zone id may not be `__proto__`, `constructor` or `prototype`, and a `__proto__` key in a JSON document is a validation error rather than being dropped silently.
- `getDesignJsonSchema()`, `getProductJsonSchema()`, `getFontCatalogJsonSchema()`.
- Format version 3 and E3a (details in "Team colours, roles, templates and the palette"): `upgradeDesign`, `upgradeV2`; team colours `setTeamColor`, `swapTeamColors`, `setZoneTeamColor`, `setShapeGroupColor`, `teamColourValue`, `teamColourRoles`, `teamColourUses`, `mapDesignColours`; roles `setTeamName`, `setSamplePlayer`, `designForPlayer`, `setRoleValue`, `roleValue`, `findLayers`, `findRoleLayersOnSide`, `layerSide`, `setRoleSlot`, `isRoleSlotOn`, `newRoleLayer`, `placeAtPreset`, `setSizeStep`, `sizeStepOf`, `setOutline`, `outlineWidthMm`, `outlineStepOf`, `presetsForRole`, `requirePreset`; templates `validateTemplate`, `applyTemplate`, `resolveTemplateColour`; palette `validatePalette`, `nearestPaletteColour`, `matchColourCode`, `matchLevel`, `coloursCommonFirst`, `coloursByFamily`, `paletteColourRef`; colour maths `parseColourCode`, `hexToLab`, `ciede2000`, `colourDifference`, `contrastRatio`, `relativeLuminance`; readability `itemReadability`, `designReadability`, `backgroundAt`, `readabilityFix`, `outlineColourFor`.

The JSON Schema cannot check NFC, a visible character, font references or the number maximum; `validateDesign` does, and `json-schema.test.ts` lists each such difference.

## Jersey numbers

The founders' rule (S0-3c), held as data and applied by one set of plain functions. The backend's roster checks use the same functions, so a number is judged the same way in the editor and at order time.

- A jersey number is a string of digits worth **0 to 99**. The longest allowed string follows from the maximum: **2 digits**, counting leading zeros, so `"007"` is invalid.
- Allowed digit systems: Western `0-9` (U+0030 to U+0039), Arabic-Indic `٠-٩` (U+0660 to U+0669) and Extended Arabic-Indic `۰-۹` (U+06F0 to U+06F9, the Urdu and Persian forms). **One number may not mix systems** (`"1٢"`, and `"٧۷"`, are invalid).
- Leading zeros are allowed and do not change the value: `"07"` and `"7"` are both 7. The string is kept exactly as typed; digits are never converted to another system.
- **The same number:** two numbers are the same when their values are equal, in any digit system and with or without leading zeros: `"7"`, `"07"`, `"٧"` and `"۷"`.
- Nothing else: no signs, spaces, decimal points, full-width digits (`"７"`). Nothing is trimmed or normalised: `" 7"` is invalid. Empty is invalid.

**The limits are data.** They live in `src/design/jersey-number-rules.ts` as `DEFAULT_JERSEY_NUMBER_RULES` (`{ maxValue: 99, digitSystems: [...] }`, each system being an id, a name and the code point of its zero). Every function below takes `rules` as an optional last argument and defaults to that data, so the backend can pass rules loaded from its own settings without a code change here. `checkJerseyNumberRules(rules)` returns a description of what is wrong with a rules object (or `null`); an unusable rules object makes the functions throw a `RangeError`.

```ts
import {
  checkJerseyNumber, jerseyNumberValue, isSameJerseyNumber, findDuplicateJerseyNumbers,
} from "@fitmyoutfit/editor/design"; // also from "@fitmyoutfit/editor"; no React or Three.js

checkJerseyNumber("٠٧");   // { ok: true, value: 7, digitSystem: "arabic-indic" }
checkJerseyNumber("100");  // { ok: false, error: '"100" has more than 2 digits (the largest jersey number is 99; leading zeros count)' }
checkJerseyNumber("1٢");   // { ok: false, error: '"1٢" mixes two digit systems (Western (0-9) and Arabic-Indic (٠-٩)); use one system only' }
jerseyNumberValue("07");   // 7  (null when invalid)
isSameJerseyNumber("7", "۷"); // true

// Roster check: one call over every player's number, as typed.
const { duplicates, invalid } = findDuplicateJerseyNumbers(players.map((p) => p.number));
// duplicates: [{ value: 7, indexes: [0, 3], numbers: ["7", "٧"] }]  (sorted by value; indexes are list positions)
// invalid:    [{ index: 5, entry: "100", error: "..." }]
```

- `checkJerseyNumber(input: unknown, rules?)` returns `{ ok: true, value, digitSystem }` or `{ ok: false, error }`. It accepts any input and never throws for a bad number; `error` is a readable phrase that starts with the quoted number (or says what type it got).
- `isValidJerseyNumber(input, rules?)`, `jerseyNumberValue(input, rules?)` (the value, or `null` when invalid), `jerseyNumberMaxLength(rules?)`.
- `isSameJerseyNumber(a, b, rules?)`: true only when both are valid and their values are equal. An invalid entry is never "the same" as anything.
- `findDuplicateJerseyNumbers(list, rules?)` returns `{ duplicates, invalid }`. **Invalid entries never crash it and never count as duplicates**, not even two identical invalid strings: they are listed in `invalid` (index, entry, reason) so the caller can show both problems. Without a list it throws a `TypeError`.
- The error wording may be improved over time. Test on `ok`, not on the text, in the backend.

### How the JSON Schema and the validation function divide the work

A JSON Schema cannot say "at most N" where N is data, so `schema/design.schema.json` checks the **structure** of a number layer's value only: one or more digits, all from one of the three digit systems (that pattern also rules out mixing). **The maximum (99) and the length that follows from it are enforced by `validateDesign` and the edit functions**, with the rules you pass in. This is stated in the schema's `description` for the value. So a document can pass the schema and still be rejected by `validateDesign` (`"100"`); never the other way round. Treat `validateDesign` as the rule and the schema as a structural pre-check for other tools. A test (`json-schema.test.ts`) lists exactly where the two differ.

Limit of "rules as data": rules can change the maximum or allow fewer digit systems. A digit system that is not one of the three in the default data is still refused by the schema's pattern, which is built from the default data. Adding a fourth system means adding it to the default data and regenerating the schema.

## Product definitions are data

A product definition (`samples/products/placeholder-jersey.json`, schema in `schema/product.schema.json`) lists the model file, the palette, the colour zones (id, name, default colour) and the **pattern pieces**. Each piece is vector data in its own millimetres:

```jsonc
{
  "id": "front", "name": "Front", "mesh": "front", "width": 560, "height": 700,
  "uv": { "x": 0.02, "y": 0.02, "width": 0.448, "height": 0.56 },
  "outline": "M 160 0 L 400 0 L 505 45 Q 535 80 540 160 L 560 700 L 0 700 L 20 160 Q 25 80 55 45 Z",
  "zone": "body",
  "regions": [
    { "zone": "yoke", "path": "M -10 -10 H 570 V 115 Q 280 175 -10 115 Z" },
    { "zone": "side_panels", "path": "M -10 230 L 92 230 L 70 710 L -10 710 Z M 570 230 L 468 230 L 490 710 L 570 710 Z" }
  ]
}
```

- `outline` is the cut shape: one closed SVG path inside the piece's box (0, 0) to (`width`, `height`). It is what production files will be cut from.
- `zone` fills the whole piece. `regions` are areas of other zones, drawn bottom to top. A region may reach past the outline (a band that runs to the edge); only the part inside the outline is garment.
- Paths use SVG path syntax with the commands **M, L, H, V, C, Q, Z** (absolute or relative). Arcs (`A`) and the smooth shorthands (`S`, `T`) are refused with a message: write arcs as cubic curves. One small parser (`src/design/svg-path.ts`) reads every path, so what is validated, drawn, hit-tested and used to build the placeholder model is the same shape.
- `mesh` is the name of the node in the model that carries the piece (the name Blender shows). Several pieces may share one mesh, each with its own UV island.
- `uv` is the piece's box in the model's UV space. It must have the piece's proportions (within 1%, or artwork would be stretched), and pieces may not overlap (the model has one texture).

`validateProductDefinition` checks all of that, plus that every zone a piece names exists and that every zone is drawn on some piece. The JSON Schema checks the structure and the characters of the paths only; its descriptions say so. A test lists where the two differ.

Product definitions are format **version 2** (step E3a), which adds:

- `teamColors`: the team colours a new design starts with;
- `views`: the pieces that show the front and the back (thumbnails, flat views);
- `placements`: named **placement presets** (N5), in the order the interface offers them: `{ id, name, pieceId, centre, maxSize, roles, side, fontSize }`: where a layer of one of `roles` goes, centred where on which piece, its largest box, the side the camera turns to, and the font size of text and numbers at the Medium size. Validation checks each centre lies inside its piece's outline. The stand-ins' presets are in their source records and generated into the product definitions; the placeholder's are written by hand. They replace the demo's old `demo/placements.ts`.
- `printArea` on a piece (optional, E3b, N6): `{ x, y, width, height }` in the piece's millimetres, where items may be printed. An item's whole turned box stays inside it after every edit (the print-area rule, E3c: made smaller when it cannot fit); without one, the piece's box is the limit. `minItemSize` and `placementOrder` (optional, E3c): see "Step E3c". Validation checks the area is inside the piece's box and every preset's centre is inside its piece's area. The middle of the area is the piece's centre line for snapping. The stand-ins' areas are **placeholders** (until the factories give theirs), kept in their source records (`printAreas`, copied by the generator) and in their product definitions; the `.glb` files are unchanged. An item can still cross the piece's cut shape inside its area (the area is a rectangle): the "clipped" check (`isClipped`) says so, and "Move it in" (`moveInside`) finds the nearest place where it fits. Capabilities by decoration method (4.9) are a later step.

A real model replaces the placeholder by changing this JSON and the GLB file; no code changes. The demo now shows such a model by default: `samples/products/stand-in-jersey.json` (see "Stand-in models").

### From the design to the model

`drawPatternTexture(ctx, product, design, { size })` (root entry, no Three.js; any 2D context) draws one square texture that covers the model's whole UV space: each piece's box at `uv * size` pixels, drawn with a transform from the piece's millimetres to those pixels, filled with its zone colour and then its regions. In the texture each piece fills its whole box plus a margin of `size / 128` pixels, so filtering at the seams never shows the background. Margins are drawn first for every piece, then every piece exactly, so a margin never covers a neighbour. With `mode: "flat"` it draws the pieces as cut instead (clipped to the outline, outline stroked), as in the demo's "Flat pattern pieces".

`DesignCanvas` keeps one 2D canvas and one `CanvasTexture` per model, puts the texture on the materials of the pieces' meshes (white, so the texture carries the colour), and redraws and re-uploads it whenever the design changes. The model is not reloaded. At 2048 x 2048 the texture costs 16 MiB of GPU memory, about 21 MiB with mipmaps. A redraw of the five pieces takes well under a millisecond of drawing; the upload follows on the next frame. The placeholder's front gets about 1.6 texture pixels per millimetre at that size, every piece of the stand-in jersey 1.58, of the stand-in T-shirt 1.9.

How the 3D view looks (cheap enough for a phone: no shadows, no environment map, one draw per mesh: the stand-in jersey is one mesh, the T-shirt one per piece):

- **Cloth shading** (`react/fabric.ts`): the garment's material stays a plain standard material (rough, not metallic, both sides drawn) with a small shader patch. A model may carry baked ambient occlusion per vertex for both sides of the cloth (custom glTF attribute `_OCCLUSION`); folds, armpits and the inside are darkened by it. Back faces are the **inside** of the garment: darker, and coloured from a second, small texture (256 px, about 256 KB) drawn from the colour zones only, redrawn only when a zone colour changes. So no print shows mirrored through the neck opening.
- **Studio** (`react/studio.ts`): a sky light and three directional lights (key, fill, rim) that follow the camera, so every side is lit alike; a soft CSS gradient behind the canvas (override it with `style.background`). Tone mapping is Khronos PBR Neutral, which keeps palette colours true under even light and rolls highlights off instead of clipping.

Pure helpers for the same mapping, on the `/design` entry: `pieceToUv`, `uvToPiece`, `pieceAtUv`, `zoneAtPiecePoint`, `zoneAtUv` (the zone under a tap on the model, from the hit's UV), `isInsidePiece`, `piecesByZone`, `pieceGeometry`; and on the root entry: `pieceTextureRect`, `pieceTextureScale`, `pieceToTexture`, `textureToPiece`.

## Stand-in models

The demo shows `samples/models/stand-in-jersey.glb` with `samples/products/stand-in-jersey.json` by default, and `samples/models/stand-in-tshirt.glb` with `samples/products/stand-in-tshirt.json` on request. They are **stand-ins**: real garments so the editor can be judged on something that looks like clothing, until our own pattern-based models (from our pattern maker and 3D artist) arrive and replace them, again by changing only those files.

Both are made by one script from two source records (data): `samples/models/stand-in-jersey.source.json` and `samples/models/stand-in-tshirt.source.json` hold the source's URL, licence and SHA-256, how to read it, and the mapping from its geometry to our pattern pieces and colour zones. Download the source file (it is not in the repository), then from `packages/editor` run `npm run process:stand-in -- <path to the .glb>`. The script picks the record whose SHA-256 matches the file and refuses any other file. It reads the file as data only (its own strict GLB reader, `scripts/model-prep/glb.ts`) and rewrites the GLB and the product definition. Rerunning it on the T-shirt's source gives the committed files byte for byte.

### Stand-in football jersey

- **Where it comes from:** "Jersey Patterns 3D Free" by Wearable3D (https://sketchfab.com/Wearable3D), https://sketchfab.com/3d-models/jersey-patterns-3d-free-a6b7401510484ee1b375c02f97f14e86, licensed under **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/). CC BY asks for credit wherever the work is shown: the demo shows a credit line over the 3D view, the notice with what we changed is `samples/models/stand-in-jersey.LICENSE.txt`, and the credit is in the GLB's `asset.copyright`. A store page that shows this model needs the same credit.
- **What it is:** a short-sleeved V-neck football jersey with a collar band and stripe, cuffs and cuff stripes, and leaf-shaped side panels with four stripes each: 27 pattern pieces, 103,266 triangles, **one mesh (one draw call)**, 1.69 MB. Front 670.9 x 718.0 mm (it wraps round under the side panels), back 491.4 x 719.7 mm, sleeves 371.2 x 212.2 mm, side panels 151.5 x 330.4 mm. On the model: 103 cm round the chest 25 mm below the armholes (a men's M), back 72 cm from the neckline with the collar, sleeves 23 cm with the cuff.
- **Zones:** body front, body back, sleeves, side panels, collar, collar stripe, cuffs, cuff stripes, side stripes. Every zone is whole pieces (the trims are their own geometry), so no piece has regions. The thin strips of the main fabric between the trims (2.5 mm between cuff and cuff stripe, 2.6 mm in the collar, two strips between the side stripes) follow the sleeves, collar and side panels.
- **What the source is, found from the data** (the script prints this evidence):
  - Sketchfab merged everything per material into five meshes, in centimetres with Z up (a root node turns them to Y up). `Object_0` (98,890 triangles) is the cloth's **outer** layer: rays from it along its normals hit cloth 0.3% (front, back) to 64% (the strips under the arms, which hang close) of the time, against them always (the inner copy is 0.49 mm behind). `Object_1` is the inner copy (its triangles face the other way in UV; its rays hit cloth 95 to 100% along its normals, always against them). The trims' two layers in `Object_3` split the same way (outer 5 to 49%, inner 88 to 100%). `Object_2` (31,032 triangles) is the **edge strips** between the two: 3D area but no UV area. `Object_3` holds **both layers of the trims** in one mesh (14 islands each), `Object_4` their edge strips.
  - The UVs are a 0 to 1 layout of the sewing pattern, 13 islands of main fabric and 14 trims, not millimetres. Measured against the 3D surface (median of 3D edge length over UV edge length, per island), the layout uses **one scale, 1609.9 mm per UV unit**: front, back and side panels within 0.3% of it, sleeves +2.3 and +2.7% (stretched over the arms), so every piece is re-expressed in millimetres with it. Thin trims deviate more (collar stripe +9.6%: it is stretched round the neck) but do not decide.
  - The trims are **sewn in**, edge to edge with the main fabric, not laid on top: no kept surface has other cloth within 0.2 mm in front of or behind it (the script refuses a file where one has), so nothing flickers. Their islands' boxes overlap the sleeves' and side panels' boxes in the source layout (they are curved strips), so every piece gets its own area of the texture.
- **How it is made** (`input.uv: "normalised"`, pieces found by a UV point inside each island): keeps the outer layer of each island; turns Z-up centimetres into Y-up metres through the node transforms; measures the UV scale (`model-prep/scale.ts`); puts each piece in the editor's frame and traces its outline; packs the pieces at one scale (1.576 texture pixels per mm at 2048) with the skyline packer, which fits the thin strips 7% tighter than shelves; checks the orientation (front +Z, wearer's left +X) and that no surface lies on another; welds 1,650 seam vertex groups (moves up to 0.44 mm); bakes occlusion (about 2.5 minutes); joins all pieces into one mesh and stores the vertex data as integers with KHR_mesh_quantization (`model-prep/quantize.ts`, read by Three.js's GLTFLoader without a decoder): 16-bit positions (to 0.01 mm), 8-bit normals, 16-bit UVs. 2.55 MB as floats, 1.69 MB as integers.
- `src/test/stand-in-jersey.test.ts` checks the committed files: true millimetres (a 100 mm square on the front, a sleeve and the back, and 100 mm lines on a side panel, are 158 texture pixels and 95 to 105 mm along the cloth), one scale, the chest, UVs inside outlines, closed seams, no surface on another, no bleeding, every zone shown, size.

### Stand-in T-shirt

- **Where it comes from:** "Garment 3D" by Prashant Verma, https://github.com/prashant3285/garment, file `shirt.glb` ("GLB exported from CLO"), MIT License, Copyright (c) 2021 Prashant Verma. The licence notice, with what we changed, is `samples/models/stand-in-tshirt.LICENSE.txt`; the copyright is also in the GLB's `asset.copyright`.
- **What it is:** a short-sleeved V-neck T-shirt in A-pose, seven pattern pieces (front, back, two sleeves, three neck-band strips), one mesh each, 43,138 triangles, 1.06 MB. Front 520.4 x 712.6 mm, back 522.2 x 738.7 mm, sleeves 417.8 x 182.7 mm (about 103 cm round the chest: a size L).
- **Zones:** body front, body back, side panels (front and back, from the underarm down), sleeves, sleeve ends (a band along the hem) and the neck band.
- **How it is made** (pieces are whole source meshes, `sourceMesh`):
  - keeps the **outer** surface of each piece. CLO exports cloth with thickness: two layers a fabric's thickness apart plus an edge strip. Rays cast from each layer show which side faces open space (from the outer layer, 0 to 16% of rays along its normal hit cloth, against it 100%; from the inner layer 97 to 100% either way);
  - reads each flat piece from the UVs, which CLO writes in millimetres of the flat pattern, and traces its outline from the UV mesh's boundary (lines only, within 0.1 mm);
  - packs all pieces into one texture at **one scale** (1.903 pixels per mm at 2048, shelf packing), 2/128 of the texture apart so each piece's bleed has room;
  - sets every vertex's UV from its piece millimetres through the product definition, welds the seams (sewn vertices up to 0.5 mm apart), smooths normals across them and bakes occlusion for both sides (about 35 s);
  - writes one plain material, no textures, 16-bit indices, float vertex data.
- `src/test/stand-in-model.test.ts` checks the committed files.

The plain functions behind both are in `scripts/model-prep/` with unit tests: `glb.ts` (reading, node transforms, units), `shells.ts` (shells, layers and edge strips, finding an island by a UV point), `scale.ts` (the UV scale from the 3D surface), `frame.ts`, `outline.ts`, `regions.ts`, `packing.ts` (shelf and skyline), `mesh3d.ts` (rays, seams, normals, occlusion), `assemble.ts` (orientation, one mesh), `quantize.ts`. The outlines are the source pieces' **sewing lines** (no seam allowance). They are fine for placing artwork; production cut files will come from our own patterns.

## Placeholder model

The script-generated placeholder below stays as a second sample: the unit tests use its simple, known shapes, and the demo still shows it with `?product=placeholder-jersey`. Nothing shows it by default.

`samples/models/placeholder-jersey.glb` (about 190 KB) is generated by `scripts/generate-placeholder-jersey.ts` with `@gltf-transform/core`: procedural geometry, no third-party model or texture, so there is nothing to attribute. It is built **from the pattern pieces** in the product definition: each piece becomes one mesh named as its `mesh`, whose rows wrap the piece's outline round a simple body (each row of the flat piece becomes a ring or half ring as long as the row is wide, with points spread by arc length, so 1 mm on the piece is about 1 mm on the model). Every vertex's UV is its own point on the flat piece mapped into the piece's UV rectangle, so a point in piece coordinates lands at a known place on the garment. The model has one white material and no textures. Tests check that every mesh's UVs lie inside its own piece's outline and that every zone shows on the model.

## Layers on the model (step E2)

### How layers are drawn

`drawPatternTexture` draws the zones of every piece, then the design's layers bottom to top (`texture/layers.ts`), each in its piece's millimetre-to-pixel transform, translated to the layer's centre and turned by its rotation, and **clipped to the piece's outline**. The same function draws the flat view, so the demo's close-up and (later) proofs show exactly what the model shows.

The text layout rule, which proofs and production files must repeat:

- the line is drawn as text by the browser's text engine (it shapes Arabic and Urdu and orders mixed text inside the line by the Unicode bidi algorithm), with the paragraph direction this package resolves (`direction`, or the first strong letter for `auto`; number layers are always left to right);
- at `fontSize` mm per em, vertically centred on the box (CSS "middle" baseline), anchored at the box's start edge, centre or end edge by `align`;
- a line wider than the box is shrunk evenly to the box's width; it never wraps and is never stretched;
- the font stack is the layer's font, its `fallbackFontIds` in order, then `sans-serif` (`layerFont`);
- an **outline** (`outline.width` mm) is a stroke round the glyphs, twice the width wide with round joins, drawn under the fill, so `width` mm show outside the letters; the letters and their outline fit the box together, so the outline stays inside the box; when a long line is shrunk, the outline shrinks with it (it follows the size the letters are drawn at, E3a-2), but never below `MIN_OUTLINE_MM` (1 mm) or its own width when thinner (`fitLine`);
- `drawPatternTexture` reports for each text and number layer whether it was shrunk and by how much (`textFits`, also in `onTextureDrawn`): the interface says "long names get smaller" from it (N12).

**Shapes** are drawn with the zones, piece by piece, after the zone regions and before every layer, clipped as the regions are: to the outline in the flat view, to the piece's area plus its margin in the texture (so seams bleed in the shape's colour, and nothing reaches another piece).

Logos and clipart are drawn as large as fits inside the box, keeping the image's proportions, centred. An image not loaded yet is drawn as a grey placeholder and listed in `missingImages`. The selected layer can be outlined (`selectedLayerId`, editor view only; never for proofs).

`drawMs` measures recording the drawing calls; browsers may rasterise text later (at upload), so it understates the full cost. No phone measurement has been made yet (E5).

### Fonts

Fonts are data: `samples/fonts/placeholder-fonts.json` (schema `schema/font-catalog.schema.json`) lists three placeholder fonts, each with the scripts it covers, its fallbacks and its licence (SPDX id, copyright line, npm package):

| Font | Package | Licence | Use |
| --- | --- | --- | --- |
| Oswald 700 | `@fontsource/oswald` | OFL-1.1 | names (Latin); falls back to Noto Sans Arabic |
| Graduate 400 | `@fontsource/graduate` | OFL-1.1 | varsity numbers (Latin digits); falls back to Noto Sans Arabic |
| Noto Sans Arabic 700 | `@fontsource/noto-sans-arabic` | OFL-1.1 | Arabic, Urdu (and Latin) |

**The interface fonts of the demo page** (E3d, decision D4 of `docs/design/07-editor-review.md`): the demo page loads the store's two interface faces so the founder judges the real look. They are the host's, not the package's (decision 009: the host provides the interface fonts; the package names them in `--font-heading` and `--font-body` with system fallbacks). Only the Latin subset of the weights the stylesheet uses is imported (`demo/main.tsx`).

| Font | Package | Licence (checked in the package's `LICENSE` and upstream, 17 Nov 2026) | Weights in the demo |
| --- | --- | --- | --- |
| Barlow Condensed | `@fontsource/barlow-condensed` | OFL-1.1, "Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow)" (upstream `OFL.txt`) | 700 |
| Inter | `@fontsource/inter` | OFL-1.1, "Copyright (c) 2016 The Inter Project Authors (https://github.com/rsms/inter)" (upstream `LICENSE.txt`) | 400, 500, 600, 700 |

The editor does not ship font files: **the host declares the faces** (the demo imports `@fontsource/<name>/<weight>.css`; the packages are dev dependencies of this package for the demo). `DesignCanvas` then makes sure text never stays in a fallback silently: a `FontWatcher` asks the font set (`document.fonts` by default) to load each family of each layer for that layer's characters, redraws the texture when faces arrive or fail, and reports `{ loading, missing, failed }` through `onFontStatus`, where `missing` names a family no face was declared for. `loadDesignFonts(fontSet, design)` waits until nothing is loading, for proof renders.

### Logo uploads

The host supplies the upload function; the editor never knows where files go:

```ts
import { uploadLogo, newLogoLayer, addLayer } from "@fitmyoutfit/editor";

const result = await uploadLogo(file, {
  upload: async ({ bytes, mediaType, width, height, fileName }) => ({ assetId: await storage.put(bytes, mediaType) }),
  // limits: DEFAULT_UPLOAD_LIMITS (data), decode: decodeWithBrowser (default)
});
if (result.ok) design = addLayer(design, newLogoLayer(product, { id, pieceId, asset: result.asset }), { product });
// result.issues: [{ code, severity: "error" | "warning", message }] to show
```

`<DesignCanvas assetUrl={(asset) => url}>` then says where to load each asset's image from (with CORS: a cross-origin image without it would stop the texture from uploading). `createMemoryAssetStore()` plays the host in the demo and tests.

A JPEG with an EXIF Orientation of 5 to 8 (a phone photo held upright) is stored as it is and referenced at the size it is seen at: its header gives `orientation`, `uprightSize(header)` the turned size (E3c).

The checks (plain functions on the `/design` entry, no DOM, so the backend runs the same ones on the same bytes; limits in `DEFAULT_UPLOAD_LIMITS`, placeholders until the factories' print specifications arrive). **Errors block the upload, warnings do not.**

| Check | Rule | Limit (data) | Kind |
| --- | --- | --- | --- |
| File type | by the file's signature, never its name or declared type: PNG, JPEG, WebP. A GIF, PDF, HEIC, SVG or text file renamed to `.png` is refused and named | `acceptedTypes` | error |
| Damaged | header missing or cut short, no image data, or (in the browser) the file does not decode or decodes at another size than its header says | | error |
| File size | checked before the file is read | `maxFileBytes` 10 MB | error |
| Dimensions | longest side, total pixels, smallest side | `maxSidePx` 8000, `maxPixels` 40 M, `minSidePx` 16 | error |
| Animation | animated PNG or WebP (only one frame would print) | | error |
| Transparency | JPEG, or PNG/WebP without alpha (from the header); else the decoded pixels: fewer than 25% of the edge pixels transparent | `transparentAlphaMax` 16, `minTransparentEdgeShare` 0.25 | warning: "will print as a box" |
| Resolution | pixels per inch at the size the logo is placed (drawn) at; recalculated from the layer after every resize (`logoLayerWarnings`), from the design data alone | `minDpi` 150 | warning |

**SVG is not accepted for uploads.** A solid check (no scripts, no event attributes, no external or `javascript:` references, no `foreignObject`, no entity tricks, CSS `url()` and `@import`) needs a real XML parser and an allow-list sanitiser that behaves the same on the server; a hand-written pattern check would not be solid, and a strict allow-list would refuse most Illustrator and Inkscape exports anyway. Customers upload PNG, JPEG or WebP; curated clipart may still be SVG.

### Dragging on the model: pointer to piece millimetres

With `onLayerDrag`, a press on a layer drags it instead of turning the garment. A capture-phase listener on the canvas's parent sees the pointer before the orbit controls. The pointer is cast as a ray into the scene; the first hit gives the mesh and the UV at that point; `pieceAtMeshUv` finds the piece of that mesh whose UV rectangle holds the UV and turns it into the piece's millimetres (the inverse of the linear piece-to-UV map). `layerAtPoint` picks the topmost layer whose turned box (plus `touchSlopMm`) holds the point. During the drag the layer keeps its grab offset, moves only while the pointer is on its own piece, and its centre stays inside the piece's box. Moves are sent at most once per animation frame, between a `start` and an `end` (or `cancel`). A press while another pointer is down (orbit, pinch) is left to the orbit controls; a second finger during a drag cancels the drag (E3c). The ray is cast through a bounding-volume hierarchy of the mesh once it is built (E3c).

### Undo and redo

`state/history.ts` is a plain immutable history over any value: `commit` records a step; a gesture (`beginGesture`, `updateGesture` for every pointer move or slider value, `endGesture`) records **one** step from its start to its end, or none if nothing changed; `undo` and `redo` end an open gesture first; equal values (`sameJson` for designs) are never a step; at most `limit` (200) steps are kept. `useDesignHistory` wraps it for React. Selection is not part of the history (it is not part of the design). Every step can carry a **label key** (`commit(next, label)`, `beginGesture(h, label)`; the keys are `EDIT_LABELS`: "zone-colour", "template", "move" ...), and `undoLabel` and `redoLabel` say what the next undo or redo changes, so the interface can announce "Undone: Body colour" in its own words (N18).

## Team colours, roles, templates and the palette (step E3a)

All plain functions on the `/design` entry (no React, no Three.js), except the thumbnails (root entry, any 2D context).

**Team colours** (06-editor 4.2): `setTeamColor(design, role, colour | null)` sets Main, Second or Accent (null removes the Accent; what followed it keeps its colour) and recolours every follower; `swapTeamColors(design)` swaps Main and Second across the kit; `setZoneTeamColor`, `setShapeGroupColor` and `teamColourValue(design, role)` (a fill or outline that follows a team colour) make things follow. Each is one document change, so one undo step.

**Roles and presets** (4.5): `setTeamName`, `setSamplePlayer`; `designForPlayer(design, { name, number })` is the roster preview's swap (Latin, Arabic and Urdu names in NFC; English, Arabic or Urdu digits under the jersey number rule). `findLayers(design, { role, preset, pieceId, kind })` and `findRoleLayersOnSide(design, product, "player-number", "back")` answer "which item is the player's number on the back" from data. `setRoleSlot(design, role, preset, on, { product, fonts, style })` is a Players switch (on: a layer in the style of the role's layer already on the kit; off: removed, the value kept). `placeAtPreset` is a "Where" chip; `setSizeStep` (Small 0.8, Medium 1, Large 1.25 times the preset's font size) and `setOutline` (Thin 3%, Medium 5%, Thick 8% of the font size, at least 1 mm) are the style controls.

**Templates** (4.1, N2; `template.ts`, `samples/templates/<product>/`): a template gives every zone a team colour role or a fixed palette colour, carries shapes with colour roles and groups, and places the role slots at presets with their style (font and colour always; outline and size only if it sets them). `applyTemplate(design, template, { product, fonts, previous })` keeps the team colours, team name, logos and free text with their presets, the sample player, the coach's own slot switches and the style choices the template leaves open; it changes the zone colours, the shapes, the slots' positions and the fonts and colours the template sets. `previous` (the template the design has) lets it tell the coach's switches and outlines from the old template's. An Accent role falls back to Second (or the template's `accentFallback`) when the team has two colours.

The sample templates are **placeholders we drew** from generic sports shapes, generated by `scripts/make-sample-templates.ts`: the jersey has Classic, Hoops, Vertical stripes, Sash and Chevron; the T-shirt Plain, Contrast sides and Chest band. Hoops and the chest band are lines of **equal body height measured on the committed 3D model** (each piece's vertices give their piece millimetres and their height), so their edges meet at every seam, front to side panel to back; the gap between hoops is centred on the chest name's measured height. Since E3a-2 every one is readable in both sample colour sets (a test checks): Hoops and Vertical stripes carry a plain back panel (group `panel`) behind the player's name and number, Vertical stripes a plain chest band (group `band`) behind the team name, and the Sash puts the team name on the upper back (across the sash, half of it vanished).

**Thumbnails** (N13): `drawTemplateThumbnail` draws a template's front piece flat (kept for tests and flat views). The **cards** the interface shows are `drawTemplateCard` / `drawDesignView`: the garment as the 3D model shows it (see "The camera and the cards").

**Palette and the colour-code match** (4.3, N14): a palette (`samples/palettes/placeholder-palette.json`, `validatePalette`) lists colours with families, a `common` order for the start card, and `printTested`. The sample palette is 30 placeholder colours in the specification's seven families and says **not print-tested**. `matchColourCode(palette, input)` reads 3 or 6 hex digits (with or without `#`), finds the nearest palette colour by **CIEDE2000** (`colour.ts`, written by hand: sRGB to CIELAB with D65 as Bruce Lindbloom publishes it, and the formula checked against all 34 test pairs of Sharma, Wu and Dalal 2005), and returns the difference, the match level (`very-close` up to 2, `close` up to 6, `different` above, `DEFAULT_MATCH_THRESHOLDS`) and the value to apply: the palette colour, with `requested` beside it. An invalid code is refused with `code: "invalid-code"`.

**Readability** (N15): `itemReadability(product, design, layerId)` judges an item against **every colour under it** (E3a-2; E3a-1 looked only under its centre): its area is the layer box's width and the letters' height (`INK_HEIGHT_EM` of the font size, plus the outline), turned with the item and sampled about every 4 mm (`readabilityArea`, `readabilitySamples`, `backgroundsUnder`). It passes when the fill reaches 3:1 (`READABILITY_MIN_CONTRAST`) on every colour under it, or when the fill reaches it on none and the outline does on all (outlined letters); letters that show on one colour and vanish on another (a name across a sash) fail as `mixed`. `readabilityRemedy` gives the one-tap fix, which always passes when the palette is given (E3c): team colours first (letters, then an outline), then the palette's best colour (white or black); with `prefer: "outline"` (the coach chose the letters) an outline first. `makeReadable` applies it to every failing item when a design is applied. `outlineColourFor` picks a default outline colour that shows against both the letters and the garment.

## Deliberately left for later

- Dragging items in the flat view (selection by tapping and moving by presets and fine-tune work).
- Warning badges on the model for items that are not selected (the selected item's badge sits beside its handles; "On this kit" and the Done panel list them all).
- Occlusion for handles (an item hidden behind a sleeve still shows its handles if it faces the camera).
- The print-tested palette and the designer's templates (inputs from the founders and the graphic designer): the placeholders are data and are replaced by files only.
- Product capabilities by decoration method (4.9). The factories' real print areas.
- Font metrics for a maximum length per field (E4); the text layout above (shrink to the box) is where they plug in. Curved or arched text and multi-line text.
- Roster preview (E4): the swap exists (`designForPlayer`); the player list, previous and next, and the per-font maximum lengths do not.
- Proof renders (E5): draw with `drawPatternTexture` after `loadDesignFonts`, refuse when `missingImages` is not empty, and never pass `selectedLayerId`.
- SVG logo uploads (see "Logo uploads"); a malware scan of uploads (M4).
- Migrations other than version 2 to 3 (version 1 is refused with a clear message).
- Mirrored or rotated pieces in UV space, per-layer visibility or locking (shapes carry `locked`; layers do not).
- Saving, design versions ("every save creates a new version") and share links: backend concerns. `schemaVersion` is the format version only.
- Thinning the stand-in jersey's mesh (103,266 triangles; the simulation mesh is far denser than a phone needs) and compressing the T-shirt's (1.06 MB as floats; quantising it as the jersey's would save about a third). Thinning needs a mesh simplifier (meshoptimizer's, for example), which is a new dependency. Performance tuning for mid-range phones. The component renders on demand (`frameloop="demand"`) and caps the pixel ratio at 2, but no phone measurements have been made. If phones struggle, pass `textureSize={1024}` (a quarter of the memory).
