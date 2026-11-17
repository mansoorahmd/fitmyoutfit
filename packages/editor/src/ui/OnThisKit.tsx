/**
 * "On this kit" (06-editor.md 4.8): everything on the garment, in the
 * coach's words, top first: "Team name: TIGERS", "Number", "Logo: crest.png",
 * where it is, a warning badge when something needs a look, and a "⋯" menu
 * (Edit, Duplicate for logos and text, Bring forward, Send back, Delete).
 * Tapping a row selects the item, turns the camera to it and opens its tool.
 * The template's shapes are listed under "From the design", locked: their
 * menu offers their colour only. Opened from the stage's button; on phones it
 * takes the panel's place (with a Back row), on desktop it is a popover.
 */
import { useEffect, useRef, useState } from "react";
import { removeLayer } from "../design/edit.js";
import { bringForward, canDuplicate, duplicateLayer, sendBack } from "../design/item-edits.js";
import type { Layer } from "../design/schema.js";
import { fill, shapeGroupWords } from "./content.js";
import { useEditor } from "./context.js";
import { itemChecks } from "./checks.js";
import { EditorIcon, type IconName } from "./icons.js";
import { itemWords } from "./items.js";
import { toolForLayer } from "./selection.js";

/** The icon for an item's role (4.8): shield for the team name, shirt for names and numbers, picture for logos, Aa for text. */
export function roleIcon(layer: Pick<Layer, "role" | "kind">): IconName {
  if (layer.role === "team-name") return "team";
  if (layer.role === "player-name" || layer.role === "player-number") return "players";
  if (layer.kind === "logo" || layer.kind === "clipart") return "logos";
  return "text";
}

/** The "On this kit (n)" button on the stage: icon-only with a number below 480 px wide (4.8). */
export function KitButton({ count, compact, open, onClick }: { count: number; compact: boolean; open: boolean; onClick: () => void }) {
  const { wording } = useEditor();
  const w = wording.selection;
  const name = fill(w.onThisKitName, { count });
  return (
    <button type="button" className={compact ? "fmo-kit-button fmo-kit-icon" : "fmo-kit-button"} aria-label={name} title={name} aria-expanded={open} onClick={onClick} data-testid="kit-button">
      <EditorIcon name="layers" size={22} />
      {compact ? (
        <span className="fmo-kit-count" aria-hidden="true">
          {count}
        </span>
      ) : (
        <span aria-hidden="true">{fill(w.onThisKitCount, { count })}</span>
      )}
    </button>
  );
}

