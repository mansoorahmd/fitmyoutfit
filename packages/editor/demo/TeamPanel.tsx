/**
 * The demo's plain controls for the E3a engine: team colours and swap,
 * templates with their thumbnails, the team name and a sample player, the
 * role slots at their presets, outlines and sizes, readability, long names
 * and the colour-code match. Developer labels only: the real interface (and
 * its wording) is the next task. Every control calls one engine function and
 * commits one history step with its label.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  TEAM_COLOUR_ROLES,
  applyTemplate,
  checkJerseyNumber,
  coloursByFamily,
  designReadability,
  drawTemplateThumbnail,
  findLayers,
  isRoleSlotOn,
  itemReadability,
  outlineColourFor,
  matchColourCode,
  outlineStepOf,
  paletteColourRef,
  placeAtPreset,
  readabilityFix,
  setOutline,
  setRoleSlot,
  setSamplePlayer,
  setSizeStep,
  setTeamColor,
  setTeamName,
  setZoneColor,
  sizeStepOf,
  swapTeamColors,
  teamColourValue,
  type AssetImageLookup,
  type DesignDocument,
  type EditLabel,
  type FontCatalog,
  type LetteringStyle,
  type OutlineStep,
  type Palette,
  type ProductDefinition,
  type SizeStep,
  type Template,
  type TeamColourRole,
  type TextFit,
  type ValueRole,
} from "../src";

export interface TeamPanelProps {
  product: ProductDefinition;
  design: DesignDocument;
  palette: Palette;
  fonts: FontCatalog;
  templates: Template[];
  textFits: TextFit[];
  images: AssetImageLookup;
  /** Bumped when fonts or images arrive, so thumbnails redraw. */
  version: number;
  commitEdit: (edit: (current: DesignDocument) => DesignDocument, label: EditLabel) => boolean;
  previewEdit: (edit: (current: DesignDocument) => DesignDocument) => void;
  begin: (label: EditLabel) => void;
  end: () => void;
}

const ROLE_NAMES: Record<TeamColourRole, string> = { main: "Main", second: "Second", accent: "Accent" };

/** The style a role slot gets when no layer of its role is on the kit to copy, and no template sets one. */
function defaultStyle(design: DesignDocument, role: ValueRole): LetteringStyle {
  return { fontId: role === "player-number" ? "graduate-400" : "oswald-700", fill: teamColourValue(design, "second") };
}

function TemplateCard({ product, design, template, fonts, previous, images, version, current, onPick }: {
  product: ProductDefinition;
  design: DesignDocument;
  template: Template;
  fonts: FontCatalog;
  previous: Template | null;
  images: AssetImageLookup;
  version: number;
  current: boolean;
  onPick: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    try {
      drawTemplateThumbnail(ctx, product, design, template, { fonts, previous, width: 120, height: 150, images });
    } catch (error) {
      console.error(error);
    }
  }, [product, design, template, fonts, previous, images, version]);
  return (
    <button type="button" className={current ? "template-card current" : "template-card"} onClick={onPick} aria-pressed={current} data-testid={`template-${template.id}`}>
      <canvas ref={ref} width={120} height={150} />
      <span>{template.name}{current ? " (current)" : ""}</span>
    </button>
  );
}

