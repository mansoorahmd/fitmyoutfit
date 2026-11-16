/**
 * Logos (06-editor.md 4.6, 10.4): the drop zone and the file picker; the
 * upload checks, each refusal said in the coach's words (never the engine's);
 * an accepted logo placed at once in the usual place (left chest, then the
 * centre of the chest, then the upper back), selected, with the camera on it.
 * Each logo has its own card: Replace and Remove, Where (presets), Size (a
 * stepper), and the warnings that never block: the "box" of a logo without a
 * transparent background (Keep it), and "May print blurry at this size" with
 * Make it sharp, recomputed live as the logo is resized.
 */
import { useId, useRef, useState } from "react";
import { addLayer, removeLayer } from "../design/edit.js";
import { scaleLayerBy } from "../design/item-edits.js";
import { newLogoLayer, nextLayerId } from "../design/new-layers.js";
import { placeAtPreset } from "../design/roles.js";
import type { DesignDocument, ItemRole, Layer, LogoAssetRef, PlacementPreset } from "../design/schema.js";
import { LOGO_MEDIA_TYPES } from "../design/schema.js";
import type { UploadIssue } from "../design/upload-checks.js";
import { uploadLogo } from "../upload/logo-upload.js";
import { fill, presetWords } from "./content.js";
import { useEditor } from "./context.js";
import { EditorIcon } from "./icons.js";
import { presetsFor } from "./lettering.js";
import { LOGO_ORDER, LOGO_SIZE_STEP, logoIsBlurry, logoSizeLimits, logoSizeWord, makeLogoSharp, nextLogoPreset, replaceLogoAsset, sharpWidth, type LogoLayer } from "./logos.js";
import { Alert, PresetChips } from "./parts.js";
import { isStorageFull, uploadRefusal, uploadRefusalText } from "./upload-wording.js";

export { LOGO_ORDER };
export { TextTool } from "./TextTool.js";

/** Where the next item of a role goes: the first of these presets that is free (nothing there yet). */
export function nextFreePreset(design: Pick<DesignDocument, "layers">, presets: PlacementPreset[], order: string[]): PlacementPreset | null {
  const used = new Set(design.layers.map((l) => l.preset).filter(Boolean));
  const ordered = [...order.map((id) => presets.find((p) => p.id === id)).filter((p): p is PlacementPreset => Boolean(p)), ...presets];
  return ordered.find((p) => !used.has(p.id)) ?? ordered[0] ?? null;
}

/** Free text: a motto low on the back first, then the upper back (4.7). */
export const TEXT_ORDER = ["lower-back", "upper-back"];

/** The "Where" chips for an item (presets for its role); a preset moves it and turns the camera. */
export function ItemWhere({ layer, role }: { layer: Layer; role: ItemRole }) {
  const api = useEditor();
  const { product, wording } = api;
  return (
    <PresetChips
      product={product}
      presets={presetsFor(product, role)}
      current={layer.preset ?? null}
      words={(p) => presetWords(wording, p)}
      onPick={(p) => {
        if (api.commit((d) => placeAtPreset(d, layer.id, p.id, { product }), "placement")) {
          api.select(layer.id);
          api.showSide(p.side);
        }
      }}
      testIdPrefix={`where-${layer.id}`}
    />
  );
}

type Checked = { ok: true; asset: LogoAssetRef; issues: UploadIssue[] } | { ok: false; text: string; retry: File | null };

/** Runs the checks and the host's upload; a refusal comes back in the coach's words. */
function useLogoUpload() {
  const api = useEditor();
  return async (file: File): Promise<Checked> => {
    let networkFailed = false;
    let storageFull = false;
    try {
      const head = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
      const result = await uploadLogo(file, {
        upload: async (request) => {
          try {
            return await api.assets.upload(request);
          } catch (error) {
            // The device's storage full (S4) is told apart from the network.
            if (isStorageFull(error)) storageFull = true;
            else networkFailed = true;
            throw error;
          }
        },
      });
      if (!result.ok) {
        const kind = uploadRefusal(result.issues, { head, size: file.size, networkFailed, storageFull });
        // The engine's message goes to the console for developers; the coach reads the wording.
        console.info("[editor] logo refused:", result.issues.map((i) => `${i.code}: ${i.message}`).join("; "));
        return { ok: false, text: uploadRefusalText(api.wording, kind ?? "damaged", file.name, file.size), retry: networkFailed || storageFull ? file : null };
      }
      return { ok: true, asset: result.asset, issues: result.issues };
    } catch (error) {
      console.info("[editor] logo refused:", error);
      return { ok: false, text: uploadRefusalText(api.wording, storageFull ? "storage-full" : networkFailed ? "network" : "damaged", file.name, file.size), retry: networkFailed || storageFull ? file : null };
    }
  };
}

