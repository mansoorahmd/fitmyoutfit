import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "./sha256.js";

const node = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

describe("sha256Hex", () => {
  it("matches the known values", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("matches the Node crypto module at every padding boundary and for Urdu, Arabic and emoji text", () => {
    for (let length = 0; length <= 200; length++) {
      const s = "x".repeat(length);
      expect(sha256Hex(s)).toBe(node(s));
    }
    for (const s of ["لاہور شیرز", "محمد ٧ ۷", "é é", "😀 ‌", "a".repeat(10_000)]) {
      expect(sha256Hex(s)).toBe(node(s));
    }
  });
});
