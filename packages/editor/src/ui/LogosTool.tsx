/**
 * Logos and Text: the simple panels of E3a (06-editor.md 4.6, 4.7), so
 * nothing the old developer demo could do is lost. A coach picks an image
 * file; the upload checks run; a refusal is said in the coach's words; an
 * accepted logo is placed at a preset (the first on the left chest) and can be
 * moved between presets or removed. Text adds a line of free text at a preset.
 *
 * E3b CONTINUES HERE: the full Logos flow (the logo card with Replace, the
 * size stepper, "Make it sharp", the resolution warning and its badge, Keep
 * it and the design-help link, drop-zone polish) and the full Text tool
 * (style, alignment, several lines in "On this kit") replace these panels.
 */
import { useId, useRef, useState } from "react";
import { addCatalogFont } from "../design/font-catalog.js";
import { addLayer, removeLayer, updateLayer } from "../design/edit.js";
import { newLogoLayer, newTextLayer, nextLayerId } from "../design/new-layers.js";
import { normalizeText } from "../design/text.js";
import { placeAtPreset } from "../design/roles.js";
import type { DesignDocument, ItemRole, Layer, PlacementPreset } from "../design/schema.js";
import { teamColourValue } from "../design/team-colours.js";
import type { UploadIssue } from "../design/upload-checks.js";
import { LOGO_MEDIA_TYPES } from "../design/schema.js";
import { uploadLogo } from "../upload/logo-upload.js";
import { fill, presetWords } from "./content.js";
import { useEditor } from "./context.js";
import { EditorIcon } from "./icons.js";
import { presetsFor } from "./lettering.js";
import { Alert, PresetChips } from "./parts.js";
import { uploadRefusal, uploadRefusalText, uploadWarningTexts } from "./upload-wording.js";

/** Where the next item of a role goes: the first of these presets that is free (nothing there yet). */
export function nextFreePreset(design: Pick<DesignDocument, "layers">, presets: PlacementPreset[], order: string[]): PlacementPreset | null {
  const used = new Set(design.layers.map((l) => l.preset).filter(Boolean));
  const ordered = [...order.map((id) => presets.find((p) => p.id === id)).filter((p): p is PlacementPreset => Boolean(p)), ...presets];
  return ordered.find((p) => !used.has(p.id)) ?? ordered[0] ?? null;
}

/** The usual order of logos on club kits (06-editor.md 4.6): crest on the left chest, then a sponsor, then the upper back. */
export const LOGO_ORDER = ["left-chest", "chest-centre", "right-chest", "upper-back", "lower-back", "sleeve-left", "sleeve-right"];
/** Free text: a motto low on the back first, then the upper back (4.7). */
export const TEXT_ORDER = ["lower-back", "upper-back"];

function ItemWhere({ layer, role }: { layer: Layer; role: ItemRole }) {
  const api = useEditor();
  const { product, wording } = api;
  return (
    <PresetChips
      product={product}
      presets={presetsFor(product, role)}
      current={layer.preset ?? null}
      words={(p) => presetWords(wording, p)}
      onPick={(p) => {
        if (api.commit((d) => placeAtPreset(d, layer.id, p.id, { product }), "placement")) api.showSide(p.side);
      }}
      testIdPrefix={`where-${layer.id}`}
    />
  );
}

