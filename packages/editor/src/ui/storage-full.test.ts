/** A logo upload that fails because the device's storage is full says so, with a way forward (E3c, S4). */
import { describe, expect, it } from "vitest";
import { EDITOR_WORDING as W } from "./content";
import { isStorageFull, uploadRefusal, uploadRefusalText } from "./upload-wording";

describe("storage full (S4)", () => {
  it("tells the quota error from a network failure", () => {
    const quota = Object.assign(new Error("The quota has been exceeded."), { name: "QuotaExceededError" });
    expect(isStorageFull(quota)).toBe(true);
    expect(isStorageFull({ name: "NS_ERROR_DOM_QUOTA_REACHED" })).toBe(true);
    expect(isStorageFull(new Error("IndexedDB transaction aborted (storage full?)"))).toBe(true);
    expect(isStorageFull(new TypeError("Failed to fetch"))).toBe(false);
  });

  it("gives storage its own sentence, never the connection one", () => {
    expect(uploadRefusal([], { size: 1000, storageFull: true, networkFailed: true })).toBe("storage-full");
    const text = uploadRefusalText(W, "storage-full", "crest.png", 1000);
    expect(text).toBe(W.logos.storageFull);
    expect(text).not.toBe(W.logos.network);
    expect(text).toMatch(/storage is full/);
  });
});
