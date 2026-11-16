/**
 * Text (06-editor.md 4.7): free text lines (a motto, a sponsor's name, a
 * year), the same on every shirt. "Add text" puts the first line low on the
 * back, the next on the upper back. Each line has its own card: the text
 * (any script: the field is `dir="auto"`, and the model resolves the
 * direction from the first strong letter, 11.1; there is no Direction
 * control), Where, font (shown in the line's own words), colour, outline,
 * size, and alignment as Start, Centre and End, whose icons turn round for
 * right-to-left text.
 */
import { useId, useState } from "react";
import { addCatalogFont } from "../design/font-catalog.js";
import { addLayer, removeLayer, updateLayer } from "../design/edit.js";
import { newTextLayer, nextLayerId } from "../design/new-layers.js";
import { coloursCommonFirst, paletteColourRef } from "../design/palette.js";
import { itemReadability, outlineColourFor } from "../design/readability.js";
import { outlineStepOf, setOutline, setSizeStep, sizeStepOf, type OutlineStep, type SizeStep } from "../design/roles.js";
import { TEAM_COLOUR_ROLES, type DesignDocument, type Layer } from "../design/schema.js";
import { teamColourValue } from "../design/team-colours.js";
import { resolveTextDirection } from "../design/text.js";
import { hasPictographs, stripPictographs } from "../design/typed-text.js";
import { fieldCheck, fieldStep, fontDisplayName, type FieldState } from "./lettering.js";
import { PictographAlert } from "./parts.js";
import { fill } from "./content.js";
import { useEditor } from "./context.js";
import { EditorIcon } from "./icons.js";
import { presetsFor } from "./lettering.js";
import { ItemWhere } from "./LogosTool.js";
import { nextPreset } from "./logos.js";
import { Segmented, Swatch } from "./parts.js";
import { colourName } from "./stage-logic.js";

type TextLayer = Extract<Layer, { kind: "text" }>;

