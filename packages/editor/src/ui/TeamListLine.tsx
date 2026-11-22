/**
 * One line of the team list (08-team-list.md 4.1 to 4.6): its fields, its states, its message under it, its menu.
 * The keys (Enter, Tab, arrows, Esc) are handled once for the whole list by `TeamList` (event delegation, 4.3);
 * a line only draws itself and reports focus. Memoised on what it shows, so typing in one line does not redraw 40.
 */
import { memo, useEffect, useId, useRef, type ReactNode } from "react";
import { readSize } from "@fitmyoutfit/team-rules";
import type { SizeTable } from "@fitmyoutfit/team-rules";
import { FIELD_MAX } from "../team-list/saved.js";
import type { EditorLine, TeamListSize } from "../team-list/types.js";
import { fill, type EditorWording } from "./content.js";
import { EditorIcon } from "./icons.js";

/** A problem or note, worded, ready to show on a line. */
export interface Shown {
  key: string;
  code: string;
  field: "name" | "number" | "size" | "count" | "list";
  text: string;
  /** The words are said inside the empty field ("Needs a size"); everything else is a sentence under the line. */
  inField: boolean;
  kind: "error" | "note";
}

export interface LineRowProps {
  line: EditorLine;
  index: number;
  total: number;
  wide: boolean;
  chosen: boolean;
  /** The name field is shown (always), the number field only when the design prints numbers. */
  showNumber: boolean;
  nameLabel: "name" | "nameNotPrinted";
  /** Offered in the line menu: only for the fields the design has. */
  hasNameFlag: boolean;
  hasNumberFlag: boolean;
  shown: readonly Shown[];
  menuOpen: boolean;
  wording: EditorWording;
  /** The size listbox is open under this line's size field (wide). */
  listOpen: boolean;
  readOnly?: boolean;
}

export function sameRow(a: LineRowProps, b: LineRowProps): boolean {
  return (
    a.line === b.line &&
    a.index === b.index &&
    a.total === b.total &&
    a.wide === b.wide &&
    a.chosen === b.chosen &&
    a.showNumber === b.showNumber &&
    a.nameLabel === b.nameLabel &&
    a.hasNameFlag === b.hasNameFlag &&
    a.hasNumberFlag === b.hasNumberFlag &&
    a.menuOpen === b.menuOpen &&
    a.listOpen === b.listOpen &&
    a.wording === b.wording &&
    a.readOnly === b.readOnly &&
    a.shown.length === b.shown.length &&
    a.shown.every((s, i) => s.key === b.shown[i]!.key)
  );
}

function lineName(wording: EditorWording, line: EditorLine, index: number, total: number): string {
  const w = wording.teamList;
  return fill(w.lineName, { i: index + 1, n: total, name: line.name || w.noNameYet, number: line.number || w.noNumberYet, size: line.size || w.noSizeYet });
}

