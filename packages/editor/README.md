# @fitmyoutfit/editor

The 3D design editor for the store. It is a standalone React + Three.js package: no Medusa, no Next.js. The storefront embeds it; a future platform could reuse it.

**A design is data, not an image.** A design is a versioned JSON document. Previews, proof renders and production files are all generated from it, so it never holds flattened pixels.

Status: step E1 done. The placeholder jersey is shown in 3D with its vector pattern pieces drawn onto it as a texture, the camera orbits (mouse and touch), and each colour zone can be recoloured. The document format below is a **first draft** (`schemaVersion` 1) that steps E2 to E5 will extend.

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

To run the demo on another port: `npm run dev -w packages/editor -- --port 5183 --strictPort` from the repository root. The demo shows the jersey, a list of the colour zones with placeholder swatches (`samples/palettes/placeholder-palette.json`), the flat pattern pieces and the design JSON. It fits a phone screen.

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
// Optional: textureSize (default 2048), onTextureDrawn({ size, pieces, fills, drawMs }), onError
```

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
  "schemaVersion": 1,
  "product": { "id": "placeholder-jersey" },
  "palette": { "id": "placeholder-palette", "version": 1 },
  "zones": { "body": { "id": "placeholder-white", "hex": "#FFFFFF" } },
  "fonts": [{ "id": "font-sans", "family": "Inter", "weight": 700 }],
  "layers": [
    {
      "id": "text-1", "kind": "text", "pieceId": "front",
      "position": { "x": 280, "y": 250 }, "size": { "width": 400, "height": 80 }, "rotation": 0,
      "value": "TIGERS", "fontId": "font-sans", "fontSize": 60,
      "fill": { "id": "placeholder-red", "hex": "#C8102E" }, "align": "center"
    }
  ]
}
```

Layer kinds: `text` and `number` (value, font, size, fill, alignment), and `logo` and `clipart` (an `asset` reference). Layers are listed bottom to top.

- A `text` value is any Unicode text of 1 to 200 characters and is stored exactly as written: Latin, Arabic and Urdu names, mixed text such as `Ali علي 10`, and combining marks are all accepted. There is no normalisation, so `e` plus a combining acute and the single character `é` stay different values. (Text direction, alignment by reading direction and font fallback per script belong to the text-layer work in weeks 5 to 6.)
- A `number` value is a jersey number: see "Jersey numbers" below. In short, a string of 1 or 2 digits worth 0 to 99, in English, Arabic or Urdu digits, one system per number, stored exactly as typed (`"7"`, `"07"`, `"٧"`).
- `rotation` is any finite number of degrees. It is stored as given, not wrapped to 0 to 360 (`725.5` stays `725.5`). A value that is not a finite number is rejected.
- `position` may lie outside the piece (negative, or beyond the piece size) and is accepted. Checking that layers stay inside their piece is not done yet (see "Deliberately left for later").

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

`logo` and `clipart` layers hold `asset: { assetId, mediaType }`, a reference to a file in asset storage. SVG stays SVG; PNG and JPEG are kept as the original file. Nothing is rasterised or re-encoded into the document. A text layer stays text (value, font reference), not outlines.

### Functions (`@fitmyoutfit/editor/design`)

- `createDesign(product)`: empty design, every zone at its default colour.
- `validateDesign(input, { product? })`: returns `{ ok: true, value }` or `{ ok: false, errors: [{ path, message }] }`. **Never throws**: a value that cannot even be read (a throwing getter, a Proxy that throws) comes back as one error with an empty `path` and the message `a design could not be read (<reason>)`. With `product`, it also checks that zones and pattern pieces exist. Rules that need several parts of the document (unique ids, `fontId` listed in `fonts`) run only after the structure is valid.
- `validateProductDefinition(input)` (also never throws), `assertValidDesign(input)`.
- Edits, all immutable (they return a new document, never change the input, and throw `DesignError`, never a raw `TypeError`, with readable messages for invalid input, including a wrong argument such as `undefined` or `null`): `setZoneColor`, `addLayer`, `updateLayer`, `removeLayer`, `addFont`. `updateLayer` replaces nested objects (`position`, `size`) whole and cannot change `id` or `kind`.
  - A text or number layer must use a font listed in `design.fonts`: `addLayer` and `updateLayer` refuse an unknown `fontId`. Add the font first with `addFont`.
  - A number layer's value must follow the jersey number rule (below), in `validateDesign` and in `addLayer` and `updateLayer`, with the same readable message. Pass `{ jerseyNumberRules }` (next to `{ product }`) to use other rules than the default data.
  - Pass `{ product }` as the last argument (`addLayer(design, layer, { product })`, `updateLayer(design, id, patch, { product })`, `setZoneColor(design, zone, colour, { product })`) to also refuse a `pieceId` or zone that the product does not have, or a product that is not the one the design is for. Without it only the document is checked, because the document does not carry the product's pieces.
  - **Fonts that no layer uses any more stay in `fonts`** after `removeLayer` or after a layer switches font. They are harmless, the next layer can reuse them, and nothing removes data behind the caller's back. A later "tidy up" step (for example when saving) can drop them.