export function TeamPanel(props: TeamPanelProps) {
  const { product, design, palette, fonts, templates, textFits, images, version, commitEdit, previewEdit, begin, end } = props;
  const [teamRole, setTeamRole] = useState<TeamColourRole>("main");
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [playerDraft, setPlayerDraft] = useState<string | null>(null);
  const [numberDraft, setNumberDraft] = useState<string | null>(null);
  const [numberError, setNumberError] = useState<string | null>(null);
  const [code, setCode] = useState("#1A5FB4");
  const [codeZone, setCodeZone] = useState(product.zones[0]!.id);
  const previous = templates.find((t) => t.id === design.template?.id) ?? null;
  const families = useMemo(() => coloursByFamily(palette), [palette]);
  const match = code.trim() === "" ? null : matchColourCode(palette, code);
  const readability = designReadability(product, design);
  const shrunk = textFits.filter((f) => f.shrunk);
  const has = (presetId: string) => product.placements.some((p) => p.id === presetId);
  const sleevePreset = product.placements.find((p) => p.roles.includes("player-number") && (p.side === "left" || p.side === "right"));

  const slot = (role: ValueRole, presetId: string, on: boolean) =>
    commitEdit((d) => setRoleSlot(d, role, presetId, on, { product, fonts, style: defaultStyle(d, role) }), "slot");

  const teamNameAt = findLayers(design, { role: "team-name" }).map((l) => l.preset);
  const whereTeamName = (presetId: string | null) =>
    commitEdit((d) => {
      const current = findLayers(d, { role: "team-name" });
      if (presetId === null) return current.reduce((acc, l) => (l.preset ? setRoleSlot(acc, "team-name", l.preset, false, { product }) : acc), d);
      if (current.length === 0) return setRoleSlot(d, "team-name", presetId, true, { product, fonts, style: defaultStyle(d, "team-name") });
      return current.reduce((acc, l) => placeAtPreset(acc, l.id, presetId, { product }), d);
    }, "placement");

  const roleOutline = (role: ValueRole, step: OutlineStep | null, colour: TeamColourRole) =>
    commitEdit((d) => findLayers(d, { role }).reduce((acc, l) => setOutline(acc, l.id, step ? { step, color: teamColourValue(acc, colour) } : null, { product }), d), "outline");
  const roleSize = (role: ValueRole, step: SizeStep) =>
    commitEdit((d) => findLayers(d, { role }).reduce((acc, l) => (l.preset ? setSizeStep(acc, l.id, step, { product }) : acc), d), "size");

  return (
    <section className="team-panel" data-testid="team-panel">
      <h2>Team colours</h2>
      <div className="row">
        {TEAM_COLOUR_ROLES.map((role) => {
          const c = design.teamColors[role];
          return (
            <button key={role} type="button" className="team-slot" aria-pressed={teamRole === role} onClick={() => setTeamRole(role)} data-testid={`team-${role}`}>
              <span className="zone-chip" style={{ background: c?.hex ?? "transparent" }} /> {ROLE_NAMES[role]}: {c ? (palette.colors.find((p) => p.id === c.id)?.name ?? c.id) : "none"}
              {c?.requested ? ` (from ${c.requested})` : ""}
            </button>
          );
        })}
        <button type="button" onClick={() => commitEdit((d) => swapTeamColors(d), "swap-team-colours")} data-testid="swap">
          Swap Main and Second
        </button>
        {design.teamColors.accent && (
          <button type="button" onClick={() => commitEdit((d) => setTeamColor(d, "accent", null), "team-colour")}>
            No accent
          </button>
        )}
      </div>
      <div className="swatches" role="group" aria-label={`Colour for ${ROLE_NAMES[teamRole]}`}>
        {palette.common.map((id) => palette.colors.find((c) => c.id === id)!).map((c) => (
          <button key={c.id} type="button" className="swatch small" title={c.name} aria-label={`${ROLE_NAMES[teamRole]}: ${c.name}`} aria-pressed={design.teamColors[teamRole]?.id === c.id} style={{ background: c.hex }} onClick={() => commitEdit((d) => setTeamColor(d, teamRole, paletteColourRef(c)), "team-colour")} data-testid={`team-swatch-${c.id}`} />
        ))}
      </div>

      {templates.length > 0 && (
        <>
          <h2>Designs (templates)</h2>
          <div className="templates" data-testid="templates">
            {templates.map((t) => (
              <TemplateCard key={t.id} product={product} design={design} template={t} fonts={fonts} previous={previous} images={images} version={version} current={design.template?.id === t.id} onPick={() => commitEdit((d) => applyTemplate(d, t, { product, fonts, previous: templates.find((x) => x.id === d.template?.id) ?? null }), "template")} />
            ))}
          </div>
        </>
      )}

      <h2>Team</h2>
      <label className="row">
        <span>Team name</span>
        <input
          dir="auto"
          value={nameDraft ?? design.teamName}
          onFocus={() => begin("team-name")}
          onBlur={() => {
            end();
            setNameDraft(null);
          }}
          onChange={(e) => {
            setNameDraft(e.target.value);
            previewEdit((d) => setTeamName(d, e.target.value));
          }}
          data-testid="team-name"
        />
      </label>
      <div className="row">
        <span>Where</span>
        <div className="segmented">
          {has("chest-centre") && <button type="button" aria-pressed={teamNameAt.includes("chest-centre")} onClick={() => whereTeamName("chest-centre")} data-testid="team-name-chest">Chest</button>}
          {has("upper-back") && <button type="button" aria-pressed={teamNameAt.includes("upper-back")} onClick={() => whereTeamName("upper-back")} data-testid="team-name-upper-back">Upper back</button>}
          <button type="button" aria-pressed={teamNameAt.length === 0} onClick={() => whereTeamName(null)} data-testid="team-name-off">Off</button>
        </div>
      </div>

      <h2>Players (sample player)</h2>
      <label className="row">
        <span>Name</span>
        <input
          dir="auto"
          value={playerDraft ?? design.samplePlayer.name}
          onFocus={() => begin("player-name")}
          onBlur={() => {
            end();
            setPlayerDraft(null);
          }}
          onChange={(e) => {
            setPlayerDraft(e.target.value);
            previewEdit((d) => setSamplePlayer(d, { name: e.target.value }));
          }}
          data-testid="player-name"
        />
      </label>
      <label className="row">
        <span>Number</span>
        <input
          dir="ltr"
          inputMode="numeric"
          value={numberDraft ?? design.samplePlayer.number}
          onFocus={() => begin("player-number")}
          onBlur={() => {
            end();
            setNumberDraft(null);
            setNumberError(null);
          }}
          onChange={(e) => {
            const value = e.target.value;
            setNumberDraft(value);
            const rule = checkJerseyNumber(value);
            setNumberError(rule.ok ? null : rule.error);
            if (rule.ok) previewEdit((d) => setSamplePlayer(d, { number: value }));
          }}
          data-testid="player-number"
        />
      </label>
      {numberError && <p className="msg msg-error">{numberError}</p>}
      <div className="row switches">
        {[
          ["player-name", "back-name", "Name on back"],
          ["player-number", "back-number", "Number on back"],
          ["player-number", "front-number", "Number on front"],
          ...(sleevePreset ? [["player-number", sleevePreset.id, "Number on sleeve"]] : []),
        ]
          .filter(([, preset]) => has(preset!))
          .map(([role, preset, label]) => {
            const on = isRoleSlotOn(design, role as ValueRole, preset!);
            return (
              <label key={preset} className="switch">
                <input type="checkbox" checked={on} onChange={() => slot(role as ValueRole, preset!, !on)} data-testid={`slot-${preset}`} /> {label}
              </label>
            );
          })}
      </div>

      <h2>Lettering style</h2>
      {(["team-name", "player-name", "player-number"] as ValueRole[]).map((role) => {
        const layer = findLayers(design, { role })[0];
        if (!layer || (layer.kind !== "text" && layer.kind !== "number")) return null;
        const step = outlineStepOf(layer);
        // No outline yet: the team colour that stands out from both the letters and the garment.
        const background = itemReadability(product, design, layer.id)?.background;
        const colour = layer.outline?.color.teamColor ?? (background ? outlineColourFor(design, layer.fill, background).role : "main");
        const size = sizeStepOf(product, layer);
        return (
          <div key={role} className="row" data-testid={`style-${role}`}>
            <span>{role}</span>
            <div className="segmented" role="group" aria-label={`Outline of ${role}`}>
              {([null, "thin", "medium", "thick"] as const).map((s) => (
                <button key={s ?? "none"} type="button" aria-pressed={step === s} onClick={() => roleOutline(role, s, colour)} data-testid={`outline-${role}-${s ?? "none"}`}>
                  {s ?? "none"}
                </button>
              ))}
            </div>
            <select value={colour} onChange={(e) => step && roleOutline(role, step, e.target.value as TeamColourRole)} aria-label={`Outline colour of ${role}`}>
              {TEAM_COLOUR_ROLES.filter((r) => design.teamColors[r]).map((r) => (
                <option key={r} value={r}>
                  outline {ROLE_NAMES[r]}
                </option>
              ))}
            </select>
            <div className="segmented" role="group" aria-label={`Size of ${role}`}>
              {(["small", "medium", "large"] as SizeStep[]).map((s) => (
                <button key={s} type="button" aria-pressed={size === s} onClick={() => roleSize(role, s)}>
                  {s[0]!.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      <h2>Readability (3:1) and long names</h2>
      <ul className="plain-list" data-testid="readability">
        {readability.map((r) => {
          const layer = design.layers.find((l) => l.id === r.layerId)!;
          const fix = readabilityFix(design, r.background);
          return (
            <li key={r.layerId} className={r.passes ? "" : "msg msg-warning"}>
              {layer.role} on {r.background.kind === "zone" ? `zone ${r.background.zoneId}` : `shape ${r.background.group}`}: {r.ratio.toFixed(2)}:1
              {r.outlineRatio !== null && `, outline ${r.outlineRatio.toFixed(2)}:1`} {r.passes ? "passes" : "HARD TO READ"}
              {!r.passes && (
                <button type="button" onClick={() => commitEdit((d) => setOutline(d, r.layerId, { step: "thin", color: teamColourValue(d, fix.role) }, { product }), "outline")}>
                  Add outline ({ROLE_NAMES[fix.role]})
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="note" data-testid="text-fits">
        {shrunk.length === 0 ? "No line is shrunk to fit." : shrunk.map((f) => `${f.role} shrunk to ${Math.round(f.scale * 100)}%`).join("; ")}
      </p>

      <h2>Colour code</h2>
      <div className="row">
        <input value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" aria-label="Colour code" data-testid="colour-code" />
      </div>
      {match && !match.ok && <p className="msg msg-error" data-testid="colour-code-error">{match.error}</p>}
      {match && match.ok && (
        <div className="code-match" data-testid="colour-code-result">
          <div className="code-chip">
            <span style={{ background: match.requested }} />
            You entered {match.requested}
          </div>
          <div className="code-chip">
            <span style={{ background: match.colour.hex }} />
            Printed: {match.colour.name} {match.colour.hex}
          </div>
          <p>
            CIEDE2000 difference {match.deltaE.toFixed(2)}: <strong>{match.match}</strong>
          </p>
          <div className="row">
            <select value={codeZone} onChange={(e) => setCodeZone(e.target.value)} aria-label="Zone for the matched colour">
              {product.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => commitEdit((d) => setZoneColor(d, codeZone, match.value, { product }), "zone-colour")} data-testid="use-code-zone">
              Use for zone
            </button>
            <button type="button" onClick={() => commitEdit((d) => setTeamColor(d, teamRole, match.value), "team-colour")} data-testid="use-code-team">
              Use for {ROLE_NAMES[teamRole]}
            </button>
          </div>
        </div>
      )}
      <p className="note">
        Palette: {palette.colors.length} colours in {families.length} families, {palette.printTested ? "print-tested" : "NOT print-tested (placeholder)"}.
      </p>
    </section>
  );

}

