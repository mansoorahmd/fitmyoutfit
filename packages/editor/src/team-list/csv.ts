/**
 * A CSV file for the paste view (08-team-list.md, 5.6): the bytes of a file become text, which the SAME reader as a
 * paste then reads (`readPastedList`, in the rules package). No CSV library: quoting is the reader's job, and the
 * browser's own `File` reading gives the bytes.
 *
 * Encodings: UTF-8 (a byte-order mark is dropped); if that is not valid UTF-8, UTF-16 (Excel's "Unicode Text": a
 * byte-order mark, or text that is plainly 16-bit); anything else (Excel's older "CSV" in a code page, which turns
 * Arabic and Urdu letters into question marks) is refused with the "Save As CSV UTF-8" message. A file that is not
 * text (a picture, a spreadsheet) is refused, and one over the limit is not read at all.
 */
import { PASTE_LIMITS } from "./paste.js";

export type FileRefusal = "too-big" | "spreadsheet" | "not-text" | "encoding" | "empty";

export type FileText = { ok: true; text: string; encoding: "utf-8" | "utf-16le" | "utf-16be" } | { ok: false; reason: FileRefusal };

/** Names that can only be a spreadsheet: the hint says to copy the cells (W-TL41). */
const SPREADSHEET_NAME = /\.(xlsx|xlsm|xlsb|xls|ods|numbers)$/iu;

/** Whether a file's name says it is a spreadsheet, which the paste view does not read (5.6). */
export function isSpreadsheetName(name: string): boolean {
  return SPREADSHEET_NAME.test(name.trim());
}

/** Whether the bytes start like a zip (an .xlsx is one), an old Excel file, or a PDF or a picture: not text. */
function looksBinary(bytes: Uint8Array): FileRefusal | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x50, 0x4b, 0x03, 0x04)) return "spreadsheet"; // PK: .xlsx, .ods
  if (starts(0xd0, 0xcf, 0x11, 0xe0)) return "spreadsheet"; // old .xls
  if (starts(0x25, 0x50, 0x44, 0x46) || starts(0x89, 0x50, 0x4e, 0x47) || starts(0xff, 0xd8, 0xff) || starts(0x47, 0x49, 0x46, 0x38)) return "not-text";
  return null;
}

function decode(label: "utf-8" | "utf-16le" | "utf-16be", bytes: Uint8Array): string | null {
  try {
    return new TextDecoder(label, { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return null;
  }
}

/** Plain 16-bit text without a mark: every other byte is zero for Latin letters (UTF-16LE) or the even ones (BE). */
function guessUtf16(bytes: Uint8Array): "utf-16le" | "utf-16be" | null {
  const pairs = Math.min(Math.floor(bytes.length / 2), 400);
  if (pairs < 2) return null;
  let evenZero = 0;
  let oddZero = 0;
  for (let i = 0; i < pairs; i++) {
    if (bytes[2 * i] === 0) evenZero++;
    if (bytes[2 * i + 1] === 0) oddZero++;
  }
  if (oddZero > pairs * 0.4 && evenZero === 0) return "utf-16le";
  if (evenZero > pairs * 0.4 && oddZero === 0) return "utf-16be";
  return null;
}

/** The text of a file's bytes, or why it is refused. `name` is used only to recognise a spreadsheet. */
export function readFileText(bytes: Uint8Array, options: { name?: string; maxBytes?: number } = {}): FileText {
  const max = options.maxBytes ?? PASTE_LIMITS.maxFileBytes;
  if (bytes.length > max) return { ok: false, reason: "too-big" };
  if (options.name && isSpreadsheetName(options.name)) return { ok: false, reason: "spreadsheet" };
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  const binary = looksBinary(bytes);
  if (binary) return { ok: false, reason: binary };

  // Byte-order marks decide first.
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    const text = decode("utf-16le", bytes);
    return text === null ? { ok: false, reason: "encoding" } : done(text, "utf-16le");
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const text = decode("utf-16be", bytes);
    return text === null ? { ok: false, reason: "encoding" } : done(text, "utf-16be");
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    const text = decode("utf-8", bytes);
    return text === null ? { ok: false, reason: "encoding" } : done(text, "utf-8");
  }
  // 16-bit text without a mark: look before trying UTF-8 (it would "decode", with a NUL after every letter).
  const guessed = guessUtf16(bytes);
  if (guessed) {
    const text = decode(guessed, bytes);
    if (text !== null) return done(text, guessed);
  }
  const text = decode("utf-8", bytes);
  if (text === null) return { ok: false, reason: "encoding" };
  // NUL bytes and other control characters in valid UTF-8 are not a list.
  if (hasControlCharacters(text)) return { ok: false, reason: "not-text" };
  return done(text, "utf-8");
}

/** A control character other than tab and the line breaks (and form feed, which spreadsheets sometimes leave). */
function hasControlCharacters(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if ((code < 9 || (code > 13 && code < 32)) && code !== 12) return true;
  }
  return false;
}

function done(text: string, encoding: "utf-8" | "utf-16le" | "utf-16be"): FileText {
  // The byte-order mark is dropped (a decoder keeps it when `ignoreBOM` is false only for some labels; strip it anyway).
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return clean.trim() === "" ? { ok: false, reason: "empty" } : { ok: true, text: clean, encoding };
}
