/**
 * Pasting a list and a CSV file (08-team-list.md, section 5): a sub-view of the Players panel. The text is read by the
 * rules package (`readPastedList`, through `team-list/paste.ts`); this view only SHOWS what was read, before anything
 * is added: the players found, the lines that are not players listed apart, the parts that are unclear left empty and
 * marked. Nothing changes in the list until "Add n players" (one undo step).
 */
import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent } from "react";
import { readFileText } from "../team-list/csv.js";
import { PASTE_LIMITS, countTextLines, pastedLines, readPaste, type PasteMode } from "../team-list/paste.js";
import { filledLines } from "../team-list/lines.js";
import { fill } from "./content.js";
import { useEditor } from "./context.js";
import { EditorIcon } from "./icons.js";
import { useTeamList } from "./team-list-context.js";
import { fileRefusalText, notAddedReason, previewMessages } from "./team-list-words.js";

/** Reading is live: this long after the text last changed (5.2). */
export const READ_DELAY_MS = 300;
const NO_LINES: readonly number[] = [];

function kilobytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function PasteView() {
  const t = useTeamList();
  const api = useEditor();
  const { wording } = api;
  const w = wording.teamList;
  const p = w.paste;
  const wide = api.layout !== "compact";
  const uid = useId();
  const box = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(t.pasteText);
  // What is read: the text as it was READ_DELAY_MS ago (the first reading of a kept text is at once).
  const [readText, setReadText] = useState(t.pasteText);
  const [editing, setEditing] = useState(t.pasteText.trim() === "");
  const [mode, setMode] = useState<PasteMode>("add");
  // The "Not added" lines the organizer chose to add belong to the text they were chosen for: another text starts again.
  const [chosenExtras, setExtras] = useState<{ text: string; lines: readonly number[] }>({ text: t.pasteText, lines: [] });
  const extras = chosenExtras.text === readText ? chosenExtras.lines : NO_LINES;
  const [fileMessage, setFileMessage] = useState<string | null>(null);
  const [holdHint, setHoldHint] = useState(false);
  const [dragging, setDragging] = useState(false);
  const canReadClipboard = typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function";

  const existing = filledLines(t.lines);
  const hasList = existing.length > 0;
  const effectiveMode: PasteMode = hasList ? mode : "add";

  useEffect(() => {
    if (text === readText) return;
    const timer = setTimeout(() => setReadText(text), READ_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, readText]);
  // The text is kept for the visit (5.2), and a different text starts its "Not added" choices again.
  useEffect(() => {
    t.setPasteText(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const preview = useMemo(
    () => (readText.trim() === "" ? null : readPaste(readText, { sizes: t.sizes, prints: t.prints, existing: t.lines, mode: effectiveMode, maxLines: t.limits.maxLines }, extras)),
    [readText, t.sizes, t.prints, t.lines, effectiveMode, t.limits.maxLines, extras],
  );
  const wordsContext = useMemo(() => {
    const base = effectiveMode === "add" ? existing : [];
    return { wording, lines: [...base, ...(preview?.rows.map((r) => r.line) ?? [])], sizes: t.sizes, noun: t.noun };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wording, preview, effectiveMode, t.sizes, t.noun, t.lines]);

  const n = preview?.rows.length ?? 0;
  // The stage shows the first player read, while this view is open (5.2); the chosen line comes back when it closes.
  const firstRead = preview?.rows[0]?.line ?? null;
  const { previewPlayer } = t;
  useEffect(() => {
    previewPlayer(firstRead);
  }, [firstRead, previewPlayer]);
  useEffect(() => () => previewPlayer(null), [previewPlayer]);
  const pending = text !== readText;

  // G4: text over the limit is cut, and the organizer is told (it was cut without a word before).
  const [cutNote, setCutNote] = useState(false);
  const take = (next: string) => {
    setText(next.slice(0, PASTE_LIMITS.maxTextLength));
    setReadText(next.slice(0, PASTE_LIMITS.maxTextLength));
    setFileMessage(null);
    setCutNote(next.length > PASTE_LIMITS.maxTextLength);
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    {
      const area = event.currentTarget;
      const incoming = event.clipboardData.getData("text").length;
      if (area.value.length - (area.selectionEnd - area.selectionStart) + incoming > PASTE_LIMITS.maxTextLength) setCutNote(true);
    }
    // On a phone a paste closes the keyboard so the result is in view; "Edit text" opens the box again (5.2).
    if (!wide) {
      const pasted = event.clipboardData.getData("text");
      setTimeout(() => {
        box.current?.blur();
        if (pasted.trim() !== "") setEditing(false);
      }, 0);
    }
  };

  const pasteButton = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      take(clip);
      setHoldHint(false);
      if (!wide) setEditing(false);
    } catch {
      // The browser refused: the box takes focus and says how to paste by hand (W-TL33).
      setHoldHint(true);
      box.current?.focus();
    }
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > PASTE_LIMITS.maxFileBytes) {
      setFileMessage(fileRefusalText("too-big", wording, { size: kilobytes(file.size), max: kilobytes(PASTE_LIMITS.maxFileBytes) }));
      return;
    }
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      setFileMessage(fileRefusalText("encoding", wording));
      return;
    }
    const result = readFileText(bytes, { name: file.name });
    if (!result.ok) {
      setFileMessage(fileRefusalText(result.reason, wording, { size: kilobytes(file.size), max: kilobytes(PASTE_LIMITS.maxFileBytes) }));
      return;
    }
    take(result.text);
    setEditing(false);
    setFileMessage(null);
    api.announce(fill(p.fileRead, { file: file.name }));
  };
  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    void readFile(event.target.files?.[0]);
    event.target.value = "";
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void readFile(event.dataTransfer.files?.[0]);
  };

  const accept = () => {
    if (!preview || n === 0) return;
    // What was just typed counts even before the live reading catches up.
    const fresh = pending ? readPaste(text, { sizes: t.sizes, prints: t.prints, existing: t.lines, mode: effectiveMode, maxLines: t.limits.maxLines }, extras) : preview;
    if (fresh.rows.length > 0) t.addPasted(pastedLines(fresh), effectiveMode);
  };
  const cancel = () => t.setView("list");
  const textLines = preview?.textLines ?? countTextLines(text);
  const addLabel = n === 1 ? (effectiveMode === "replace" ? p.replaceOne : p.addOne) : fill(effectiveMode === "replace" ? p.replaceN : p.addN, { n });
  const columnNames = preview?.columns?.map((c) => p.columnNames[c]).join(" · ");

  return (
    <div
      className="fmo-pv"
      data-testid="paste-view"
      data-dragging={dragging ? "true" : undefined}
      onDragOver={(e) => {
        if (e.dataTransfer?.types?.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className="fmo-pv-scroll">
        <button type="button" className="fmo-btn fmo-btn-text fmo-pv-back" onClick={cancel} data-testid="paste-back">
          <EditorIcon name="chevronLeft" size={20} />
          {p.back}
        </button>
        <h3 className="fmo-panel-title fmo-pv-title" id={`${uid}-title`}>{p.title}</h3>
        {(editing || !preview) && (
          <>
            <p className="fmo-muted fmo-pv-body">{p.body}</p>
            <textarea
              ref={box}
              className="fmo-field fmo-pv-box"
              rows={wide ? 8 : 6}
              dir="auto"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              aria-label={p.boxName}
              aria-describedby={holdHint ? `${uid}-hold` : undefined}
              placeholder={p.examples.join("\n")}
              value={text}
              maxLength={PASTE_LIMITS.maxTextLength}
              onChange={(e) => {
                setText(e.target.value);
                setFileMessage(null);
                if (e.target.value.length < PASTE_LIMITS.maxTextLength) setCutNote(false);
              }}
              onPaste={onPaste}
              data-testid="paste-box"
            />
            {holdHint && <p className="fmo-muted fmo-pv-hint" id={`${uid}-hold`} data-testid="paste-hold">{p.hold}</p>}
          </>
        )}
        <div className="fmo-pv-tools">
          {canReadClipboard && (
            <button type="button" className="fmo-btn" onClick={() => void pasteButton()} data-testid="paste-button">
              {p.paste}
            </button>
          )}
          <button type="button" className="fmo-btn" onClick={() => fileInput.current?.click()} data-testid="paste-choose-file">
            {p.chooseFile}
          </button>
          <input ref={fileInput} type="file" className="fmo-pv-file" accept=".csv,.tsv,.txt,text/csv,text/plain" tabIndex={-1} aria-hidden="true" onChange={onFile} data-testid="paste-file" />
        </div>
        <p className="fmo-muted fmo-pv-hint">{p.excelHint}</p>
        {fileMessage && (
          <p className="fmo-pv-file-problem" role="alert" data-testid="paste-file-problem">
            <EditorIcon name="alert" size={16} />
            <span>{fileMessage}</span>
          </p>
        )}
        {cutNote && (
          <p className="fmo-pv-file-problem" role="status" data-testid="paste-cut">
            <EditorIcon name="info" size={16} />
            <span>{fill(p.cut, { max: PASTE_LIMITS.maxTextLength.toLocaleString("en") })}</span>
          </p>
        )}
        {dragging && <p className="fmo-pv-drop" aria-hidden="true">{p.dropHere}</p>}
        {preview && !editing && (
          <div className="fmo-pv-folded">
            <span data-testid="paste-text-count">{textLines === 1 ? p.yourTextOne : fill(p.yourText, { n: textLines })}</span>
            <button type="button" className="fmo-btn fmo-btn-text" onClick={() => { setEditing(true); setTimeout(() => box.current?.focus(), 0); }} data-testid="paste-edit">
              {p.editText}
            </button>
          </div>
        )}
        {preview && (
          <div className="fmo-pv-result" aria-busy={pending ? true : undefined} data-testid="paste-result">
            <h3 className="fmo-section-title" role="status" aria-live="polite" data-testid="paste-count">
              {n === 0 ? p.readNone : n === 1 ? p.readOne : fill(p.read, { n })}
              {preview.needLook > 0 && ` · ${preview.needLook === 1 ? p.needLookOne : fill(p.needLook, { k: preview.needLook })}`}
            </h3>
            {columnNames && <p className="fmo-muted fmo-pv-hint" data-testid="paste-columns">{fill(p.columns, { names: columnNames })}</p>}
            {preview.overLimit > 0 && (
              <p className="fmo-pv-over" data-testid="paste-over-limit">
                <EditorIcon name="info" size={16} />
                <span>{preview.room === 0 ? p.overLimitNone : fill(p.overLimit, { fit: preview.room })}</span>
              </p>
            )}
            {hasList && (
              <div className="fmo-pv-modes" role="radiogroup" aria-label={p.modeName}>
                <label className="fmo-pv-mode">
                  <input type="radio" name={`${uid}-mode`} checked={effectiveMode === "add"} onChange={() => setMode("add")} data-testid="paste-mode-add" />
                  <span>{fill(p.addTo, { n: existing.length })}</span>
                </label>
                <label className="fmo-pv-mode">
                  <input type="radio" name={`${uid}-mode`} checked={effectiveMode === "replace"} onChange={() => setMode("replace")} data-testid="paste-mode-replace" />
                  <span>{p.replace}</span>
                </label>
              </div>
            )}
            {n > 0 && (
              <ol className="fmo-pv-rows" aria-label={p.listName} data-testid="paste-rows">
                {preview.rows.map((row, i) => {
                  const messages = previewMessages(row, wordsContext);
                  const empty = <span aria-hidden="true">{p.empty}</span>;
                  const l = row.line;
                  return (
                    <li key={row.line.id} className="fmo-pv-row" data-testid={`paste-row-${i}`}>
                      <div
                        className="fmo-pv-fields"
                        data-wide={wide ? "true" : undefined}
                        role="group"
                        aria-label={fill(p.rowName, { name: l.name || p.noNameRow, number: l.number || p.noNumberRow, size: l.size || p.noSizeRow })}
                      >
                        {wide && <span className="fmo-tl-index" aria-hidden="true">{i + 1}</span>}
                        <bdi className="fmo-pv-name" dir="auto">{l.name || empty}</bdi>
                        {t.prints.number && <span className="fmo-pv-number" dir="ltr">{l.number || empty}</span>}
                        <span className="fmo-pv-size">{l.size || empty}</span>
                      </div>
                      {messages.map((m) => (
                        <p key={m.key} className="fmo-tl-msg fmo-pv-msg" data-kind={m.kind === "problem" ? "error" : "note"}>
                          <EditorIcon name={m.kind === "problem" ? "alert" : "info"} size={16} />
                          <span>
                            {m.kind === "problem" && <span className="fmo-sr-only">{w.problemPrefix} </span>}
                            {m.text}
                          </span>
                        </p>
                      ))}
                    </li>
                  );
                })}
              </ol>
            )}
            {preview.notAdded.length > 0 && (
              <section className="fmo-pv-notadded" aria-label={p.notAddedName} data-testid="paste-not-added">
                <h3 className="fmo-section-title">{fill(p.notAdded, { n: preview.notAdded.length })}</h3>
                <ul className="fmo-pv-rows">
                  {preview.notAdded.map((item) => (
                    <li key={item.lineNumber} className="fmo-pv-row fmo-pv-notrow">
                      <q className="fmo-pv-quote" dir="auto">{item.text}</q>
                      <span className="fmo-muted fmo-pv-reason">{notAddedReason(item.reason, wording)}</span>
                      {item.reason === "not-a-player" && (
                        <button type="button" className="fmo-btn fmo-btn-text" aria-label={fill(p.addAsLine, { text: item.text })} onClick={() => setExtras({ text: readText, lines: [...extras, item.lineNumber] })} data-testid={`paste-add-extra-${item.lineNumber}`}>
                          {p.add}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
      {preview && (
        <div className="fmo-pv-actions">
          <div className="fmo-pv-buttons">
            <button type="button" className="fmo-btn fmo-btn-ink fmo-pv-accept" aria-disabled={n === 0} onClick={accept} data-testid="paste-accept">
              {n === 0 ? fill(p.addN, { n: 0 }) : addLabel}
            </button>
            <button type="button" className="fmo-btn fmo-btn-text" onClick={cancel} data-testid="paste-cancel">
              {p.cancel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
