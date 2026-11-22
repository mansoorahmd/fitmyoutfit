/**
 * A saved list coming back (11.1, 12.3 "the saved list, or nothing"): its shape is checked by the rules package, its
 * content is not (a list with problems is still a list: the checks run on it as on any other).
 */
import { parseRosterInput } from "@fitmyoutfit/team-rules";
import type { RosterLimits } from "@fitmyoutfit/team-rules";
import { withIds } from "./lines.js";
import type { EditorLine } from "./types.js";

/** The lines of a saved list for this product, or an empty list when there is none or it is not usable. */
export function readSavedList(saved: unknown, options: { productId: string; limits?: Partial<RosterLimits> }): EditorLine[] {
  if (!saved || typeof saved !== "object") return [];
  const record = saved as { version?: unknown; productId?: unknown; lines?: unknown };
  if (record.version !== 1 || record.productId !== options.productId) return [];
  const parsed = parseRosterInput(record.lines, options.limits);
  return parsed.ok ? withIds(parsed.lines) : [];
}
