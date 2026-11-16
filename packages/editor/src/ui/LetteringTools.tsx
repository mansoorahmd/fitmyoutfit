/**
 * Team and Players (06-editor.md 4.5): the team name, the player's name and
 * number are roles, not text boxes. The coach types the team name once and a
 * sample player; chooses where they go (presets, switches) and their style
 * (font, colour, outline, size). A readability warning with a one-tap fix
 * appears when letters are hard to read on the kit.
 */
import { useId, useState, type ReactNode, useMemo } from "react";
import { addCatalogFont } from "../design/font-catalog.js";
import { updateLayer } from "../design/edit.js";
import { coloursCommonFirst, paletteColourRef } from "../design/palette.js";
import { contrastRatio } from "../design/colour.js";
import { applyReadabilityRemedy, itemReadability, outlineColourFor } from "../design/readability.js";
import { readabilityWarnings, remedyWords } from "./checks.js";
import { findLayers, isRoleSlotOn, outlineStepOf, placeAtPreset, setOutline, setRoleSlot, setSamplePlayer, setSizeStep, setTeamName, sizeStepOf, type LetteringStyle, type OutlineStep, type SizeStep } from "../design/roles.js";
import { TEAM_COLOUR_ROLES, type ColorValue, type DesignDocument, type Layer, type PlacementPreset, type TeamColourRole } from "../design/schema.js";
import { teamColourValue } from "../design/team-colours.js";
import type { ValueRole } from "../design/edit.js";
import type { EditLabel } from "../state/history.js";
import { fill, presetWords } from "./content.js";
import { useEditor, type EditorApi } from "./context.js";
import { EditorIcon } from "./icons.js";
import { convertDigits, digitChoiceOf, numberErrorText, numberFieldError, playerSwitches, presetsFor, type DigitChoice } from "./lettering.js";
import { Alert, PresetChips, Segmented, Swatch, SwitchRow } from "./parts.js";
import { colourName } from "./stage-logic.js";

type TextLike = Extract<Layer, { kind: "text" | "number" }>;

/** Below this, a team colour outline would hardly show round the letters or on the garment (a default only; the coach can choose any). */
const MIN_OUTLINE_CONTRAST = 1.5;

function roleLayers(design: DesignDocument, role: ValueRole): TextLike[] {
  return findLayers(design, { role }).filter((l): l is TextLike => l.kind === "text" || l.kind === "number");
}

/** The style a role slot gets when nothing of its role is on the kit: the catalogue's first font for it, in the second team colour. */
function defaultStyle(api: EditorApi, design: DesignDocument, role: ValueRole): LetteringStyle {
  const use = role === "player-number" ? "number" : "text";
  // The font another lettering item already uses (a kit keeps one look), else the catalogue's first for this use.
  const used = design.layers.find((l): l is TextLike => (l.kind === "text" || l.kind === "number") && (l.role === "player-name" || l.role === "player-number" || l.role === "team-name") && (role === "player-number") === (l.role === "player-number"));
  const font = (used && api.fonts.fonts.find((f) => f.id === used.fontId)) ?? api.fonts.fonts.find((f) => f.uses.includes(use)) ?? api.fonts.fonts[0]!;
  return { fontId: font.id, fill: teamColourValue(design, "second") };
}

/** Applies an edit to every layer of some roles, as one step. */
function forRoles(roles: ValueRole[], edit: (d: DesignDocument, layer: TextLike) => DesignDocument) {
  return (d: DesignDocument) => roles.flatMap((r) => roleLayers(d, r)).reduce((acc, layer) => edit(acc, acc.layers.find((l) => l.id === layer.id) as TextLike), d);
}

