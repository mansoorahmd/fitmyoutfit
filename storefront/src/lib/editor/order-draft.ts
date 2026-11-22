// The designer opened for a team order keeps what the server has not seen yet on this device, as
// an unsent draft: the design since the last save point (the server gets a new design version only
// at save points, never on every stroke) and the team list while a save has not got through.
// The server's copy is the one that counts; this record only keeps the organizer's own typing from
// being lost to a closed tab, a crash or a stopped backend, and keeps the logo files the design
// uses (they live on this device; the editor's device store prunes files no record refers to).
//
// It sits in the editor's own device store (the same IndexedDB), under its own key, so the
// product page's "Continue your design" record is never touched by an order.

import {
  upgradeDesign,
  type DesignDocument,
  type KeyValueStore,
  type ProductDefinition,
  type SavedTeamList,
} from "@fitmyoutfit/editor"

export type OrderDraft = {
  version: 1
  orderId: string
  productId: string
  savedAt: number
  design: DesignDocument
  /** The design has changes the server's version does not have. */
  designDirty: boolean
  /** The team list as the editor last handed it over, and whether the server has not confirmed it yet. */
  teamList?: SavedTeamList
  listDirty: boolean
}

const key = (orderId: string) => `order:${orderId}`

export async function readOrderDraft(kv: KeyValueStore, orderId: string, product: ProductDefinition): Promise<OrderDraft | null> {
  const raw = (await kv.get("designs", key(orderId))) as Partial<OrderDraft> | undefined
  if (!raw || raw.version !== 1 || raw.orderId !== orderId || raw.productId !== product.id) return null
  const checked = upgradeDesign(raw.design, { product })
  if (!checked.ok) return null
  return {
    version: 1,
    orderId,
    productId: product.id,
    savedAt: Number(raw.savedAt) || 0,
    design: checked.value,
    designDirty: raw.designDirty === true,
    ...(raw.teamList && typeof raw.teamList === "object" ? { teamList: raw.teamList } : {}),
    listDirty: raw.listDirty === true,
  }
}

/** The draft's product and whether it has changes the server does not, without checking it against a product (which neck is it for?). */
export async function readRawOrderDraft(kv: KeyValueStore, orderId: string): Promise<{ productId: string; designDirty: boolean } | null> {
  try {
    const raw = (await kv.get("designs", key(orderId))) as Partial<OrderDraft> | undefined
    if (!raw || raw.version !== 1 || raw.orderId !== orderId || typeof raw.productId !== "string") return null
    return { productId: raw.productId, designDirty: raw.designDirty === true }
  } catch {
    return null
  }
}

export async function writeOrderDraft(kv: KeyValueStore, draft: OrderDraft): Promise<void> {
  // The editor's own device records have `started` and `design`: the same shape, so its pruning of
  // logo files sees the design's layers.
  await kv.put("designs", key(draft.orderId), { ...draft, started: true })
}

export async function deleteOrderDraft(kv: KeyValueStore, orderId: string): Promise<void> {
  await kv.delete("designs", key(orderId))
}
