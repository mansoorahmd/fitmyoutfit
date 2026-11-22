import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createDesign, createMemoryKeyValueStore, validateProductDefinition, type ProductDefinition } from "@fitmyoutfit/editor"
import { describe, expect, it } from "vitest"

import { deleteOrderDraft, readOrderDraft, writeOrderDraft, type OrderDraft } from "./order-draft"

const sample = resolve(import.meta.dirname, "../../../../packages/editor/samples/products/stand-in-jersey.json")
const checked = validateProductDefinition(JSON.parse(readFileSync(sample, "utf8")))
if (!checked.ok) throw new Error("the sample product is not valid")
const product: ProductDefinition = checked.value

const draft = (over: Partial<OrderDraft> = {}): OrderDraft => ({
  version: 1,
  orderId: "teamord_1",
  productId: product.id,
  savedAt: 1,
  design: createDesign(product, { teamName: "Lions" }),
  designDirty: true,
  teamList: { version: 1, productId: product.id, prints: { name: true, number: true }, lines: [] },
  listDirty: true,
  ...over,
})

describe("the unsent draft of a team order on this device", () => {
  it("writes and reads back the design, the list and the two flags", async () => {
    const kv = createMemoryKeyValueStore()
    await writeOrderDraft(kv, draft())
    const back = await readOrderDraft(kv, "teamord_1", product)
    expect(back?.design.teamName).toBe("Lions")
    expect(back?.designDirty).toBe(true)
    expect(back?.listDirty).toBe(true)
    expect(back?.teamList?.productId).toBe(product.id)
  })

  it("is the editor's record shape, so logo files the design uses are kept by its pruning", async () => {
    const kv = createMemoryKeyValueStore()
    await writeOrderDraft(kv, draft())
    const raw = (await kv.get("designs", "order:teamord_1")) as { started: boolean; design: unknown }
    expect(raw.started).toBe(true)
    expect(raw.design).toBeTruthy()
  })

  it("never mixes up two orders, or an order and the product's own record", async () => {
    const kv = createMemoryKeyValueStore()
    await writeOrderDraft(kv, draft())
    expect(await readOrderDraft(kv, "teamord_2", product)).toBeNull()
    expect(await kv.keys("designs")).toEqual(["order:teamord_1"])
  })

  it("is null for a record of another product, or for a design that no longer fits", async () => {
    const kv = createMemoryKeyValueStore()
    await writeOrderDraft(kv, draft({ productId: "another" }))
    expect(await readOrderDraft(kv, "teamord_1", product)).toBeNull()
    await kv.put("designs", "order:teamord_3", { version: 1, orderId: "teamord_3", productId: product.id, design: { nope: true } })
    expect(await readOrderDraft(kv, "teamord_3", product)).toBeNull()
  })

  it("is forgotten on request", async () => {
    const kv = createMemoryKeyValueStore()
    await writeOrderDraft(kv, draft())
    await deleteOrderDraft(kv, "teamord_1")
    expect(await readOrderDraft(kv, "teamord_1", product)).toBeNull()
  })
})