/** The style controls (4.5): font, colour, outline, size, for one or more roles. */
function StyleControls({ roles, fontRoles, onFonts }: { roles: ValueRole[]; fontRoles: Array<{ role: ValueRole; label: string }>; onFonts: (role: ValueRole) => void }) {
  const api = useEditor();
  const { design, wording, palette, product } = api;
  const w = wording.lettering;
  const layer = roles.flatMap((r) => roleLayers(design, r))[0];
  if (!layer) return null;
  const step = outlineStepOf(layer);
  const shownStep: "none" | "thin" | "thick" = step === null ? "none" : step === "thick" ? "thick" : "thin";
  const size = sizeStepOf(product, layer);
  const outlineRole = layer.outline?.color.teamColor ?? null;
  const commit = (edit: (d: DesignDocument, l: TextLike) => DesignDocument, label: EditLabel) => api.commit(forRoles(roles, edit), label);
  const colourFor = (d: DesignDocument, l: TextLike): ColorValue => {
    if (l.outline) return l.outline.color.teamColor && d.teamColors[l.outline.color.teamColor] ? teamColourValue(d, l.outline.color.teamColor) : l.outline.color;
    const background = itemReadability(product, d, l.id)?.background;
    if (!background) return teamColourValue(d, "main");
    const team = outlineColourFor(d, l.fill, background);
    // A team colour that shows round the letters and on the garment; else the palette's best (a red and white
    // team with white letters on red: neither team colour would show).
    if (team.ratio >= MIN_OUTLINE_CONTRAST) return teamColourValue(d, team.role);
    let best = { colour: teamColourValue(d, team.role) as ColorValue, ratio: team.ratio };
    for (const c of palette.colors) {
      const ratio = Math.min(contrastRatio(c.hex, l.fill.hex), contrastRatio(c.hex, background.colour.hex));
      if (ratio > best.ratio) best = { colour: paletteColourRef(c), ratio };
    }
    return best.colour;
  };
  const setStep = (value: "none" | "thin" | "thick") =>
    commit((d, l) => setOutline(d, l.id, value === "none" ? null : { step: value as OutlineStep, color: colourFor(d, l) }, { product }), "outline");
  const roleSwatches = (current: ColorValue | undefined, onPick: (role: TeamColourRole) => void, prefix: string) =>
    TEAM_COLOUR_ROLES.filter((r) => design.teamColors[r]).map((r) => {
      const c = design.teamColors[r]!;
      const name = `${wording.colours.roles[r]}: ${colourName(palette, c)}`;
      const selected = current?.teamColor === r;
      return <Swatch key={r} hex={c.hex} label={selected ? fill(wording.colours.selected, { colour: name }) : name} selected={selected} onPick={() => onPick(r)} testId={`${prefix}-team-${r}`} />;
    });

  return (
    <section className="fmo-section" aria-label={w.style}>
      <span className="fmo-label">{w.style}</span>
      {fontRoles.map(({ role, label }) => {
        const l = roleLayers(design, role)[0];
        const font = l && api.fonts.fonts.find((f) => f.id === l.fontId);
        if (!l) return null;
        return (
          <button key={role} type="button" className="fmo-btn fmo-btn-block fmo-font-button" onClick={() => onFonts(role)} data-testid={`font-${role}`}>
            <span>{label}</span>
            <span style={{ fontFamily: font ? `"${font.family}"` : undefined, fontWeight: font?.weight }}>{font?.name ?? l.fontId}</span>
          </button>
        );
      })}
      <div>
        <span className="fmo-label">{w.colour}</span>
        <div className="fmo-scroll-row">
          {roleSwatches(layer.fill, (r) => commit((d, l) => updateLayer(d, l.id, { fill: teamColourValue(d, r) }, { product }), "colour"), `fill-${roles[0]}`)}
          <span className="fmo-divider" />
          {coloursCommonFirst(palette)
            .slice(0, 8)
            .map((c) => {
              const selected = layer.fill.id === c.id && !layer.fill.teamColor;
              return <Swatch key={c.id} hex={c.hex} label={selected ? fill(wording.colours.selected, { colour: c.name }) : c.name} selected={selected} onPick={() => commit((d, l) => updateLayer(d, l.id, { fill: paletteColourRef(c) }, { product }), "colour")} testId={`fill-${roles[0]}-${c.id}`} />;
            })}
        </div>
      </div>
      <div>
        <span className="fmo-label">{w.outline}</span>
        <Segmented
          label={w.outline}
          value={shownStep}
          options={[
            { value: "none", label: w.outlineSteps.none },
            { value: "thin", label: w.outlineSteps.thin },
            { value: "thick", label: w.outlineSteps.thick },
          ]}
          onChange={setStep}
          testId={`outline-${roles[0]}`}
        />
      </div>
      {layer.outline && (
        <div>
          <span className="fmo-label">{w.outlineColour}</span>
          <div className="fmo-swatches">
            {roleSwatches(outlineRole ? { ...layer.outline.color } : undefined, (r) => commit((d, l) => setOutline(d, l.id, { step: outlineStepOf(l) ?? "thin", color: teamColourValue(d, r) }, { product }), "outline"), `outline-${roles[0]}`)}
            <span className="fmo-divider" />
            {coloursCommonFirst(palette)
              .slice(0, 6)
              .map((c) => {
                const selected = !outlineRole && layer.outline?.color.id === c.id;
                return <Swatch key={c.id} hex={c.hex} label={selected ? fill(wording.colours.selected, { colour: c.name }) : c.name} selected={selected} onPick={() => commit((d, l) => setOutline(d, l.id, { step: outlineStepOf(l) ?? "thin", color: paletteColourRef(c) }, { product }), "outline")} testId={`outline-${roles[0]}-${c.id}`} />;
              })}
          </div>
        </div>
      )}
      {size !== null && (
        <div>
          <span className="fmo-label">{w.size}</span>
          <Segmented
            label={w.size}
            value={size}
            options={(["small", "medium", "large"] as SizeStep[]).map((s) => ({ value: s, label: w.sizeSteps[s] }))}
            onChange={(s) => commit((d, l) => (l.preset ? setSizeStep(d, l.id, s, { product }) : d), "size")}
            testId={`size-${roles[0]}`}
          />
        </div>
      )}
    </section>
  );
}

