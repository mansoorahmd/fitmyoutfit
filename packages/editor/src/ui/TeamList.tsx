/**
 * The team list: the Players tab (docs/design/08-team-list.md, decision D-TL1). The summary bar, the toolbar, the
 * lines, "Add a player", the empty state, the by-size view and the keyboard rules of 4.3 for typing twenty players
 * without leaving the keyboard. The lines are the editor's own state (kept in its one undo history by the shell);
 * the checks are the rules package's, worded from the codes (`team-list-words.ts`).
 *
 * Pasting a list is `PasteView`; the player chip is on the stage; the Done panel has its own team section.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { readSize } from "@fitmyoutfit/team-rules";
import { nextToFix, shownProblems } from "../team-list/checks.js";
import { fieldsOf, focusAfterRemoval, keyAction, type Field, type KeyAction } from "../team-list/keys.js";
import type { SortBy } from "../team-list/lines.js";
import type { EditorLine } from "../team-list/types.js";
import { fill } from "./content.js";
import { useEditor } from "./context.js";
import { EditorIcon } from "./icons.js";
import { LineRow, SizeListbox, SizeStrip, listboxSizes, type Shown } from "./TeamListLine.js";
import { useTeamList } from "./team-list-context.js";
import { Alert, SwitchRow } from "./parts.js";
import { noteText, piecesText, playerCalled, problemText, saysInField } from "./team-list-words.js";

const NO_SHOWN: readonly Shown[] = [];

type MenuState = { kind: "line"; id: string; stepper?: boolean } | { kind: "sort" } | null;

export function TeamListView({ initialDetailsOpen }: { initialDetailsOpen?: boolean } = {}) {
  const t = useTeamList();
  const api = useEditor();
  const { wording } = api;
  const w = wording.teamList;
  const wide = api.layout !== "compact";
  const { lines, analysis, prints } = t;
  const showNumber = prints.number;
  const bySize = !prints.name && !prints.number;
  const root = useRef<HTMLDivElement>(null);
  const rows = useRef<HTMLDivElement>(null);
  // Open by default on a desktop when the panel is at least 640 px tall, else a 48 px bar (8.1).
  const [detailsOpen, setDetailsOpen] = useState(() => initialDetailsOpen ?? (api.layout === "wide" && typeof window !== "undefined" && window.innerHeight - 64 >= 640));
  const [onlyFix, setOnlyFix] = useState(false);
  const [pinned, setPinned] = useState<readonly string[]>([]);
  const [menu, setMenu] = useState<MenuState>(null);
  const [sizeFocus, setSizeFocus] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const [namesForBags, setNamesForBags] = useState(false);
  const pending = useRef<{ id: string; field: Field | "first" | "line" } | null>(null);
  const valueAtFocus = useRef<{ id: string; field: Field; value: string } | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const menuButton = useRef<HTMLElement | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const listboxId = useId();
  const locked = t.locked;
  const atLimit = lines.length >= t.limits.maxLines;
  const chosenIndex = t.chosenId ? lines.findIndex((l) => l.id === t.chosenId) : -1;

  const sizeLine = sizeFocus ? lines.find((l) => l.id === sizeFocus) : undefined;
  const { sizes: sizeList, noun: productNoun } = t;
  const wordsContext = useMemo(() => ({ wording, lines, sizes: sizeList, noun: productNoun }), [wording, lines, sizeList, productNoun]);

  /**
   * The problems and notes of every line, worded. Worked out when the lines, their checks, what has been left or the
   * wording change, NOT when another line is chosen: choosing is the hot path (TL4, 100 ms), and 40 lines of sentences
   * were being rebuilt for it. Only the chosen line's "Prints smaller to fit" note depends on the choice (`shownFor`).
   */
  const shownByLine = useMemo(() => {
    const map = new Map<string, Shown[]>();
    for (const line of lines) {
      const problems = shownProblems(analysis, line, t.seen, t.revealAll);
      const out: Shown[] = problems.map((p) => {
        const text = problemText(p, line, wordsContext);
        return { key: `${p.code}:${text}`, code: p.code, field: p.field, text, inField: saysInField(p), kind: "error" as const };
      });
      const seen = t.seen[line.id];
      for (const n of analysis.notesByLine.get(line.id) ?? []) {
        if (n.code === "name-mixed-scripts" && !(seen?.name || t.revealAll)) continue;
        out.push({ key: `${n.code}`, code: n.code, field: "name", text: noteText(n, wording), inField: false, kind: "note" });
      }
      map.set(line.id, out);
    }
    return map;
  }, [lines, analysis, t.seen, t.revealAll, wordsContext, wording]);
  const smallerNote = useMemo<Shown>(() => ({ key: "smaller", code: "smaller", field: "name", text: w.notes.smaller, inField: false, kind: "note" }), [w.notes.smaller]);
  const shownFor = (line: EditorLine): readonly Shown[] => {
    const base = shownByLine.get(line.id) ?? NO_SHOWN;
    if (line.id === t.chosenId && t.nameShrunk && !line.noName && prints.name && !base.some((s) => s.code === "name-too-long")) return [...base, smallerNote];
    return base;
  };

  // ---- Focus requests: after the render that makes the field exist.
  useLayoutEffect(() => {
    const p = pending.current;
    if (!p) return;
    const li = rows.current?.querySelector<HTMLElement>(`li[data-id="${CSS.escape(p.id)}"]`);
    if (!li) return;
    pending.current = null;
    if (p.field === "line") {
      li.focus({ preventScroll: true });
    } else {
      const line = lines.find((l) => l.id === p.id);
      const field = p.field === "first" ? (line ? fieldsOf(line, showNumber)[0] : "name") : p.field;
      const input = li.querySelector<HTMLElement>(`[data-field="${field}"]`) ?? li.querySelector<HTMLElement>("input");
      input?.focus({ preventScroll: true });
      if (input instanceof HTMLInputElement) {
        const end = input.value.length;
        input.setSelectionRange?.(end, end);
      }
    }
    li.scrollIntoView?.({ block: "nearest", behavior: "auto" });
  });

  // The chip's step and its middle (7.2) bring the chosen line into view; a tap on a line never moves the list.
  const firstTick = useRef(t.revealTick);
  useEffect(() => {
    if (t.revealTick === firstTick.current) return;
    firstTick.current = t.revealTick;
    const li = rows.current?.querySelector<HTMLElement>('li[data-chosen="true"]');
    li?.scrollIntoView?.({ block: "nearest", behavior: api.reducedMotion ? "auto" : "smooth" });
  }, [t.revealTick, t.chosenId, api.reducedMotion]);

  // Opened by the Done panel's "Show" (11.2): the chosen line is scrolled into view, as "Next to fix" does.
  useLayoutEffect(() => {
    if (!t.consumeReveal()) return;
    const li = rows.current?.querySelector<HTMLElement>('li[data-chosen="true"]');
    if (li && rows.current) rows.current.scrollTop = Math.max(0, li.offsetTop - rows.current.clientHeight / 3);
    // Once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The scroll position of the visit is kept for the next time the list opens (3.5).
  useLayoutEffect(() => {
    const el = rows.current;
    if (el && t.memory.get() > 0) el.scrollTop = t.memory.get();
    return () => {
      if (el) t.memory.set(el.scrollTop);
    };
    // Once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The keyboard probably open: a field of the list has focus (focus in and out is settled over a moment, so moving
  // from one field to the next never shows the panel growing and shrinking).
  const keyboardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFocusIn = (event: React.FocusEvent<HTMLElement>) => {
    // Only a text field brings up the keyboard (a button or a line taking focus does not).
    if (!(event.target instanceof HTMLInputElement)) return;
    if (keyboardTimer.current) clearTimeout(keyboardTimer.current);
    t.setKeyboard(true);
  };
  const onFocusOut = () => {
    if (keyboardTimer.current) clearTimeout(keyboardTimer.current);
    keyboardTimer.current = setTimeout(() => {
      if (!root.current?.contains(document.activeElement) || !(document.activeElement as HTMLElement | null)?.matches?.("input, textarea")) {
        t.setKeyboard(false);
        if (!root.current?.contains(document.activeElement)) t.endTyping();
      }
    }, 120);
  };
  useEffect(
    () => () => {
      if (keyboardTimer.current) clearTimeout(keyboardTimer.current);
      t.setKeyboard(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const addAndFocus = useCallback(() => {
    const id = t.add();
    if (id) pending.current = { id, field: "first" };
    else api.announce(fill(w.limitReached, { max: t.limits.maxLines }));
    return id;
  }, [t, api, w.limitReached]);

  const goToFix = useCallback(
    (direction: 1 | -1 = 1) => {
      t.revealAllProblems();
      const id = nextToFix(lines, analysis.toFix, t.chosenId, direction);
      if (!id) return;
      t.choose(id);
      const li = rows.current?.querySelector<HTMLElement>(`li[data-id="${CSS.escape(id)}"]`);
      const problem = analysis.byLine.get(id)?.[0];
      const field: Field = problem && (problem.field === "name" || problem.field === "number" || problem.field === "size") ? problem.field : "size";
      pending.current = { id, field: api.layout === "compact" && !t.keyboard ? "line" : field };
      if (li && rows.current) rows.current.scrollTop = Math.max(0, li.offsetTop - rows.current.clientHeight / 3);
      if (onlyFix) setPinned((p) => (p.includes(id) ? p : [...p, id]));
    },
    [t, lines, analysis, api.layout, onlyFix],
  );

  // F8 and Shift+F8 (6.4): next and previous line to fix, while the list is open.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "F8" || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      goToFix(e.shiftKey ? -1 : 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goToFix]);

  // The count line, said politely after actions, never on every key press (8.1).
  const [spoken, setSpoken] = useState("");
  const players = analysis.report.summary.players;
  const countText = lines.length === 0 ? "" : players === 0 ? fill(w.players, { n: 0 }) : `${players === 1 ? w.onePlayer : fill(w.players, { n: players })} · ${analysis.toFix.length > 0 ? fill(w.toFix, { k: analysis.toFix.length }) : w.allReady}`;
  useEffect(() => {
    const timer = setTimeout(() => setSpoken(countText), 900);
    return () => clearTimeout(timer);
  }, [countText]);

  // ---- The one place the keys of 4.3 are handled: the decision is `keyAction` (team-list/keys.ts, tested); this carries it out.
  const [listing, setListing] = useState(false);
  const focusNow = (id: string, field: Field): boolean => {
    const el = rows.current?.querySelector<HTMLElement>(`li[data-id="${CSS.escape(id)}"] [data-field="${field}"]`);
    if (!el) return false;
    el.focus({ preventScroll: true });
    el.scrollIntoView?.({ block: "nearest" });
    return true;
  };
  const carryOut = (action: KeyAction | null, id: string, field: Field, value: string): void => {
    if (!action) return;
    // A signed list can be walked, not changed (11.3).
    if (locked && action.type !== "go" && action.type !== "go-first" && action.type !== "go-same") return;
    switch (action.type) {
      case "go":
        if (!focusNow(action.id, action.field)) pending.current = { id: action.id, field: action.field };
        return;
      case "go-first":
        pending.current = { id: action.id, field: "first" };
        t.choose(action.id);
        setActive(-1);
        return;
      case "go-same": {
        const target = lines.find((l) => l.id === action.id);
        const own = target ? fieldsOf(target, showNumber) : [];
        pending.current = { id: action.id, field: own.includes(action.field) ? action.field : (own.at(-1) ?? "size") };
        t.choose(action.id);
        setActive(-1);
        return;
      }
      case "add":
        addAndFocus();
        return;
      case "limit":
        api.announce(fill(w.limitReached, { max: t.limits.maxLines }));
        // Enter in the last allowed line ends typing (G4): the keys that follow are not appended to the Size field.
        (document.activeElement as HTMLElement | null)?.blur();
        return;
      case "remove-empty":
        t.remove(id, { silent: true });
        api.announce(w.skipEmpty);
        (document.activeElement as HTMLElement | null)?.blur();
        if (wide) addButton.current?.focus();
        return;
      case "remove-empty-back":
        t.remove(id, { silent: true });
        pending.current = { id: action.id, field: action.field };
        setActive(-1);
        return;
      case "open-list":
        setListing(true);
        setActive(-1);
        return;
      case "close-list":
        setListing(false);
        return;
      case "move-active":
        setActive(action.to);
        return;
      case "move-line":
        t.move(id, action.delta);
        pending.current = { id, field };
        setActive(-1);
        return;
      case "restore":
        t.typeField(id, field, action.value);
        return;
      case "choose-active": {
        const line = lines.find((l) => l.id === id);
        const choice = listboxSizes(t.sizes, line?.size ?? value)[active];
        if (choice) t.typeField(id, "size", choice.code);
        setListing(false);
        carryOut(action.then, id, field, value);
        return;
      }
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const id = target.dataset.id;
    const field = target.dataset.field as Field | undefined;
    if (!id || !field || !(target instanceof HTMLInputElement)) return;
    const line = lines.find((l) => l.id === id);
    const was = valueAtFocus.current;
    const action = keyAction(
      { key: event.key, shift: event.shiftKey, alt: event.altKey },
      {
        field,
        lineId: id,
        visible: visibleLines,
        showNumber,
        wide,
        listOpen: sizeFocus === id && listing,
        active,
        listLength: listboxSizes(t.sizes, line?.size ?? "").length,
        atLimit,
        valueAtFocus: was && was.id === id && was.field === field ? was.value : null,
        value: target.value,
      },
    );
    if (!action) return;
    // Escape closes the size list and nothing more (the editor's own Escape must not also run).
    if (event.key === "Escape" && action.type === "close-list") event.stopPropagation();
    event.preventDefault();
    carryOut(action, id, field, target.value);
  };

  const onChange = (event: FormEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (!(target instanceof HTMLInputElement)) return;
    const id = target.dataset.id;
    const field = target.dataset.field as Field | undefined;
    if (!id || !field) return;
    t.typeField(id, field, target.value);
    if (field === "size") {
      setListing(true);
      setActive(-1);
    }
  };

  const onFocus = (event: React.FocusEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const id = target.dataset.id ?? target.closest<HTMLElement>("li[data-id]")?.dataset.id;
    if (!id) return;
    t.choose(id);
    if (target instanceof HTMLInputElement) {
      const field = target.dataset.field as Field | undefined;
      if (!field) return;
      valueAtFocus.current = { id, field, value: target.value };
      t.beginField(id, field);
      if (field === "size") {
        setSizeFocus(id);
        setListing(false);
        setActive(-1);
      } else setSizeFocus(null);
      // The line being typed stays in view above the keyboard.
      target.closest("li")?.scrollIntoView?.({ block: "nearest" });
    }
  };

  const onBlur = (event: React.FocusEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const id = target.dataset.id;
    const field = target.dataset.field as Field | undefined;
    if (!(target instanceof HTMLInputElement) || !id || !field) return;
    t.leaveField(id, field);
    if (field === "size") {
      setListing(false);
      // Leaving the size field for another control keeps nothing open; moving on to the next line's field resets it.
      if (!(event.relatedTarget as HTMLElement | null)?.closest?.(".fmo-tl-strip")) setSizeFocus((s) => (s === id ? null : s));
    }
    const next = event.relatedTarget as HTMLElement | null;
    if (!next || next.closest<HTMLElement>("li[data-id]")?.dataset.id !== id) t.leaveLine(id);
  };

  // Pasting text that holds a line break or a tab into a field opens the paste view with it (5.1); a single line pastes as usual.
  const onPasteInto = (event: React.ClipboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (!(target instanceof HTMLInputElement) || !target.dataset.field) return;
    const pasted = event.clipboardData.getData("text");
    if (!/[\r\n\t\u2028\u2029]/u.test(pasted.replace(/[\r\n]+$/u, ""))) return;
    event.preventDefault();
    if (atLimit) {
      api.announce(fill(w.limitReached, { max: t.limits.maxLines }));
      return;
    }
    t.openPaste(pasted);
  };

  const onClick = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const opener = target.closest<HTMLElement>("[data-open-menu]");
    const id = target.closest<HTMLElement>("li[data-id]")?.dataset.id;
    if (!id) return;
    if (opener) {
      menuButton.current = opener;
      setAnchor(opener);
      t.choose(id);
      setMenu((m) => (m && m.kind === "line" && m.id === id ? null : { kind: "line", id }));
      return;
    }
    if (!(target instanceof HTMLInputElement)) t.choose(id);
  };

  const closeMenu = useCallback(() => {
    setMenu(null);
    menuButton.current?.focus({ preventScroll: true });
  }, []);

  // ---- What is listed.
  const toFixIds = analysis.toFix;
  const visibleLines = onlyFix ? lines.filter((l) => pinned.includes(l.id) || toFixIds.includes(l.id)) : lines;
  const shownLines = bySize && !namesForBags ? [] : visibleLines;

  const summary = analysis.report.summary;
  const typingShort = api.layout === "compact" && t.keyboard;
  // The phone's normal height (3.2) is the header, the summary bar and the chosen line: the toolbar waits for "Show all".
  const collapsed = api.layout === "compact" && api.detent !== "expanded" && !typingShort;
  // In a small panel the chosen line is kept in view. When the keyboard opens, the line sits at the foot of the rows, directly
  // above the keyboard, the lines typed before it above it, like a chat (3.3); after that, moving between lines only scrolls
  // when the line is not in view (a tap on a line never moves the list).
  const chosenForView = t.chosenId;
  const sizeStripOpen = sizeFocus !== null;
  const wasTyping = useRef(false);
  useEffect(() => {
    const opened = typingShort && !wasTyping.current;
    wasTyping.current = typingShort;
    if (!collapsed && !typingShort) return;
    const place = (block: ScrollLogicalPosition) => {
      const li = rows.current?.querySelector<HTMLElement>('li[data-chosen="true"]');
      const box = rows.current?.getBoundingClientRect();
      if (!li || !box) return;
      const r = li.getBoundingClientRect();
      if (block === "nearest" && r.top >= box.top && r.bottom <= box.bottom) return;
      li.scrollIntoView?.({ block });
    };
    place(opened ? "end" : "nearest");
    if (!opened && !sizeStripOpen) return;
    // Again once the panel has settled at its new height.
    const timer = setTimeout(() => place(opened ? "end" : "nearest"), 300);
    return () => clearTimeout(timer);
  }, [chosenForView, collapsed, typingShort, sizeStripOpen]);

  const minimumNote = t.minimum && summary.minimum && !summary.minimum.met && lines.length > 0 ? fill(w.minimum, { region: t.minimum.region, minimum: t.minimum.pieces, noun: t.minimum.pieces === 1 ? t.noun.one : t.noun.many, pieces: summary.pieces, missing: summary.minimum.missing }) : null;
  const countLine = lines.length === 0 ? "" : countText;
  const shortLine = lines.length === 0 ? "" : analysis.toFix.length > 0 ? fill(w.shortBar, { i: Math.max(1, chosenIndex + 1), n: lines.length, k: analysis.toFix.length }) : fill(w.shortBarReady, { i: Math.max(1, chosenIndex + 1), n: lines.length });
  const mixedDigits = analysis.listNotes.some((n) => n.code === "mixed-digit-systems");
  const hasHiddenNumbers = !prints.number && lines.some((l) => l.number !== "");

  const startOnlyFix = (on: boolean) => {
    setOnlyFix(on);
    setPinned(on ? [...analysis.toFix] : []);
  };

  const menuLine = menu?.kind === "line" ? lines.find((l) => l.id === menu.id) : undefined;
  const menuIndex = menuLine ? lines.findIndex((l) => l.id === menuLine.id) : -1;

  const empty = lines.length === 0;
  // A short desktop panel (the summary closed) keeps Sort and Style on the summary bar's row, so more lines show (3.4).
  const inBar = api.layout === "wide" && !detailsOpen;
  const sortButton = locked ? null : (
    <button type="button" className="fmo-btn fmo-btn-text" aria-haspopup="menu" aria-expanded={menu?.kind === "sort"} onClick={(e) => { menuButton.current = e.currentTarget; setAnchor(e.currentTarget); setMenu((m) => (m?.kind === "sort" ? null : { kind: "sort" })); }} data-testid="tl-sort">
      {w.sort}
      <EditorIcon name="chevronDown" size={16} />
    </button>
  );
  const pasteButton = locked ? null : (
    <button type="button" className="fmo-btn fmo-btn-text" aria-disabled={atLimit} onClick={() => (atLimit ? api.announce(fill(w.limitReached, { max: t.limits.maxLines })) : t.openPaste())} data-testid="tl-paste">
      {w.paste.button}
    </button>
  );
  const styleButton = (
    <button type="button" className="fmo-btn fmo-btn-text fmo-tl-style" onClick={() => t.setView("style")} data-testid="tl-style">
      {w.style} ›
    </button>
  );
  // Under the summary bar: the details, the minimum, Sort and Style, notes. On a desktop they sit between the bar and the lines; on a phone
  // they scroll with the lines (the bar alone is stuck at the top), so the lines get the room (3.2).
  const above = (
    <>
      {!empty && detailsOpen && !typingShort && (
        <div className="fmo-tl-details" data-testid="tl-summary-details">
          {summary.pieces !== summary.players && (
            <p className="fmo-tl-detail">
              {piecesText(wording, summary.pieces, t.noun)}
              {" "}
              {(() => {
                const multi = lines.filter((l) => l.count > 1);
                return multi.length === 1 ? fill(w.piecesWith, { name: playerCalled(wording, multi[0], lines.indexOf(multi[0]!)), count: multi[0]!.count }) : "";
              })()}
            </p>
          )}
          <p className="fmo-tl-detail" data-testid="tl-sizes">
            <span className="fmo-tl-strong">{w.sizes}</span>{" "}
            {summary.bySize
              .filter((s) => wide || s.pieces > 0)
              .map((s) => `${s.size} ${s.pieces}`)
              .concat(summary.otherSizes.map((s) => `${s.size} ${s.pieces}`))
              .join(" · ")}
            {summary.linesWithoutSize > 0 && ` · ${fill(w.noSizeCount, { n: summary.piecesWithoutSize })}`}
          </p>
          <p className="fmo-tl-detail" data-testid="tl-ready">
            {fill(w.readyCount, { r: summary.readyLines })} · {fill(w.toFixCount, { k: summary.linesToFix })}
          </p>
          <SwitchRow label={w.onlyToFix} checked={onlyFix} onChange={startOnlyFix} testId="tl-only-fix" />
          {mixedDigits && (
            <div className="fmo-tl-detail">
              <p>{w.notes["mixed-digit-systems"]}</p>
              <div className="fmo-row">
                <button type="button" className="fmo-btn fmo-btn-text" onClick={() => t.convertDigits("western")}>{w.digitsTo.western}</button>
                <button type="button" className="fmo-btn fmo-btn-text" onClick={() => t.convertDigits("arabic-indic")}>{w.digitsTo["arabic-indic"]}</button>
              </div>
            </div>
          )}
        </div>
      )}
      {minimumNote && !typingShort && (
        <p className="fmo-tl-minimum" data-testid="tl-minimum">
          <EditorIcon name="info" size={16} />
          <span>{minimumNote}</span>
        </p>
      )}
      {!empty && !typingShort && !collapsed && !inBar && (
        <div className="fmo-tl-toolbar">
          <span className="fmo-tl-toolbar-start">
            {pasteButton}
            {sortButton}
          </span>
          {styleButton}
        </div>
      )}
      {hasHiddenNumbers && !typingShort && !collapsed && (
        <Alert kind="info" testId="tl-numbers-off">
          <p>{w.numbersOff}</p>
        </Alert>
      )}
      {onlyFix && !typingShort && (
        <p className="fmo-tl-detail fmo-tl-showing" data-testid="tl-showing">
          {fill(w.showing, { k: visibleLines.length, n: lines.length })} ·{" "}
          <button type="button" className="fmo-btn fmo-btn-text" onClick={() => startOnlyFix(false)}>{w.showAll}</button>
        </p>
      )}
    </>
  );
  return (
    <div className="fmo-tl" ref={root} data-keep-typing data-testid="team-list" data-keyboard={typingShort ? "true" : undefined} data-locked={locked ? "true" : undefined} onFocus={onFocusIn} onBlur={onFocusOut}>
      <div className="sr-only fmo-sr-only" role="status" aria-live="polite" data-testid="tl-live">{spoken}</div>
      {locked && (
        <div className="fmo-tl-locked" data-testid="tl-locked">
          <EditorIcon name="lock" size={16} />
          <p>{fill(w.locked.note, { date: locked.signedOn })}</p>
          {locked.onChangeList && (
            <button type="button" className="fmo-btn fmo-btn-text" onClick={locked.onChangeList} data-testid="tl-change-list">
              {w.locked.change}
            </button>
          )}
        </div>
      )}
      {!empty && (
        <div className="fmo-tl-bar" data-testid="tl-summary-bar">
          <button type="button" className="fmo-tl-count" aria-expanded={detailsOpen} aria-label={detailsOpen ? w.summaryClose : w.summaryOpen} onClick={() => setDetailsOpen((o) => !o)} data-testid="tl-summary-toggle">
            <EditorIcon name={detailsOpen ? "chevronUp" : "chevronDown"} size={20} />
            <span data-testid="tl-count-line">
              {typingShort ? shortLine : countLine}
              {!typingShort && players > 0 && analysis.toFix.length === 0 && <EditorIcon name="check" size={16} className="fmo-tl-ok" />}
            </span>
          </button>
          {analysis.toFix.length > 0 && (
            <button type="button" className="fmo-btn fmo-btn-text fmo-tl-next" aria-label={fill(w.nextToFixName, { k: analysis.toFix.length })} onClick={() => goToFix(1)} data-testid="tl-next-to-fix">
              {w.nextToFix} ›
            </button>
          )}
          {inBar && !typingShort && (
            <>
              {pasteButton}
              {sortButton}
              {styleButton}
            </>
          )}
          {!locked && <button type="button" className="fmo-icon-btn fmo-tl-plus" aria-label={w.addPlayer} aria-disabled={atLimit} onClick={() => !atLimit && addAndFocus()} data-testid="tl-add-top">
            <EditorIcon name="plus" />
          </button>}
        </div>
      )}
      {wide && above}
      {wide && !empty && shownLines.length > 0 && (
        <div className="fmo-tl-heading" aria-hidden="true">
          <span className="fmo-tl-index">#</span>
          <span>{prints.name ? w.heading.name : w.heading.nameNotPrinted}</span>
          {showNumber && <span className="fmo-tl-h-number">{w.heading.number}</span>}
          <span className="fmo-tl-h-size">{w.heading.size}</span>
        </div>
      )}
      <div className="fmo-tl-rows" ref={rows} data-testid="tl-rows">
        {!wide && <div className="fmo-tl-above">{above}</div>}
        {empty ? (
          <div className="fmo-tl-empty" data-testid="tl-empty">
            <h3 className="fmo-section-title">{w.empty.title}</h3>
            <p className="fmo-muted">{w.empty.body}</p>
            {!locked && (
              <>
                <button type="button" className="fmo-btn fmo-btn-block fmo-btn-ink" onClick={() => addAndFocus()} data-testid="tl-empty-add">
                  <EditorIcon name="plus" size={20} />
                  {w.empty.add}
                </button>
                <button type="button" className="fmo-btn fmo-btn-block" onClick={() => t.openPaste()} data-testid="tl-empty-paste">
                  {w.paste.button}
                </button>
              </>
            )}
            <button type="button" className="fmo-btn fmo-btn-text" onClick={() => t.setView("style")} data-testid="tl-style-empty">
              {w.styleLong} ›
            </button>
          </div>
        ) : bySize && !namesForBags ? (
          <BySizeList onNames={() => setNamesForBags(true)} />
        ) : (
          <>
            <ol className="fmo-tl-list" aria-label={fill(w.listName, { n: summary.players })} onKeyDown={onKeyDown} onInput={onChange} onChange={onChange} onFocus={onFocus} onBlur={onBlur} onClick={onClick} onPaste={onPasteInto} data-testid="tl-list">
              {shownLines.map((line) => {
                const index = lines.indexOf(line);
                return (
                  <LineRow
                    key={line.id}
                    line={line}
                    index={index}
                    total={lines.length}
                    wide={wide}
                    chosen={line.id === t.chosenId}
                    showNumber={showNumber}
                    nameLabel={prints.name ? "name" : "nameNotPrinted"}
                    hasNameFlag={prints.name}
                    hasNumberFlag={prints.number}
                    shown={shownFor(line)}
                    menuOpen={menu?.kind === "line" && menu.id === line.id}
                    wording={wording}
                    readOnly={Boolean(locked)}
                    listOpen={wide && sizeFocus === line.id && listing}
                  />
                );
              })}
            </ol>
            {wide && sizeLine && listing && shownLines.some((l) => l.id === sizeLine.id) && (
              <ListboxAnchor rows={rows} lineId={sizeLine.id}>
                <SizeListbox id={listboxId} sizes={listboxSizes(t.sizes, sizeLine.size)} typed="" active={active} wording={wording} onPick={(code) => { t.typeField(sizeLine.id, "size", code); setListing(false); }} />
              </ListboxAnchor>
            )}
            {atLimit && (
              <p className="fmo-tl-detail" data-testid="tl-limit">{fill(w.limitReached, { max: t.limits.maxLines })}</p>
            )}
            {!onlyFix && !locked && (
              <button type="button" className="fmo-tl-add" ref={addButton} aria-disabled={atLimit} onClick={() => !atLimit && addAndFocus()} data-testid="tl-add">
                <EditorIcon name="plus" size={20} />
                {w.addPlayer}
              </button>
            )}
            {bySize && (
              <div className="fmo-tl-detail">
                <SwitchRow label={w.bySize.addNames} checked={namesForBags} onChange={setNamesForBags} testId="tl-bag-names" />
              </div>
            )}
          </>
        )}
      </div>
      {typingShort && sizeFocus && !wide && (
        <SizeStrip
          sizes={t.sizes}
          table={t.sizeTable}
          current={sizeLine?.size ?? ""}
          wording={wording}
          onChart={t.openSizeChart ? () => t.openSizeChart?.(sizeLine ? readSize(sizeLine.size, t.sizeTable) : null) : null}
          onPick={(code) => {
            if (!sizeLine) return;
            t.typeField(sizeLine.id, "size", code);
            const at = visibleLines.findIndex((l) => l.id === sizeLine.id);
            const next = visibleLines[at + 1];
            if (next) {
              pending.current = { id: next.id, field: "first" };
              t.choose(next.id);
              setActive(-1);
            } else if (!atLimit) addAndFocus();
          }}
        />
      )}
      {menu && menu.kind === "sort" && (
        <MenuView
          anchor={anchor}
          align="start"
          label={w.sort}
          onClose={closeMenu}
          items={(["number", "name", "size", "entered"] as SortBy[]).map((by) => ({
            id: by,
            label: w.sortBy[by],
            onSelect: () => {
              t.sort(by);
              api.announce(w.sortedBy[by]);
            },
          }))}
        />
      )}
      {menu && menu.kind === "line" && menuLine && (
        <MenuView
          anchor={anchor}
          sheet={api.layout !== "wide"}
          label={fill(w.more, { name: menuLine.name || fill(w.unnamedPlayer, { i: menuIndex + 1 }) })}
          onClose={closeMenu}
          stepper={menu.stepper ? { count: menuLine.count, min: t.limits.minCount, max: t.limits.maxCount, onChange: (n) => t.setCount(menuLine.id, n), label: w.countLabel, less: w.countLess, more: w.countMore, done: w.done } : undefined}
          items={[
            { id: "up", label: w.moveUp, disabled: menuIndex <= 0, onSelect: () => t.move(menuLine.id, -1) },
            { id: "down", label: w.moveDown, disabled: menuIndex >= lines.length - 1, onSelect: () => t.move(menuLine.id, 1) },
            { id: "count", label: fill(w.countItem, { count: menuLine.count }), keepOpen: true, onSelect: () => setMenu({ kind: "line", id: menuLine.id, stepper: true }) },
            ...(prints.name ? [{ id: "noname", label: w.noNameItem, checked: menuLine.noName, onSelect: () => t.setFlag(menuLine.id, "noName", !menuLine.noName) }] : []),
            ...(prints.number ? [{ id: "nonumber", label: w.noNumberItem, checked: menuLine.noNumber, onSelect: () => t.setFlag(menuLine.id, "noNumber", !menuLine.noNumber) }] : []),
            { id: "remove", label: w.remove, danger: true, onSelect: () => {
              // Focus goes to the SAME field of the line that took its place (4.7, 13.7), never to the top of the page.
              const was = valueAtFocus.current;
              const next = focusAfterRemoval({ lines, removedId: menuLine.id, lastField: was && was.id === menuLine.id ? was.field : null, showNumber, phoneWithoutKeyboard: api.layout === "compact" && !t.keyboard });
              t.remove(menuLine.id);
              if (next) pending.current = next;
            } },
          ]}
        />
      )}
    </div>
  );
}

/** Puts the desktop's size listbox under its line (absolute in the rows' own scrolling box). */
function ListboxAnchor({ rows, lineId, children }: { rows: React.RefObject<HTMLDivElement | null>; lineId: string; children: ReactNode }) {
  const [top, setTop] = useState<{ top: number; right: number } | null>(null);
  useLayoutEffect(() => {
    const li = rows.current?.querySelector<HTMLElement>(`li[data-id="${CSS.escape(lineId)}"]`);
    const box = li?.querySelector<HTMLElement>(".fmo-tl-sizebox");
    if (!li || !box || !rows.current) return;
    const r = rows.current;
    // Measuring the line is the point of this effect: the position can only be known after layout.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTop({ top: li.offsetTop + box.offsetTop + box.offsetHeight + 2, right: r.clientWidth - (box.offsetLeft + box.offsetWidth) });
  }, [rows, lineId]);
  if (!top) return null;
  return (
    <div className="fmo-tl-listbox-anchor" style={{ top: top.top, insetInlineEnd: Math.max(0, top.right - 16) }}>
      {children}
    </div>
  );
}

interface MenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  keepOpen?: boolean;
  onSelect: () => void;
}

/** A small menu (the line menu 4.6 and Sort): arrow keys move, Enter chooses, Esc closes and returns focus to its button. */
export function MenuView({ anchor, align = "end", label, items, onClose, stepper, sheet = false }: { anchor: HTMLElement | null; align?: "start" | "end"; sheet?: boolean; label: string; items: MenuItem[]; onClose: () => void; stepper?: { count: number; min: number; max: number; onChange: (n: number) => void; label: string; less: string; more: string; done: string } }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  // Placed beside its button in the page's own coordinates (the menu is fixed: the panel's box does not clip it), and again
  // once the panel has settled (opening the menu takes focus from the field, so a phone's keyboard layout ends).
  const place = useCallback(() => {
    if (sheet) return;
    const box = anchor?.getBoundingClientRect();
    const host = anchor?.closest<HTMLElement>(".fmo-editor")?.getBoundingClientRect();
    if (!box || !host) return;
    const width = Math.min(260, host.width - 24);
    const height = ref.current?.offsetHeight ?? 240;
    const below = box.bottom + 4 + height <= host.bottom - 8;
    setPos({ top: below ? box.bottom + 4 : Math.max(host.top + 8, box.top - 4 - height), left: Math.max(host.left + 12, Math.min(align === "start" ? box.left : box.right - width, host.right - width - 12)), width });
  }, [anchor, align, sheet]);
  useLayoutEffect(() => {
    place();
    const timer = setTimeout(place, 320);
    return () => clearTimeout(timer);
  }, [place, items.length, stepper]);
  // Focus goes into the menu once it is placed (a hidden element cannot take focus).
  const placed = pos !== null || sheet;
  const hasStepper = stepper !== undefined;
  useEffect(() => {
    if (placed) ref.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"]), button')?.focus({ preventScroll: true });
  }, [placed, hasStepper]);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = [...(ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ?? [])];
    const k = buttons.indexOf(document.activeElement as HTMLElement);
    buttons[(k + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  };
  return (
    <>
    {sheet && <div className="fmo-tl-scrim" aria-hidden="true" data-testid="tl-menu-scrim" />}
    <div className={sheet ? "fmo-tl-menu fmo-tl-sheet" : "fmo-tl-menu"} role="menu" aria-label={label} ref={ref} style={sheet ? undefined : pos ? { top: pos.top, left: pos.left, width: pos.width } : { visibility: "hidden" }} onKeyDown={onKey} data-sheet={sheet ? "true" : undefined} data-testid="tl-menu">
      {sheet && <p className="fmo-label fmo-tl-sheet-title" aria-hidden="true"><bdi dir="auto">{label}</bdi></p>}
      {stepper ? (
        <div className="fmo-tl-stepper" role="group" aria-label={stepper.label}>
          <span className="fmo-label">{stepper.label}</span>
          <div className="fmo-row">
            <button type="button" className="fmo-icon-btn" aria-label={stepper.less} aria-disabled={stepper.count <= stepper.min} onClick={() => stepper.count > stepper.min && stepper.onChange(stepper.count - 1)} data-testid="tl-count-less">
              <EditorIcon name="minus" />
            </button>
            <output className="fmo-tl-count-value" data-testid="tl-count-value">{stepper.count}</output>
            <button type="button" className="fmo-icon-btn" aria-label={stepper.more} aria-disabled={stepper.count >= stepper.max} onClick={() => stepper.count < stepper.max && stepper.onChange(stepper.count + 1)} data-testid="tl-count-more">
              <EditorIcon name="plus" />
            </button>
          </div>
          <button type="button" className="fmo-btn fmo-btn-ink" onClick={onClose}>{stepper.done}</button>
        </div>
      ) : (
        items.map((item) => (
          <button
            key={item.id}
            type="button"
            role={item.checked !== undefined ? "menuitemcheckbox" : "menuitem"}
            aria-checked={item.checked}
            aria-disabled={item.disabled || undefined}
            className="fmo-tl-menu-item"
            data-danger={item.danger ? "true" : undefined}
            onClick={() => {
              if (item.disabled) return;
              item.onSelect();
              if (!item.keepOpen) onClose();
            }}
            data-testid={`tl-menu-${item.id}`}
          >
            <span className="fmo-tl-check">{item.danger ? <EditorIcon name="trash" size={20} /> : item.checked ? <EditorIcon name="check" size={18} /> : null}</span>
            <span>{item.label}</span>
          </button>
        ))
      )}
    </div>
    </>
  );
}

/** A design with neither a name nor a number (9): one stepper per size, and the total. */
function BySizeList({ onNames }: { onNames: () => void }) {
  const t = useTeamList();
  const { wording } = useEditor();
  const w = wording.teamList;
  const per = new Map<string, number>();
  for (const l of t.analysis.filled) {
    const code = readSize(l.size, t.sizeTable) ?? l.size;
    per.set(code, (per.get(code) ?? 0) + l.count);
  }
  const total = [...per.values()].reduce((a, b) => a + b, 0);
  return (
    <div className="fmo-tl-bysize" data-testid="tl-by-size">
      <h3 className="fmo-section-title">{w.bySize.title}</h3>
      {t.sizes.map((s) => {
        const count = per.get(s.code) ?? 0;
        return (
          <div key={s.code} className="fmo-tl-size-row" role="group" aria-label={fill(w.bySize.sizeCount, { size: s.label ?? s.code, count })}>
            <span className="fmo-tl-size-name">{s.label ?? s.code}</span>
            <button type="button" className="fmo-icon-btn" aria-label={fill(w.bySize.less, { size: s.label ?? s.code })} aria-disabled={count <= 0} onClick={() => count > 0 && t.setSizeCount(s.code, count - 1)} data-testid={`tl-size-less-${s.code}`}>
              <EditorIcon name="minus" />
            </button>
            <output className="fmo-tl-count-value" data-testid={`tl-size-count-${s.code}`}>{count}</output>
            <button type="button" className="fmo-icon-btn" aria-label={fill(w.bySize.more, { size: s.label ?? s.code })} onClick={() => t.setSizeCount(s.code, count + 1)} data-testid={`tl-size-more-${s.code}`}>
              <EditorIcon name="plus" />
            </button>
          </div>
        );
      })}
      <p className="fmo-tl-detail"><span className="fmo-tl-strong">{fill(w.bySize.total, { n: total })}</span></p>
      <button type="button" className="fmo-btn fmo-btn-text" onClick={onNames} data-testid="tl-bag-names-open">
        {w.bySize.addNames}
      </button>
    </div>
  );
}
