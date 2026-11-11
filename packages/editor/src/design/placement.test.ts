import { describe, expect, it } from "vitest";
import {
  MAX_LAYER_SIDE_MM,
  MIN_LAYER_SIDE_MM,
  clampToPiece,
  dragPosition,
  isPointInLayer,
  layerAtPoint,
  layerCorners,
  normalizeRotation,
  pieceAtMeshUv,
  scaleLayer,
  startLayerDrag,
  toLayerFrame,
} from "./placement";
import { pieceToUv } from "./pattern";
import { createDesign } from "./create";
import { addFont, addLayer, updateLayer } from "./edit";
import { loadPlaceholderProduct, logoLayer, numberLayer, textLayer } from "../test/fixtures";
import type { Layer } from "./schema";

const product = loadPlaceholderProduct();
const piece = (id: string) => product.pieces.find((p) => p.id === id)!;

describe("pointer on the model to piece millimetres", () => {
  it("finds the piece of the hit mesh and converts the UV to its millimetres", () => {
    for (const p of product.pieces) {
      const point = { x: p.width * 0.3, y: p.height * 0.6 };
      const hit = pieceAtMeshUv(product, p.mesh, pieceToUv(p, point));
      expect(hit?.piece.id).toBe(p.id);
      expect(hit!.point.x).toBeCloseTo(point.x, 9);
      expect(hit!.point.y).toBeCloseTo(point.y, 9);
    }
  });

  it("the centre of the front's UV rectangle is the centre of the front piece", () => {
    const front = piece("front");
    const hit = pieceAtMeshUv(product, "front", { u: front.uv.x + front.uv.width / 2, v: front.uv.y + front.uv.height / 2 });
    expect(hit!.point.x).toBeCloseTo(280, 9);
    expect(hit!.point.y).toBeCloseTo(350, 9);
  });

  it("returns null for a mesh that carries no piece, or a UV outside the mesh's pieces", () => {
    expect(pieceAtMeshUv(product, "buttons", { u: 0.1, v: 0.1 })).toBeNull();
    // A UV inside the BACK's rectangle, reported on the FRONT mesh: not the front.
    const back = piece("back");
    expect(pieceAtMeshUv(product, "front", { u: back.uv.x + 0.1, v: back.uv.y + 0.1 })).toBeNull();
  });

  it("handles pieces that share one mesh by their UV rectangles", () => {
    const shared = {
      ...product,
      pieces: product.pieces.map((p) => (p.id.startsWith("sleeve") ? { ...p, mesh: "sleeves" } : p)),
    };
    const left = shared.pieces.find((p) => p.id === "sleeve_left")!;
    const right = shared.pieces.find((p) => p.id === "sleeve_right")!;
    expect(pieceAtMeshUv(shared, "sleeves", pieceToUv(left, { x: 10, y: 10 }))?.piece.id).toBe("sleeve_left");
    expect(pieceAtMeshUv(shared, "sleeves", pieceToUv(right, { x: 10, y: 10 }))?.piece.id).toBe("sleeve_right");
  });
});

