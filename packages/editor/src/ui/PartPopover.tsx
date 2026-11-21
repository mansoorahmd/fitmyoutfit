/**
 * E3f: a click on a part of the garment (a sleeve, the collar, the body) opens its colour row right there, by the
 * click: the part's name and its swatches. One click on a swatch sets the colour (the popover stays, so another can
 * be tried); a click elsewhere or Escape (the shell's key handler) closes it. Desktop; a phone shows the same row in
 * its panel instead.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PartRow, partName, usePartColours } from "./ColoursTool.js";
import { useEditor, type ColourTarget } from "./context.js";

const GAP = 12;
const EDGE = 8;

export function PartPopover({ target, x, y, onClose }: { target: ColourTarget; x: number; y: number; onClose: () => void }) {
  const { product, wording } = useEditor();
  const [open, setOpen] = useState(false);
  const on = usePartColours();
  const ref = useRef<HTMLElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  // By the click, kept inside the canvas (measured: the popover grows when "All colours" opens).
  useLayoutEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const left = Math.max(EDGE, Math.min(x + GAP, host.clientWidth - el.offsetWidth - EDGE));
    const top = Math.max(EDGE, Math.min(y + GAP, host.clientHeight - el.offsetHeight - EDGE));
    setPlace((old) => (old && old.left === left && old.top === top ? old : { left, top }));
  }, [x, y, open]);
  useEffect(() => {
    const down = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", down, true);
    return () => window.removeEventListener("pointerdown", down, true);
  }, [onClose]);
  return (
    <aside ref={ref} className="fmo-part-popover" role="dialog" aria-label={partName(wording, product, target)} style={{ left: place?.left ?? 0, top: place?.top ?? 0, visibility: place ? "visible" : "hidden" }} data-testid="part-popover">
      <PartRow target={target} open={open} onOpen={setOpen} on={on} />
    </aside>
  );
}