- A zone id may not be `__proto__`, `constructor` or `prototype`, and a `__proto__` key in a JSON document is a validation error rather than being dropped silently.
- `getDesignJsonSchema()`, `getProductJsonSchema()`.

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

A real model replaces the placeholder by changing this JSON and the GLB file; no code changes.

### From the design to the model

`drawPatternTexture(ctx, product, design, { size })` (root entry, no Three.js; any 2D context) draws one square texture that covers the model's whole UV space: each piece's box at `uv * size` pixels, drawn with a transform from the piece's millimetres to those pixels, filled with its zone colour and then its regions. In the texture each piece fills its whole box plus a margin of `size / 128` pixels, so filtering at the seams never shows the background. Margins are drawn first for every piece, then every piece exactly, so a margin never covers a neighbour. With `mode: "flat"` it draws the pieces as cut instead (clipped to the outline, outline stroked), as in the demo's "Flat pattern pieces".

`DesignCanvas` keeps one 2D canvas and one `CanvasTexture` per model, puts the texture on the materials of the pieces' meshes (white, so the texture carries the colour), and redraws and re-uploads it whenever the design changes. The model is not reloaded. At 2048 x 2048 the texture costs 16 MiB of GPU memory, about 21 MiB with mipmaps. A redraw of the five pieces takes well under a millisecond of drawing; the upload follows on the next frame. The front gets about 1.6 texture pixels per millimetre at that size.

Pure helpers for the same mapping, on the `/design` entry: `pieceToUv`, `uvToPiece`, `pieceAtUv`, `zoneAtPiecePoint`, `zoneAtUv` (the zone under a tap on the model, from the hit's UV), `isInsidePiece`, `piecesByZone`, `pieceGeometry`; and on the root entry: `pieceTextureRect`, `pieceTextureScale`, `pieceToTexture`, `textureToPiece`.

## Placeholder model

`samples/models/placeholder-jersey.glb` (about 190 KB) is generated by `scripts/generate-placeholder-jersey.ts` with `@gltf-transform/core`: procedural geometry, no third-party model or texture, so there is nothing to attribute. It is built **from the pattern pieces** in the product definition: each piece becomes one mesh named as its `mesh`, whose rows wrap the piece's outline round a simple body (each row of the flat piece becomes a ring or half ring as long as the row is wide, with points spread by arc length, so 1 mm on the piece is about 1 mm on the model). Every vertex's UV is its own point on the flat piece mapped into the piece's UV rectangle, so a point in piece coordinates lands at a known place on the garment. The model has one white material and no textures. Tests check that every mesh's UVs lie inside its own piece's outline and that every zone shows on the model.

## Deliberately left for later

- Showing text, number and logo layers on the model (E2). They will be drawn by `drawPatternTexture` in the same per-piece millimetre transform, after the zones, clipped to the piece.
- Choosing a zone by tapping the model (the lookup, `zoneAtUv`, exists; the raycast and the UI do not).
- Palette data (the demo's swatches are placeholder data in `samples/palettes/`), snapping a custom HEX to the nearest palette colour and its warning, templates, undo and redo.
- Upload checks (file type, resolution, DPI), real font files and font metrics, text fitting.
- Roster data and number or name binding for team orders; proof renders. (The number rule and the duplicate check exist as plain functions; the roster itself does not.)
- Migrations between `schemaVersion`s (only version 1 exists; other versions are rejected with a clear message).
- Checks that layers lie inside their piece (today a layer may sit partly or wholly outside it), mirrored or rotated pieces in UV space, per-layer visibility or locking.
- Saving, design versions ("every save creates a new version") and share links: backend concerns. `schemaVersion` is the format version only.
- Compression of the model (Draco or Meshopt) and performance tuning for mid-range phones. The component renders on demand (`frameloop="demand"`) and caps the pixel ratio at 2, but no phone measurements have been made. If phones struggle, pass `textureSize={1024}` (a quarter of the memory).