export function TextTool() {
  const api = useEditor();
  const { design, product, wording, fonts } = api;
  const w = wording.lettering;
  const id = useId();
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const texts = design.layers.filter((l): l is TextLayer => l.kind === "text" && l.role === "text");
  const font = fonts.fonts.find((f) => f.uses.includes("text"))!;

  const add = () => {
    const checked = fieldCheck(wording, draft, "text");
    if (checked.error) {
      setDraftError(checked.error);
      return;
    }
    const value = checked.value.trim();
    const preset = nextPreset(product, "text", api.design, presetsFor(product, "text"));
    const layerId = nextLayerId(api.design, "text");
    const ok = api.commit((d) => addLayer(addCatalogFont(d, fonts, font.id), newTextLayer(product, { id: layerId, preset: preset?.id, pieceId: preset ? undefined : product.views.back, value, fontId: font.id, fill: teamColourValue(d, "second") }), { product }), "add-item");
    if (ok) {
      setDraft("");
      api.select(layerId);
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
          <input
            id={id}
            className="fmo-field"
            dir="auto"
            maxLength={60}
            value={draft}
            aria-invalid={Boolean(draftError)}
            onChange={(e) => {
              setDraft(e.target.value);
              const checked = fieldCheck(wording, e.target.value, "text");
              setDraftError(checked.error === wording.lettering.noPictographs ? checked.error : null);
            }}
            onBlur={() => draft.trim() === "" && setDraftError(null)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            data-testid="text-input"
          />
          <button type="button" className="fmo-btn" style={{ minHeight: 48 }} onClick={add} disabled={draft.trim() === ""} data-testid="text-add">
            {w.addText}
          </button>
        </div>
        {draftError ? (
          <p className="fmo-field-error" role="alert" data-testid="text-input-error">
            <EditorIcon name="alert" size={18} />
            {draftError}
          </p>
        ) : (
          <p className="fmo-muted">{w.sameOnEvery}</p>
        )}
      </div>
      {texts.map((t) => (
        <TextItem key={t.id} layer={t} />
      ))}
    </>
  );
}

function TextItem({ layer }: { layer: TextLayer }) {
  const api = useEditor();
  const { product, wording, palette, fonts, design } = api;
  const w = wording.lettering;
  const [field, setField] = useState<FieldState>({ draft: null, error: null });
  const draft = field.draft;
  const selected = api.selectedId === layer.id;
  const rtl = resolveTextDirection(layer.value, layer.direction) === "rtl";
  const opts = { product };
  const step = outlineStepOf(layer);
  const shownStep: "none" | "thin" | "thick" = step === null ? "none" : step === "thick" ? "thick" : "thin";
  const size = sizeStepOf(product, layer);
  // An outline in the team colour that stands out most on what is under the letters (as the readability fix).
  const outlineColour = () => {
    const background = itemReadability(product, api.design, layer.id)?.background;
    return background ? teamColourValue(api.design, outlineColourFor(api.design, layer.fill, background).role) : teamColourValue(api.design, "main");
  };
  const textFonts = fonts.fonts.filter((f) => f.uses.includes("text"));
  return (
    <div className="fmo-item" data-testid={`text-${layer.id}`} data-selected={selected}>
      <div className="fmo-item-head">
        <input
          className="fmo-field"
          dir="auto"
          aria-label={w.textLabel}
          value={draft ?? layer.value}
          maxLength={60}
          onFocus={() => {
            api.select(layer.id);
            api.begin("text");
            api.setTyping(layer.id);
          }}
          aria-invalid={Boolean(field.error)}
          onBlur={() => {
            api.end();
            api.setTyping(null);
            setField((f) => fieldStep(f, { type: "left" }));
          }}
          onChange={(e) => {
            // Line breaks and tabs become spaces; emoji and an empty line are refused, with the reason (E3c).
            const raw = e.target.value;
            const checked = fieldCheck(wording, raw, "text");
            setField((f) => fieldStep(f, { type: "typed", raw, error: checked.error }));
            if (!checked.error) api.preview((d) => updateLayer(d, layer.id, { value: checked.value }, opts));
          }}
          data-testid={`text-value-${layer.id}`}
        />
        <button
          type="button"
          className="fmo-btn fmo-btn-text"
          onClick={() => {
            if (api.commit((d) => removeLayer(d, layer.id), "remove-item") && selected) api.select(null);
          }}
          data-testid={`remove-${layer.id}`}
        >
          {w.removeText}
        </button>
      </div>
      {field.error && (
        <p className="fmo-field-error" role="alert" data-testid={`text-value-${layer.id}-error`}>
          <EditorIcon name="alert" size={18} />
          {field.error}
        </p>
      )}
      {!field.error && hasPictographs(layer.value) && (
        <PictographAlert
          onRemove={(d: DesignDocument) => {
            const value = stripPictographs(layer.value);
            // A line that was only emoji goes.
            return value ? updateLayer(d, layer.id, { value }, opts) : removeLayer(d, layer.id);
          }}
          testId={`pictographs-${layer.id}`}
        />
      )}
      <span className="fmo-label">{w.where}</span>
      <ItemWhere layer={layer} role="text" />
      <span className="fmo-label">{w.font}</span>
      <div className="fmo-scroll-row" role="radiogroup" aria-label={w.font}>
        {textFonts.map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={layer.fontId === f.id}
            className="fmo-chip fmo-font-chip"
            title={fontDisplayName(f)}
            onClick={() => api.commit((d) => updateLayer(addCatalogFont(d, fonts, f.id), layer.id, { fontId: f.id }, opts), "font")}
            data-testid={`text-font-${layer.id}-${f.id}`}
          >
            <span className="fmo-bdi" dir="auto" style={{ fontFamily: `"${f.family}"`, fontWeight: f.weight }}>
              {layer.value.slice(0, 14)}
            </span>
          </button>
        ))}
      </div>
      <span className="fmo-label">{w.colour}</span>
      <div className="fmo-scroll-row">
        {TEAM_COLOUR_ROLES.filter((r) => design.teamColors[r]).map((r) => {
          const c = design.teamColors[r]!;
          const name = `${wording.colours.roles[r]}: ${colourName(palette, c)}`;
          const on = layer.fill.teamColor === r;
          return <Swatch key={r} hex={c.hex} label={on ? fill(wording.colours.selected, { colour: name }) : name} selected={on} onPick={() => api.commit((d) => updateLayer(d, layer.id, { fill: teamColourValue(d, r) }, opts), "colour")} testId={`text-fill-${layer.id}-team-${r}`} />;
        })}
        <span className="fmo-divider" />
        {coloursCommonFirst(palette)
          .slice(0, 8)
          .map((c) => {
            const on = layer.fill.id === c.id && !layer.fill.teamColor;
            return <Swatch key={c.id} hex={c.hex} label={on ? fill(wording.colours.selected, { colour: c.name }) : c.name} selected={on} onPick={() => api.commit((d) => updateLayer(d, layer.id, { fill: paletteColourRef(c) }, opts), "colour")} testId={`text-fill-${layer.id}-${c.id}`} />;
          })}
      </div>
      <span className="fmo-label">{w.outline}</span>
      <Segmented
        label={w.outline}
        value={shownStep}
        options={[
          { value: "none", label: w.outlineSteps.none },
          { value: "thin", label: w.outlineSteps.thin },
          { value: "thick", label: w.outlineSteps.thick },
        ]}
        onChange={(v) => api.commit((d) => setOutline(d, layer.id, v === "none" ? null : { step: v as OutlineStep, color: layer.outline?.color ?? outlineColour() }, opts), "outline")}
        testId={`text-outline-${layer.id}`}
      />
      {size !== null && (
        <>
          <span className="fmo-label">{w.size}</span>
          <Segmented
            label={w.size}
            value={size}
            options={(["small", "medium", "large"] as SizeStep[]).map((s) => ({ value: s, label: w.sizeSteps[s] }))}
            onChange={(s) => api.commit((d) => setSizeStep(d, layer.id, s, opts), "size")}
            testId={`text-size-${layer.id}`}
          />
        </>
      )}
      <span className="fmo-label">{w.alignLabel}</span>
      <div className="fmo-segmented" role="group" aria-label={w.alignLabel} data-testid={`text-align-${layer.id}`} data-rtl={rtl}>
        {(["start", "center", "end"] as const).map((a) => (
          <button key={a} type="button" aria-pressed={layer.align === a} onClick={() => api.commit((d) => updateLayer(d, layer.id, { align: a }, opts), "align")} data-value={a}>
            {/* Start is the left for left-to-right text and the right for right-to-left text (11.1): the icon turns round. */}
            <EditorIcon name={a === "center" ? "alignCentre" : (a === "start") !== rtl ? "alignLeft" : "alignRight"} size={20} />
            <span>{w.align[a]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
