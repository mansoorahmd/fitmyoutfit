// The product page needs to know, without loading the editor, whether this
// device holds a design for a product. The editor keeps the design itself in
// the browser's IndexedDB; the design page also leaves a small flag here
// (localStorage, one key per handle) when it saves or clears one. The flag
// is only a hint for the button's label: the designer page reads the real
// store and corrects the flag. Every access is guarded, because storage can
// be refused (private windows, blocked site data).

const KEY_PREFIX = "fmo:saved-design:"

const key = (handle: string) => `${KEY_PREFIX}${handle}`

/** Whether this device holds a saved design for the product (false when storage is not available). */
export function hasSavedDesign(handle: string): boolean {
  try {
    return window.localStorage.getItem(key(handle)) === "1"
  } catch {
    return false
  }
}

/** Remembers, or forgets, that this device holds a design for the product. */
export function setSavedDesignFlag(handle: string, saved: boolean): void {
  try {
    if (saved) window.localStorage.setItem(key(handle), "1")
    else window.localStorage.removeItem(key(handle))
  } catch {
    // storage refused: the button simply keeps its first label
  }
}
