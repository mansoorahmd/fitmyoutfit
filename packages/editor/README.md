# @fitmyoutfit/editor

The 3D design editor for the store. It is a standalone React + Three.js package: no Medusa, no Next.js. The storefront embeds it; a future platform could reuse it.

**A design is data, not an image.** A design is a versioned JSON document. Previews, proof renders and production files are all generated from it, so it never holds flattened pixels.

Status: step E2 done. On top of E1 (vector pattern pieces drawn onto the 3D model, orbit camera, colour per zone): text layers in Latin, Arabic and Urdu, jersey number layers, logo uploads with checks (file type by content, size limits, transparency, print resolution), moving layers by dragging them on the model, resizing, rotating, ordering and deleting them, and undo and redo of every change. The document format is `schemaVersion` **2** (see "Format version 2" below); E3 to E5 will extend it.

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
| `npm run process:stand-in -- <source.glb>` | Rewrites a stand-in model and its product definition from its downloaded source file (the jersey or the T-shirt, picked by the file's SHA-256); see "Stand-in models" |

To run the demo on another port: `npm run dev -w packages/editor -- --port 5184 --strictPort` from the repository root. The demo shows the stand-in football jersey; a switch in the header (or `?product=stand-in-tshirt`, `?product=placeholder-jersey`) shows the stand-in T-shirt or the old placeholder instead. A credit line over the 3D view names the model on screen and its licence. It has camera buttons for each side; controls to add a team name (Latin, Urdu and Arabic presets or typed), a number (English or Arabic digits) and a logo on a chosen piece; test files for the upload checks (made in the browser by code); the layer list (select, up, down, delete, low-DPI badge); controls for the selected layer (text, font, alignment, direction, colour, size, rotation, piece); the checks' messages; undo and redo (buttons, Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y; Delete, arrow keys to nudge, Escape to deselect); the colour zones; a flat close-up of the selected piece, the flat pattern, the design JSON and the fonts' licences. Drag a layer on the model to move it. It fits a phone screen: the model stays at the top while the panel scrolls.

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
// touchSlopMm (default 8), ref: { showSide("front" | "back" | "left" | "right") }
```

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

## The design document

One source of truth: the zod schemas in `src/design/schema.ts`. The TypeScript types are inferred from them (`DesignDocument`, `Layer`, ...) and the JSON Schema files in `schema/` are generated from them (`npm run generate:schema`). A test fails if a committed schema file is stale, and another runs the committed JSON Schema (with Ajv) and the code validator over the same documents to check they agree.

```jsonc
{
  "schemaVersion": 2,
  "product": { "id": "placeholder-jersey" },
  "palette": { "id": "placeholder-palette", "version": 1 },
  "zones": { "body": { "id": "placeholder-white", "hex": "#FFFFFF" } },
  "fonts": [
    { "id": "noto-sans-arabic-700", "family": "Noto Sans Arabic", "weight": 700, "style": "normal" },
    { "id": "oswald-700", "family": "Oswald", "weight": 700, "style": "normal", "fallbackFontIds": ["noto-sans-arabic-700"] }
  ],
  "layers": [
    {
      "id": "text-1", "kind": "text", "pieceId": "back",
      "position": { "x": 280, "y": 150 }, "size": { "width": 448, "height": 98 }, "rotation": 0,
      "value": "محمد علی", "direction": "auto", "fontId": "oswald-700", "fontSize": 70,
      "fill": { "id": "placeholder-navy", "hex": "#1B2A5C" }, "align": "center"
    },
    {
      "id": "logo-1", "kind": "logo", "pieceId": "front",
      "position": { "x": 125, "y": 140 }, "size": { "width": 80, "height": 80 }, "rotation": 15,
      "asset": { "assetId": "upload-7f3a", "mediaType": "image/png", "width": 600, "height": 600 }
    }
  ]
}
```

Layer kinds: `text` and `number` (value, font, size, fill, alignment), and `logo` and `clipart` (an `asset` reference). Layers are listed bottom to top: later layers are drawn over earlier ones, and `moveLayer` changes the order.

- A `text` value is one line of Unicode text, 1 to 200 UTF-16 code units, in any script: Latin, Arabic and Urdu names and mixed text such as `Ali علي 10`. It is stored in **Unicode NFC**, so a name typed with a combining accent and the same name typed with the precomposed letter are the same string and compare equal with `===` (the roster checks will rely on that). `addLayer` and `updateLayer` normalise; `validateDesign` refuses text that is not NFC rather than changing it silently. No line breaks, tabs or other control characters, and not only spaces. Bidi marks (LRM, RLM, ALM) are allowed.
- A text layer's `direction` is `"auto"`, `"ltr"` or `"rtl"`. `"auto"` follows the text: the first strong letter decides (Unicode bidi rules P2 and P3), so `محمد علی` reads right to left and `Ali علي` left to right. Digits are never strong letters.
- `align` is `"start"`, `"center"` or `"end"`, **by reading direction**: start is the left edge of the box for left-to-right text and the right edge for right-to-left text.
- A `number` value is a jersey number: see "Jersey numbers" below. In short, a string of 1 or 2 digits worth 0 to 99, in English, Arabic or Urdu digits, one system per number, stored exactly as typed (`"7"`, `"07"`, `"٧"`).
- `rotation` is any finite number of degrees. It is stored as given, not wrapped to 0 to 360 (`725.5` stays `725.5`). A value that is not a finite number is rejected.
- `position` may lie outside the piece (negative, or beyond the piece size) and is accepted by the format. Dragging in the editor keeps the centre inside the piece's box; whatever reaches past the piece's outline is clipped when drawn.

### Format version 2 (step E2): what changed, and why old documents are refused

A version 1 document is refused with `format version 1 is not supported`; no migration exists because no version 1 design was ever saved in production, and a version 1 logo cannot be migrated (it did not record its pixel size). Changes:

- text layers: `align` is `start`, `center` or `end` (was `left`, `center`, `right`); a required `direction`; NFC, one line, not blank;
- fonts: optional `fallbackFontIds` (other fonts of the document, tried in order for characters the font lacks); `family` may not contain quotes, backslashes, semicolons, braces or angle brackets, because it goes into a CSS font string;
- asset references: required `width` and `height` in pixels (used for the DPI check); `image/webp` added; a `logo` takes PNG, JPEG or WebP only (customer uploads), `clipart` may also be SVG (our own curated files);
- product definitions keep their own `schemaVersion` 1 (`PRODUCT_SCHEMA_VERSION`); they did not change.

### Pattern-piece coordinates

- A **pattern piece** is a flat 2D panel of the garment (front, back, a sleeve). Its size is in the product definition.
- Units are **millimetres**, at real garment scale, never screen pixels or UV values.
- The origin is the piece's **top-left corner**, X to the right, **Y down** (the same orientation as SVG and as glTF UVs).
- A layer's `position` is its **centre**. `size` is its unrotated box. `rotation` is in **degrees, clockwise**, about the centre.
- A product definition maps each piece to a mesh in the model and to a rectangle in the model's UV space (`uv`: x, y, width, height, glTF convention, origin top-left). Piece to UV is then a linear map: `u = uv.x + (px / piece.width) * uv.width`, and the same for V. The 3D view and the proof renders use that map; the stored numbers never change.
- `fontSize` is the em size in mm.

### Colours

A colour is `{ "id": "<palette colour id>", "hex": "#RRGGBB" }`: a palette reference plus the HEX copied from the palette when it was picked. HEX is always **upper case, 6 digits**. Storing the HEX makes the document renderable without the palette and keeps old designs readable if a palette later changes; the document-level `palette` (id and version) says which palette the ids belong to. Zones hold one colour each, keyed by zone id. Fonts, text fills and zones all use the same colour shape.

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
- the font stack is the layer's font, its `fallbackFontIds` in order, then `sans-serif` (`layerFont`).

Logos and clipart are drawn as large as fits inside the box, keeping the image's proportions, centred. An image not loaded yet is drawn as a grey placeholder and listed in `missingImages`. The selected layer can be outlined (`selectedLayerId`, editor view only; never for proofs).

`drawMs` measures recording the drawing calls; browsers may rasterise text later (at upload), so it understates the full cost. No phone measurement has been made yet (E5).

### Fonts

Fonts are data: `samples/fonts/placeholder-fonts.json` (schema `schema/font-catalog.schema.json`) lists three placeholder fonts, each with the scripts it covers, its fallbacks and its licence (SPDX id, copyright line, npm package):

| Font | Package | Licence | Use |
| --- | --- | --- | --- |
| Oswald 700 | `@fontsource/oswald` | OFL-1.1 | names (Latin); falls back to Noto Sans Arabic |
| Graduate 400 | `@fontsource/graduate` | OFL-1.1 | varsity numbers (Latin digits); falls back to Noto Sans Arabic |
| Noto Sans Arabic 700 | `@fontsource/noto-sans-arabic` | OFL-1.1 | Arabic, Urdu (and Latin) |

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

With `onLayerDrag`, a press on a layer drags it instead of turning the garment. A capture-phase listener on the canvas's parent sees the pointer before the orbit controls. The pointer is cast as a ray into the scene; the first hit gives the mesh and the UV at that point; `pieceAtMeshUv` finds the piece of that mesh whose UV rectangle holds the UV and turns it into the piece's millimetres (the inverse of the linear piece-to-UV map). `layerAtPoint` picks the topmost layer whose turned box (plus `touchSlopMm`) holds the point. During the drag the layer keeps its grab offset, moves only while the pointer is on its own piece, and its centre stays inside the piece's box. Moves are sent at most once per animation frame, between a `start` and an `end` (or `cancel`). A press while another pointer is down (orbit, pinch) is left to the orbit controls; a second finger during a drag is ignored.

### Undo and redo

`state/history.ts` is a plain immutable history over any value: `commit` records a step; a gesture (`beginGesture`, `updateGesture` for every pointer move or slider value, `endGesture`) records **one** step from its start to its end, or none if nothing changed; `undo` and `redo` end an open gesture first; equal values (`sameJson` for designs) are never a step; at most `limit` (200) steps are kept. `useDesignHistory` wraps it for React. Selection is not part of the history (it is not part of the design).

## Deliberately left for later

- Choosing a zone by tapping the model (the lookup, `zoneAtUv`, exists; the raycast and the UI do not).
- Palette data (the demo's swatches are placeholder data in `samples/palettes/`), snapping a custom HEX to the nearest palette colour and its warning (E3), templates (E3).
- Font metrics for a maximum length per field (E4); the text layout above (shrink to the box) is where they plug in. Curved or arched text. Text outlines (strokes) and multi-line text.
- Roster preview (E4): swapping each player's name and number into the text and number layers. The values are plain text in NFC and numbers under the number rule, so the swap is a data change.
- Proof renders (E5): draw with `drawPatternTexture` after `loadDesignFonts`, refuse when `missingImages` is not empty, and never pass `selectedLayerId`.
- SVG logo uploads (see "Logo uploads"); a malware scan of uploads (M4).
- On-model resize and rotate handles (today: sliders and buttons), snapping and guides.
- Migrations between `schemaVersion`s (version 1 is refused with a clear message; no migration).
- Mirrored or rotated pieces in UV space, per-layer visibility or locking.
- Saving, design versions ("every save creates a new version") and share links: backend concerns. `schemaVersion` is the format version only.
- Thinning the stand-in jersey's mesh (103,266 triangles; the simulation mesh is far denser than a phone needs) and compressing the T-shirt's (1.06 MB as floats; quantising it as the jersey's would save about a third). Thinning needs a mesh simplifier (meshoptimizer's, for example), which is a new dependency. Performance tuning for mid-range phones. The component renders on demand (`frameloop="demand"`) and caps the pixel ratio at 2, but no phone measurements have been made. If phones struggle, pass `textureSize={1024}` (a quarter of the memory).
