// The top bar's save state for a designer opened on a team order, and the words it uses. The
// design and the list are saved in two different places: the list goes to the order as the
// organizer goes (the server), the design stays on this device until a save point. The top bar
// must say the truth about both, so it takes the worse of the two:
//
// - the list is failing or in conflict: "Not saved";
// - the list or the device copy is being written: "Saving…";
// - otherwise "Saved": and when the design has changes only this device has, "Saved on this
//   device" (the editor's own words), because the server has not got them yet.

import type { SaveState } from "@fitmyoutfit/editor"

import type { ListSaveState } from "./list-saver"

export type TopBar = {
  state: SaveState | null
  /** Which words "Saved" uses: "server" says only "Saved", "device" keeps the editor's "Saved on this device". */
  savedWords: "server" | "device"
}

export function topBarState({
  list,
  device,
  designUnsent,
  touched,
}: {
  list: ListSaveState
  /** The device copy of the design (and the list) as the editor's autosave reports it; null before the first write. */
  device: SaveState | null
  /** The design has changes the order's design version does not have. */
  designUnsent: boolean
  /** Anything has been changed or saved since the page opened. */
  touched: boolean
}): TopBar {
  const savedWords = designUnsent ? "device" : "server"
  if (list.kind === "failed" || list.kind === "conflict") return { state: "failed", savedWords }
  if (device === "failed") return { state: "failed", savedWords }
  if (list.kind === "saving" || device === "saving") return { state: "saving", savedWords }
  return { state: touched || designUnsent ? "saved" : null, savedWords }
}
