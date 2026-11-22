/** A CSV file for the paste view (08-team-list.md 5.6): the encodings, the refusals, and the same reader. */
import { describe, expect, it } from "vitest";
import { readPastedList } from "@fitmyoutfit/team-rules";
import { isSpreadsheetName, readFileText } from "./csv.js";
import { PASTE_LIMITS, readPaste } from "./paste.js";
import { DEFAULT_TEAM_SIZES } from "./types.js";

const utf8 = (text: string, bom = false) => {
  const body = new TextEncoder().encode(text);
  return bom ? Uint8Array.from([0xef, 0xbb, 0xbf, ...body]) : body;
};
function utf16(text: string, order: "le" | "be", bom = true): Uint8Array {
  const out: number[] = bom ? (order === "le" ? [0xff, 0xfe] : [0xfe, 0xff]) : [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out.push(...(order === "le" ? [c & 255, c >> 8] : [c >> 8, c & 255]));
  }
  return Uint8Array.from(out);
}
const CSV = 'Name,No,Size\nAli Raza,10,M\n"Raza, Bilal",7,L\nمحمد علی,٧,XL\n';
const preview = (text: string) => readPaste(text, { sizes: DEFAULT_TEAM_SIZES, prints: { name: true, number: true }, existing: [], mode: "add", maxLines: 100 });

describe("the text of a file", () => {
  it("reads UTF-8, with Urdu names", () => {
    const r = readFileText(utf8(CSV));
    expect(r).toMatchObject({ ok: true, encoding: "utf-8" });
    if (r.ok) expect(r.text).toBe(CSV);
  });
  it("drops a byte-order mark", () => {
    const r = readFileText(utf8(CSV, true));
    expect(r.ok && r.text.startsWith("Name")).toBe(true);
  });
  it("reads UTF-16 (Excel's Unicode Text), little and big endian, with or without a mark", () => {
    for (const order of ["le", "be"] as const) {
      for (const bom of [true, false]) {
        const r = readFileText(utf16(CSV, order, bom));
        expect(r, `${order} ${bom}`).toMatchObject({ ok: true });
        if (r.ok) expect(r.text).toBe(CSV);
      }
    }
  });
  it("refuses another encoding with the message about saving as CSV UTF-8 (an accented letter in a code page is not valid UTF-8)", () => {
    const latin1 = Uint8Array.from([...new TextEncoder().encode("Name,No,Size\nJos"), 0xe9, ...new TextEncoder().encode(",7,M\n")]);
    expect(readFileText(latin1)).toEqual({ ok: false, reason: "encoding" });
  });
  it("refuses a file that is not text: a picture, a PDF, a spreadsheet by its bytes and by its name", () => {
    expect(readFileText(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]))).toEqual({ ok: false, reason: "not-text" });
    expect(readFileText(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]))).toEqual({ ok: false, reason: "not-text" });
    expect(readFileText(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0]))).toEqual({ ok: false, reason: "spreadsheet" });
    expect(readFileText(utf8("Ali 7 M"), { name: "team.XLSX" })).toEqual({ ok: false, reason: "spreadsheet" });
    expect(readFileText(Uint8Array.from([0x41, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06]))).toMatchObject({ ok: false });
    expect(isSpreadsheetName("a.csv")).toBe(false);
    expect(isSpreadsheetName("a.xls")).toBe(true);
  });
  it("refuses a file over the limit without reading it, and an empty one", () => {
    expect(PASTE_LIMITS.maxFileBytes).toBe(200 * 1024);
    expect(readFileText(new Uint8Array(PASTE_LIMITS.maxFileBytes + 1))).toEqual({ ok: false, reason: "too-big" });
    expect(readFileText(new Uint8Array(0))).toEqual({ ok: false, reason: "empty" });
    expect(readFileText(utf8("  \n \n"))).toEqual({ ok: false, reason: "empty" });
  });
});

describe("the same reader and the same preview", () => {
  it("reads a quoted comma as part of the name, a header as the columns, and shows what the same text pasted shows", () => {
    const file = readFileText(utf8(CSV, true));
    if (!file.ok) throw new Error("not read");
    const fromFile = preview(file.text);
    expect(fromFile.columns).toEqual(["name", "number", "size"]);
    expect(fromFile.rows.map((r) => [r.line.name, r.line.number, r.line.size])).toEqual([
      ["Ali Raza", "10", "M"],
      ["Raza, Bilal", "7", "L"],
      ["محمد علی", "٧", "XL"],
    ]);
    const direct = readPastedList(CSV, { sizes: DEFAULT_TEAM_SIZES });
    expect(fromFile.rows.map((r) => r.line.name)).toEqual(direct.lines.map((l) => l.name));
  });
  it("a file of 25 players is read in full", () => {
    const rows = Array.from({ length: 25 }, (_, i) => `Player ${String.fromCharCode(65 + i)},${i + 1},${["S", "M", "L", "XL"][i % 4]}`);
    const file = readFileText(utf8(["Name,No,Size", ...rows].join("\r\n")));
    if (!file.ok) throw new Error("not read");
    const p = preview(file.text);
    expect(p.rows).toHaveLength(25);
    expect(p.needLook).toBe(0);
  });
});