/** The font list (4.5.1): each font showing the coach's own text, inside the panel with a Back row. */
function FontList({ role, sample, onBack }: { role: ValueRole; sample: string; onBack: () => void }) {
  const api = useEditor();
  const { design, fonts, wording, product } = api;
  const use = role === "player-number" ? "number" : "text";
  const current = roleLayers(design, role)[0]?.fontId;
  const arabic = /\p{Script=Arabic}/u.test(sample);
  return (
    <>
      <div className="fmo-back-row">
        <button type="button" onClick={onBack} data-testid="back">
          {wording.tools.back}
        </button>
      </div>
      <div role="radiogroup" aria-label={wording.lettering.font}>
        {fonts.fonts
          .filter((f) => f.uses.includes(use))
          .map((f) => {
            const fallback = f.fallbackFontIds.map((id) => fonts.fonts.find((x) => x.id === id)).find((x) => x?.scripts.includes("arabic"));
            const latinOnly = arabic && !f.scripts.includes("arabic");
            return (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={current === f.id}
                className="fmo-font-row"
                onClick={() => {
                  api.commit((d) => roleLayers(d, role).reduce((acc, l) => updateLayer(addCatalogFont(acc, fonts, f.id), l.id, { fontId: f.id }, { product }), d), "font");
                  onBack();
                }}
                data-testid={`font-option-${f.id}`}
              >
                <span className="fmo-muted">
                  {f.name} {current === f.id && <EditorIcon name="check" size={16} />}
                </span>
                <span className="fmo-font-sample fmo-bdi" dir="auto" style={{ fontFamily: `"${f.family}"${fallback ? `, "${fallback.family}"` : ""}`, fontWeight: f.weight }}>
                  {sample}
                </span>
                {latinOnly && fallback && <span className="fmo-muted">{fill(wording.lettering.latinOnly, { font: fallback.name })}</span>}
              </button>
            );
          })}
      </div>
    </>
  );
}

