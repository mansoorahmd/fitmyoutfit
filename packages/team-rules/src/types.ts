/**
 * The shapes of the roster rules (docs/design/08-team-list.md, sections 6, 8 and 12; decision 012).
 * Plain data in, plain data out: no sentences (the storefront and the editor own the wording).
 */
import type { JerseyNumberRules } from "./jersey-number-rules.js";

/** One line of a team list: one player, or one spare shirt (08-team-list.md, 12.1). */
export interface RosterLine {
  /** Made by the host, unique in the list; kept when the line is edited or moved. Optional here. */
  id?: string;
  /** As typed, cleaned. May be empty. */
  name: string;
  /** As typed, cleaned: "07" and "٧" are kept as written and compared as numbers. May be empty. */
  number: string;
  /** One of the product's size codes, or the text as typed when it is not one. May be empty. */
  size: string;
  /** How many of this shirt (1 to `maxCount`). */
  count: number;
  /** The organizer said this shirt has no name on purpose (a spare). */
  noName: boolean;
  /** The organizer said this shirt has no number on purpose. */
  noNumber: boolean;
}

/** Which fields the design prints (08-team-list.md, section 9). */
export interface PrintedFields {
  name: boolean;
  number: boolean;
}

/** One size of the product, with the extra words that mean it (08-team-list.md, 4.5). */
export interface SizeSpec {
  /** The product's code and spelling, for example "2XL". */
  code: string;
  /** Other spellings of this size, any case, with or without spaces ("xxl", "youth small"). */
  words?: readonly string[];
}

/**
 * The limits. All of them are data with the defaults of decision 012 (see `DEFAULT_LIMITS`), and
 * every function takes them as an argument: the backend can read them from settings.
 */
export interface RosterLimits {
  /** Most lines in one list. */
  maxLines: number;
  /** Fewest and most of one shirt on one line. */
  minCount: number;
  maxCount: number;
  /**
   * Longest name, in characters (letters; combining marks and the zero-width non-joiner do not
   * count). A fixed number until the editor can measure fonts.
   */
  maxNameLength: number;
  /** The jersey number rule: 0 to 99, in English or Arabic digits. */
  numberRules: JerseyNumberRules;
}

/** What the checks need to know besides the lines. */
export interface RosterSettings {
  /** Which fields the design prints: what is required follows this. */
  prints: PrintedFields;
  /** The product's sizes, in the product's order. A plain string is a size without extra words. */
  sizes: readonly (string | SizeSpec)[];
  /** Only the limits to change; the rest are the defaults. */
  limits?: Partial<RosterLimits>;
}

export type LineField = "name" | "number" | "size" | "count";

export type ProblemCode =
  | "name-missing"
  | "number-missing"
  | "size-missing"
  | "number-not-digits"
  | "number-too-long"
  | "number-mixed-digits"
  | "number-duplicate"
  | "name-character"
  | "name-too-long"
  | "size-unknown"
  | "quantity-range"
  | "list-too-long";

/** A reference to another line, for messages such as "Same number as Bilal". */
export interface LineRef {
  index: number;
  id?: string;
  name: string;
}

/** One problem. `detail` holds the values a message needs; it never holds a sentence. */
export interface RosterProblem {
  code: ProblemCode;
  /** Position of the line in the list (0-based); -1 for a problem of the whole list. */
  index: number;
  /** The line's id, when it has one. */
  lineId?: string;
  /** The field the problem belongs to; "list" for the list itself. */
  field: LineField | "list";
  detail?: {
    /** number-duplicate: the shared value, and the other lines that have it. */
    value?: number;
    others?: LineRef[];
    /** name-character: the characters that cannot be printed, and whether one is a digit. */
    characters?: string[];
    hasDigit?: boolean;
    /** name-too-long: the length and the limit. */
    length?: number;
    max?: number;
    /** size-unknown: the size as typed. */
    size?: string;
    /** quantity-range: the count as given, and the range. */
    count?: number;
    min?: number;
    /** list-too-long: the number of lines. */
    lines?: number;
  };
}

/** A remark that is not a problem (08-team-list.md, 6.1 and 7.4). */
export interface RosterNote {
  code: "name-mixed-scripts" | "mixed-digit-systems";
  /** The line it belongs to; -1 for the whole list. */
  index: number;
  lineId?: string;
}

export interface SizeCount {
  size: string;
  pieces: number;
}

export interface RosterSummary {
  /** Lines in the list. */
  players: number;
  /** Garments: the sum of the counts. */
  pieces: number;
  /** Pieces per size of the product, in the product's order (sizes in no line are 0). */
  bySize: SizeCount[];
  /** Pieces with a size that is not one of the product's, grouped by the size as typed. */
  otherSizes: SizeCount[];
  /** Lines with no size, and their pieces. */
  linesWithoutSize: number;
  piecesWithoutSize: number;
  /** Lines with no problem, and the positions of the lines with at least one. */
  readyLines: number;
  linesToFix: number;
  indexesToFix: number[];
  /** Only when a minimum was given. */
  minimum: { required: number; missing: number; met: boolean } | null;
  /** No problem, at least one line, and the minimum met. */
  readyForProof: boolean;
}

export interface RosterAnalysis {
  problems: RosterProblem[];
  notes: RosterNote[];
  summary: RosterSummary;
}
