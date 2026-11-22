// @vitest-environment jsdom
/**
 * The garment chooser run in the shell (G4): offered only with two garments and a callback, one tap for the other
 * neck, the carried design and list handed to the host, and a question first when something would be left behind.
 */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDesign } from "../design/create.js";
import { addLayer } from "../design/edit.js";
import { newLogoLayer } from "../design/new-layers.js";
import type { ProductDefinition } from "../design/schema.js";
import { applyTemplate, type Template } from "../design/template.js";
import type { SavedTeamList } from "../team-list/types.js";
import { loadMatchJerseyProduct, loadMatchJerseyRoundProduct, loadPlaceholderFonts, loadPlaceholderPalette, loadStandInProduct } from "../test/fixtures.js";
import { EditorShell } from "./EditorShell.js";
import type { GarmentChange, GarmentChoice } from "./garment.js";

const vneck = loadMatchJerseyProduct();
const round = loadMatchJerseyRoundProduct();
const tshirt = loadStandInProduct();
const fonts = loadPlaceholderFonts();
const hoops = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../samples/templates/match-jersey-vneck/hoops.json"), "utf8")) as Template;
const assets = { upload: async () => ({ assetId: "a1" }), url: () => null };
const crest = { assetId: "a-crest", mediaType: "image/png", width: 800, height: 800 } as const;
const design = addLayer(applyTemplate(createDesign(vneck, { teamName: "TIGERS", samplePlayer: { name: "ALI", number: "10" } }), hoops, { product: vneck, fonts }), newLogoLayer(vneck, { id: "crest-1", pieceId: "front", preset: "left-chest", asset: crest }), { product: vneck });
const list: SavedTeamList = { version: 1, productId: vneck.id, prints: { name: true, number: true }, lines: [{ id: "l1", name: "Ali", number: "10", size: "M", count: 1, noName: false, noNumber: false }] };

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 390 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 844 });
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as never;
  Element.prototype.scrollIntoView ??= () => undefined;
});
afterEach(cleanup);

const choice = (product: ProductDefinition, name: string, extra: Partial<GarmentChoice> = {}): GarmentChoice => ({ id: product.id, name, product, ...extra });
const garments = (bareTshirt?: ProductDefinition): GarmentChoice[] => [
  choice(vneck, "Jersey, V-neck", { group: "jersey", groupName: "Jersey", variant: "V-neck" }),
  choice(round, "Jersey, round neck", { group: "jersey", groupName: "Jersey", variant: "Round neck" }),
  choice(bareTshirt ?? tshirt, "T-shirt"),
];

function mount(extra: { garments?: GarmentChoice[]; onChoose?: ((c: GarmentChange) => void) | undefined } = {}) {
  return render(
    <EditorShell
      product={vneck}
      palette={loadPlaceholderPalette()}
      fonts={fonts}
      templates={[]}
      initialDesign={design}
      productName="Jersey"
      assets={assets}
      flatView
      fontSet={null}
      teamList={{ initial: list }}
      {...(extra.garments ? { garments: extra.garments } : {})}
      {...(extra.onChoose ? { onChooseGarment: extra.onChoose } : {})}
    />,
  );
}

describe("the garment chooser in the shell", () => {
  it("is not offered without garments, with one, or without the host's callback", () => {
    expect(mount().queryByTestId("garment-button")).toBeNull();
    cleanup();
    expect(mount({ garments: [garments()[0]!], onChoose: () => undefined }).queryByTestId("garment-button")).toBeNull();
    cleanup();
    expect(mount({ garments: garments() }).queryByTestId("garment-button")).toBeNull();
  });

  it("one tap on the other neck: the host is given everything unchanged, the list for the new product, and a notice; no question", () => {
    const changes: GarmentChange[] = [];
    const view = mount({ garments: garments(), onChoose: (c) => changes.push(c) });
    act(() => void fireEvent.click(view.getByTestId("garment-button")));
    expect(view.getByTestId("garment-sheet")).toBeTruthy();
    act(() => void fireEvent.click(view.getByTestId(`garment-${round.id}`)));
    expect(changes).toHaveLength(1);
    const c = changes[0]!;
    expect(c).toMatchObject({ garmentId: round.id, samePattern: true, leftBehind: 0 });
    expect(c.design.product.id).toBe(round.id);
    expect(c.design.layers.map((l) => l.id)).toEqual(design.layers.map((l) => l.id));
    expect(c.design.shapes).toEqual(design.shapes);
    expect(c.teamList).toMatchObject({ productId: round.id, lines: [{ id: "l1", name: "Ali" }] });
    expect(c.notice).toContain("round neck");
    expect(view.queryByTestId("garment-ask")?.hasAttribute("open")).toBeFalsy();
  });

  it("to another garment with a place for everything: carried, the stripes noted in the notice", () => {
    const changes: GarmentChange[] = [];
    const view = mount({ garments: garments(), onChoose: (c) => changes.push(c) });
    act(() => void fireEvent.click(view.getByTestId("garment-button")));
    act(() => void fireEvent.click(view.getByTestId(`garment-${tshirt.id}`)));
    expect(changes[0]).toMatchObject({ garmentId: tshirt.id, samePattern: false, leftBehind: 0 });
    expect(changes[0]!.design.layers).toHaveLength(design.layers.length);
    expect(changes[0]!.design.shapes).toEqual([]);
    expect(changes[0]!.notice).toContain("stripes");
  });

  it("asks before anything would be left behind, and says what: staying changes nothing, switching hands the host the rest", () => {
    const bare: ProductDefinition = structuredClone(tshirt);
    for (const p of bare.placements) p.roles = p.roles.filter((r) => r !== "crest") as typeof p.roles;
    bare.placements = bare.placements.filter((p) => p.roles.length > 0);
    const changes: GarmentChange[] = [];
    const view = mount({ garments: garments(bare), onChoose: (c) => changes.push(c) });
    act(() => void fireEvent.click(view.getByTestId("garment-button")));
    act(() => void fireEvent.click(view.getByTestId(`garment-${tshirt.id}`)));
    expect(changes).toEqual([]);
    const ask = view.getByTestId("garment-ask");
    expect(ask.textContent).toContain("1 of your items has no place");
    expect(ask.textContent).toContain("Logo");
    act(() => void fireEvent.click(view.getByTestId("garment-ask-stay")));
    expect(changes).toEqual([]);
    act(() => void fireEvent.click(view.getByTestId("garment-button")));
    act(() => void fireEvent.click(view.getByTestId(`garment-${tshirt.id}`)));
    act(() => void fireEvent.click(view.getByTestId("garment-ask-switch")));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ garmentId: tshirt.id, leftBehind: 1 });
    expect(changes[0]!.design.layers.some((l) => l.id === "crest-1")).toBe(false);
    expect(changes[0]!.notice).toContain("1 item stays");
  });

  it("choosing the garment already being designed changes nothing", () => {
    const changes: GarmentChange[] = [];
    const view = mount({ garments: garments(), onChoose: (c) => changes.push(c) });
    act(() => void fireEvent.click(view.getByTestId("garment-button")));
    act(() => void fireEvent.click(view.getByTestId(`garment-${vneck.id}`)));
    expect(changes).toEqual([]);
  });
});
