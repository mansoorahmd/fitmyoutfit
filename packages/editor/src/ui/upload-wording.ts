/**
 * The upload checks' findings in the coach's words (06-editor.md 10.4). The
 * engine's messages are for developers (they name codes and limits): the
 * editor never shows them; it maps each finding to a sentence from the
 * wording data, from the issue's code and the file itself.
 */
import { describeOtherFormat, readImageHeader } from "../design/image-file.js";
import { DEFAULT_UPLOAD_LIMITS, type UploadIssue, type UploadLimits } from "../design/upload-checks.js";
import { fill, type EditorWording } from "./content.js";

/** What went wrong with an upload, for the coach. */
export type UploadRefusal = "wrong-type" | "svg" | "damaged" | "too-big" | "too-small" | "too-large" | "animated" | "network";

export interface UploadContext {
  /** The first bytes of the file (a few hundred are enough), to tell an SVG from other files and read the size in pixels. */
  head?: Uint8Array | null;
  /** The file's size in bytes. */
  size: number;
  /** The host's upload failed (the network), not the checks. */
  networkFailed?: boolean;
  limits?: UploadLimits;
}

/** The kind of refusal from the checks' errors and the file. Null when nothing was refused. */
export function uploadRefusal(issues: readonly UploadIssue[], context: UploadContext): UploadRefusal | null {
  if (context.networkFailed) return "network";
  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length === 0) return null;
  const limits = context.limits ?? DEFAULT_UPLOAD_LIMITS;
  const codes = new Set(errors.map((e) => e.code));
  if (codes.has("file-size")) return "too-big";
  if (codes.has("file-type")) {
    const other = context.head ? describeOtherFormat(context.head) : null;
    return other === "an SVG file" ? "svg" : "wrong-type";
  }
  if (codes.has("animated")) return "animated";
  if (codes.has("dimensions")) {
    const header = context.head ? readImageHeader(context.head) : null;
    if (header?.ok) {
      const { width, height } = header.header;
      if (width < limits.minSidePx || height < limits.minSidePx) return "too-small";
      return "too-large";
    }
    return "too-small";
  }
  return "damaged";
}

/** Megabytes as the coach reads them ("12.0 MB"). */
export function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The sentence for a refusal (W-ED94a to W-ED94f, W-ED97). */
export function uploadRefusalText(wording: EditorWording, refusal: UploadRefusal, fileName: string, size: number): string {
  const l = wording.logos;
  const file = fileName || l.yourLogo;
  switch (refusal) {
    case "svg":
      return l.svg;
    case "wrong-type":
      return fill(l.wrongType, { file });
    case "damaged":
      return fill(l.damaged, { file });
    case "too-big":
      return fill(l.tooBig, { file, size: formatMegabytes(size) });
    case "too-small":
      return fill(l.tooSmall, { file });
    case "too-large":
      return fill(l.tooLarge, { file });
    case "animated":
      return fill(l.animated, { file });
    case "network":
      return l.network;
  }
}

/** The warnings the simple Logos panel shows (E3a): no transparency; the full set (blurry, "Make it sharp") is E3b. */
export function uploadWarningTexts(wording: EditorWording, issues: readonly UploadIssue[]): string[] {
  const out: string[] = [];
  if (issues.some((i) => i.severity === "warning" && i.code === "transparency")) out.push(wording.logos.noTransparency);
  return out;
}