export function LogosTool() {
  const api = useEditor();
  const { design, product, wording } = api;
  const w = wording.logos;
  const input = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replacing = useRef<string | null>(null);
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [refusal, setRefusal] = useState<{ text: string; retry: File | null; replace: string | null } | null>(null);
  const check = useLogoUpload();
  const logos = design.layers.filter((l): l is LogoLayer => l.kind === "logo");
  const pointer = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;

  const noteIssues = (asset: LogoAssetRef, issues: readonly UploadIssue[]) => {
    const box = issues.some((i) => i.severity === "warning" && i.code === "transparency");
    api.setLogoNote(asset.assetId, { box, kept: false });
  };

  const add = async (file: File) => {
    setBusy(true);
    setRefusal(null);
    try {
      const result = await check(file);
      if (!result.ok) {
        setRefusal({ text: result.text, retry: result.retry, replace: null });
        return;
      }
      const current = api.design;
      const role = current.layers.some((l) => l.kind === "logo") ? "sponsor" : "crest";
      // The centre of the chest is the team name's place when it is there: the next free place then.
      const presets = presetsFor(product, role).filter((p) => !(p.id === "chest-centre" && current.layers.some((l) => l.role === "team-name" && l.preset === "chest-centre")));
      const preset = nextLogoPreset(current, presets);
      const layerId = nextLayerId(current, "logo");
      const ok = api.commit((d) => addLayer(d, newLogoLayer(product, { id: layerId, preset: preset?.id, pieceId: preset ? undefined : product.views.front, role, asset: result.asset }), { product }), "add-item");
      if (ok) {
        noteIssues(result.asset, result.issues);
        api.select(layerId);
        api.showSide(preset?.side ?? "front");
      }
    } finally {
      setBusy(false);
    }
  };

  const replace = async (layerId: string, file: File) => {
    setBusy(true);
    setRefusal(null);
    try {
      const result = await check(file);
      if (!result.ok) {
        setRefusal({ text: result.text, retry: result.retry, replace: layerId });
        return;
      }
      if (api.commit((d) => replaceLogoAsset(d, layerId, result.asset, { product }), "add-item")) {
        noteIssues(result.asset, result.issues);
        api.select(layerId);
      }
    } finally {
      setBusy(false);
    }
  };

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void add(file);
  };

  return (
    <>
      {refusal && (
        <Alert kind="error" role="alert" focus testId="logo-error">
          <p>{refusal.text}</p>
          {refusal.retry && (
            <button type="button" className="fmo-btn" onClick={() => void (refusal.replace ? replace(refusal.replace, refusal.retry!) : add(refusal.retry!))} data-testid="logo-retry">
              {w.tryAgain}
            </button>
          )}
        </Alert>
      )}
      {logos.map((logo) => (
        <LogoCard
          key={logo.id}
          logo={logo}
          onReplace={() => {
            replacing.current = logo.id;
            replaceInput.current?.click();
          }}
        />
      ))}
      <input
        ref={input}
        id={id}
        type="file"
        accept={LOGO_MEDIA_TYPES.join(",")}
        hidden
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
        data-testid="logo-file"
      />
      <input
        ref={replaceInput}
        type="file"
        accept={LOGO_MEDIA_TYPES.join(",")}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          const target = replacing.current;
          e.target.value = "";
          if (file && target) void replace(target, file);
        }}
        data-testid="logo-replace-file"
      />
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
      {logos.length === 0 && <p className="fmo-muted">{w.designHelp}</p>}
      <p className="fmo-muted">{w.rights}</p>
    </>
  );
}

