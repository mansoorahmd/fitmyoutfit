// Which garment (which neck) the designer opens on, and where a choice in the editor's garment chooser leads. Plain
// functions, tested on their own (garment-choice.test.ts). The editor's chooser gives the host the carried design;
// what the store does with it is decided here: between the two necks of the jersey (one store product, one price) the
// designer stays on its page and starts again on the other neck; to another garment (another store product, with its
// own price, sizes and size chart) it moves to that product's address; inside a team order only the first happens.

import type { KeyValueStore } from "@fitmyoutfit/editor"

import { entryOfGarment, garmentById, garmentOfDesign, type EditorGarment, type EditorProduct } from "./products"

/** What a saved record on this device says: which garment it is for and when it was saved. */
export type DeviceRecord = { id: string; savedAt: number }

/**
 * The garment a designer opens on.
 *
 * A team order opens on the neck the order's design was saved with; but a draft on this device with changes the server
 * has not seen yet (a neck changed since the last save point) is the newer truth and opens first. Outside an order the
 * device's most recently saved design wins, so a design saved on the round neck opens on the round neck; a device with
 * nothing saved (or one that cannot be read) opens on the product's first garment.
 *
 * Outside an order a garment the address asks for (`?garment=`, a chooser card's) comes first, when the product has it:
 * a garment that is unknown or another product's is ignored. Inside an order the order's design decides, whatever the
 * address says.
 */
export function openingGarment(
  entry: Pick<EditorProduct, "garments">,
  input: {
    order?: { design: unknown; draft?: { productId: string; designDirty: boolean } | null }
    device?: readonly DeviceRecord[]
    /** The editor product id the address asks for (outside a team order only). */
    requested?: string | null
  }
): EditorGarment {
  if (input.order) {
    const draft = input.order.draft
    const fromDraft = draft?.designDirty ? garmentById(entry, draft.productId) : null
    return fromDraft ?? garmentOfDesign(entry, input.order.design)
  }
  const asked = garmentById(entry, input.requested)
  if (asked) return asked
  let best: DeviceRecord | null = null
  for (const record of input.device ?? []) {
    if (!garmentById(entry, record.id)) continue
    if (!best || record.savedAt > best.savedAt) best = record
  }
  return garmentById(entry, best?.id) ?? entry.garments[0]!
}

export type GarmentMove =
  /** The other neck of the same store product: the designer starts again on it, on the same page. */
  | { kind: "neck"; garment: EditorGarment }
  /** Another store product: the designer moves to its address. */
  | { kind: "product"; entry: EditorProduct; garment: EditorGarment }
  /** Nothing to do: the garment is the current one, unknown, or (inside a team order) another product's. */
  | { kind: "none" }

/** What choosing a garment in the chooser does, from the garment being designed. */
export function garmentMove(current: Pick<EditorProduct, "handle" | "garments">, currentId: string, targetId: string, options: { inOrder: boolean }): GarmentMove {
  if (targetId === currentId) return { kind: "none" }
  const own = garmentById(current, targetId)
  if (own) return { kind: "neck", garment: own }
  // a team order is for one product: the backend refuses another product's design version
  if (options.inOrder) return { kind: "none" }
  const entry = entryOfGarment(targetId)
  const garment = entry ? garmentById(entry, targetId) : null
  return entry && garment && entry.handle !== current.handle ? { kind: "product", entry, garment } : { kind: "none" }
}

/** The editor product ids of a product's garments, for reading what the device holds. */
export const garmentIds = (entry: Pick<EditorProduct, "garments">): string[] => entry.garments.map((g) => g.definition)

/**
 * What this device holds for each of the garments: the editor keeps its last design of a product under `last:<id>`
 * (`DeviceDesignStore`). A record that is not readable is not counted, and a store that cannot be read says nothing.
 */
export async function readDeviceRecords(kv: KeyValueStore, ids: readonly string[]): Promise<DeviceRecord[]> {
  const records: DeviceRecord[] = []
  for (const id of ids) {
    try {
      const raw = (await kv.get("designs", `last:${id}`)) as { version?: number; productId?: string; savedAt?: number } | undefined
      if (raw && raw.version === 1 && raw.productId === id) records.push({ id, savedAt: Number(raw.savedAt) || 0 })
    } catch {
      // storage refused: nothing to say about this garment
    }
  }
  return records
}
