import { describe, expect, it } from "vitest";
import { loadStandInJerseyProduct, loadStandInProduct } from "../test/fixtures";
import { clampIntoArea, clampToPrintArea, isClipped, layerBounds, maxScaleInArea, moveInside, printAreaOf } from "./print-area";
import { validateProductDefinition } from "./validate";
import { printAreaLines, snapLines, snapPosition, snapReachMm } from "./snapping";
import type { Layer, ProductDefinition } from "./schema";

const jersey = loadStandInJerseyProduct();
const tshirt = loadStandInProduct();

const item = (over: Partial<Pick<Layer, "position" | "size" | "rotation" | "pieceId">> & { id?: string } = {}) => ({
  id: over.id ?? "item",
  pieceId: over.pieceId ?? "front",
  position: over.position ?? { x: 335.5, y: 285 },
  size: over.size ?? { width: 200, height: 60 },
  rotation: over.rotation ?? 0,
});

describe("print areas in the product data (N6)", () => {
  it.each([
    ["jersey", jersey],
    ["T-shirt", tshirt],
  ] as const)("the %s's front, back and sleeves have one, every preset's centre in it, and the data validates", (_name, product: ProductDefinition) => {
    for (const id of ["front", "back", "sleeve_left", "sleeve_right"]) expect(product.pieces.find((p) => p.id === id)!.printArea).toBeDefined();
    for (const preset of product.placements) {
      const area = printAreaOf(product.pieces.find((p) => p.id === preset.pieceId)!);
      expect(preset.centre.x).toBeGreaterThanOrEqual(area.x);
      expect(preset.centre.x).toBeLessThanOrEqual(area.x + area.width);
      expect(preset.centre.y).toBeGreaterThanOrEqual(area.y);
      expect(preset.centre.y).toBeLessThanOrEqual(area.y + area.height);
    }
    expect(validateProductDefinition(product).ok).toBe(true);
  });

  it("a piece without one is limited by its box; a print area outside the box, or a preset outside the area, is refused", () => {
    const collar = jersey.pieces.find((p) => p.id === "collar")!;
    expect(printAreaOf(collar)).toEqual({ x: 0, y: 0, width: collar.width, height: collar.height });
    const bad = structuredClone(jersey);
    bad.pieces.find((p) => p.id === "front")!.printArea = { x: 600, y: 0, width: 200, height: 100 };
    const result = validateProductDefinition(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path.endsWith("printArea"))).toBe(true);
      expect(result.errors.some((e) => /outside the print area/.test(e.message))).toBe(true);
    }
  });
});

describe("keeping the whole box inside the print area", () => {
  const area = { x: 100, y: 50, width: 400, height: 600 };

  it("moves a box that pokes out back in, as little as needed", () => {
    expect(clampIntoArea(area, item({ position: { x: 120, y: 300 } }))).toEqual({ x: 200, y: 300 }); // half-width 100 from the left edge
    expect(clampIntoArea(area, item({ position: { x: 480, y: 640 } }))).toEqual({ x: 400, y: 620 });
    expect(clampIntoArea(area, item({ position: { x: 300, y: 300 } }))).toEqual({ x: 300, y: 300 }); // already inside
  });

  it("uses the turned box's bounds", () => {
    const turned = item({ position: { x: 120, y: 300 }, rotation: 90 }); // 60 wide, 200 tall when turned
    expect(layerBounds(turned).width).toBeCloseTo(60);
    expect(clampIntoArea(area, turned).x).toBeCloseTo(130);
  });

  it("centres a box larger than the area, and says how far one may grow", () => {
    expect(clampIntoArea(area, item({ size: { width: 500, height: 60 }, position: { x: 150, y: 300 } })).x).toBe(300);
    expect(maxScaleInArea(area, item())).toBeCloseTo(2); // 400 / 200
  });

  it("on the jersey's front, the team name dragged to the side seam stops inside the print area", () => {
    const p = clampToPrintArea(jersey, item({ position: { x: 640, y: 285 } }));
    const front = printAreaOf(jersey.pieces.find((x) => x.id === "front")!);
    expect(p.x + 100).toBeLessThanOrEqual(front.x + front.width + 1e-6);
  });
});

describe("the clipped check and Move it in", () => {
  it("an item crossing the outline is clipped; one well inside is not", () => {
    expect(isClipped(jersey, item())).toBe(false);
    // The V-neck: a wide box at the top centre of the front is cut by the neckline.
    expect(isClipped(jersey, item({ position: { x: 335.5, y: 90 }, size: { width: 300, height: 80 } }))).toBe(true);
    // Past the side seam at the waist.
    expect(isClipped(jersey, item({ position: { x: 480, y: 360 }, size: { width: 120, height: 60 } }))).toBe(true);
  });

  it("Move it in finds the nearest place where the whole box is on the piece and in the area", () => {
    const clipped = item({ position: { x: 335.5, y: 90 }, size: { width: 300, height: 80 } });
    const at = moveInside(jersey, clipped)!;
    expect(at).not.toBeNull();
    expect(isClipped(jersey, { ...clipped, position: at })).toBe(false);
    // It moved down from the neck, not far.
    expect(at.y).toBeGreaterThan(90);
    expect(Math.hypot(at.x - 335.5, at.y - 90)).toBeLessThan(200);
    // A box bigger than the piece cannot be moved in.
    expect(moveInside(jersey, item({ size: { width: 650, height: 700 } }))).toBeNull();
  });
});

