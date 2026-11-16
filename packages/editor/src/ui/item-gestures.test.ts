/**
 * Placing an item (E3c, B1): every way a gesture ends goes through one path,
 * which commits or cancels it and clears the print-area lines, the snapping
 * guides and the "placing" state (QA12: a cancelled turn left the editor
 * stuck placing, with the tools frozen; removing the resize's clean-up failed
 * no test, mutation M18). Run against the real undo history.
 */
import { describe, expect, it } from "vitest";
import { createDesign } from "../design/create";
import { addLayer } from "../design/edit";
import { addCatalogFont } from "../design/font-catalog";
import { newLogoLayer, newTextLayer } from "../design/new-layers";
import { layerBounds, printAreaOf } from "../design/print-area";
import type { DesignDocument, Layer, ProductDefinition } from "../design/schema";
import { beginGesture, cancelGesture, createHistory, endGesture, sameJson, updateGesture, type History } from "../state/history";
import { loadPlaceholderFonts, loadStandInJerseyProduct, loadStandInProduct } from "../test/fixtures";
import { createItemGestures, gestureEndOutcome, type GestureEndReason, type GestureKind, type PlacingGuide } from "./item-gestures";
import { handlesGone } from "./SelectionOverlay";
import { keepsHintRoom } from "./Stage";
import { travelledPast, DRAG_SLOP_PX } from "../react/press-policy";

const fonts = loadPlaceholderFonts();

function setup(product: ProductDefinition = loadStandInJerseyProduct()) {
  let d = createDesign(product, { teamName: "TIGERS" });
  const font = fonts.fonts.find((f) => f.uses.includes("text"))!;
  d = addCatalogFont(d, fonts, font.id);
  d = addLayer(d, newTextLayer(product, { id: "name-1", role: "team-name", preset: "chest-centre", value: "TIGERS", fontId: font.id, fill: d.teamColors.second }), { product });
  d = addLayer(d, newLogoLayer(product, { id: "logo-1", preset: "sleeve-left", role: "crest", asset: { assetId: "a1", mediaType: "image/png", width: 2000, height: 2000 } }), { product });
  let h: History<DesignDocument> = createHistory(d, { equals: sameJson });
  const log = { guides: [] as PlacingGuide[], placing: null as GestureKind | null, guideCalls: 0, ends: [] as Array<{ outcome: string; reason: GestureEndReason; shrunk: boolean }> };
  const gestures = createItemGestures({
    product: () => product,
    design: () => h.present,
    history: {
      begin: (label) => (h = beginGesture(h, label)),
      preview: (update) => (h = updateGesture(h, update(h.present))),
      end: () => (h = endGesture(h)),
      cancel: () => (h = cancelGesture(h)),
    },
    setGuides: (g) => {
      log.guides = g;
      log.guideCalls++;
    },
    setPlacing: (kind) => (log.placing = kind),
    snapping: () => true,
    onEnd: (info) => log.ends.push(info),
  });
  return { product, gestures, log, history: () => h, start: d, layer: (id: string) => h.present.layers.find((l) => l.id === id)! };
}

/** The item's turned box goes past its print area by this many mm (0 inside). */
function outside(product: ProductDefinition, layer: Layer): number {
  const area = printAreaOf(product.pieces.find((p) => p.id === layer.pieceId)!);
  const b = layerBounds(layer);
  return Math.max(0, area.x - b.x, b.x + b.width - (area.x + area.width), area.y - b.y, b.y + b.height - (area.y + area.height));
}

const ALL_REASONS: GestureEndReason[] = ["release", "cancel", "lost-capture", "unmount", "hidden", "second-pointer", "blur", "tool-change", "selection-change", "done-panel"];

