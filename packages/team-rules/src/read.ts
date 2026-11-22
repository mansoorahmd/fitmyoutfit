/**
 * Reading a pasted list or a CSV file (docs/design/08-team-list.md, section 5.3): text in, lines
 * out. The same reader serves the paste box of the editor and the server.
 *
 * Each part of a line is recognised by what it looks like (a size word, one or two digits, the
 * rest the name), in any order, and the parts may be separated by tabs, commas, semicolons, `|`
 * or spaces. The reader never guesses: when a line can be read two ways the uncertain field is
 * left empty and a note says so. Lines that are not players are listed apart.
 *
 * It does not check the lines (that is `checkRoster`, run on the result) and never throws for
 * odd text.
 */
import { DEFAULT_JERSEY_NUMBER_RULES } from "./jersey-number-rules.js";
import { resolveLimits } from "./limits.js";
import { buildSizeTable, looksLikeSize, readSize, type SizeTable } from "./sizes.js";
import { cleanText } from "./text.js";
import type { RosterLimits, RosterLine, SizeSpec } from "./types.js";

export type ColumnName = "name" | "number" | "size" | "count";

/** An uncertain part, left empty or defaulted, with the values the message needs. */
export type ReadNote =
  | { code: "two-numbers"; values: string[] }
  | { code: "two-sizes"; values: string[] }
  | { code: "two-counts"; values: string[] }
  | { code: "count-unclear"; value: string };

export interface ReadLine {
  /** Line number in the text, from 1, counting empty lines. */
  lineNumber: number;
  /** The line as read, after the decoration was removed. */
  text: string;
  /** Empty when none was found. */
  name: string;
  /** As written ("07", "٧"); empty when none or when two were found. */
  number: string;
  /** The product's spelling when it is one of the product's sizes, else as written; empty when none or two. */
  size: string;
  /** 1 unless the line said otherwise ("x2", "2 pcs", "qty 2"). */
  count: number;
  notes: ReadNote[];
}

export interface NotAdded {
  lineNumber: number;
  text: string;
  /** "not-a-player": no number, no size, and a colon at the end or more than five words. "nothing-to-read": only decoration. */
  reason: "not-a-player" | "nothing-to-read";
}

export interface ReadResult {
  lines: ReadLine[];
  notAdded: NotAdded[];
  /** The column order when the first line was a header ("Used as column names"), else null. */
  columns: ColumnName[] | null;
  /** Players read but left out because they do not fit (`room`). */
  overLimit: number;
}

export interface ReadOptions {
  /** The product's sizes (as in `RosterSettings`). */
  sizes: readonly (string | SizeSpec)[];
  limits?: Partial<RosterLimits>;
  /** How many more lines fit in the list; the limit's `maxLines` when left out. */
  room?: number;
}

// ---------------------------------------------------------------------------------------------
// Step 2: decoration

/** WhatsApp's copied prefixes: `[10:42, 17/11/2026] Imran: ` and `17/11/2026, 10:42 - Imran: `. */
const WHATSAPP_BRACKET = /^\[\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?m\.?)?,?\s*\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}\]\s*[^:\n]{1,40}:\s*/iu;
const WHATSAPP_DASH = /^\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?m\.?)?\s+[-\u2013]\s+[^:\n]{1,40}:\s*/iu;

