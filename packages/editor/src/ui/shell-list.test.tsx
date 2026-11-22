// @vitest-environment jsdom
/**
 * The shell run in a DOM (the flat view: no WebGL in jsdom): the team list's undo history and the locked guards, as
 * the reviewer's run (QA20 B1, S5): a paste is one undo step; nothing changes the list while it is locked.
 */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDesign } from "../design/create.js";
import { applyTemplate } from "../design/template.js";
import type { Template } from "../design/template.js";
import { EditorShell, type EditorShellProps } from "./EditorShell.js";
import type { SavedTeamList, TeamListHost } from "../team-list/types.js";
import { loadPlaceholderFonts, loadPlaceholderPalette, loadStandInJerseyProduct } from "../test/fixtures.js";

const product = loadStandInJerseyProduct();
const fontsCatalog = loadPlaceholderFonts();
const classic = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../samples/templates/stand-in-jersey/classic.json"), "utf8")) as Template;
const design = applyTemplate(createDesign(product, { teamName: "LIONS", samplePlayer: { name: "ALI", number: "10" } }), classic, { product, fonts: fontsCatalog });
const assets = { upload: async () => ({ assetId: "a1" }), url: () => null };
const saved = (names: string[]): SavedTeamList => ({ version: 1, productId: product.id, prints: { name: true, number: true }, lines: names.map((name, i) => ({ id: `l-${i}`, name, number: String(i + 1), size: "M", count: 1, noName: false, noNumber: false })) as never });

beforeAll(() => {
  // jsdom lacks these; the shell only needs them to exist.
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 390 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 844 });
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as never;
  Element.prototype.scrollIntoView ??= () => undefined;
});
afterEach(cleanup);

function mount(teamList: TeamListHost, extra: Partial<EditorShellProps> = {}) {
  const view = render(
    <EditorShell product={product} palette={loadPlaceholderPalette()} fonts={loadPlaceholderFonts()} templates={[]} initialDesign={design} productName="Jersey" assets={assets} flatView fontSet={null} teamList={teamList} {...extra} />,
  );
  act(() => void fireEvent.click(view.getByTestId("tab-players")));
  return view;
}

describe("the locked list and the history (B1)", () => {
  it("undo and redo (keys and buttons) change nothing and tell the host nothing while the list is locked", () => {
    vi.useFakeTimers();
    try {
      const calls: SavedTeamList[] = [];
      const host: TeamListHost = { initial: saved(["Ali", "Bilal"]), debounceMs: 10, onChange: (l) => calls.push(l) };
      const view = mount(host);
      // An edit while unlocked, so there is something to undo.
      act(() => void fireEvent.change(view.getByTestId("tl-name-0"), { target: { value: "Aliyan" } }));
      act(() => void fireEvent.blur(view.getByTestId("tl-name-0")));
      act(() => void vi.advanceTimersByTime(50));
      expect(calls.at(-1)?.lines[0]?.name).toBe("Aliyan");
      const before = calls.length;
      view.rerender(
        <EditorShell product={product} palette={loadPlaceholderPalette()} fonts={loadPlaceholderFonts()} templates={[]} initialDesign={design} productName="Jersey" assets={assets} flatView fontSet={null} teamList={{ ...host, locked: { signedOn: "20 Nov 2026" } }} />,
      );
      expect(view.getByTestId("tl-locked")).toBeTruthy();
      const name = () => (view.getByTestId("tl-name-0") as HTMLInputElement).value;
      expect(name()).toBe("Aliyan");
      act(() => void fireEvent.keyDown(window, { key: "z", ctrlKey: true }));
      act(() => void fireEvent.keyDown(window, { key: "y", ctrlKey: true }));
      act(() => void fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true }));
      act(() => void fireEvent.click(view.getByTestId("undo")));
      act(() => void fireEvent.click(view.getByTestId("redo")));
      act(() => void vi.advanceTimersByTime(200));
      expect(name()).toBe("Aliyan");
      expect(calls.length).toBe(before);
      expect(view.getByTestId("undo").getAttribute("aria-disabled")).toBe("true");
      expect(view.getByTestId("redo").getAttribute("aria-disabled")).toBe("true");
    } finally {
      vi.useRealTimers();
    }
  });
});

const names = (view: ReturnType<typeof mount>) => Array.from(view.container.querySelectorAll<HTMLInputElement>('[data-field="name"]')).map((i) => i.value);

describe("a paste is one undo step (S5)", () => {
  it("three pasted players come in together and one undo takes them all out", async () => {
    const view = mount({ initial: saved(["Ali", "Bilal"]) });
    expect(names(view)).toEqual(["Ali", "Bilal"]);
    act(() => void fireEvent.click(view.getByTestId("tl-paste")));
    act(() => void fireEvent.change(view.getByTestId("paste-box"), { target: { value: "Chand 5 M\nDawood 6 L\nEmad 7 S" } }));
    const accept = await view.findByTestId("paste-accept");
    act(() => void fireEvent.click(accept));
    expect(names(view)).toEqual(["Ali", "Bilal", "Chand", "Dawood", "Emad"]);
    act(() => void fireEvent.click(view.getByTestId("undo")));
    expect(names(view)).toEqual(["Ali", "Bilal"]);
    act(() => void fireEvent.click(view.getByTestId("redo")));
    expect(names(view)).toEqual(["Ali", "Bilal", "Chand", "Dawood", "Emad"]);
  });
});

describe("every way of changing a locked list is refused (S5)", () => {
  it("typing, a multi-line paste, the line menu, moving a line: nothing changes and the host is not called", () => {
    vi.useFakeTimers();
    try {
      const calls: SavedTeamList[] = [];
      const view = mount({ initial: saved(["Ali", "Bilal"]), locked: { signedOn: "20 Nov 2026" }, debounceMs: 10, onChange: (l) => calls.push(l) });
      expect(view.getByTestId("tl-locked")).toBeTruthy();
      const first = view.getByTestId("tl-name-0") as HTMLInputElement;
      act(() => void first.focus());
      act(() => void fireEvent.input(first, { target: { value: "Zed" } }));
      act(() => void fireEvent.keyDown(first, { key: "ArrowDown", altKey: true }));
      act(() => void fireEvent.keyDown(first, { key: "Enter" }));
      act(() => void fireEvent.paste(first, { clipboardData: { getData: () => "Chand 5 M\nDawood 6 L" } }));
      expect(view.queryByTestId("paste-view")).toBeNull();
      expect(view.queryByTestId("tl-more-0")).toBeNull();
      expect(view.queryByTestId("tl-add")).toBeNull();
      expect(view.queryByTestId("tl-add-top")).toBeNull();
      act(() => void vi.advanceTimersByTime(300));
      expect(names(view)).toEqual(["Ali", "Bilal"]);
      expect(calls).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
