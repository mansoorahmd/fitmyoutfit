/** E3e (QA 17): focus moved in code after a pointer shows no ring; after a key it does. */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { EDITOR_CSS } from "./styles";
import { focusForInput, lastInputWasKey, resetInputKind, trackInputKind } from "./pointer-focus";

class FakeEl {
  attrs = new Map<string, string>();
  listeners = new Map<string, Array<() => void>>();
  focused: unknown = null;
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
  addEventListener(type: string, fn: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener(type: string, fn: () => void) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((f) => f !== fn));
  }
  fire(type: string) {
    for (const fn of this.listeners.get(type) ?? []) fn();
  }
  focus(options: unknown) {
    this.focused = options;
  }
}

describe("focus without a ring after a pointer", () => {
  beforeEach(() => resetInputKind());
  it("a pointer (or no input at all): the button takes focus, marked, and not asked to show the ring", () => {
    const win = new EventTarget();
    trackInputKind(win);
    const el = new FakeEl();
    focusForInput(el as unknown as HTMLElement);
    expect(el.attrs.has("data-pointer-focus")).toBe(true);
    expect((el.focused as { focusVisible?: boolean }).focusVisible).toBe(false);
    // The first key pressed brings the ring back.
    el.fire("keydown");
    expect(el.attrs.has("data-pointer-focus")).toBe(false);
  });
  it("a key was the last input: no mark, the ring shows as usual", () => {
    const win = new EventTarget();
    trackInputKind(win);
    win.dispatchEvent(new Event("keydown"));
    expect(lastInputWasKey()).toBe(true);
    const el = new FakeEl();
    focusForInput(el as unknown as HTMLElement);
    expect(el.attrs.has("data-pointer-focus")).toBe(false);
    expect((el.focused as { focusVisible?: boolean }).focusVisible).toBeUndefined();
    win.dispatchEvent(new Event("pointerdown"));
    expect(lastInputWasKey()).toBe(false);
  });
  it("the stylesheet draws no ring on a marked button, and the Done panel uses it", () => {
    expect(EDITOR_CSS).toMatch(/\[data-pointer-focus\]:focus-visible\s*\{[^}]*outline:\s*none/);
    expect(readFileSync(new URL("./DonePanel.tsx", import.meta.url), "utf8")).toContain("focusForInput(");
  });
});
