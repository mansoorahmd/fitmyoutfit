import { describe, expect, it } from "vitest";
import {
  isInsidePiece,
  pieceAtUv,
  pieceGeometry,
  pieceToUv,
  piecesByZone,
  uvToPiece,
  zoneAtPiecePoint,
  zoneAtUv,
} from "./pattern";
import { validateProductDefinition } from "./validate";
import type { ProductDefinition } from "./schema";
import { loadPlaceholderProduct } from "../test/fixtures";

const product = loadPlaceholderProduct();
const piece = (id: string) => product.pieces.find((p) => p.id === id)!;
const front = piece("front");
const back = piece("back");
const sleeve = piece("sleeve_left");

/** A copy of the placeholder product, changed by `mutate`, and the error messages it gets. */
function errorsFor(mutate: (p: Record<string, any>) => void): string[] {
  const copy = JSON.parse(JSON.stringify(product)) as Record<string, any>;
  mutate(copy);
  const result = validateProductDefinition(copy);
  return result.ok ? [] : result.errors.map((e) => e.message);
}

describe("product definition with pattern panels", () => {
  it("the placeholder product validates, with an outline and zones on every piece", () => {
    expect(validateProductDefinition(product).ok).toBe(true);
    for (const p of product.pieces) {
      expect(p.outline.length, p.id).toBeGreaterThan(0);
      expect(pieceGeometry(p).outline.polylines).toHaveLength(1);
    }
  });

  it("the front and the back each carry more than one zone", () => {
    for (const p of [front, back]) {
      const zones = new Set([p.zone, ...p.regions.map((r) => r.zone)]);
      expect(zones.size, p.id).toBeGreaterThanOrEqual(3);
    }
  });

  it("rejects path data that does not parse, with the reason", () => {
    expect(errorsFor((p) => (p.pieces[0].outline = "M0 0 A 5 5 0 0 1 10 0 Z"))).toEqual([
      expect.stringMatching(/^pieces\[0\]\.outline: .*command 'A'.*not supported/),
    ]);
    expect(errorsFor((p) => (p.pieces[0].regions[0].path = "L 1 1"))).toEqual([
      expect.stringMatching(/^pieces\[0\]\.regions\[0\]\.path: is not usable path data: path data must start with a move/),
    ]);
  });

  it("rejects characters that are not path data", () => {
    const errors = errorsFor((p) => (p.pieces[0].outline = "<svg><path d='M0 0'/></svg>"));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^pieces\[0\]\.outline: may only hold the path commands/);
  });

  it("rejects an outline that is open, has several shapes, no area, or leaves the piece's box", () => {
    expect(errorsFor((p) => (p.pieces[4].outline = "M 0 0 H 480 V 30 H 0"))).toEqual([
      expect.stringMatching(/pieces\[4\]\.outline: must be one closed shape .* and no closing Z/),
    ]);
    expect(errorsFor((p) => (p.pieces[4].outline = "M 0 0 H 10 V 10 Z M 20 0 H 30 V 10 Z"))).toEqual([
      expect.stringMatching(/pieces\[4\]\.outline: must be one closed shape .*found 2 shape/),
    ]);
    expect(errorsFor((p) => (p.pieces[4].outline = "M 0 0 H 480 Z"))).toEqual([
      "pieces[4].outline: encloses no area",
    ]);
    expect(errorsFor((p) => (p.pieces[4].outline = "M 0 0 H 481 V 30 H 0 Z"))).toEqual([
      "pieces[4].outline: must lie inside the piece's box, 0 to 480 by 0 to 30 mm",
    ]);
    expect(errorsFor((p) => (p.pieces[4].outline = "M -1 0 H 480 V 30 H 0 Z"))).toHaveLength(1);
  });

  it("rejects zones that the product does not have, and zones that no piece draws", () => {
    expect(errorsFor((p) => (p.pieces[0].regions[0].zone = "pockets"))).toEqual([
      expect.stringMatching(/^pieces\[0\]\.regions\[0\]\.zone: "pockets" is not one of the product's colour zones/),
    ]);
    expect(errorsFor((p) => (p.pieces[4].zone = "hood"))).toEqual([
      expect.stringMatching(/^pieces\[4\]\.zone: "hood" is not one/),
      expect.stringMatching(/^zones\[5\]: colour zone "collar" is not drawn on any piece/),
    ]);
    expect(errorsFor((p) => (p.pieces[0].zone = "__proto__"))).not.toEqual([]);
  });

  it("rejects a UV rectangle that would stretch the piece, and overlapping UV rectangles", () => {
    expect(errorsFor((p) => (p.pieces[0].uv.width = 0.4))).toEqual([
      expect.stringMatching(/^pieces\[0\]\.uv: the UV rectangle's proportions .* would stretch artwork/),
    ]);
    expect(errorsFor((p) => (p.pieces[1].uv.x = 0.3))).toEqual([
      'pieces[1].uv: overlaps the UV rectangle of piece "front"; each piece needs its own area of the texture',
    ]);
  });

  it("rejects a piece without an outline, zone or regions, and unknown fields", () => {
    expect(errorsFor((p) => delete p.pieces[0].outline)[0]).toMatch(/pieces\[0\]\.outline: is required/);
    expect(errorsFor((p) => delete p.pieces[0].zone)[0]).toMatch(/pieces\[0\]\.zone: is required/);
    expect(errorsFor((p) => delete p.pieces[0].regions)[0]).toMatch(/pieces\[0\]\.regions: is required/);
    expect(errorsFor((p) => (p.pieces[0].texture = "front.png"))).toEqual(["pieces[0].texture: unknown field"]);
    expect(errorsFor((p) => (p.zones[0].materials = ["body"]))).toEqual(["zones[0].materials: unknown field"]);
  });

  it("never throws on hostile path input", () => {
    for (const value of [null, 1, {}, [], "M".repeat(30_000)]) {
      const result = validateProductDefinition({ ...product, pieces: [{ ...front, outline: value }] });
      expect(result.ok).toBe(false);
    }
  });
});

describe("pattern-piece coordinates to UV", () => {
  it("maps the piece's corners onto its UV rectangle", () => {
    expect(pieceToUv(front, { x: 0, y: 0 })).toEqual({ u: 0.02, v: 0.02 });
    const corner = pieceToUv(front, { x: 560, y: 700 });
    expect(corner.u).toBeCloseTo(0.468, 12);
    expect(corner.v).toBeCloseTo(0.58, 12);
    const centre = pieceToUv(back, { x: 280, y: 350 });
    expect(centre.u).toBeCloseTo(0.532 + 0.224, 12);
    expect(centre.v).toBeCloseTo(0.02 + 0.28, 12);
  });

  it("is linear and the same scale across and down (no stretching)", () => {
    for (const p of product.pieces) {
      const a = pieceToUv(p, { x: 0, y: 0 });
      const b = pieceToUv(p, { x: 100, y: 100 });
      expect((b.u - a.u) / (b.v - a.v)).toBeCloseTo(1, 2);
    }
  });

  it("uvToPiece is its inverse", () => {
    for (const p of product.pieces) {
      for (const point of [{ x: 0, y: 0 }, { x: 12.5, y: 7 }, { x: p.width, y: p.height }]) {
        const round = uvToPiece(p, pieceToUv(p, point));
        expect(round.x).toBeCloseTo(point.x, 9);
        expect(round.y).toBeCloseTo(point.y, 9);
      }
    }
  });

  it("finds the piece under a UV point, and none in the gaps between pieces", () => {
    const hit = pieceAtUv(product, pieceToUv(sleeve, { x: 220, y: 110 }));
    expect(hit?.piece.id).toBe("sleeve_left");
    expect(hit?.point.x).toBeCloseTo(220, 9);
    expect(pieceAtUv(product, { u: 0.5, v: 0.3 })).toBeNull();
    expect(pieceAtUv(product, { u: 0.01, v: 0.01 })).toBeNull();
  });
});

describe("zone lookup", () => {
  it("finds the zone at known points of the front", () => {
    expect(zoneAtPiecePoint(front, { x: 280, y: 400 })).toBe("body");
    expect(zoneAtPiecePoint(front, { x: 280, y: 60 })).toBe("yoke");
    expect(zoneAtPiecePoint(front, { x: 40, y: 500 })).toBe("side_panels");
    expect(zoneAtPiecePoint(front, { x: 520, y: 500 })).toBe("side_panels");
    // The yoke dips in the middle on the front (a curve), not at the sides.
    expect(zoneAtPiecePoint(front, { x: 280, y: 135 })).toBe("yoke");
    expect(zoneAtPiecePoint(front, { x: 60, y: 135 })).toBe("body");
  });

  it("follows the back's own regions", () => {
    expect(zoneAtPiecePoint(back, { x: 280, y: 135 })).toBe("body");
    expect(zoneAtPiecePoint(back, { x: 280, y: 60 })).toBe("yoke");
  });

  it("returns null outside the outline, even where a region reaches past it", () => {
    // Top corner of the box: outside the shoulder line, though the yoke region covers it.
    expect(zoneAtPiecePoint(front, { x: 5, y: 5 })).toBeNull();
    expect(isInsidePiece(front, { x: 5, y: 5 })).toBe(false);
    expect(zoneAtPiecePoint(front, { x: 600, y: 300 })).toBeNull();
    expect(zoneAtPiecePoint(sleeve, { x: 5, y: 215 })).toBeNull();
  });

  it("uses the topmost region when regions overlap", () => {
    const layered: ProductDefinition = {
      ...product,
      pieces: product.pieces.map((p) =>
        p.id === "collar"
          ? { ...p, regions: [{ zone: "body", path: "M 0 0 H 100 V 30 H 0 Z" }, { zone: "cuffs", path: "M 50 0 H 150 V 30 H 50 Z" }] }
          : p,
      ),
    };
    const collar = layered.pieces.find((p) => p.id === "collar")!;
    expect(zoneAtPiecePoint(collar, { x: 25, y: 15 })).toBe("body");
    expect(zoneAtPiecePoint(collar, { x: 75, y: 15 })).toBe("cuffs");
    expect(zoneAtPiecePoint(collar, { x: 300, y: 15 })).toBe("collar");
  });

  it("finds the zone from a UV point, as a tap on the model would", () => {
    expect(zoneAtUv(product, pieceToUv(sleeve, { x: 220, y: 200 }))).toEqual({ pieceId: "sleeve_left", zone: "cuffs" });
    expect(zoneAtUv(product, pieceToUv(sleeve, { x: 220, y: 50 }))).toEqual({ pieceId: "sleeve_left", zone: "sleeves" });
    expect(zoneAtUv(product, { u: 0.5, v: 0.99 })).toBeNull();
  });

  it("lists which pieces each zone is drawn on", () => {
    const map = piecesByZone(product);
    expect(map.get("body")).toEqual(["front", "back"]);
    expect(map.get("side_panels")).toEqual(["front", "back"]);
    expect(map.get("cuffs")).toEqual(["sleeve_left", "sleeve_right"]);
    expect(map.get("collar")).toEqual(["collar"]);
  });
});