/** "Hard to read on Navy." with the one-tap fix (4.5, N15), for the items of some roles. */
function ReadabilityWarnings({ roles }: { roles: ValueRole[] }) {
  const api = useEditor();
  const { design, product, palette, wording } = api;
  // Computed once per design (the panel re-renders often; this samples every colour under every item).
  const roleKey = roles.join(",");
  const coachColoured = api.coachColoured;
  const warnings = useMemo(() => readabilityWarnings(wording, product, design, palette, roleKey.split(",") as ValueRole[], coachColoured), [wording, product, design, palette, roleKey, coachColoured]);
  if (warnings.length === 0) return null;
  return (
    <>
      {warnings.map(({ text, layerIds, remedy, readability: r }) => {
        const fixLabel = remedyWords(wording, palette, remedy);
        return (
          <Alert key={r.layerId} kind="warning" testId={`readability-${r.layerId}`}>
            <p>{text}</p>
            <button
              type="button"
              className="fmo-btn"
              onClick={() =>
                api.commit((d) => applyReadabilityRemedy(d, layerIds, remedy, { product }), remedy.kind === "outline" ? "outline" : "colour")
              }
              data-testid={`readability-fix-${r.layerId}`}
            >
              {fixLabel}
            </button>
          </Alert>
        );
      })}
    </>
  );
}

