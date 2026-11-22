/** What the editor hands its host: after a second without changes, never on every key, at once on request. */
import { describe, expect, it, vi } from "vitest";
import { createHandOver } from "./hand-over.js";

describe("handing the list to the host", () => {
  it("waits for a quiet moment and hands over only the last value", () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    const h = createHandOver<number>({ delayMs: 1000, emit: (v) => seen.push(v) });
    h.schedule(1);
    vi.advanceTimersByTime(600);
    h.schedule(2);
    vi.advanceTimersByTime(600);
    expect(seen).toEqual([]);
    expect(h.pending).toBe(true);
    vi.advanceTimersByTime(500);
    expect(seen).toEqual([2]);
    expect(h.pending).toBe(false);
    vi.useRealTimers();
  });
  it("hands over at once on flush, and never twice", () => {
    vi.useFakeTimers();
    const seen: string[] = [];
    const h = createHandOver<string>({ delayMs: 1000, emit: (v) => seen.push(v) });
    h.schedule("a");
    h.flush();
    h.flush();
    vi.advanceTimersByTime(5000);
    expect(seen).toEqual(["a"]);
    vi.useRealTimers();
  });
  it("forgets a value on dispose, and takes the delay from the host when it is a function", () => {
    vi.useFakeTimers();
    const seen: string[] = [];
    let ms = 0;
    const h = createHandOver<string>({ delayMs: () => ms, emit: (v) => seen.push(v) });
    h.schedule("now");
    vi.advanceTimersByTime(1);
    ms = 1000;
    h.schedule("later");
    h.dispose();
    vi.advanceTimersByTime(5000);
    expect(seen).toEqual(["now"]);
    vi.useRealTimers();
  });
});