/** One logo: its file, Replace and Remove, Where, Size, and its warnings. */
function LogoCard({ logo, onReplace }: { logo: LogoLayer; onReplace: () => void }) {
  const api = useEditor();
  const { product, wording, assets } = api;
  const w = wording.logos;
  const name = assets.fileName?.(logo.asset.assetId) || w.yourLogo;
  const url = assets.url(logo.asset);
  const note = api.logoNotes[logo.asset.assetId];
  const blurry = logoIsBlurry(logo);
  const sizeWord = logoSizeWord(product, logo);
  const limits = logoSizeLimits(product, logo);
  const selected = api.selectedId === logo.id;
  return (
    <div className="fmo-item" data-testid={`logo-${logo.id}`} data-selected={selected}>
      <div className="fmo-item-head">
        <button type="button" className="fmo-item-pick" aria-label={fill(w.selectName, { file: name })} aria-pressed={selected} onClick={() => api.select(logo.id, { turn: true })} data-testid={`select-${logo.id}`}>
          {url ? <img src={url} alt="" /> : <EditorIcon name="logos" />}
          <span className="fmo-item-name fmo-bdi" dir="auto">
            {fill(w.logoName, { file: name })}
          </span>
          {(blurry || (note?.box && !note.kept)) && (
            <span className="fmo-badge" aria-hidden="true">
              <EditorIcon name="alert" size={16} />
            </span>
          )}
        </button>
        <button type="button" className="fmo-btn fmo-btn-text" aria-label={fill(w.replaceName, { file: name })} onClick={onReplace} data-testid={`replace-${logo.id}`}>
          {w.replace}
        </button>
        <button
          type="button"
          className="fmo-btn fmo-btn-text"
          aria-label={fill(w.removeName, { file: name })}
          onClick={() => {
            if (api.commit((d) => removeLayer(d, logo.id), "remove-item") && selected) api.select(null);
          }}
          data-testid={`remove-${logo.id}`}
        >
          {w.remove}
        </button>
      </div>
      <span className="fmo-label">{w.where}</span>
      <ItemWhere layer={logo} role={logo.role} />
      <div className="fmo-stepper-row">
        <span className="fmo-label">{w.size}</span>
        <div className="fmo-stepper" role="group" aria-label={w.size}>
          <button type="button" className="fmo-round" aria-label={w.smaller} title={w.smaller} aria-disabled={!limits.canShrink} onClick={() => limits.canShrink && api.commit((d) => scaleLayerBy(d, logo.id, 1 / LOGO_SIZE_STEP, { product }), "resize")} data-testid={`size-down-${logo.id}`}>
            <EditorIcon name="minus" />
          </button>
          <span className="fmo-stepper-value" aria-live="polite" data-testid={`size-word-${logo.id}`}>
            {w.sizeSteps[sizeWord]}
          </span>
          <button type="button" className="fmo-round" aria-label={w.bigger} title={w.bigger} aria-disabled={!limits.canGrow} onClick={() => limits.canGrow && api.commit((d) => scaleLayerBy(d, logo.id, LOGO_SIZE_STEP, { product }), "resize")} data-testid={`size-up-${logo.id}`}>
            <EditorIcon name="plus" />
          </button>
        </div>
      </div>
      {note?.box && !note.kept && (
        <Alert kind="warning" testId={`logo-box-${logo.id}`}>
          <p>{w.noTransparency}</p>
          <p className="fmo-muted">{w.designHelp}</p>
          <button type="button" className="fmo-btn" onClick={() => api.setLogoNote(logo.asset.assetId, { kept: true })} data-testid={`keep-${logo.id}`}>
            {w.keepIt}
          </button>
        </Alert>
      )}
      {blurry && (
        <Alert kind="warning" testId={`logo-blurry-${logo.id}`}>
          <p>{fill(w.blurry, { size: fill(w.sharpSize, { cm: sharpWidth(logo).cm }) })}</p>
          <button type="button" className="fmo-btn" onClick={() => api.commit((d) => makeLogoSharp(d, logo.id, { product }), "resize")} data-testid={`make-sharp-${logo.id}`}>
            {w.makeSharp}
          </button>
        </Alert>
      )}
    </div>
  );
}
