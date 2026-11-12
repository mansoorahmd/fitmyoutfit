// Writes the sample templates (samples/templates/<product>/*.json and index.json)
// from the descriptions below: PLACEHOLDER templates we drew ourselves from
// generic sports shapes (plain, hoops, vertical stripes, a sash, a chevron, a
// chest band), until the graphic designer's templates arrive. Nothing is
// copied from another store.
//
// Usage (from packages/editor): npm run generate:templates
//
// Horizontal bands (hoops, a chest band) are drawn at equal HEIGHTS ON THE
// BODY, measured on the committed 3D model: for each piece, the script reads
// the model's vertices (their piece millimetres from the UVs, their height
// from the positions) and traces, column by column across the piece, where a
// given height lies. So a hoop's edges on the front, the side panels and the
// back meet at the same height at every seam, however each piece is cut and
// hangs. Vertical stripes, the sash and the chevron are straight lines in the
// piece's millimetres (they are on one piece, or run from its centre line).
//
// The output is data; the templates are validated against the product and
// the font catalogue before they are written.

import { NodeIO } from "@gltf-transform/core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateProductDefinition } from "../src/design/validate.js";
import { validateFontCatalog } from "../src/design/font-catalog.js";
import { uvToPiece } from "../src/design/pattern.js";
import { validateTemplate, type Template, type TemplateColour, type TemplateSlot } from "../src/design/template.js";
import type { PatternPiece, ProductDefinition } from "../src/design/schema.js";
import { KHRMeshQuantization } from "./model-prep/quantize.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8")) as unknown;
const fontsResult = validateFontCatalog(read("samples/fonts/placeholder-fonts.json"));
if (!fontsResult.ok) throw new Error(fontsResult.errors.map((e) => e.message).join("\n"));
const fonts = fontsResult.value;

function loadProduct(id: string): ProductDefinition {
  const result = validateProductDefinition(read(`samples/products/${id}.json`));
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join("\n"));
  return result.value;
}

/** Height on the body (mm above the garment's lowest point) at points of each piece, from the model. */
class BodyHeights {
  private readonly triangles = new Map<string, Array<{ p: [number, number][]; h: [number, number, number] }>>();
  private readonly grid = new Map<string, Map<string, number[]>>();
  private static readonly CELL = 12;

  private constructor(readonly product: ProductDefinition) {}

