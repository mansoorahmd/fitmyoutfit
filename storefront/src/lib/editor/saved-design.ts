// The product page needs to know, without loading the editor, whether this
// device holds a design for a product, and the chooser's cards whether it holds
// one for a garment (the jersey's two necks are two garments of one product).
// The editor keeps the design itself in the browser's IndexedDB; the design page
// also leaves small flags here (localStorage, one key per handle and one per
// garment) when it saves or clears one. A flag is only a hint for a button's
// label: the designer page reads the real store and corrects the flags. Every
// access is guarded, because storage can be refused (private windows, blocked
// site data).

import { editorProductFor } from "./products"

const KEY_PREFIX = "fmo:saved-design:"

const key = (handle: string) => `${KEY_PREFIX}${handle}`
const garmentKey = (garmentId: string) => `${KEY_PREFIX}garment:${garmentId}`

/** Whether this device holds a saved design for the product (false when storage is not available). */
export function hasSavedDesign(handle: string): boolean {
  try {
    return window.localStorage.getItem(key(handle)) === "1"
  } catch {
    return false
  }
}

/** Whether this device holds a saved design for the garment (an editor product id; false when storage is not available). */
export function hasSavedGarmentDesign(garmentId: string): boolean {
  try {
    return window.localStorage.getItem(garmentKey(garmentId)) === "1"
  } catch {
    return false
  }
}

/**
 * Remembers, or forgets, that this device holds a design for the product. With `garmentId` it is that garment's design
 * that is remembered or forgotten (the product still counts as saved while another of its garments is); without it the
 * product and all its garments are set alike.
 */
export function setSavedDesignFlag(handle: string, saved: boolean, garmentId?: string): void {
  try {
    const garments = editorProductFor(handle)?.garments.map((g) => g.definition) ?? []
    if (garmentId) {
      if (saved) window.localStorage.setItem(garmentKey(garmentId), "1")
      else window.localStorage.removeItem(garmentKey(garmentId))
      const any = garments.some((id) => window.localStorage.getItem(garmentKey(id)) === "1")
      if (saved || any) window.localStorage.setItem(key(handle), "1")
      else window.localStorage.removeItem(key(handle))
      return
    }
    if (saved) window.localStorage.setItem(key(handle), "1")
    else window.localStorage.removeItem(key(handle))
    if (!saved) for (const id of garments) window.localStorage.removeItem(garmentKey(id))
  } catch {
    // storage refused: the button simply keeps its first label
  }
}
