/**
 * Text (06-editor.md 4.7): free text lines (a motto, a sponsor's name, a
 * year), the same on every shirt.
 */
import { useId, useState } from "react";
import { addCatalogFont } from "../design/font-catalog.js";
import { addLayer, removeLayer, updateLayer } from "../design/edit.js";
import { newTextLayer, nextLayerId } from "../design/new-layers.js";
import { normalizeText } from "../design/text.js";
import type { Layer } from "../design/schema.js";
import { teamColourValue } from "../design/team-colours.js";
import { useEditor } from "./context.js";
import { presetsFor } from "./lettering.js";
import { ItemWhere, TEXT_ORDER, nextFreePreset } from "./LogosTool.js";

export function TextTool() {
  const api = useEditor();
  const { design, product, wording, fonts } = api;
  const w = wording.lettering;
  const id = useId();
  const [draft, setDraft] = useState("");
  const texts = design.layers.filter((l): l is Extract<Layer, { kind: "text" }> => l.kind === "text" && l.role === "text");
  const font = fonts.fonts.find((f) => f.uses.includes("text"))!;

  const add = () => {
    const value = normalizeText(draft.trim());
    if (!value) return;
    const preset = nextFreePreset(api.design, presetsFor(product, "text"), TEXT_ORDER);
    const layerId = nextLayerId(api.design, "text");
    const ok = api.commit((d) => addLayer(addCatalogFont(d, fonts, font.id), newTextLayer(product, { id: layerId, preset: preset?.id, pieceId: preset ? undefined : product.views.back, value, fontId: font.id, fill: teamColourValue(d, "second") }), { product }), "add-item");
    if (ok) {
      setDraft("");
      api.showSide(preset?.side ?? "back");
    }
  };

  return (
    <>
      <div data-keep-typing>
        <label className="fmo-label" htmlFor={id}>
          {w.textLabel}
        </label>
        <div className="fmo-row" style={{ flexWrap: "nowrap" }}>
          <input id={id} className="fmo-field" dir="auto" maxLength={60} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} data-testid="text-input" />
          <button type="button" className="fmo-btn" style={{ minHeight: 48 }} onClick={add} disabled={draft.trim() === ""} data-testid="text-add">
            {w.addText}
          </button>
        </div>
        <p className="fmo-muted">{w.sameOnEvery}</p>
      </div>
      {texts.map((t) => (
        <TextItem key={t.id} layer={t} />
      ))}
    </>
  );
}

function TextItem({ layer }: { layer: Extract<Layer, { kind: "text" }> }) {
  const api = useEditor();
  const { product, wording } = api;
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="fmo-item" data-testid={`text-${layer.id}`}>
      <div className="fmo-item-head">
        <input
          className="fmo-field"
          dir="auto"
          aria-label={wording.lettering.textLabel}
          value={draft ?? layer.value}
          maxLength={60}
          onFocus={() => {
            api.begin("text");
            api.setTyping(layer.id);
          }}
          onBlur={() => {
            api.end();
            api.setTyping(null);
            setDraft(null);
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            const value = normalizeText(e.target.value);
            if (value.trim()) api.preview((d) => updateLayer(d, layer.id, { value }, { product }));
          }}
        />
        <button type="button" className="fmo-btn fmo-btn-text" onClick={() => api.commit((d) => removeLayer(d, layer.id), "remove-item")} data-testid={`remove-${layer.id}`}>
          {wording.lettering.removeText}
        </button>
      </div>
      <ItemWhere layer={layer} role="text" />
    </div>
  );
}

