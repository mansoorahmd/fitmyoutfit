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
import { useId, useRef, useState, memo } from "react";
import { addLayer, removeLayer } from "../design/edit.js";
import { scaleLayerBy } from "../design/item-edits.js";
import { newLogoLayer, nextLayerId } from "../design/new-layers.js";
import { placeAtPreset } from "../design/roles.js";
import type { ItemRole, Layer, LogoAssetRef, PlacementPreset } from "../design/schema.js";
import { LOGO_MEDIA_TYPES } from "../design/schema.js";
import type { UploadIssue } from "../design/upload-checks.js";
import { uploadLogo } from "../upload/logo-upload.js";
import { fill, presetWords } from "./content.js";
import { useEditor } from "./context.js";
import { EditorIcon } from "./icons.js";
import { presetsFor } from "./lettering.js";
import { itemWhere } from "./items.js";
import { LOGO_SIZE_STEP, countLogos, logoIsBlurry, logoLimit, logoSizeLimits, logoSizeWord, makeLogoSharp, nextPreset, replaceLogoAsset, sharpWidth, type LogoLayer } from "./logos.js";
import { Alert, PresetChips } from "./parts.js";
import { isStorageFull, uploadRefusal, uploadRefusalText } from "./upload-wording.js";

export { TextTool } from "./TextTool.js";


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

function LogosToolView() {
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
      // Worked out from the design as it is when the logo is added (several files dropped at once add one by one).
      let layerId = "";
      let preset: PlacementPreset | null = null;
      const ok = api.commit((d) => {
        const role = d.layers.some((l) => l.kind === "logo") ? "sponsor" : "crest";
        // The first free place in the product's order (a place the team name takes is not free).
        preset = nextPreset(product, "logo", d, presetsFor(product, role));
        layerId = nextLayerId(d, "logo");
        return addLayer(d, newLogoLayer(product, { id: layerId, preset: preset?.id, pieceId: preset ? undefined : product.views.front, role, asset: result.asset }), { product });
      }, "add-item");
      if (ok) {
        noteIssues(result.asset, result.issues);
        api.select(layerId);
        api.showSide((preset as PlacementPreset | null)?.side ?? "front");
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
      if (api.commit((d) => replaceLogoAsset(d, layerId, result.asset, { product }), "replace-logo")) {
        noteIssues(result.asset, result.issues);
        api.select(layerId);
      }
    } finally {
      setBusy(false);
    }
  };

  // Several files at once (dropped, or chosen together): each is added in turn, to the next free place, up to the
  // limit; beyond it the coach is told (E3c minor).
  const pick = async (files: FileList | null) => {
    const list = [...(files ?? [])];
    for (let k = 0; k < list.length; k++) {
      if (countLogos(api.latestDesign?.() ?? api.design) >= logoLimit(product)) {
        setRefusal({ text: fill(w.tooMany, { count: logoLimit(product) }), retry: null, replace: null });
        return;
      }
      await add(list[k]!);
    }
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
      {/* R14: "Add a logo" first, under the title; then the logos (only the selected one's card open). */}
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
            void pick(e.dataTransfer.files);
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
        multiple
        hidden
        onChange={(e) => {
          void pick(e.target.files);
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
  // The file is not on this device (S2): it would be ordered without its picture.
  const missing = api.missingAssets?.has(logo.asset.assetId) ?? false;
  const remove = () => {
    if (api.commit((d) => removeLayer(d, logo.id), "remove-item") && selected) api.select(null);
  };
  // R14: a logo not selected is one 56 px row (picture, name, place, a badge when it needs a look); a tap opens it.
  // A logo whose file is missing stays open: "Add it again" must be in view (E3c, S2).
  if (!selected && !missing) {
    const where = itemWhere(wording, product, logo).where;
    return (
      <div className="fmo-item fmo-item-row" data-testid={`logo-${logo.id}`} data-selected={false} data-missing={missing}>
        <button type="button" className="fmo-item-pick" aria-label={fill(w.selectName, { file: name })} aria-expanded={false} onClick={() => api.select(logo.id, { turn: true })} data-testid={`select-${logo.id}`}>
          {url ? <img src={url} alt="" /> : <EditorIcon name="logos" />}
          <span className="fmo-kit-words">
            <span className="fmo-item-name fmo-bdi" dir="auto">
              {fill(w.logoName, { file: name })}
            </span>
            <span className="fmo-muted">{where}</span>
          </span>
          {(missing || blurry || (note?.box && !note.kept)) && (
            <span className="fmo-badge" aria-hidden="true">
              <EditorIcon name="alert" size={16} />
            </span>
          )}
          <EditorIcon name="chevronDown" size={20} />
        </button>
      </div>
    );
  }
  return (
    <div className="fmo-item" data-testid={`logo-${logo.id}`} data-selected={selected} data-missing={missing}>
      <div className="fmo-item-head">
        <button type="button" className="fmo-item-pick" aria-label={fill(w.selectName, { file: name })} aria-pressed={selected} onClick={() => api.select(logo.id, { turn: true })} data-testid={`select-${logo.id}`}>
          {url ? <img src={url} alt="" /> : <EditorIcon name="logos" />}
          <span className="fmo-item-name fmo-bdi" dir="auto">
            {fill(w.logoName, { file: name })}
          </span>
          {(missing || blurry || (note?.box && !note.kept)) && (
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
          onClick={remove}
          data-testid={`remove-${logo.id}`}
        >
          {w.remove}
        </button>
      </div>
      {missing && (
        <Alert kind="warning" testId={`logo-missing-${logo.id}`}>
          <p>{w.missingCard}</p>
          <div className="fmo-row">
            <button type="button" className="fmo-btn" onClick={onReplace} data-testid={`add-again-${logo.id}`}>
              {w.addAgain}
            </button>
            <button type="button" className="fmo-btn fmo-btn-text" onClick={remove} data-testid={`missing-remove-${logo.id}`}>
              {w.remove}
            </button>
          </div>
        </Alert>
      )}
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
      {/* R15: a selected logo's warnings lead the panel (SelectedWarnings); not repeated here. */}
      {!selected && note?.box && !note.kept && (
        <Alert kind="warning" testId={`logo-box-${logo.id}`}>
          <p>{w.noTransparency}</p>
          <p className="fmo-muted">{w.designHelp}</p>
          <button type="button" className="fmo-btn" onClick={() => api.setLogoNote(logo.asset.assetId, { kept: true })} data-testid={`keep-${logo.id}`}>
            {w.keepIt}
          </button>
        </Alert>
      )}
      {!selected && blurry && (
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

/** E3d (speed): re-renders only when its props or the editor's data change. */
export const LogosTool = memo(LogosToolView);
