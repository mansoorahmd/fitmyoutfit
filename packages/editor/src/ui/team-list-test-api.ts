/**
 * A `TeamListApi` for tests that render the list's components to markup without the shell: real analysis of the
 * given lines, functions that do nothing (or record their calls). Not part of the package's entry point.
 */
import { buildSizeTable } from "@fitmyoutfit/team-rules";
import { analyseList, type SeenMap } from "../team-list/checks.js";
import { DEFAULT_TEAM_NOUN, DEFAULT_TEAM_SIZES, type EditorLine } from "../team-list/types.js";
import type { TeamListApi } from "./team-list-context.js";

export function fakeTeamApi(lines: readonly EditorLine[] = [], overrides: Partial<TeamListApi> = {}, options: { prints?: { name: boolean; number: boolean }; seen?: SeenMap } = {}): TeamListApi {
  const prints = options.prints ?? { name: true, number: true };
  const noop = () => undefined;
  return {
    lines,
    analysis: analyseList(lines, { prints, sizes: DEFAULT_TEAM_SIZES }),
    prints,
    sizes: DEFAULT_TEAM_SIZES,
    sizeTable: buildSizeTable(DEFAULT_TEAM_SIZES),
    noun: DEFAULT_TEAM_NOUN,
    minimum: null,
    limits: { maxLines: 100, minCount: 1, maxCount: 10 },
    openSizeChart: null,
    chosenId: lines[0]?.id ?? null,
    choose: noop,
    step: noop,
    stepNote: "",
    reveal: noop,
    revealTick: 0,
    seen: options.seen ?? {},
    revealAll: false,
    memory: { get: () => 0, set: noop },
    keyboard: false,
    view: "list",
    setView: noop,
    consumeReveal: () => false,
    pasteText: "",
    setPasteText: noop,
    openPaste: noop,
    addPasted: noop,
    beginField: noop,
    typeField: noop,
    leaveField: noop,
    leaveLine: noop,
    endTyping: noop,
    add: () => null,
    remove: noop,
    move: noop,
    sort: noop,
    setCount: noop,
    setFlag: noop,
    convertDigits: noop,
    setSizeCount: noop,
    revealAllProblems: noop,
    setKeyboard: noop,
    nameShrunk: false,
    closeUpLayerId: null,
    ...overrides,
  };
}
