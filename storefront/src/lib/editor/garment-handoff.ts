// When the designer moves from one store product to another (the jersey to the T-shirt), the new page opens on the
// design that was carried over and says what the editor said about the change. The sentence is handed over in
// sessionStorage, for one visit of that page: it is read once and removed. Every access is guarded (storage can be
// refused); without it the page opens as before, with no sentence.

const KEY = "fmo:garment-notice"

/** Remembers the sentence for the next visit of this product's designer. */
export function rememberGarmentNotice(handle: string, notice: string): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ handle, notice }))
  } catch {
    // storage refused: the page opens without the sentence
  }
}

/** The sentence left for this product's designer, once; null when there is none (or it was left for another product). */
export function takeGarmentNotice(handle: string): string | null {
  try {
    const raw = window.sessionStorage.getItem(KEY)
    if (!raw) return null
    window.sessionStorage.removeItem(KEY)
    const parsed = JSON.parse(raw) as { handle?: unknown; notice?: unknown }
    return parsed.handle === handle && typeof parsed.notice === "string" && parsed.notice.trim() !== "" ? parsed.notice : null
  } catch {
    return null
  }
}
