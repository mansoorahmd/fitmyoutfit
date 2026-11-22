/**
 * The garment chooser's sheet (G4): a native modal <dialog> like the Done panel (a phone's sheet rises from the bottom;
 * a desktop's is 400 px on the right), one card per garment group with a chip for each member, so the other neck of
 * the jersey is one tap away. Choosing calls `onPick`; the shell asks first when something would be left behind.
 */
import { useEffect, useRef } from "react";
import { fill, type EditorWording } from "./content.js";
import { EditorIcon } from "./icons.js";
import type { EditorLayout } from "./layout.js";
import { groupGarments, type GarmentChoice } from "./garment.js";

export interface GarmentSheetProps {
  open: boolean;
  layout: EditorLayout;
  wording: EditorWording;
  garments: readonly GarmentChoice[];
  currentId: string;
  onPick: (garment: GarmentChoice) => void;
  onClose: () => void;
}

export function GarmentSheet({ open, layout, wording, garments, currentId, onPick, onClose }: GarmentSheetProps) {
  const w = wording.garment;
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      dialog.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open]);
  const groups = groupGarments(garments);
  return (
    <dialog
      ref={ref}
      className="fmo-done-panel fmo-garment-panel"
      data-layout={layout}
      aria-labelledby="fmo-garment-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      data-testid="garment-sheet"
    >
      {open && (
        <div className="fmo-done-inner fmo-stack">
          <div className="fmo-panel-head">
            <h2 className="fmo-panel-title" id="fmo-garment-title">
              {w.title}
            </h2>
            <button type="button" className="fmo-icon-btn" aria-label={w.close} title={w.close} onClick={onClose} data-testid="garment-close">
              <EditorIcon name={layout === "compact" ? "chevronDown" : "close"} />
            </button>
          </div>
          <p className="fmo-muted">{w.body}</p>
          <div className="fmo-gm-list">
            {groups.map((group) => {
              const single = group.members.length === 1;
              const here = group.members.some((m) => m.id === currentId);
              const picture = (
                <span className="fmo-gm-picture" aria-hidden="true">
                  {(group.members.find((m) => m.id === currentId)?.picture ?? group.picture) ? <img src={group.members.find((m) => m.id === currentId)?.picture ?? group.picture} alt="" width={64} height={64} loading="lazy" /> : <EditorIcon name="players" size={32} />}
                </span>
              );
              return single ? (
                <button key={group.key} type="button" className="fmo-gm-card" data-current={here || undefined} aria-pressed={here} onClick={() => onPick(group.members[0]!)} data-testid={`garment-${group.members[0]!.id}`}>
                  {picture}
                  <span className="fmo-gm-name">{group.name}</span>
                  {here && <EditorIcon name="check" size={20} />}
                </button>
              ) : (
                <div key={group.key} className="fmo-gm-card" role="group" aria-label={group.name} data-current={here || undefined} data-testid={`garment-group-${group.key}`}>
                  {picture}
                  <span className="fmo-gm-name">{group.name}</span>
                  <span className="fmo-gm-chips">
                    {group.members.map((m) => (
                      <button key={m.id} type="button" className="fmo-chip" aria-pressed={m.id === currentId} aria-label={fill(w.pick, { name: m.name })} onClick={() => onPick(m)} data-testid={`garment-${m.id}`}>
                        {m.variant ?? m.name}
                      </button>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </dialog>
  );
}