describe("ending a gesture (B1)", () => {
  it("a release, or the coach's own choice of a tool, an item or Done, commits; anything else cancels", () => {
    expect(ALL_REASONS.filter((r) => gestureEndOutcome(r) === "commit")).toEqual(["release", "tool-change", "selection-change", "done-panel"]);
  });

  for (const kind of ["resize", "rotate", "move"] as const) {
    for (const reason of ALL_REASONS) {
      it(`a ${kind} ended by "${reason}" clears the lines and "placing" and leaves no gesture open`, () => {
        const t = setup();
        const id = kind === "move" ? "name-1" : "name-1";
        const before = t.layer(id);
        if (kind === "resize") {
          t.gestures.resize(id, "start", 1);
          t.gestures.resize(id, "move", 0.8);
        } else if (kind === "rotate") {
          t.gestures.rotate(id, "start", 0, false);
          t.gestures.rotate(id, "move", 30, false);
        } else {
          t.gestures.drag({ phase: "start", layerId: id, pieceId: before.pieceId, position: before.position });
          t.gestures.drag({ phase: "move", layerId: id, pieceId: before.pieceId, position: { x: before.position.x - 20, y: before.position.y + 40 } });
        }
        expect(t.log.placing).toBe(kind);
        expect(t.log.guides.length).toBeGreaterThan(0);
        expect(t.gestures.finish(reason)).toBe(gestureEndOutcome(reason));
        expect(t.log.placing).toBeNull();
        expect(t.log.guides).toEqual([]);
        expect(t.history().gestureStart).toBeNull();
        expect(t.gestures.active()).toBeNull();
        if (gestureEndOutcome(reason) === "cancel") {
          expect(t.layer(id)).toEqual(before);
          expect(t.history().past).toHaveLength(0);
        } else {
          expect(t.layer(id)).not.toEqual(before);
          expect(t.history().past).toHaveLength(1);
        }
        // Ends once: a second ending, and late events from the pointer, do nothing.
        expect(t.gestures.finish("release")).toBeNull();
        const after = t.history();
        if (kind === "resize") t.gestures.resize(id, "move", 1.3);
        else if (kind === "rotate") t.gestures.rotate(id, "end", 90, false);
        else t.gestures.drag({ phase: "end", layerId: id, pieceId: before.pieceId, position: { x: 0, y: 0 } });
        expect(t.history()).toBe(after);
        expect(t.log.ends).toHaveLength(1);
      });
    }
  }

  it("the handles' own cancel phase (a system touch-cancel) ends a turn and a resize the same way (QA's live defect and M18)", () => {
    for (const kind of ["rotate", "resize"] as const) {
      const t = setup();
      if (kind === "rotate") {
        t.gestures.rotate("name-1", "start", 0, false);
        t.gestures.rotate("name-1", "move", 45, false);
        t.gestures.rotate("name-1", "cancel", 45, false);
      } else {
        t.gestures.resize("name-1", "start", 1);
        t.gestures.resize("name-1", "move", 0.7);
        t.gestures.resize("name-1", "cancel", 0.7);
      }
      expect(t.log.placing).toBeNull();
      expect(t.log.guides).toEqual([]);
      expect(t.history().present).toBe(t.start);
      expect(t.history().gestureStart).toBeNull();
    }
  });

  it("a release commits one undo step; nothing changed makes none", () => {
    const t = setup();
    t.gestures.rotate("name-1", "start", 0, false);
    t.gestures.rotate("name-1", "move", 20, false);
    t.gestures.rotate("name-1", "end", 15, false);
    expect(t.layer("name-1").rotation).toBe(15);
    expect(t.history().past).toHaveLength(1);
    const u = setup();
    u.gestures.resize("name-1", "start", 1);
    u.gestures.resize("name-1", "end", 1);
    expect(u.history().past).toHaveLength(0);
  });

  it("a press and release without travel is never a move and never an undo step, wherever the pointer lands (B3)", () => {
    const t = setup();
    const before = t.layer("name-1");
    t.gestures.drag({ phase: "start", layerId: "name-1", pieceId: "front", position: before.position });
    // The camera re-framed under the still pointer: the release lands on another point of the cloth.
    t.gestures.drag({ phase: "end", layerId: "name-1", pieceId: "front", position: { x: before.position.x, y: before.position.y + 27 }, moved: false });
    expect(t.layer("name-1")).toEqual(before);
    expect(t.history().past).toHaveLength(0);
    expect(t.log.placing).toBeNull();
    expect(t.log.guides).toEqual([]);
  });

  it("a gesture started while another is open ends the first one first", () => {
    const t = setup();
    t.gestures.rotate("name-1", "start", 0, false);
    t.gestures.rotate("name-1", "move", 30, false);
    t.gestures.resize("name-1", "start", 1);
    expect(t.gestures.active()).toEqual({ kind: "resize", layerId: "name-1" });
    expect(t.history().past).toHaveLength(1);
    t.gestures.finish("cancel");
    expect(t.layer("name-1").rotation).toBe(30);
  });

  it("a turn that only fits smaller makes the item smaller, inside its area, and says so on release (B2)", () => {
    for (const product of [loadStandInJerseyProduct(), loadStandInProduct()]) {
      const t = setup(product);
      // QA's case: a large logo on the sleeve, as big as its area allows, turned 60 degrees.
      t.gestures.resize("logo-1", "start", 1);
      t.gestures.resize("logo-1", "end", 10);
      const big = t.layer("logo-1");
      expect(outside(product, big)).toBeLessThan(0.01);
      t.gestures.rotate("logo-1", "start", 0, false);
      t.gestures.rotate("logo-1", "move", 60, true);
      expect(outside(product, t.layer("logo-1"))).toBeLessThan(0.01);
      t.gestures.rotate("logo-1", "end", 60, true);
      const turned = t.layer("logo-1");
      expect(turned.rotation).toBe(60);
      expect(turned.size.width).toBeLessThan(big.size.width);
      expect(outside(product, turned)).toBeLessThan(0.01);
      expect(t.log.ends.at(-1)).toMatchObject({ outcome: "commit", shrunk: true });
    }
  });

  it("a drag keeps the whole box inside the print area, and shows the area's lines while it goes on", () => {
    const t = setup();
    const before = t.layer("name-1");
    t.gestures.drag({ phase: "start", layerId: "name-1", pieceId: "front", position: before.position });
    t.gestures.drag({ phase: "move", layerId: "name-1", pieceId: "front", position: { x: 640, y: 10 } });
    expect(t.log.guides.some((g) => g.kind === "area")).toBe(true);
    expect(outside(t.product, t.layer("name-1"))).toBeLessThan(0.01);
    t.gestures.drag({ phase: "end", layerId: "name-1", pieceId: "front", position: { x: 640, y: 10 }, moved: true });
    expect(outside(t.product, t.layer("name-1"))).toBeLessThan(0.01);
    expect(t.history().past).toHaveLength(1);
  });
});

describe("the handles and the stage around a gesture", () => {
  it("the handles count as gone when the item faces away, the overlay hides or nothing is selected", () => {
    expect(handlesGone({ facing: true }, false)).toBe(false);
    expect(handlesGone({ facing: false }, false)).toBe(true);
    expect(handlesGone({ facing: true }, true)).toBe(true);
    expect(handlesGone(null, false)).toBe(true);
  });

  it("a press moves an item only after the pointer travels more than the slop (B3)", () => {
    expect(DRAG_SLOP_PX).toBeGreaterThan(0);
    expect(travelledPast({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(false);
    expect(travelledPast({ x: 100, y: 100 }, { x: 102, y: 103 })).toBe(false);
    expect(travelledPast({ x: 100, y: 100 }, { x: 104, y: 103 })).toBe(true);
  });

  it("the hint's room is kept after the hint goes, until the frame changes for another reason (B3)", () => {
    expect(keepsHintRoom(true, null, "a")).toBe(true);
    expect(keepsHintRoom(false, "a", "a")).toBe(true); // dismissed: the garment does not move
    expect(keepsHintRoom(false, "a", "b")).toBe(false); // a panel opened: re-framed anyway
    expect(keepsHintRoom(false, null, "a")).toBe(false);
  });
});
