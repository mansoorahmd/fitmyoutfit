/**
 * The roster proof's snapshot: what the organizer signs, as one canonical JSON text and its
 * SHA-256 hash. The server makes the text when a proof is made and stores it with its hash; the
 * storefront or the editor can make the same text from the same list and get the same hash, which
 * is how "the list I saw is the list on record" is checked.
 *
 * The canonical text (format 1):
 * - one JSON object with the keys in this fixed order: `format`, `design_version_id`, `product_id`,
 *   `region_id`, `team_name`, `prints` (`name`, `number`), `lines`;
 * - each line, in list order, with the keys `name`, `number`, `size`, `count`, `no_name`,
 *   `no_number` (its id and position are not part of it: the order of the array is the position);
 * - every text goes through `cleanText` first (Unicode NFC, direction marks and zero-width spaces
 *   removed, white space runs made one space, trimmed), so the same name typed with a combining
 *   mark or a trailing space hashes the same; digits are kept as written (an Arabic-Indic seven
 *   stays an Arabic-Indic seven);
 * - `count` is a whole number, the flags are true or false (anything else is false), no white
 *   space between tokens, non-ASCII text written as is (not as \u escapes), UTF-8.
 */
import { sha256Hex } from "./sha256.js";
import { cleanText } from "./text.js";

export const SNAPSHOT_FORMAT = 1;

/** A line of the snapshot, in the API's names. */
export interface SnapshotLine {
  name: string;
  number: string;
  size: string;
  count: number;
  no_name: boolean;
  no_number: boolean;
}

/** What a proof freezes. Names are the API's (snake_case), as the server stores them. */
export interface ProofSnapshot {
  design_version_id: string;
  product_id: string;
  region_id: string;
  team_name: string;
  prints: { name: boolean; number: boolean };
  lines: readonly SnapshotLine[];
}

const text = (value: unknown): string => (typeof value === "string" ? cleanText(value) : "");

function countOf(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : 0;
}

/** The snapshot with every value in its canonical form (a plain object, keys in order). */
export function canonicalSnapshot(snapshot: ProofSnapshot): Record<string, unknown> {
  return {
    format: SNAPSHOT_FORMAT,
    design_version_id: text(snapshot.design_version_id),
    product_id: text(snapshot.product_id),
    region_id: text(snapshot.region_id),
    team_name: text(snapshot.team_name),
    prints: { name: snapshot.prints.name === true, number: snapshot.prints.number === true },
    lines: snapshot.lines.map((line) => ({
      name: text(line.name),
      number: text(line.number),
      size: text(line.size),
      count: countOf(line.count),
      no_name: line.no_name === true,
      no_number: line.no_number === true,
    })),
  };
}

/** The canonical JSON text of a snapshot: what is hashed and stored. */
export function canonicalSnapshotText(snapshot: ProofSnapshot): string {
  return JSON.stringify(canonicalSnapshot(snapshot));
}

/** The SHA-256 (64 lowercase hexadecimal characters) of the canonical text's UTF-8 bytes. */
export function hashSnapshotText(canonicalText: string): string {
  return sha256Hex(canonicalText);
}

/** The canonical text and its hash, together. */
export function hashSnapshot(snapshot: ProofSnapshot): { text: string; hash: string } {
  const canonical = canonicalSnapshotText(snapshot);
  return { text: canonical, hash: hashSnapshotText(canonical) };
}