export function LogosTool() {
  const api = useEditor();
  const { design, product, wording, assets } = api;
  const w = wording.logos;
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [refusal, setRefusal] = useState<{ text: string; retry: File | null } | null>(null);
  const [warnings, setWarnings] = useState<Record<string, string[]>>({});
  const logos = design.layers.filter((l): l is Extract<Layer, { kind: "logo" }> => l.kind === "logo");
  const pointer = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;

  const handle = async (file: File) => {
    setBusy(true);
    setRefusal(null);
    let networkFailed = false;
    try {
      const head = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
      const result = await uploadLogo(file, {
        upload: async (request) => {
          try {
            return await assets.upload(request);
          } catch (error) {
            networkFailed = true;
            throw error;
          }
        },
      });
      if (!result.ok) {
        const kind = uploadRefusal(result.issues, { head, size: file.size, networkFailed });
        setRefusal({ text: uploadRefusalText(wording, kind ?? "damaged", file.name, file.size), retry: networkFailed ? file : null });
        return;
      }
      const presets = presetsFor(product, logos.length === 0 ? "crest" : "sponsor");
      const preset = nextFreePreset(api.design, presets.filter((p) => !(p.id === "chest-centre" && api.design.layers.some((l) => l.role === "team-name" && l.preset === "chest-centre"))), LOGO_ORDER);
      const layerId = nextLayerId(api.design, "logo");
      const role = logos.length === 0 ? "crest" : "sponsor";
      const ok = api.commit((d) => addLayer(d, newLogoLayer(product, { id: layerId, preset: preset?.id, pieceId: preset ? undefined : product.views.front, role, asset: result.asset }), { product }), "add-item");
      if (ok) {
        setWarnings((all) => ({ ...all, [result.asset.assetId]: uploadWarningTexts(wording, result.issues as UploadIssue[]) }));
        api.showSide(preset?.side ?? "front");
      }
    } catch {
      setRefusal({ text: uploadRefusalText(wording, "damaged", file.name, file.size), retry: null });
    } finally {
      setBusy(false);
    }
  };

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void handle(file);
  };

  return (
    <>
      {refusal && (
        <Alert kind="error" role="alert" focus testId="logo-error">
          <p>{refusal.text}</p>
          {refusal.retry && (
            <button type="button" className="fmo-btn" onClick={() => void handle(refusal.retry!)}>
              {w.tryAgain}
            </button>
          )}
        </Alert>
      )}
      {logos.map((logo) => {
        const name = assets.fileName?.(logo.asset.assetId) || w.yourLogo;
        const url = assets.url(logo.asset);
        return (
          <div key={logo.id} className="fmo-item" data-testid={`logo-${logo.id}`}>
            <div className="fmo-item-head">
              {url ? <img src={url} alt="" /> : <EditorIcon name="logos" />}
              <span className="fmo-item-name fmo-bdi" dir="auto">
                {fill(w.logoName, { file: name })}
              </span>
              <button type="button" className="fmo-btn fmo-btn-text" onClick={() => api.commit((d) => removeLayer(d, logo.id), "remove-item")} data-testid={`remove-${logo.id}`}>
                {w.remove}
              </button>
            </div>
            <span className="fmo-label">{w.where}</span>
            <ItemWhere layer={logo} role={logo.role} />
            {(warnings[logo.asset.assetId] ?? []).map((text) => (
              <Alert key={text} kind="warning">
                <p>{text}</p>
                <button type="button" className="fmo-btn" onClick={() => setWarnings((all) => ({ ...all, [logo.asset.assetId]: [] }))}>
                  {w.keepIt}
                </button>
              </Alert>
            ))}
          </div>
        );
      })}
      <input ref={input} id={id} type="file" accept={LOGO_MEDIA_TYPES.join(",")} hidden onChange={(e) => {
        pick(e.target.files);
        e.target.value = "";
      }} data-testid="logo-file" />
      {busy ? (
        <div className="fmo-drop" role="status" aria-live="polite" data-testid="logo-checking">
          <span className="fmo-spinner" aria-hidden="true" />
          <strong>{w.checking}</strong>
        </div>
      ) : (
        <button
          type="button"
          className="fmo-drop"
          data-over={over}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            pick(e.dataTransfer.files);
          }}
          data-testid="logo-add"
        >
          <EditorIcon name={logos.length === 0 ? "logos" : "plus"} size={28} />
          <span>
            <strong>{logos.length === 0 ? w.add : w.addAnother}</strong>
            <span>{w.formats}</span>
            {pointer && <span>{w.drop}</span>}
          </span>
        </button>
      )}
      <p className="fmo-muted">{w.rights}</p>
    </>
  );
}

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