/** A text field for a role value: one undo step per visit, the model changes on every key, the camera frames the item. */
function ValueField({
  label,
  value,
  onType,
  label2,
  layerId,
  placeholder,
  numeric,
  error,
  note,
  testId,
  editLabel,
}: {
  label: string;
  value: string;
  onType: (value: string) => void;
  label2?: ReactNode;
  layerId: string | null;
  placeholder?: string;
  numeric?: boolean;
  error?: string | null;
  note?: string | null;
  testId: string;
  editLabel: EditLabel;
}) {
  const api = useEditor();
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div data-keep-typing>
      <label className="fmo-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="fmo-field"
        dir={numeric ? "ltr" : "auto"}
        inputMode={numeric ? "numeric" : "text"}
        autoComplete="off"
        maxLength={numeric ? 4 : 60}
        enterKeyHint="done"
        placeholder={placeholder}
        value={draft ?? value}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : note ? `${id}-note` : undefined}
        onFocus={() => {
          api.begin(editLabel);
          api.setTyping(layerId);
        }}
        onBlur={() => {
          api.end();
          api.setTyping(null);
          setDraft(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        onChange={(e) => {
          setDraft(e.target.value);
          onType(e.target.value);
        }}
        data-testid={testId}
      />
      {label2}
      {error && (
        <p className="fmo-field-error" id={`${id}-error`} role="alert" data-testid={`${testId}-error`}>
          <EditorIcon name="alert" size={18} />
          {error}
        </p>
      )}
      {!error && note && (
        <p className="fmo-muted" id={`${id}-note`} data-testid={`${testId}-note`}>
          {note}
        </p>
      )}
    </div>
  );
}

export function TeamTool() {
  const api = useEditor();
  const { design, product, wording } = api;
  const w = wording.lettering;
  const [fonts, setFonts] = useState<ValueRole | null>(null);
  const layers = roleLayers(design, "team-name");
  const at = layers[0]?.preset ?? null;
  const playerNameOn = isRoleSlotOn(design, "player-name", "back-name");
  const presets = presetsFor(product, "team-name").filter((p) => !(p.id === "back-name" && playerNameOn && at !== "back-name"));
  if (fonts) return <FontList role={fonts} sample={design.teamName || w.teamName} onBack={() => setFonts(null)} />;

  const place = (preset: PlacementPreset) => {
    const ok = api.commit((d) => {
      const current = roleLayers(d, "team-name");
      if (current.length === 0) return setRoleSlot(d, "team-name", preset.id, true, { product, fonts: api.fonts, style: defaultStyle(api, d, "team-name") });
      let next = placeAtPreset(d, current[0]!.id, preset.id, { product });
      for (const extra of current.slice(1)) next = { ...next, layers: next.layers.filter((l) => l.id !== extra.id) };
      return next;
    }, "placement");
    if (ok) api.showSide(preset.side);
  };
  const off = () => api.commit((d) => roleLayers(d, "team-name").reduce((acc, l) => (l.preset ? setRoleSlot(acc, "team-name", l.preset, false, { product }) : acc), d), "placement");

  return (
    <>
      <ValueField label={w.teamName} value={design.teamName} placeholder={wording.start.namePlaceholder} layerId={layers[0]?.id ?? null} onType={(v) => api.preview((d) => setTeamName(d, v))} testId="team-name" editLabel="team-name" />
      <div>
        <span className="fmo-label">{w.where}</span>
        <PresetChips product={product} presets={presets} current={at} words={(p) => presetWords(wording, p)} onPick={place} offLabel={w.off} onOff={off} testIdPrefix="team-where" />
      </div>
      <ReadabilityWarnings roles={["team-name"]} />
      <StyleControls roles={["team-name"]} fontRoles={[{ role: "team-name", label: w.font }]} onFonts={setFonts} />
    </>
  );
}

export function PlayersTool() {
  const api = useEditor();
  const { design, product, wording, textFits } = api;
  const w = wording.lettering;
  const [fonts, setFonts] = useState<ValueRole | null>(null);
  const [numberError, setNumberError] = useState<string | null>(null);
  const nameLayer = roleLayers(design, "player-name")[0];
  const numberLayer = roleLayers(design, "player-number")[0];
  const shrunk = textFits.some((f) => f.role === "player-name" && f.shrunk);
  const digits = digitChoiceOf(design.samplePlayer.number);
  if (fonts) return <FontList role={fonts} sample={fonts === "player-number" ? design.samplePlayer.number || w.sampleNumber : design.samplePlayer.name || w.sampleName} onBack={() => setFonts(null)} />;

  const typeNumber = (value: string) => {
    const error = numberFieldError(value);
    setNumberError(error ? numberErrorText(wording, error) : null);
    // The model keeps the last good number; no error ever reaches it.
    if (!error) api.preview((d) => setSamplePlayer(d, { number: value }));
  };

  return (
    <>
      <p className="fmo-muted">{w.fromTeamList}</p>
      <span className="fmo-label" data-keep-typing>
        {w.previewAs}
      </span>
      <div className="fmo-fields" data-keep-typing>
        <ValueField label={w.playerName} value={design.samplePlayer.name} placeholder={w.sampleName} layerId={nameLayer?.id ?? null} onType={(v) => api.preview((d) => setSamplePlayer(d, { name: v }))} note={shrunk ? w.shrunk : null} testId="player-name" editLabel="player-name" />
        <ValueField label={w.number} value={design.samplePlayer.number} placeholder={w.sampleNumber} numeric layerId={numberLayer?.id ?? null} onType={typeNumber} error={numberError} testId="player-number" editLabel="player-number" />
      </div>
      <section className="fmo-section" aria-label={w.onTheShirt}>
        <span className="fmo-label">{w.onTheShirt}</span>
        {playerSwitches(product, wording).map((s) => (
          <SwitchRow
            key={`${s.role}-${s.preset.id}`}
            label={s.label}
            checked={isRoleSlotOn(design, s.role, s.preset.id)}
            onChange={(on) => {
              if (api.commit((d) => setRoleSlot(d, s.role, s.preset.id, on, { product, fonts: api.fonts, style: defaultStyle(api, d, s.role) }), "slot") && on) api.showSide(s.preset.side);
            }}
            testId={`slot-${s.preset.id}`}
          />
        ))}
      </section>
      <ReadabilityWarnings roles={["player-name", "player-number"]} />
      <StyleControls
        roles={["player-name", "player-number"]}
        fontRoles={[
          { role: "player-name", label: w.nameFont },
          { role: "player-number", label: w.numberFont },
        ]}
        onFonts={setFonts}
      />
      {numberLayer && (
        <div>
          <span className="fmo-label">{w.digits}</span>
          <Segmented<DigitChoice>
            label={w.digits}
            value={digits}
            options={[
              { value: "western", label: w.digitSystems.western },
              { value: "arabic-indic", label: w.digitSystems["arabic-indic"] },
            ]}
            onChange={(to) => api.commit((d) => setSamplePlayer(d, { number: convertDigits(d.samplePlayer.number, to) }), "player-number")}
            testId="digits"
          />
        </div>
      )}
    </>
  );
}
