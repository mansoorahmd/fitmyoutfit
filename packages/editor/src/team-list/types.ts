/**
 * The team list's types: a line is the rules package's `RosterLine` with an id; what the host gives the editor and
 * gets back (08-team-list.md, section 12). Nothing here knows the store, React or Three.js.
 */
import type { PrintedFields, RosterAnalysis, RosterLimits, RosterLine } from "@fitmyoutfit/team-rules";

/** One line of the list: always has an id (made by the editor, unique, never reused, kept when moved or edited). */
export type EditorLine = RosterLine & { id: string };

/** One size of the product as the host gives it (12.3): the code, its label, its group and the words that mean it. */
export interface TeamListSize {
  /** The product's code and spelling ("2XL"). */
  code: string;
  /** What the buttons show; the code when left out. */
  label?: string;
  /** Youth and adult sizes are shown in two groups. */
  group?: "youth" | "adult";
  /** Other spellings (any case, with or without spaces). The usual ones for the usual codes are known already. */
  words?: readonly string[];
}

/** The product's noun for "21 jerseys" (the host's wording). */
export interface TeamListNoun {
  one: string;
  many: string;
}

/** The region's minimum, in pieces, and its name for the note ("Orders to the UK need at least 10 jerseys..."). */
export interface TeamListMinimum {
  pieces: number;
  region: string;
}

/** The list as it is saved (12.2): the lines in order, what the design prints, the product it was made for, a format version. */
export interface SavedTeamList {
  version: 1;
  productId: string;
  /** Which fields the design printed when the list was last changed. */
  prints: PrintedFields;
  lines: RosterLine[];
}

/** What the editor hands over with the list: the rules package's analysis (problems as codes, notes, the summary). Worked out, never saved. */
export type TeamListReport = RosterAnalysis;

/** What the host gives the editor and what it gets back (12.3). Everything is optional. */
export interface TeamListHost {
  /** The saved list to start from, or nothing. A list made for another product is not used. */
  initial?: SavedTeamList | null;
  /** The product's sizes. Default: YS to 3XL (the store's usual sizes). */
  sizes?: readonly TeamListSize[];
  /** The product's noun. Default: "shirt" and "shirts". */
  noun?: TeamListNoun;
  /** The region's minimum; nothing: none is shown. */
  minimum?: TeamListMinimum | null;
  /** The limits that are not the package's defaults (100 lines, 1 to 10 of one shirt, 18 characters in a name). */
  limits?: Partial<RosterLimits>;
  /** Opens the size chart (the host's own sheet). Without it the "Size chart" button is not shown. */
  openSizeChart?: (size: string | null) => void;
  /** Every change: the list and its report, after `debounceMs` without changes. */
  onChange?: (list: SavedTeamList, report: TeamListReport) => void;
  /** Default 1000 ms (11.1). */
  debounceMs?: number;
}

/** The sizes used when the host gives none: the store's (backend seed data): youth YS to YXL, adult XS to 3XL. */
export const DEFAULT_TEAM_SIZES: readonly TeamListSize[] = Object.freeze([
  { code: "YS", group: "youth" },
  { code: "YM", group: "youth" },
  { code: "YL", group: "youth" },
  { code: "YXL", group: "youth" },
  { code: "XS", group: "adult" },
  { code: "S", group: "adult" },
  { code: "M", group: "adult" },
  { code: "L", group: "adult" },
  { code: "XL", group: "adult" },
  { code: "2XL", group: "adult" },
  { code: "3XL", group: "adult" },
] satisfies TeamListSize[]);

export const DEFAULT_TEAM_NOUN: TeamListNoun = Object.freeze({ one: "shirt", many: "shirts" });
