import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalSnapshotText, hashSnapshot, hashSnapshotText, type ProofSnapshot } from "./snapshot.js";

const base = (): ProofSnapshot => ({
  design_version_id: "desver_1",
  product_id: "prod_1",
  region_id: "reg_1",
  team_name: "Lahore Lions",
  prints: { name: true, number: true },
  lines: [
    { name: "Ali Khan", number: "7", size: "M", count: 1, no_name: false, no_number: false },
    { name: "", number: "10", size: "L", count: 2, no_name: true, no_number: false },
  ],
});

describe("canonical snapshot text", () => {
  it("has a fixed key order and no white space", () => {
    expect(canonicalSnapshotText(base())).toBe(
      '{"format":1,"design_version_id":"desver_1","product_id":"prod_1","region_id":"reg_1","team_name":"Lahore Lions",' +
        '"prints":{"name":true,"number":true},"lines":[' +
        '{"name":"Ali Khan","number":"7","size":"M","count":1,"no_name":false,"no_number":false},' +
        '{"name":"","number":"10","size":"L","count":2,"no_name":true,"no_number":false}]}'
    );
  });

  it("does not depend on the order of the keys the caller used, or on extra keys", () => {
    const shuffled = {
      lines: [
        { no_number: false, no_name: false, count: 1, size: "M", number: "7", name: "Ali Khan", id: "l1", extra: 1 },
        { no_number: false, no_name: true, count: 2, size: "L", number: "10", name: "" },
      ],
      prints: { number: true, name: true },
      team_name: "Lahore Lions",
      region_id: "reg_1",
      product_id: "prod_1",
      design_version_id: "desver_1",
    } as unknown as ProofSnapshot;
    expect(hashSnapshot(shuffled)).toEqual(hashSnapshot(base()));
  });

  it("keeps the order of the lines: a different order is a different proof", () => {
    const swapped = base();
    swapped.lines = [swapped.lines[1]!, swapped.lines[0]!];
    expect(hashSnapshot(swapped).hash).not.toBe(hashSnapshot(base()).hash);
  });

  it("normalises text the same way the stored list is cleaned", () => {
    const a = base();
    a.lines = [{ name: "  José   ‏Ali ", number: " 7 ", size: "M", count: 1, no_name: false, no_number: false }];
    const b = base();
    b.lines = [{ name: "José Ali", number: "7", size: "M", count: 1, no_name: false, no_number: false }];
    expect(hashSnapshot(a)).toEqual(hashSnapshot(b));
  });

  it("writes Urdu and Arabic names and digits as they are, not as escapes", () => {
    const s = base();
    s.team_name = "لاہور شیرز";
    s.lines = [
      { name: "محمد علی", number: "٧", size: "M", count: 1, no_name: false, no_number: false },
      { name: "عبداللہ", number: "۱۰", size: "L", count: 1, no_name: false, no_number: false },
      { name: "نور‌الدین", number: "12", size: "L", count: 1, no_name: false, no_number: false },
    ];
    const out = hashSnapshot(s);
    expect(out.text).toContain('"team_name":"لاہور شیرز"');
    expect(out.text).toContain('"name":"محمد علی","number":"٧"');
    expect(out.text).toContain('"number":"۱۰"');
    expect(out.text).toContain("نور‌الدین");
    expect(out.text).not.toContain("\\u");
    expect(out.hash).toBe(createHash("sha256").update(out.text, "utf8").digest("hex"));
  });

  it("keeps the digit system: three sevens are three different texts", () => {
    const hashes = ["7", "٧", "۷"].map((number) => {
      const s = base();
      s.lines = [{ name: "A", number, size: "M", count: 1, no_name: false, no_number: false }];
      return hashSnapshot(s).hash;
    });
    expect(new Set(hashes).size).toBe(3);
  });

  it("changes with any field", () => {
    const reference = hashSnapshot(base()).hash;
    const changes: ((s: ProofSnapshot) => void)[] = [
      (s) => (s.team_name = "Lahore Lion"),
      (s) => (s.design_version_id = "desver_2"),
      (s) => (s.product_id = "prod_2"),
      (s) => (s.region_id = "reg_2"),
      (s) => (s.prints = { name: true, number: false }),
      (s) => (s.lines[0]!.size = "S"),
      (s) => (s.lines[0]!.count = 2),
      (s) => (s.lines[1]!.no_name = false),
      (s) => (s.lines[1]!.no_number = true),
      (s) => (s.lines = s.lines.slice(0, 1)),
    ];
    for (const change of changes) {
      const s = base();
      change(s);
      expect(hashSnapshot(s).hash).not.toBe(reference);
    }
  });

  it("hashes the text with SHA-256 in lowercase hexadecimal", () => {
    const { text, hash } = hashSnapshot(base());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSnapshotText(text)).toBe(hash);
    expect(hash).toBe(createHash("sha256").update(text, "utf8").digest("hex"));
  });

  it("holds an empty list", () => {
    const s = base();
    s.lines = [];
    expect(canonicalSnapshotText(s)).toContain('"lines":[]}');
  });
});