function LineRowView(props: LineRowProps) {
  const { line, index, total, wide, chosen, showNumber, wording, shown } = props;
  const w = wording.teamList;
  const uid = useId();
  const messageId = `${uid}-msg`;
  const forField = (field: Shown["field"]) => shown.filter((s) => s.field === field);
  const state = (field: "name" | "number" | "size"): "missing" | "wrong" | "ok" => {
    const here = forField(field).filter((s) => s.kind === "error");
    if (here.some((s) => !s.inField)) return "wrong";
    return here.length > 0 ? "missing" : "ok";
  };
  const under = shown.filter((s) => !s.inField);
  const describe = (field: "name" | "number" | "size") => {
    const ids = forField(field).map((s) => (s.inField ? `${uid}-${field}-need` : under.some((u) => u.key === s.key) ? messageId : null)).filter(Boolean);
    return ids.length > 0 ? [...new Set(ids)].join(" ") : undefined;
  };
  const needWords = (field: "name" | "number" | "size") => forField(field).find((s) => s.inField)?.text;
  const noName = line.noName;
  const noNumber = line.noNumber;
  const spareTag = (kind: "name" | "number"): ReactNode => (
    <button type="button" className="fmo-tl-tag" data-field={kind} data-id={line.id} data-open-menu="true" aria-label={`${kind === "name" ? w.tagNoName : w.tagNoNumber}, ${w.more.replace("{name}", line.name || String(index + 1))}`}>
      {kind === "name" ? w.tagNoName : w.tagNoNumber}
    </button>
  );
  return (
    <li
      className="fmo-tl-line"
      role="group"
      aria-label={lineName(wording, line, index, total)}
      tabIndex={-1}
      data-id={line.id}
      data-chosen={chosen ? "true" : undefined}
      data-testid={`tl-line-${index}`}
    >
      <div className="fmo-tl-fields" data-wide={wide ? "true" : undefined} data-number={showNumber ? "true" : undefined}>
        {wide && <span className="fmo-tl-index" aria-hidden="true">{index + 1}</span>}
        {noName ? (
          spareTag("name")
        ) : (
          <input
            className="fmo-field fmo-tl-input fmo-tl-name"
            type="text"
            dir="auto"
            data-field="name"
            maxLength={FIELD_MAX.name}
            data-id={line.id}
            data-state={state("name")}
            enterKeyHint="next"
            autoCapitalize="words"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={needWords("name") ?? (props.nameLabel === "nameNotPrinted" ? w.heading.nameNotPrinted : w.placeholder.name)}
            aria-label={fill(w.fieldName, { i: index + 1 })}
            aria-invalid={state("name") === "wrong" ? true : undefined}
            aria-describedby={describe("name")}
            aria-readonly={props.readOnly ? true : undefined}
            value={line.name}
            readOnly={props.readOnly}
            onChange={noop}
            data-testid={`tl-name-${index}`}
          />
        )}
        {showNumber &&
          (noNumber ? (
            spareTag("number")
          ) : (
            <input
              className="fmo-field fmo-tl-input fmo-tl-number"
              type="text"
              inputMode="numeric"
              dir="ltr"
              data-field="number"
              data-id={line.id}
              data-state={state("number")}
              enterKeyHint="next"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={8}
              placeholder={needWords("number") ?? w.placeholder.number}
              aria-label={fill(w.fieldNumber, { i: index + 1 })}
              aria-invalid={state("number") === "wrong" ? true : undefined}
              aria-describedby={describe("number")}
              aria-readonly={props.readOnly ? true : undefined}
              value={line.number}
              readOnly={props.readOnly}
              onChange={noop}
              data-testid={`tl-number-${index}`}
            />
          ))}
        <span className="fmo-tl-sizebox">
          <input
            className="fmo-field fmo-tl-input fmo-tl-size"
            type="text"
            role="combobox"
            aria-expanded={props.listOpen}
            aria-controls={props.listOpen ? `${uid}-sizes` : undefined}
            aria-autocomplete="list"
            data-field="size"
            maxLength={FIELD_MAX.size}
            data-id={line.id}
            data-state={state("size")}
            enterKeyHint="next"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={needWords("size") ?? w.placeholder.size}
            aria-label={fill(w.fieldSize, { i: index + 1 })}
            aria-invalid={state("size") === "wrong" ? true : undefined}
            aria-describedby={describe("size")}
            aria-readonly={props.readOnly ? true : undefined}
            value={line.size}
            readOnly={props.readOnly}
            onChange={noop}
            data-testid={`tl-size-${index}`}
          />
          {line.count > 1 && (
            <span className="fmo-tl-badge" role="img" aria-label={fill(w.countName, { count: line.count })} data-testid={`tl-count-${index}`}>
              {fill(w.countBadge, { count: line.count })}
            </span>
          )}
        </span>
        {!props.readOnly && (
          <button type="button" className="fmo-icon-btn fmo-tl-more" data-open-menu="true" data-id={line.id} aria-haspopup="menu" aria-expanded={props.menuOpen} aria-label={fill(w.more, { name: line.name || fill(w.unnamedPlayer, { i: index + 1 }) })} data-testid={`tl-more-${index}`}>
            <EditorIcon name="more" />
          </button>
        )}
      </div>
      {(["name", "number", "size"] as const).map((f) => needWords(f) && <span key={f} id={`${uid}-${f}-need`} className="fmo-sr-only">{needWords(f)}</span>)}
      {under.length > 0 && (
        <div className="fmo-tl-messages" id={messageId}>
          {under.map((s) => (
            <p key={s.key} className="fmo-tl-msg" data-kind={s.kind} data-testid={`tl-msg-${index}`} data-code={s.code}>
              <EditorIcon name={s.kind === "error" ? "alert" : "info"} size={16} />
              <span>
                {s.kind === "error" && <span className="fmo-sr-only">{w.problemPrefix} </span>}
                {s.text}
              </span>
            </p>
          ))}
        </div>
      )}
    </li>
  );
}