const LEADING_DECORATION = /^(?:[\s\u2022\u00B7\-*\u2013\u2014\p{S}\p{Extended_Pictographic}\u200D]|\uFE0F|\u20E3)+/u;
const TRAILING_DECORATION = /(?:[\s\u2022\u00B7\-*\u2013\u2014\p{S}\p{Extended_Pictographic}\u200D]|\uFE0F|\u20E3)+$/u;
/** `1. `, `12) `, and an emoji keycap such as 1 + U+FE0F + U+20E3. */
const COUNTING_MARK = /^(?:\p{Nd}+[.)]\s+|[0-9#*]\uFE0F?\u20E3\s*)/u;

function stripDecoration(raw: string): string {
  let text = cleanText(raw);
  text = text.replace(WHATSAPP_BRACKET, "").replace(WHATSAPP_DASH, "");
  text = text.replace(LEADING_DECORATION, "").replace(TRAILING_DECORATION, "");
  const counted = text.replace(COUNTING_MARK, "");
  if (counted !== text) text = counted.replace(LEADING_DECORATION, "");
  return text;
}

// ---------------------------------------------------------------------------------------------
// Parts and tokens

const COLUMN_WORDS: Readonly<Record<string, ColumnName>> = {
  name: "name",
  player: "name",
  players: "name",
  "نام": "name",
  number: "number",
  num: "number",
  no: "number",
  "#": "number",
  shirt: "number",
  "نمبر": "number",
  size: "size",
  "سائز": "size",
  qty: "count",
  quantity: "count",
  count: "count",
  pcs: "count",
};

const SEPARATORS = new Set([",", ";", "|", "\u060C", "\u061B"]);
const QUOTES = new Set(['"', "\u201C", "\u201D"]);

/** Splits on commas, semicolons and `|` outside double quotes; quotes are removed. */
function splitSeparated(text: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of text) {
    if (QUOTES.has(char)) {
      quoted = !quoted;
      continue;
    }
    if (!quoted && SEPARATORS.has(char)) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map((p) => p.trim());
}

type Split = { parts: string[]; separated: boolean };

function splitLine(text: string): Split {
  if (text.includes("\t")) return { parts: text.split("\t").map((p) => p.trim()), separated: true };
  if ([...text].some((c) => SEPARATORS.has(c))) return { parts: splitSeparated(text), separated: true };
  return { parts: [text], separated: false };
}

function wordsOf(text: string): string[] {
  return text.split(/\s+/u).filter((w) => w !== "");
}

// ---------------------------------------------------------------------------------------------
// Recognising what a token is

type Context = {
  table: SizeTable;
  isDigits: (text: string) => boolean;
};

function makeDigitTest(limits: RosterLimits): (text: string) => boolean {
  const systems = [...DEFAULT_JERSEY_NUMBER_RULES.digitSystems, ...limits.numberRules.digitSystems];
  return (text) => {
    if (text === "") return false;
    for (const char of text) {
      const code = char.codePointAt(0)!;
      if (!systems.some((s) => code >= s.zero && code <= s.zero + 9)) return false;
    }
    return true;
  };
}

/** A prefix word before a number: `#7`, `No. 7`, `no7`. */
const NUMBER_PREFIX = /^(?:#|no\.?|nr\.?|num\.?|number)/iu;
const QUANTITY_TOKEN = /^[x\u00D7](\d{1,2})$/iu;

function numberOf(token: string, ctx: Context): string | null {
  // "#7", "no7", "No.7"
  const prefixed = NUMBER_PREFIX.exec(token);
  if (prefixed) {
    const rest = token.slice(prefixed[0].length);
    if (rest !== "" && ctx.isDigits(rest) && [...rest].length <= 3) return rest;
    return null;
  }
  return ctx.isDigits(token) && [...token].length <= 3 ? token : null;
}

/**
 * Joins the two-word forms into one token: "No. 7", "# 7", "qty 2" and "2 pcs". "No" before a
 * digit token is the word "number"; "qty" and a count before "pcs" become `x2`.
 */
function mergePairs(tokens: string[], ctx: Context): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    const next = tokens[i + 1];
    if (next !== undefined && /^(?:#|no\.?|nr\.?|num\.?|number)$/iu.test(token) && ctx.isDigits(next)) {
      out.push(`#${next}`);
      i += 1;
      continue;
    }
    if (next !== undefined && /^(?:qty\.?|quantity|x|\u00D7)$/iu.test(token) && /^\d{1,2}$/u.test(next)) {
      out.push(`x${next}`);
      i += 1;
      continue;
    }
    if (next !== undefined && /^\d{1,2}$/u.test(token) && /^(?:pcs\.?|pc|pieces?)$/iu.test(next)) {
      out.push(`x${token}`);
      i += 1;
      continue;
    }
    const glued = /^(\d{1,2})(?:pcs|pc|pieces?)$/iu.exec(token);
    if (glued) {
      out.push(`x${glued[1]}`);
      continue;
    }
    const gluedQty = /^qty\.?:?(\d{1,2})$/iu.exec(token);
    if (gluedQty) {
      out.push(`x${gluedQty[1]}`);
      continue;
    }
    out.push(token);
  }
  return out;
}

/** Marks only (a dash, a dot, a pipe) and nothing to read. `#` alone is kept for `mergePairs`. */
const SYMBOL_ONLY = /^[\p{P}\p{S}]+$/u;

type Found = { name: string; numbers: string[]; sizes: string[]; counts: string[] };

/**
 * What the words of one part hold. A number or a quantity may be anywhere; a size only at either
 * end of what is left (so the S of "Ali S Khan" stays in the name), as one word or two.
 */
function readWords(words: string[], ctx: Context): Found {
  const numbers: string[] = [];
  const counts: string[] = [];
  const rest: string[] = [];
  for (const token of mergePairs(words, ctx)) {
    const number = numberOf(token, ctx);
    if (number !== null) {
      numbers.push(number);
      continue;
    }
    const quantity = QUANTITY_TOKEN.exec(token);
    if (quantity) {
      counts.push(quantity[1]!);
      continue;
    }
    if (SYMBOL_ONLY.test(token)) continue;
    rest.push(token);
  }

  const spans: { from: number; text: string }[] = [];
  const taken = new Set<number>();
  const trySpan = (from: number, to: number): boolean => {
    if (from < 0 || to > rest.length || from >= to) return false;
    for (let i = from; i < to; i += 1) if (taken.has(i)) return false;
    const text = rest.slice(from, to).join(" ");
    if (!looksLikeSize(text, ctx.table)) return false;
    spans.push({ from, text });
    for (let i = from; i < to; i += 1) taken.add(i);
    return true;
  };
  const n = rest.length;
  // The end first, then the start; two words before one.
  if (!trySpan(n - 2, n)) trySpan(n - 1, n);
  if (!trySpan(0, 2)) trySpan(0, 1);

  const sizes = spans.sort((a, b) => a.from - b.from).map((span) => span.text);
  const name = rest.filter((_, i) => !taken.has(i)).join(" ");
  return { name, numbers, sizes, counts };
}

function combine(parts: Found[]): Found {
  return {
    name: parts.map((p) => p.name).filter((n) => n !== "").join(" "),
    numbers: parts.flatMap((p) => p.numbers),
    sizes: parts.flatMap((p) => p.sizes),
    counts: parts.flatMap((p) => p.counts),
  };
}

function sizeValue(text: string, table: SizeTable): string {
  const clean = cleanText(text);
  return readSize(clean, table) ?? clean;
}

function finish(
  found: Found,
  lineNumber: number,
  text: string,
  table: SizeTable,
): ReadLine {
  const notes: ReadNote[] = [];
  let number = "";
  if (found.numbers.length === 1) number = found.numbers[0]!;
  else if (found.numbers.length > 1) notes.push({ code: "two-numbers", values: found.numbers });

  let size = "";
  if (found.sizes.length === 1) size = sizeValue(found.sizes[0]!, table);
  else if (found.sizes.length > 1) notes.push({ code: "two-sizes", values: found.sizes.map((s) => sizeValue(s, table)) });

  let count = 1;
  if (found.counts.length === 1) count = Number(found.counts[0]);
  else if (found.counts.length > 1) notes.push({ code: "two-counts", values: found.counts });

  return { lineNumber, text, name: found.name, number, size, count, notes };
}

// ---------------------------------------------------------------------------------------------
// Header lines and columns

function headerColumns(parts: string[]): ColumnName[] | null {
  const columns: ColumnName[] = [];
  for (const part of parts) {
    const key = part.toLowerCase().replace(/[.:]+$/u, "");
    const column = Object.prototype.hasOwnProperty.call(COLUMN_WORDS, key) ? COLUMN_WORDS[key] : undefined;
    if (!column) return null;
    columns.push(column);
  }
  return columns.length > 0 ? columns : null;
}

function readByColumns(parts: string[], columns: ColumnName[], lineNumber: number, text: string, ctx: Context): ReadLine {
  let name = "";
  let number = "";
  let size = "";
  let count = 1;
  const notes: ReadNote[] = [];
  columns.forEach((column, i) => {
    const part = cleanText(parts[i] ?? "");
    if (part === "") return;
    if (column === "name") name = part;
    else if (column === "number") {
      const prefixed = NUMBER_PREFIX.exec(part);
      number = prefixed ? part.slice(prefixed[0].length).trim() : part;
    } else if (column === "size") size = sizeValue(part, ctx.table);
    else if (/^\d{1,3}$/u.test(part)) count = Number(part);
    else notes.push({ code: "count-unclear", value: part });
  });
  return { lineNumber, text, name, number, size, count, notes };
}

// ---------------------------------------------------------------------------------------------

/** One line, without a header: `null` when it is not a player. */
function readLine(text: string, lineNumber: number, ctx: Context): ReadLine | NotAdded {
  const { parts } = splitLine(text);
  const found = combine(parts.map((part) => readWords(wordsOf(part), ctx)));
  const line = finish(found, lineNumber, text, ctx.table);
  const noPlayerFields = found.numbers.length === 0 && found.sizes.length === 0 && found.counts.length === 0;
  if (noPlayerFields && (text.endsWith(":") || text.endsWith("\uFF1A") || wordsOf(text).length > 5)) {
    return { lineNumber, text, reason: "not-a-player" };
  }
  return line;
}

/**
 * Reads a pasted list or the text of a CSV file. See the file's comment for the rules, and
 * docs/design/08-team-list.md, 5.3 and 5.5, for the examples this is tested with.
 */
export function readPastedList(input: string, options: ReadOptions): ReadResult {
  const limits = resolveLimits(options.limits);
  const ctx: Context = { table: buildSizeTable(options.sizes), isDigits: makeDigitTest(limits) };
  const room = Math.max(0, options.room ?? limits.maxLines);

  const lines: ReadLine[] = [];
  const notAdded: NotAdded[] = [];
  let columns: ColumnName[] | null = null;
  let overLimit = 0;
  let first = true;

  const rows = String(input).split(/\r\n|[\r\n\u2028\u2029]/u);
  rows.forEach((raw, i) => {
    if (cleanText(raw) === "") return;
    const lineNumber = i + 1;
    const text = stripDecoration(raw);
    if (text === "") {
      notAdded.push({ lineNumber, text: cleanText(raw), reason: "nothing-to-read" });
      return;
    }

    const split = splitLine(text);
    if (first) {
      first = false;
      const header = headerColumns(split.separated ? split.parts : wordsOf(text));
      if (header) {
        columns = header;
        return;
      }
    }

    let read: ReadLine | NotAdded;
    if (columns && (split.separated || columns.length === 1) && split.parts.length <= columns.length) {
      read = readByColumns(split.parts, columns, lineNumber, text, ctx);
    } else {
      read = readLine(text, lineNumber, ctx);
    }
    if ("reason" in read) {
      notAdded.push(read);
    } else if (lines.length < room) {
      lines.push(read);
    } else {
      overLimit += 1;
    }
  });

  return { lines, notAdded, columns, overLimit };
}

/** A read line as a roster line: no flags set, and no id (the host gives one). */
export function toRosterLine(read: Pick<ReadLine, "name" | "number" | "size" | "count">): RosterLine {
  return { name: read.name, number: read.number, size: read.size, count: read.count, noName: false, noNumber: false };
}