  static async load(product: ProductDefinition): Promise<BodyHeights> {
    const out = new BodyHeights(product);
    const doc = await new NodeIO().registerExtensions([KHRMeshQuantization]).readBinary(readFileSync(resolve(root, "samples", product.model.url.replace(/^\//, ""))));
    let lowest = Infinity;
    const raw: Array<{ piece: PatternPiece; pts: [number, number][]; ys: number[] }> = [];
    for (const node of doc.getRoot().listNodes()) {
      const mesh = node.getMesh();
      if (!mesh) continue;
      const m = node.getWorldMatrix();
      for (const prim of mesh.listPrimitives()) {
        const P = prim.getAttribute("POSITION")!;
        const T = prim.getAttribute("TEXCOORD_0")!;
        const idx = prim.getIndices()!.getArray()!;
        const e = [0, 0, 0];
        const f = [0, 0];
        const flat: Array<{ x: number; y: number; piece: PatternPiece | undefined }> = [];
        const ys: number[] = [];
        for (let v = 0; v < P.getCount(); v++) {
          P.getElement(v, e);
          T.getElement(v, f);
          const y = (m[1]! * e[0]! + m[5]! * e[1]! + m[9]! * e[2]! + m[13]!) * 1000;
          ys.push(y);
          lowest = Math.min(lowest, y);
          const piece = product.pieces.find((p) => f[0]! >= p.uv.x - 1e-4 && f[0]! <= p.uv.x + p.uv.width + 1e-4 && f[1]! >= p.uv.y - 1e-4 && f[1]! <= p.uv.y + p.uv.height + 1e-4);
          const pt = piece ? uvToPiece(piece, { u: f[0]!, v: f[1]! }) : { x: 0, y: 0 };
          flat.push({ x: pt.x, y: pt.y, piece });
        }
        for (let t = 0; t < idx.length; t += 3) {
          const [a, b, c] = [idx[t]!, idx[t + 1]!, idx[t + 2]!];
          const piece = flat[a]!.piece;
          if (!piece) continue;
          raw.push({ piece, pts: [a, b, c].map((v) => [flat[v]!.x, flat[v]!.y] as [number, number]), ys: [ys[a]!, ys[b]!, ys[c]!] });
        }
      }
    }
    for (const { piece, pts, ys } of raw) {
      const list = out.triangles.get(piece.id) ?? [];
      const index = list.length;
      list.push({ p: pts, h: ys.map((y) => y - lowest) as [number, number, number] });
      out.triangles.set(piece.id, list);
      const grid = out.grid.get(piece.id) ?? new Map<string, number[]>();
      out.grid.set(piece.id, grid);
      const xs = pts.map((p) => p[0]);
      const yv = pts.map((p) => p[1]);
      for (let gx = Math.floor(Math.min(...xs) / BodyHeights.CELL); gx <= Math.floor(Math.max(...xs) / BodyHeights.CELL); gx++) {
        for (let gy = Math.floor(Math.min(...yv) / BodyHeights.CELL); gy <= Math.floor(Math.max(...yv) / BodyHeights.CELL); gy++) {
          const key = `${gx},${gy}`;
          const cell = grid.get(key);
          if (cell) cell.push(index);
          else grid.set(key, [index]);
        }
      }
    }
    return out;
  }

  /** The lowest and highest body height on a piece. */
  range(pieceId: string): { low: number; high: number } {
    let low = Infinity;
    let high = -Infinity;
    for (const { h } of this.triangles.get(pieceId) ?? []) {
      low = Math.min(low, ...h);
      high = Math.max(high, ...h);
    }
    return { low, high };
  }

  /** Body height at a point of a piece, or null off the piece's surface. */
  at(pieceId: string, x: number, y: number): number | null {
    const cell = this.grid.get(pieceId)?.get(`${Math.floor(x / BodyHeights.CELL)},${Math.floor(y / BodyHeights.CELL)}`);
    if (!cell) return null;
    const list = this.triangles.get(pieceId)!;
    for (const k of cell) {
      const { p, h } = list[k]!;
      const [A, B, C] = p as [[number, number], [number, number], [number, number]];
      const det = (B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1]);
      if (Math.abs(det) < 1e-12) continue;
      const l1 = ((x - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (y - A[1])) / det;
      const l2 = ((B[0] - A[0]) * (y - A[1]) - (x - A[0]) * (B[1] - A[1])) / det;
      const l0 = 1 - l1 - l2;
      if (l0 >= -1e-6 && l1 >= -1e-6 && l2 >= -1e-6) return l0 * h[0] + l1 * h[1] + l2 * h[2];
    }
    return null;
  }

  /**
   * The line of one body height across a piece: for columns every `step` mm,
   * the piece y where the body height is `height` (heights fall as y grows).
   * Columns the height does not reach take the nearest column's y, and the
   * line runs on 40 mm past both sides of the piece, so a band built from it
   * covers the piece to its edges (the drawing clips it to the piece).
   */
  isoLine(pieceId: string, height: number, step = 10): Array<[number, number]> | null {
    const piece = this.product.pieces.find((p) => p.id === pieceId)!;
    const found: Array<[number, number] | null> = [];
    for (let x = 0; x <= piece.width + 1e-9; x += step) {
      let previous: { y: number; h: number } | null = null;
      let hit: number | null = null;
      for (let y = 0; y <= piece.height; y += 1) {
        const h = this.at(pieceId, x, y);
        if (h === null) {
          previous = null;
          continue;
        }
        if (previous && previous.h >= height && h < height) {
          hit = previous.y + ((previous.h - height) / (previous.h - h)) * (y - previous.y);
          break;
        }
        previous = { y, h };
      }
      found.push(hit === null ? null : [x, hit]);
    }
    const known = found.flatMap((p) => (p ? [p] : []));
    if (known.length === 0) return null;
    // Fill the columns the height does not reach (beyond the cut edge) from the nearest known one.
    const line = found.map((p, k) => {
      if (p) return p;
      const x = k * step;
      const nearest = known.reduce((best, q) => (Math.abs(q[0] - x) < Math.abs(best[0] - x) ? q : best));
      return [x, nearest[1]] as [number, number];
    });
    return [[-40, line[0]![1]], ...line, [piece.width + 40, line[line.length - 1]![1]]];
  }
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const pathOf = (points: Array<[number, number]>) => `M ${points.map(([x, y]) => `${r1(x)} ${r1(y)}`).join(" L ")} Z`;

/**
 * A band between two body heights on a piece (low below high), or null when
 * the piece lies wholly above or below it. A height above the piece's top or
 * below its bottom becomes a straight edge 40 mm past the piece.
 */
function band(heights: BodyHeights, pieceId: string, low: number, high: number): string | null {
  const piece = heights.product.pieces.find((p) => p.id === pieceId)!;
  const range = heights.range(pieceId);
  if (high <= range.low || low >= range.high) return null;
  const across = (y: number): Array<[number, number]> => [[-40, y], [piece.width + 40, y]];
  const top = high >= range.high ? across(-40) : (heights.isoLine(pieceId, high) ?? across(-40));
  const bottom = low <= range.low ? across(piece.height + 40) : (heights.isoLine(pieceId, low) ?? across(piece.height + 40));
  return pathOf([...top, ...bottom.reverse()]);
}

/** A straight band of `width` mm along the line from `a` to `b`, in piece millimetres. */
function strip(a: [number, number], b: [number, number], width: number): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const nx = (-dy / len) * (width / 2);
  const ny = (dx / len) * (width / 2);
  return pathOf([
    [a[0] + nx, a[1] + ny],
    [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny],
    [a[0] - nx, a[1] - ny],
  ]);
}

/** A chevron (a V) of `width` mm, from `left` down to `apex` and up to `right`. */
function chevron(left: [number, number], apex: [number, number], right: [number, number], width: number): string {
  const h = width / 2;
  return pathOf([
    [left[0], left[1] - h],
    [apex[0], apex[1] - h],
    [right[0], right[1] - h],
    [right[0], right[1] + h],
    [apex[0], apex[1] + h],
    [left[0], left[1] + h],
  ]);
}

const MAIN: TemplateColour = { team: "main" };
const SECOND: TemplateColour = { team: "second" };
const ACCENT: TemplateColour = { team: "accent" };

const nameFont = "oswald-700";
const numberFont = "graduate-400";

function slots(options: { teamName?: string; nameFill: TemplateColour; numberFill: TemplateColour; outline?: TemplateSlot["style"]["outline"]; numberOutline?: TemplateSlot["style"]["outline"] }): TemplateSlot[] {
  const out: TemplateSlot[] = [];
  out.push({ role: "team-name", preset: options.teamName ?? "chest-centre", style: { fontId: nameFont, fill: options.nameFill, ...(options.outline !== undefined ? { outline: options.outline } : {}) } });
  out.push({ role: "player-name", preset: "back-name", style: { fontId: nameFont, fill: options.nameFill, ...(options.outline !== undefined ? { outline: options.outline } : {}) } });
  out.push({ role: "player-number", preset: "back-number", style: { fontId: numberFont, fill: options.numberFill, ...(options.numberOutline !== undefined ? { outline: options.numberOutline } : {}) } });
  return out;
}

function template(product: ProductDefinition, t: Omit<Template, "schemaVersion" | "productId" | "version" | "sampleNumber">): Template {
  const full: Template = { schemaVersion: 1, version: 1, productId: product.id, sampleNumber: "10", ...t };
  const checked = validateTemplate(full, { product, fonts });
  if (!checked.ok) throw new Error(`template ${product.id}/${t.id}:\n${checked.errors.map((e) => e.message).join("\n")}`);
  return checked.value;
}

const PLACEHOLDER_NOTE = "Placeholder template drawn by us from a generic sports shape, until the graphic designer's templates arrive. Generated by scripts/make-sample-templates.ts.";

async function jerseyTemplates(): Promise<Template[]> {
  const product = loadProduct("stand-in-jersey");
  const heights = await BodyHeights.load(product);
  // The jersey's zones: body front and back, sleeves, side panels, collar, collar stripe, cuffs, cuff stripes, side stripes.
  const trims = { collar: SECOND, collar_stripe: ACCENT, cuffs: SECOND, cuff_stripes: ACCENT };
  const out: Template[] = [];

  out.push(
    template(product, {
      id: "classic",
      name: "Classic",
      about: `${PLACEHOLDER_NOTE} One colour body and sleeves, side panels and trims in the second colour, stripes in the accent.`,
      zones: { body_front: MAIN, body_back: MAIN, sleeves: MAIN, side_panels: SECOND, side_stripes: ACCENT, ...trims },
      shapes: [],
      slots: slots({ nameFill: SECOND, numberFill: SECOND }),
    }),
  );

  // Hoops: bands of 60 mm with 60 mm between them, at equal body heights on the front, the back and both side
  // panels, so they meet at every seam. The gap between two hoops is centred on the body height of the chest
  // name's preset (measured on the model), so the team name sits on the main colour; one hoop runs above it,
  // then the shoulders are plain.
  const chest = product.placements.find((p) => p.id === "chest-centre")!;
  const nameHeight = heights.at(chest.pieceId, chest.centre.x, chest.centre.y);
  if (nameHeight === null) throw new Error("the chest preset is not on the model");
  const hoopBands: Array<[number, number]> = [];
  for (let k = -5; k <= 0; k++) {
    const low = nameHeight + 30 + 120 * k;
    if (low + 60 > -20) hoopBands.push([low, low + 60]);
  }
  const hoopPieces = ["front", "back", "side_panel_left", "side_panel_right"];
  out.push(
    template(product, {
      id: "hoops",
      name: "Hoops",
      about: `${PLACEHOLDER_NOTE} Hoops at equal heights on the body (measured on the 3D model), on the front, back and side panels; plain shoulders.`,
      zones: { body_front: MAIN, body_back: MAIN, sleeves: MAIN, side_panels: MAIN, side_stripes: SECOND, ...trims },
      shapes: hoopPieces.flatMap((pieceId) =>
        hoopBands.flatMap(([low, high]) => {
          const path = band(heights, pieceId, low, high);
          return path ? [{ group: "hoops", pieceId, path, fill: SECOND }] : [];
        }),
      ),
      slots: slots({ nameFill: SECOND, numberFill: SECOND, numberOutline: { step: "medium", color: MAIN } }),
    }),
  );

  // Vertical stripes: 45 mm stripes 90 mm apart, centred on each piece's centre line, front and back.
  const stripesOn = (pieceId: string, centre: number, width: number) => {
    const shapes = [];
    for (let k = -5; k <= 5; k++) {
      const x = centre + 90 * k;
      if (x + 22.5 < 0 || x - 22.5 > width) continue;
      shapes.push({ group: "stripes", pieceId, path: pathOf([[x - 22.5, -20], [x + 22.5, -20], [x + 22.5, 760], [x - 22.5, 760]]), fill: SECOND });
    }
    return shapes;
  };
  const front = product.pieces.find((p) => p.id === "front")!;
  const back = product.pieces.find((p) => p.id === "back")!;
  out.push(
    template(product, {
      id: "stripes",
      name: "Vertical stripes",
      about: `${PLACEHOLDER_NOTE} Stripes 45 mm wide, 90 mm apart, centred on the front's and back's centre lines; plain side panels and sleeves.`,
      zones: { body_front: MAIN, body_back: MAIN, sleeves: SECOND, side_panels: SECOND, side_stripes: MAIN, collar: SECOND, collar_stripe: MAIN, cuffs: MAIN, cuff_stripes: SECOND },
      shapes: [...stripesOn("front", 335.5, front.width), ...stripesOn("back", 244, back.width)],
      slots: slots({ nameFill: MAIN, numberFill: MAIN, outline: { step: "medium", color: SECOND }, numberOutline: { step: "medium", color: SECOND } }),
    }),
  );

  // Sash: a 120 mm band from the wearer's right shoulder (the piece's top left, seen from outside) to the left hip.
  out.push(
    template(product, {
      id: "sash",
      name: "Sash",
      about: `${PLACEHOLDER_NOTE} A 120 mm sash on the front from the wearer's right shoulder to the left hip.`,
      zones: { body_front: MAIN, body_back: MAIN, sleeves: MAIN, side_panels: SECOND, side_stripes: MAIN, ...trims },
      shapes: [{ group: "sash", pieceId: "front", path: strip([120, -40], [700, 700], 120), fill: SECOND }],
      slots: slots({ nameFill: SECOND, numberFill: SECOND, outline: { step: "medium", color: MAIN } }),
    }),
  );

  // Chevron: a 55 mm V across the chest under the team name, its point on the centre line.
  out.push(
    template(product, {
      id: "chevron",
      name: "Chevron",
      about: `${PLACEHOLDER_NOTE} A 55 mm chevron across the front under the team name, its point on the centre line.`,
      zones: { body_front: MAIN, body_back: MAIN, sleeves: SECOND, side_panels: SECOND, side_stripes: MAIN, collar: SECOND, collar_stripe: MAIN, cuffs: MAIN, cuff_stripes: SECOND },
      shapes: [{ group: "chevron", pieceId: "front", path: chevron([-40, 205], [335.5, 435], [711, 205], 55), fill: SECOND }],
      slots: slots({ nameFill: SECOND, numberFill: SECOND }),
    }),
  );
  return out;
}

async function tshirtTemplates(): Promise<Template[]> {
  const product = loadProduct("stand-in-tshirt");
  const heights = await BodyHeights.load(product);
  // The T-shirt's zones: body front and back, side panels (bands at the sides), sleeves, sleeve ends, neck band.
  const out: Template[] = [];
  out.push(
    template(product, {
      id: "plain",
      name: "Plain",
      about: `${PLACEHOLDER_NOTE} One colour, the sleeve ends and neck band in the second colour.`,
      zones: { body_front: MAIN, body_back: MAIN, side_panels: MAIN, sleeves: MAIN, sleeve_ends: SECOND, neck_band: SECOND },
      shapes: [],
      slots: slots({ nameFill: SECOND, numberFill: SECOND }),
    }),
  );
  out.push(
    template(product, {
      id: "contrast",
      name: "Contrast sides",
      about: `${PLACEHOLDER_NOTE} Side panels and sleeves in the second colour, sleeve ends and neck band in the main colour.`,
      zones: { body_front: MAIN, body_back: MAIN, side_panels: SECOND, sleeves: SECOND, sleeve_ends: MAIN, neck_band: SECOND },
      shapes: [],
      slots: slots({ nameFill: SECOND, numberFill: SECOND }),
    }),
  );
  // A chest band at one body height on the front and the back (they meet at the side seams), below the team name
  // and the back number; a thin accent line above it.
  const bandPieces = ["front", "back"];
  out.push(
    template(product, {
      id: "band",
      name: "Chest band",
      about: `${PLACEHOLDER_NOTE} A 70 mm band and a 12 mm line at equal heights on the body (measured on the 3D model), front and back.`,
      zones: { body_front: MAIN, body_back: MAIN, side_panels: MAIN, sleeves: MAIN, sleeve_ends: SECOND, neck_band: SECOND },
      shapes: [
        ...bandPieces.map((pieceId) => ({ group: "band", pieceId, path: band(heights, pieceId, 210, 280)!, fill: SECOND })),
        ...bandPieces.map((pieceId) => ({ group: "line", pieceId, path: band(heights, pieceId, 292, 304)!, fill: ACCENT })),
      ],
      slots: slots({ nameFill: SECOND, numberFill: SECOND }),
    }),
  );
  return out;
}

for (const [productId, templates] of [
  ["stand-in-jersey", await jerseyTemplates()],
  ["stand-in-tshirt", await tshirtTemplates()],
] as const) {
  const dir = resolve(root, "samples/templates", productId);
  mkdirSync(dir, { recursive: true });
  for (const t of templates) writeFileSync(resolve(dir, `${t.id}.json`), `${JSON.stringify(t, null, 2)}\n`);
  writeFileSync(resolve(dir, "index.json"), `${JSON.stringify({ productId, templates: templates.map((t) => t.id) }, null, 2)}\n`);
  console.log(`Wrote ${templates.length} templates for ${productId}: ${templates.map((t) => t.id).join(", ")}`);
}