function noop() {
  // The list's input events are handled once, for every field, on the list (event delegation).
}

export const LineRow = memo(LineRowView, sameRow);

/** The size strip on top of the phone keyboard (4.5): one button per size, in two groups, then "Size chart". */
export function SizeStrip({ sizes, table, current, wording, onPick, onChart }: { sizes: readonly TeamListSize[]; table: SizeTable; current: string; wording: EditorWording; onPick: (code: string) => void; onChart: (() => void) | null }) {
  const w = wording.teamList;
  const pressed = readSize(current, table);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // On opening, the line's current size (or M) is in view.
    const target = ref.current?.querySelector<HTMLElement>(`[data-size="${pressed ?? "M"}"]`);
    target?.scrollIntoView?.({ block: "nearest", inline: "center" });
  }, [pressed]);
  const youth = sizes.filter((s) => s.group === "youth");
  const rest = sizes.filter((s) => s.group !== "youth");
  const group = (list: readonly TeamListSize[], label: string) =>
    list.length > 0 && (
      <span role="group" aria-label={label} className="fmo-tl-strip-group">
        {list.map((s) => (
          <button key={s.code} type="button" className="fmo-tl-size-btn" data-size={s.code} aria-pressed={pressed === s.code} onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(s.code)} data-testid={`tl-strip-${s.code}`}>
            {s.label ?? s.code}
          </button>
        ))}
      </span>
    );
  return (
    <div className="fmo-tl-strip fmo-scroll-row" role="group" aria-label={w.sizesGroup} ref={ref} data-testid="tl-size-strip">
      {group(youth, w.youth)}
      {youth.length > 0 && rest.length > 0 && <span className="fmo-divider" />}
      {group(rest, w.adult)}
      {onChart && (
        <button type="button" className="fmo-btn fmo-btn-text fmo-btn-pad" onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={onChart} data-testid="tl-size-chart">
          {w.sizeChart}
        </button>
      )}
    </div>
  );
}

/** The desktop's listbox under the size field (4.5): the sizes in two groups, the typed text filtering them. */
export function SizeListbox({ id, sizes, typed, active, onPick, wording }: { id: string; sizes: readonly TeamListSize[]; typed: string; active: number; onPick: (code: string) => void; wording: EditorWording }) {
  const w = wording.teamList;
  const key = typed.trim().toLowerCase().replace(/[\s\-._]+/g, "");
  const shown = key === "" ? sizes : sizes.filter((s) => s.code.toLowerCase().startsWith(key) || (s.label ?? "").toLowerCase().startsWith(key));
  const list = shown.length > 0 ? shown : sizes;
  // Two groups, Youth then Adult (4.5), each named for a screen reader and headed for the eye; the keyboard walks `list` in order.
  const groups = [
    { label: w.youth, items: list.filter((s) => s.group === "youth") },
    { label: w.adult, items: list.filter((s) => s.group !== "youth") },
  ].filter((g) => g.items.length > 0);
  return (
    <ul className="fmo-tl-listbox" role="listbox" id={id} aria-label={w.sizesGroup} data-testid="tl-size-list">
      {groups.map((g) => (
        <li key={g.label} role="presentation" className="fmo-tl-listgroup">
          <ul role="group" aria-label={g.label}>
            <li role="presentation" className="fmo-tl-listhead" aria-hidden="true">
              {g.label}
            </li>
            {g.items.map((s) => (
              <li key={s.code} role="option" id={`${id}-${s.code}`} aria-selected={list.indexOf(s) === active} data-size={s.code} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(s.code)}>
                <span>{s.label ?? s.code}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

/** The sizes the listbox would show for typed text (the same filter, for the keyboard). */
export function listboxSizes(sizes: readonly TeamListSize[], typed: string): readonly TeamListSize[] {
  const key = typed.trim().toLowerCase().replace(/[\s\-._]+/g, "");
  const shown = key === "" ? sizes : sizes.filter((s) => s.code.toLowerCase().startsWith(key) || (s.label ?? "").toLowerCase().startsWith(key));
  return shown.length > 0 ? shown : sizes;
}
