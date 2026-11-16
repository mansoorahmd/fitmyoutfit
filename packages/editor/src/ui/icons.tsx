/**
 * The editor's icon set (06-editor.md 12.1): 24 px line icons, 1.75 px
 * stroke, round caps, `currentColor`, drawn in the package (no icon library).
 * Icons are decoration: the button or label next to them carries the words.
 */
import { memo } from "react";
const PATHS = {
  design: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  colours: "M12 3.5c3 3.6 6 7 6 10.2a6 6 0 0 1-12 0C6 10.5 9 7.1 12 3.5zM9.5 14.5a2.5 2.5 0 0 0 2.5 2.5",
  team: "M12 3l7 3v5.5c0 4.4-3 7.8-7 9.5-4-1.7-7-5.1-7-9.5V6l7-3z",
  players: "M8 4l-4 3 2 4 2-1v10h8V10l2 1 2-4-4-3c-.6 1.5-2.2 2.5-4 2.5S8.6 5.5 8 4zM11 12v5M13.5 12h-1.2a1 1 0 0 0-1 1",
  logos: "M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15.5 9.5a1.5 1.5 0 1 0 0-.01",
  text: "M3 18l4.5-12L12 18M4.8 14h5.4M15 11.5c.6-.9 1.5-1.4 2.7-1.4 1.8 0 2.8 1 2.8 2.7V18M20.5 14.6c-3.4 0-5.5.8-5.5 2 0 .9.8 1.5 1.9 1.5 2 0 3.6-1.4 3.6-3.5",
  undo: "M9 7L4 12l5 5M4.5 12H15a5 5 0 0 1 0 10h-2",
  redo: "M15 7l5 5-5 5M19.5 12H9a5 5 0 0 0 0 10h2",
  close: "M6 6l12 12M18 6L6 18",
  check: "M5 12.5l4.5 4.5L19 7.5",
  alert: "M12 4l9 16H3L12 4zM12 10v4.5M12 17.2v.3",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.7v.3",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  reset: "M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4",
  swap: "M7 7h12l-3-3M17 17H5l3 3",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.6 9.3a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.2-2.4 3.7M12 17v.3",
  chevronDown: "M6 9l6 6 6-6",
  chevronUp: "M6 15l6-6 6 6",
  chevronLeft: "M15 6l-6 6 6 6",
  saved: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.3l2.7 2.7L16 9.7",
  upload: "M12 16V4M7 9l5-5 5 5M4 16v4h16v-4",
  trash: "M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13",
  copy: "M8 8h11v12H8zM5 16V4h11",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  layers: "M12 4l8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  eye: "M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6z",
  eyeOff: "M4 4l16 16M9.9 6A9.9 9.9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.4 7.6A16 16 0 0 0 2.5 12s3.5 6.5 9.5 6.5c1.6 0 3-.4 4.2-1",
  arrowLeft: "M19 12H5M11 6l-6 6 6 6",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  arrowUp: "M12 19V5M6 11l6-6 6 6",
  arrowDown: "M12 5v14M6 13l6 6 6-6",
  turnLeft: "M9 4L5 8l4 4M5 8h9a5 5 0 0 1 0 10h-3",
  turnRight: "M15 4l4 4-4 4M19 8h-9a5 5 0 0 0 0 10h3",
  centre: "M12 3v18M7 8h10v8H7z",
  straighten: "M4 12h16M7 8v8M17 8v8",
  forward: "M7 14h10v6H7zM9 4h10v8",
  back: "M5 4h10v6H5zM9 12h10v8H9z",
  stripes: "M4 9l5-5M4 15L15 4M4 20L20 4M9 20l11-11M15 20l5-5",
  alignLeft: "M4 6h16M4 10h10M4 14h16M4 18h10",
  alignCentre: "M4 6h16M7 10h10M4 14h16M7 18h10",
  alignRight: "M4 6h16M10 10h10M4 14h16M10 18h10",
} as const;

export type IconName = keyof typeof PATHS;

/** Memoised (S1): the same icon is not built again on every render of a tool. */
export const EditorIcon = memo(function EditorIcon({ name, size = 24, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className ? `fmo-icon ${className}` : "fmo-icon"}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
});

/** A plain shirt outline for the loading state, where the model will appear (06-editor.md 10.1). */
export function ShirtSilhouette({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 220" aria-hidden="true" focusable="false">
      <path
        d="M72 12 L40 22 L4 64 L28 92 L48 76 L48 208 L152 208 L152 76 L172 92 L196 64 L160 22 L128 12 C122 28 112 36 100 36 C88 36 78 28 72 12 Z"
        fill="currentColor"
      />
    </svg>
  );
}