describe("hit-testing a turned layer box", () => {
  const box = (rotation: number): Layer => ({ ...(logoLayer() as Layer), position: { x: 100, y: 100 }, size: { width: 80, height: 20 }, rotation });

  it("tests against the box as turned clockwise about its centre", () => {
    expect(isPointInLayer(box(0), { x: 135, y: 100 })).toBe(true);
    expect(isPointInLayer(box(0), { x: 100, y: 135 })).toBe(false);
    // Turned 90 degrees clockwise (Y down): the long side now runs down.
    expect(isPointInLayer(box(90), { x: 135, y: 100 })).toBe(false);
    expect(isPointInLayer(box(90), { x: 100, y: 135 })).toBe(true);
    expect(isPointInLayer(box(450), { x: 100, y: 135 })).toBe(true);
  });

  it("toLayerFrame and layerCorners agree", () => {
    const layer = box(30);
    const corners = layerCorners(layer);
    const local = corners.map((c) => toLayerFrame(layer, c));
    expect(local.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([
      [-40, -10],
      [40, -10],
      [40, 10],
      [-40, 10],
    ]);
    // Clockwise in Y-down coordinates: the top-right corner of a box turned 90 degrees is at the bottom right.
    const turned = layerCorners(box(90));
    expect(turned[1]!.x).toBeCloseTo(110, 9);
    expect(turned[1]!.y).toBeCloseTo(140, 9);
  });

  it("a slop grows the box, for fingers", () => {
    expect(isPointInLayer(box(0), { x: 100, y: 115 })).toBe(false);
    expect(isPointInLayer(box(0), { x: 100, y: 115 }, 6)).toBe(true);
  });

  it("layerAtPoint finds the topmost layer on that piece only", () => {
    let design = addFont(createDesign(product), { id: "font-sans", family: "Inter" });
    design = addLayer(design, textLayer({ id: "under", position: { x: 280, y: 250 } }));
    design = addLayer(design, textLayer({ id: "over", position: { x: 300, y: 250 } }));
    design = addLayer(design, numberLayer());
    expect(layerAtPoint(design, "front", { x: 290, y: 250 })?.id).toBe("over");
    expect(layerAtPoint(design, "front", { x: 90, y: 250 })?.id).toBe("under");
    expect(layerAtPoint(design, "front", { x: 280, y: 600 })).toBeNull();
    // The number layer is on the back; the same point on the front does not find it.
    expect(layerAtPoint(design, "back", { x: 280, y: 300 })?.id).toBe("number-1");
    expect(layerAtPoint(design, "front", { x: 280, y: 450 })).toBeNull();
  });
});

describe("dragging keeps a layer on its own piece", () => {
  const layer = { ...(textLayer() as Layer), position: { x: 280, y: 250 } };
  const front = piece("front");
  const at = (pieceId: string, x: number, y: number) => ({ piece: piece(pieceId), point: { x, y } });

  it("moves the layer with the pointer, keeping the grab offset", () => {
    const drag = startLayerDrag(layer, { x: 300, y: 260 });
    expect(drag).toEqual({ layerId: "text-1", pieceId: "front", offset: { x: -20, y: -10 } });
    expect(dragPosition(product, drag, at("front", 350, 400))).toEqual({ x: 330, y: 390 });
  });

  it("ignores a pointer on another piece or off the garment", () => {
    const drag = startLayerDrag(layer, { x: 280, y: 250 });
    expect(dragPosition(product, drag, at("back", 100, 100))).toBeNull();
    expect(dragPosition(product, drag, null)).toBeNull();
  });

  it("never lets the centre leave the piece's box", () => {
    const drag = startLayerDrag(layer, { x: 280, y: 250 });
    expect(dragPosition(product, drag, at("front", -50, 900))).toEqual({ x: 0, y: front.height });
    expect(clampToPiece(front, { x: 600, y: -1 })).toEqual({ x: front.width, y: 0 });
  });

  it("a whole drag gives a valid layer at every step", () => {
    let design = addLayer(addFont(createDesign(product), { id: "font-sans", family: "Inter" }), layer, { product });
    const drag = startLayerDrag(layer, { x: 280, y: 250 });
    for (let k = 0; k < 20; k++) {
      const next = dragPosition(product, drag, at("front", 280 + k * 50, 250 + k * 40));
      if (next) design = updateLayer(design, "text-1", { position: next }, { product });
    }
    expect(design.layers[0]!.position).toEqual({ x: front.width, y: front.height });
  });
});

describe("resizing and rotating", () => {
  it("scales the box and the font size of text and numbers together", () => {
    expect(scaleLayer(textLayer(), 1.5)).toEqual({ size: { width: 600, height: 120 }, fontSize: 90 });
    expect(scaleLayer(numberLayer(), 0.5)).toEqual({ size: { width: 150, height: 200 }, fontSize: 150 });
    expect(scaleLayer(logoLayer(), 2)).toEqual({ size: { width: 180, height: 180 } });
  });

  it("stops at the smallest and largest side", () => {
    const tiny = scaleLayer(logoLayer(), 0.001);
    expect(tiny.size.width).toBeCloseTo(MIN_LAYER_SIDE_MM, 6);
    const huge = scaleLayer(textLayer(), 100);
    expect(huge.size.width).toBeCloseTo(MAX_LAYER_SIDE_MM, 6);
    expect(huge.fontSize! / huge.size.width).toBeCloseTo(60 / 400, 9);
    expect(() => scaleLayer(textLayer(), 0)).toThrow(RangeError);
    expect(() => scaleLayer(textLayer(), Number.NaN)).toThrow(RangeError);
  });

  it("normalizeRotation gives -180 to 180 for a rotation control", () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(190)).toBe(-170);
    expect(normalizeRotation(-190)).toBe(170);
    expect(normalizeRotation(540)).toBe(180);
    expect(normalizeRotation(-180)).toBe(180);
    expect(normalizeRotation(725.5)).toBe(5.5);
  });
});
