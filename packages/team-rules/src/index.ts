/**
 * @fitmyoutfit/team-rules: the roster rules of a team order, as plain TypeScript.
 * No runtime dependencies; runs in Node and in a browser. See README.md.
 */
export * from "./types.js";
export { DEFAULT_LIMITS, resolveLimits } from "./limits.js";
export {
  ARABIC_INDIC_DIGITS,
  DEFAULT_JERSEY_NUMBER_RULES,
  EXTENDED_ARABIC_INDIC_DIGITS,
  WESTERN_DIGITS,
  type DigitSystem,
  type JerseyNumberRules,
} from "./jersey-number-rules.js";
export {
  checkJerseyNumber,
  checkJerseyNumberRules,
  findDuplicateJerseyNumbers,
  isSameJerseyNumber,
  isValidJerseyNumber,
  jerseyNumberMaxLength,
  jerseyNumberValue,
  type DuplicateJerseyNumbers,
  type DuplicateReport,
  type InvalidJerseyNumberEntry,
  type JerseyNumberCheck,
  type JerseyNumberFailure,
} from "./jersey-number.js";
export { cleanText, disallowedNameCharacters, mixesScripts, nameLength, type NameCharacterReport } from "./text.js";
export { buildSizeTable, looksLikeSize, normalizeSize, readSize, sizeKey, type SizeTable } from "./sizes.js";
export { analyzeRoster, checkRoster, normalizeLines, piecesOf, summarizeRoster } from "./check.js";
export {
  readPastedList,
  toRosterLine,
  type ColumnName,
  type NotAdded,
  type ReadLine,
  type ReadNote,
  type ReadOptions,
  type ReadResult,
} from "./read.js";
export { parseRosterInput, type RosterInputError, type RosterInputResult } from "./input.js";