/** The list itself. `onDone` closes the list (a row was chosen). */
export function OnThisKit({ onDone }: { onDone: () => void }) {
  const api = useEditor();
  // Focus moves into the list when it opens (from the button, by keyboard or touch), to its first row.
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(".fmo-kit-pick, button")?.focus({ preventScroll: true });
  }, []);
  const { design, product, wording, assets } = api;
  const w = wording.selection;
  const [menu, setMenu] = useState<string | null>(null);
  const items = [...design.layers].reverse();
  const groups = [...new Set(design.shapes.map((s) => s.group))];
  const pick = (layer: Layer) => {
    api.select(layer.id, { turn: true, openTool: true });
    onDone();
    // Focus goes to the selected item's tool (E3c minor), not to the page: two frames, once the tool is shown.
    // E3d (R16): to the panel's title (no ring), so the coach reads the tool from its start; never into a control.
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          document.getElementById("fmo-panel-title")?.focus({ preventScroll: true });
        }),
      );
    }
  };
  return (
    <div className="fmo-kit" ref={list} data-testid="kit-list">
      {items.length === 0 && <p className="fmo-muted">{w.kitEmpty}</p>}
      {items.length > 0 && (
        <ul className="fmo-kit-rows" role="list">
          {items.map((layer, k) => {
            const words = itemWords(wording, product, layer, { fileName: assets.fileName });
            const warn = itemChecks(product, design, layer, { notes: api.logoNotes, missingAssets: api.missingAssets }).length > 0;
            const index = design.layers.length - 1 - k;
            return (
              <li key={layer.id} className="fmo-kit-row" data-selected={api.selectedId === layer.id} data-testid={`kit-row-${layer.id}`}>
                <button type="button" className="fmo-kit-pick" aria-pressed={api.selectedId === layer.id} onClick={() => pick(layer)} data-testid={`kit-pick-${layer.id}`}>
                  <EditorIcon name={roleIcon(layer)} />
                  <span className="fmo-kit-words">
                    <span className="fmo-kit-name fmo-bdi" dir="auto">
                      {words.name}
                    </span>
                    <span className="fmo-muted">{words.where}</span>
                  </span>
                  {warn && (
                    <span className="fmo-badge" role="img" aria-label={w.needsALook} data-testid={`kit-badge-${layer.id}`}>
                      <EditorIcon name="alert" size={16} />
                    </span>
                  )}
                </button>
                <RowMenu
                  open={menu === layer.id}
                  onToggle={() => setMenu((m) => (m === layer.id ? null : layer.id))}
                  onClose={() => setMenu(null)}
                  label={fill(w.moreFor, { item: words.name })}
                  testId={layer.id}
                  actions={[
                    { label: w.edit, icon: toolForLayer(layer), run: () => pick(layer) },
                    ...(canDuplicate(layer)
                      ? [
                          {
                            label: w.duplicate,
                            icon: "copy" as IconName,
                            run: () => {
                              let copy: string | null = null;
                              if (
                                api.commit((d) => {
                                  const out = duplicateLayer(d, layer.id, { product });
                                  copy = out.id;
                                  return out.design;
                                }, "add-item") &&
                                copy
                              )
                                api.select(copy);
                            },
                          },
                        ]
                      : []),
                    { label: w.bringForward, icon: "forward" as IconName, disabled: index === design.layers.length - 1, run: () => api.commit((d) => bringForward(d, layer.id), "order") },
                    { label: w.sendBack, icon: "back" as IconName, disabled: index === 0, run: () => api.commit((d) => sendBack(d, layer.id), "order") },
                    {
                      label: w.delete,
                      icon: "trash" as IconName,
                      run: () => {
                        if (api.commit((d) => removeLayer(d, layer.id), "remove-item") && api.selectedId === layer.id) api.select(null);
                      },
                    },
                  ]}
                />
              </li>
            );
          })}
        </ul>
      )}
      {groups.length > 0 && (
        <>
          <h3 className="fmo-kit-group">{w.fromDesign}</h3>
          <ul className="fmo-kit-rows" role="list">
            {groups.map((group) => (
              <li key={group} className="fmo-kit-row" data-testid={`kit-shapes-${group}`}>
                <span className="fmo-kit-pick fmo-kit-locked">
                  <EditorIcon name="stripes" />
                  <span className="fmo-kit-words">
                    <span className="fmo-kit-name">{shapeGroupWords(wording, group)}</span>
                    <span className="fmo-muted">
                      <EditorIcon name="lock" size={14} /> {w.locked}
                    </span>
                  </span>
                </span>
                <RowMenu
                  open={menu === `shapes-${group}`}
                  onToggle={() => setMenu((m) => (m === `shapes-${group}` ? null : `shapes-${group}`))}
                  onClose={() => setMenu(null)}
                  label={fill(w.moreFor, { item: shapeGroupWords(wording, group) })}
                  testId={`shapes-${group}`}
                  actions={[
                    {
                      label: w.colourAction,
                      icon: "colours",
                      run: () => {
                        api.openTool("colours");
                        api.chooseColourTarget({ kind: "shapes", id: group });
                        onDone();
                      },
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

interface MenuAction {
  label: string;
  icon: IconName;
  disabled?: boolean;
  run: () => void;
}

function RowMenu({ open, onToggle, onClose, label, actions, testId }: { open: boolean; onToggle: () => void; onClose: () => void; label: string; actions: MenuAction[]; testId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key);
    };
  }, [open, onClose]);
  useEffect(() => {
    if (open) ref.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [open]);
  return (
    <div className="fmo-context-more" ref={ref}>
      <button type="button" className="fmo-round fmo-kit-menu" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={onToggle} data-testid={`kit-menu-${testId}`}>
        <EditorIcon name="more" />
      </button>
      {open && (
        <div className="fmo-menu" role="menu">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              aria-disabled={a.disabled || undefined}
              onClick={() => {
                if (a.disabled) return;
                onClose();
                a.run();
              }}
            >
              <EditorIcon name={a.icon} size={20} />
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
