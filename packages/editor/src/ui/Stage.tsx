/**
 * The stage (06-editor.md 3, 6, 10): the 3D canvas (or the flat view) on a
 * light stage that deepens for white kits, the status line, the one-time
 * hint, the loading state with its progress, the view buttons (sides, zoom,
 * reset), and the model's credit line. The garment is framed in the free
 * area above (or beside) the panel by the canvas itself (`viewInsets`).
 */
import type { ReactNode, Ref } from "react";
import { DesignCanvas, type CameraInfo, type DesignCanvasHandle, type DesignCanvasProps } from "../react/DesignCanvas.js";
import type { ViewInsets } from "../react/camera.js";
import type { DesignDocument, ProductDefinition } from "../design/schema.js";
import type { AssetUrlResolver } from "../react/asset-images.js";
import { fill, type EditorWording } from "./content.js";
import { FlatView } from "./FlatView.js";
import { EditorIcon, ShirtSilhouette } from "./icons.js";
import type { EditorLayout } from "./layout.js";
import type { StageTone } from "./stage-logic.js";

export interface StageLoad {
  /** 0 to 1, or null when unknown. */
  fraction: number | null;
  ready: boolean;
  slow: boolean;
  failed: boolean;
}

export interface StageProps {
  layout: EditorLayout;
  mode: "3d" | "flat";
  product: ProductDefinition;
  design: DesignDocument;
  wording: EditorWording;
  tone: StageTone;
  insets: ViewInsets;
  description: string;
  assetUrl: AssetUrlResolver;
  canvasRef: Ref<DesignCanvasHandle>;
  canvasProps: Omit<DesignCanvasProps, "design" | "product" | "ref" | "viewInsets" | "assetUrl">;
  load: StageLoad;
  onRetry: () => void;
  onUseFlat: () => void;
  /** The status line: a message, and whether it offers Undo. */
  status: { text: string; undo: boolean } | null;
  onUndo: () => void;
  hint: string | null;
  banner: string | null;
  camera: CameraInfo;
  onSide: (side: "front" | "back" | "left" | "right") => void;
  onZoom: (direction: "in" | "out") => void;
  onReset: () => void;
  onStageKey: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  credit?: ReactNode;
}

export function Stage({ canvasRef, ...props }: StageProps) {
  const { wording, insets, load, mode, camera, layout } = props;
  const v = wording.view;
  const percent = load.fraction === null ? null : Math.round(load.fraction * 100);
  const showLoading = mode === "3d" && !load.ready;
  const controlsBottom = insets.bottom + 12;
  const sides = ["front", "back", "left", "right"] as const;
  return (
    <div className="fmo-stage" data-tone={props.tone} data-testid="stage" style={props.credit ? ({ "--fmo-credit-room": "36px" } as React.CSSProperties) : undefined}>
      <div className="fmo-stage-deep" />
      {/* The soft contact shadow under the hem: the garment fills about two thirds of the free area's height, centred. */}
      <div className="fmo-stage-shadow" style={{ bottom: `calc(${insets.bottom}px + (100% - ${insets.bottom}px) * 0.13)`, left: `calc((100% - ${insets.right}px) / 2)` }} aria-hidden="true" />
      {mode === "3d" ? (
        <div className="fmo-canvas" tabIndex={0} role="img" aria-label={props.description} onKeyDown={props.onStageKey} data-testid="stage-canvas">
          <DesignCanvas {...props.canvasProps} ref={canvasRef} design={props.design} product={props.product} viewInsets={insets} assetUrl={props.assetUrl} style={{ background: "transparent", minHeight: 0 }} errorFallback={null} />
        </div>
      ) : (
        <div className="fmo-canvas" style={{ bottom: insets.bottom, right: insets.right, top: 92 }}>
          <FlatView product={props.product} design={props.design} assetUrl={props.assetUrl} captions={{ front: wording.states.flatFront, back: wording.states.flatBack }} label={props.description} />
        </div>
      )}
      {showLoading && (
        <div className="fmo-loading" style={{ bottom: insets.bottom, right: insets.right }} data-testid="stage-loading">
          <ShirtSilhouette className="fmo-silhouette" />
          {!load.failed ? (
            <>
              <div className="fmo-progress" data-unknown={percent === null} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} aria-label={wording.states.loadingNoPercent}>
                <span style={{ width: `${percent ?? 0}%` }} />
              </div>
              <p role="status">{percent === null ? wording.states.loadingNoPercent : fill(wording.states.loading, { percent })}</p>
              {load.slow && <p data-testid="stage-slow">{wording.states.slow}</p>}
            </>
          ) : (
            <div className="fmo-stack" role="alert" data-testid="stage-failed">
              <p>{wording.states.failed}</p>
              <div className="fmo-row" style={{ justifyContent: "center" }}>
                <button type="button" className="fmo-btn" onClick={props.onRetry} data-testid="stage-retry">
                  {wording.states.tryAgain}
                </button>
                <button type="button" className="fmo-btn fmo-btn-text" onClick={props.onUseFlat} data-testid="stage-use-flat">
                  {wording.states.useFlat}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="fmo-stage-top">
        {props.banner && (
          <div className="fmo-banner" role="status" data-testid="stage-banner">
            <EditorIcon name="info" size={20} />
            <span>{props.banner}</span>
          </div>
        )}
        <div className={props.status?.undo ? "fmo-status" : "fmo-status fmo-status-quiet"} role="status" aria-live="polite" data-testid="status-line">
          {props.status && (
            <>
              <span>{props.status.text}</span>
              {props.status.undo && (
                <button type="button" onClick={props.onUndo} data-testid="status-undo">
                  {wording.frame.undo}
                </button>
              )}
            </>
          )}
        </div>
        {props.hint && (
          <div className="fmo-hint" data-testid="stage-hint">
            {props.hint}
          </div>
        )}
      </div>
      {props.credit && (
        <div className="fmo-credit" style={{ top: props.banner ? undefined : 6, bottom: props.banner ? controlsBottom + 52 : undefined }} data-testid="model-credit">
          {props.credit}
        </div>
      )}
      {mode === "3d" && (
        <div className="fmo-view" style={{ bottom: controlsBottom, right: layout === "short" ? insets.right : 0 }} data-testid="view-controls">
          <div className="fmo-sides" role="group" aria-label={v.sidesName}>
            {sides.map((side) => (
              <button key={side} type="button" aria-pressed={camera.side === side} onClick={() => props.onSide(side)} data-testid={`view-${side}`}>
                {v.sides[side]}
              </button>
            ))}
          </div>
          <div className="fmo-zoom">
            <button type="button" className="fmo-round" aria-label={v.zoomIn} title={v.zoomIn} aria-disabled={!camera.canZoomIn} onClick={() => camera.canZoomIn && props.onZoom("in")} data-testid="zoom-in">
              <EditorIcon name="plus" />
            </button>
            <button type="button" className="fmo-round" aria-label={v.zoomOut} title={v.zoomOut} aria-disabled={!camera.canZoomOut} onClick={() => camera.canZoomOut && props.onZoom("out")} data-testid="zoom-out">
              <EditorIcon name="minus" />
            </button>
            <button type="button" className="fmo-round" aria-label={v.reset} title={v.reset} onClick={props.onReset} data-testid="zoom-reset">
              <EditorIcon name="reset" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
