/**
 * The player chip on the stage (08-team-list.md 7.2, 7.3): the chosen player's number and name, with Previous and Next
 * stepping through the team in list order. "Sample" before it while the list is empty. The middle opens the list at
 * that line (from another tool) or scrolls the list to it. Choosing is view state: nothing is written to the design.
 */
import { useMemo } from "react";
import { chipState } from "../team-list/chip.js";
import { fill } from "./content.js";
import { useEditor } from "./context.js";
import { EditorIcon } from "./icons.js";
import { useTeamList } from "./team-list-context.js";

export function PlayerChip({ inList }: { inList: boolean }) {
  const t = useTeamList();
  const api = useEditor();
  const c = api.wording.teamList.chip;
  // Capitals are the default for Latin names (decision 012); a name item set to "As typed" turns them off.
  const capitals = useMemo(() => !api.design.layers.some((l) => l.kind === "text" && l.role === "player-name" && l.letterCase === "as-typed"), [api.design.layers]);
  const state = chipState({ lines: t.lines, chosenId: t.chosenId, toFix: t.analysis.toFix, prints: t.prints, sample: api.design.samplePlayer, capitals });
  const sample = state.kind === "sample";
  const calledAt = (id: string | null): string => {
    if (id === null) return "";
    const at = t.lines.findIndex((l) => l.id === id);
    const line = t.lines[at];
    return line && line.name !== "" ? line.name : fill(c.unnamed, { i: at + 1 });
  };
  const prevName = calledAt(state.prevId);
  const nextName = calledAt(state.nextId);
  const own = state.line && state.line.name !== "" ? state.line.name : fill(c.unnamed, { i: state.index + 1 });
  const middleName = sample
    ? fill(c.showSample, { name: api.design.samplePlayer.name, number: api.design.samplePlayer.number })
    : fill(c.show, { name: own, number: state.number || c.noNumberName, size: state.line?.size || c.noSizeName });
  const shownName = state.spare ? c.noName : state.name !== "" ? state.name : state.line ? fill(c.unnamed, { i: state.index + 1 }) : "";
  const shownNumber = state.number !== "" ? state.number : state.line && t.prints.number ? c.noNumber : "";
  const open = () => {
    if (!sample && !inList) api.openTool("players", api.layout === "compact" ? "expanded" : "normal", { turn: false });
    if (t.view !== "list") t.setView("list");
    t.reveal();
  };
  const sampleOpen = () => {
    if (!inList) api.openTool("players", api.layout === "compact" ? "expanded" : "normal");
    t.setView("style");
  };
  return (
    <div className="fmo-chip" role="group" aria-label={c.group} data-state={sample ? "sample" : "player"} data-testid="player-chip">
      <button type="button" className="fmo-chip-step" aria-label={state.prevId === null ? c.previousNone : fill(c.previous, { name: prevName })} aria-disabled={state.prevId === null} onClick={() => state.prevId && t.step(-1)} data-testid="chip-prev">
        <EditorIcon name="chevronLeft" />
      </button>
      <button type="button" className="fmo-chip-main" aria-label={middleName} onClick={sample ? sampleOpen : open} data-testid="chip-main">
        {sample && <span className="fmo-chip-tag">{c.sample}</span>}
        {shownNumber !== "" && (
          <>
            <bdi className="fmo-chip-number" dir="ltr" data-missing={state.number === "" ? "true" : undefined}>{shownNumber}</bdi>
            {shownName !== "" && <span aria-hidden="true">·</span>}
          </>
        )}
        {shownName !== "" && <bdi className="fmo-chip-name" dir="auto" data-missing={state.spare || state.name === "" ? "true" : undefined}>{shownName}</bdi>}
        {state.count > 1 && <span className="fmo-chip-count" aria-label={fill(api.wording.teamList.countName, { count: state.count })}>{fill(api.wording.teamList.countBadge, { count: state.count })}</span>}
        {state.problem && (
          <span className="fmo-chip-problem" role="img" aria-label={c.problem} title={c.problem}>
            <EditorIcon name="alert" size={16} />
          </span>
        )}
      </button>
      <button type="button" className="fmo-chip-step" aria-label={state.nextId === null ? c.nextNone : fill(c.next, { name: nextName })} aria-disabled={state.nextId === null} onClick={() => state.nextId && t.step(1)} data-testid="chip-next">
        <EditorIcon name="chevronRight" />
      </button>
      <span className="fmo-sr-only" role="status" aria-live="polite" data-testid="chip-live">{t.stepNote}</span>
    </div>
  );
}

/** The whole-shirt toggle of the phone's list view (3.2): back from the close-up of the name and number. */
export function WholeShirtToggle({ pressed, onToggle }: { pressed: boolean; onToggle: () => void }) {
  const { wording } = useEditor();
  const c = wording.teamList.chip;
  const label = pressed ? c.closeUp : c.whole;
  return (
    <button type="button" className="fmo-round fmo-whole" aria-pressed={pressed} aria-label={label} title={label} onClick={onToggle} data-testid="whole-shirt">
      <EditorIcon name={pressed ? "closeUp" : "wholeShirt"} />
    </button>
  );
}