describe("snapping (N10)", () => {
  const front = jersey.pieces.find((p) => p.id === "front")!;
  const design = {
    layers: [
      { ...item({ id: "number", position: { x: 300, y: 405 }, size: { width: 170, height: 125 } }) } as unknown as Layer,
    ],
  };

  it("lists the centre line, the presets on the piece and the other items' centres and edges", () => {
    const lines = snapLines(jersey, design, "item", "front");
    expect(lines).toContainEqual({ axis: "x", at: 335.5, source: "centre-line" }); // the print area's middle
    expect(lines).toContainEqual({ axis: "y", at: 200, source: "preset" }); // left chest
    expect(lines).toContainEqual({ axis: "x", at: 300, source: "item-centre" });
    expect(lines).toContainEqual({ axis: "x", at: 215, source: "item-edge" });
    // Not its own lines, and not other pieces'.
    expect(snapLines(jersey, design, "number", "front").some((l) => l.source === "item-centre")).toBe(false);
    expect(snapLines(jersey, design, "item", "back").some((l) => l.source === "item-centre")).toBe(false);
  });

  it("snaps to the centre line within reach and returns its guide; past the reach it lets go", () => {
    const near = snapPosition(jersey, { layers: [] }, item(), { x: front.width / 2 + 4, y: 263 });
    // The centre line (335.445) and the chest preset (335.5) are a hair apart: it lands on one of them.
    expect(Math.abs(near.position.x - front.width / 2)).toBeLessThan(0.1);
    expect(near.guides).toHaveLength(1);
    expect(near.guides[0]).toMatchObject({ axis: "x", pieceId: "front" });
    expect(Math.abs(near.guides[0]!.from.x - front.width / 2)).toBeLessThan(0.1);
    // On the back, nothing else is near the centre line: it is the centre line.
    const back = jersey.pieces.find((p) => p.id === "back")!;
    const centreLine = back.printArea!.x + back.printArea!.width / 2;
    expect(centreLine).toBe(244); // the back's centre, where its presets are
    const onBack = snapPosition(jersey, { layers: [] }, item({ pieceId: "back" }), { x: centreLine - 3, y: 450 });
    expect(onBack.position.x).toBeCloseTo(centreLine, 3);
    expect(onBack.guides[0]!.source).toBe("centre-line");
    const far = snapPosition(jersey, { layers: [] }, item(), { x: front.width / 2 + 9, y: 263 });
    expect(far.position.x).toBeCloseTo(front.width / 2 + 9);
    expect(far.guides).toHaveLength(0);
  });

  it("snaps to a preset's centre on both axes, to another item's centre (a name over the number), and edge to edge", () => {
    const leftChest = snapPosition(jersey, { layers: [] }, item({ size: { width: 80, height: 80 } }), { x: 443, y: 197 });
    expect(leftChest.position).toEqual({ x: 440, y: 200 });
    expect(leftChest.guides.map((g) => g.source)).toEqual(["preset", "preset"]);
    const overNumber = snapPosition(jersey, design, item({ size: { width: 100, height: 40 } }), { x: 303, y: 250 });
    expect(overNumber.position.x).toBe(300);
    expect(overNumber.guides[0]!.source).toBe("item-centre");
    // The left edge of a 60 wide box at x 247 is 217: two from the number's left edge (215).
    const edges = snapPosition(jersey, design, item({ size: { width: 60, height: 40 } }), { x: 247, y: 600 });
    expect(edges.position.x).toBe(245);
    expect(edges.guides[0]!.source).toBe("item-edge");
  });

  it("is held off with free (Alt, or the setting), and the reach grows when the garment is small on screen", () => {
    const free = snapPosition(jersey, { layers: [] }, item(), { x: front.width / 2 + 2, y: 263 }, { free: true });
    expect(free.position.x).toBeCloseTo(front.width / 2 + 2);
    expect(free.guides).toEqual([]);
    expect(snapReachMm(2)).toBe(6); // 8 px is 4 mm: 6 mm wins
    expect(snapReachMm(0.4)).toBe(20); // 8 px is 20 mm on a small garment
    expect(snapReachMm(null)).toBe(6);
  });

  it("gives the print area's four edges to draw while placing", () => {
    const lines = printAreaLines(jersey, "front");
    expect(lines).toHaveLength(4);
    const a = front.printArea!;
    expect(lines[0]).toEqual({ pieceId: "front", from: { x: a.x, y: a.y }, to: { x: a.x + a.width, y: a.y } });
  });
});
