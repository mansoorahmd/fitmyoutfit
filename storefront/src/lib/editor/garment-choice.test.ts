import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { resolveEditorAsset } from "./asset-path"
import { garmentIds, garmentMove, openingGarment, readDeviceRecords } from "./garment-choice"
import { editorProductFor, garmentList, garmentOfDesign, garmentTitle } from "./products"

const jersey = editorProductFor("jersey")!
const tshirt = editorProductFor("t-shirt")!

describe("the garments the store hands to the editor", () => {
  it("outside a team order: the jersey's two necks as one group, then the T-shirt", () => {
    const list = garmentList(jersey, { inOrder: false })
    expect(list.map((g) => g.id)).toEqual(["match-jersey-vneck", "match-jersey-round", "stand-in-tshirt"])
    expect(list.slice(0, 2).map((g) => [g.group, g.groupName, g.variant, g.name])).toEqual([
      ["jersey", "Jersey", "V-neck", "Jersey, V-neck"],
      ["jersey", "Jersey", "Round neck", "Jersey, round neck"],
    ])
    // the T-shirt is its own card
    expect(list[2]).toMatchObject({ id: "stand-in-tshirt", name: "T-shirt", handle: "t-shirt" })
    expect(list[2]!.group).toBeUndefined()
  })

  it("has the same list from the T-shirt's designer", () => {
    expect(garmentList(tshirt, { inOrder: false }).map((g) => g.id)).toEqual(garmentList(jersey, { inOrder: false }).map((g) => g.id))
  })

  it("the jersey's pictures are files the editor has, served by the store; the T-shirt has none", () => {
    const list = garmentList(jersey, { inOrder: false })
    for (const g of list.slice(0, 2)) {
      expect(g.picture).toMatch(/^pictures\/match-jersey-(vneck|round)\.png$/)
      expect(resolveEditorAsset(g.picture!.split("/"))).toEqual({ relative: g.picture, type: "image/png" })
      expect(existsSync(resolve(import.meta.dirname, "../../../../packages/editor/samples", g.picture!))).toBe(true)
    }
    expect(list[2]!.picture).toBeUndefined()
    expect(resolveEditorAsset(["pictures", "a.jpg"])).toBeNull()
    expect(resolveEditorAsset(["pictures", "..", "x.png"])).toBeNull()
  })

  it("every garment's files are served and exist", () => {
    for (const entry of [jersey, tshirt]) {
      for (const g of entry.garments) {
        for (const relative of [`models/${g.modelFile}`, `products/${g.definition}.json`, `templates/${g.definition}/index.json`]) {
          expect(resolveEditorAsset(relative.split("/"))).not.toBeNull()
          expect(existsSync(resolve(import.meta.dirname, "../../../../packages/editor/samples", relative))).toBe(true)
        }
      }
    }
  })

  it("inside a team order: only the necks of the order's product; a product with one garment offers nothing", () => {
    expect(garmentList(jersey, { inOrder: true }).map((g) => g.id)).toEqual(["match-jersey-vneck", "match-jersey-round"])
    expect(garmentList(tshirt, { inOrder: true })).toEqual([])
  })
})

describe("the neck a saved design opens on", () => {
  it("a team order opens on the neck its design was saved with", () => {
    expect(openingGarment(jersey, { order: { design: { product: { id: "match-jersey-round" } } } }).definition).toBe("match-jersey-round")
    expect(openingGarment(jersey, { order: { design: { product: { id: "match-jersey-vneck" } } } }).definition).toBe("match-jersey-vneck")
  })

  it("an unsent draft on this device with another neck is the newer truth; a clean draft is not", () => {
    const design = { product: { id: "match-jersey-vneck" } }
    expect(openingGarment(jersey, { order: { design, draft: { productId: "match-jersey-round", designDirty: true } } }).definition).toBe("match-jersey-round")
    expect(openingGarment(jersey, { order: { design, draft: { productId: "match-jersey-round", designDirty: false } } }).definition).toBe("match-jersey-vneck")
    expect(openingGarment(jersey, { order: { design, draft: { productId: "stand-in-tshirt", designDirty: true } } }).definition).toBe("match-jersey-vneck")
  })

  it("a design that names none of the product's garments opens on the first", () => {
    expect(openingGarment(jersey, { order: { design: { product: { id: "stand-in-jersey" } } } }).definition).toBe("match-jersey-vneck")
    expect(garmentOfDesign(jersey, null).definition).toBe("match-jersey-vneck")
  })

  it("a device opens on the neck saved last, whichever it is", () => {
    expect(openingGarment(jersey, { device: [{ id: "match-jersey-vneck", savedAt: 5 }] }).definition).toBe("match-jersey-vneck")
    expect(openingGarment(jersey, { device: [{ id: "match-jersey-round", savedAt: 5 }] }).definition).toBe("match-jersey-round")
    expect(
      openingGarment(jersey, {
        device: [
          { id: "match-jersey-vneck", savedAt: 9 },
          { id: "match-jersey-round", savedAt: 5 },
        ],
      }).definition
    ).toBe("match-jersey-vneck")
    expect(openingGarment(jersey, { device: [{ id: "stand-in-tshirt", savedAt: 99 }] }).definition).toBe("match-jersey-vneck")
    expect(openingGarment(jersey, {}).definition).toBe("match-jersey-vneck")
  })

  it("reads what the device holds under each neck, and survives a store that cannot be read", async () => {
    const records: Record<string, unknown> = {
      "last:match-jersey-round": { version: 1, productId: "match-jersey-round", savedAt: 7 },
      "last:match-jersey-vneck": { version: 1, productId: "someone-else", savedAt: 9 },
    }
    const kv = { get: async (_s: string, key: string) => records[key] } as never
    expect(await readDeviceRecords(kv, garmentIds(jersey))).toEqual([{ id: "match-jersey-round", savedAt: 7 }])
    const broken = {
      get: async () => {
        throw new Error("refused")
      },
    } as never
    expect(await readDeviceRecords(broken, garmentIds(jersey))).toEqual([])
  })
})

describe("what choosing a garment does", () => {
  const free = { inOrder: false }
  it("the other neck: the same page starts again on it", () => {
    expect(garmentMove(jersey, "match-jersey-vneck", "match-jersey-round", free)).toMatchObject({ kind: "neck", garment: { definition: "match-jersey-round" } })
    expect(garmentMove(jersey, "match-jersey-round", "match-jersey-vneck", { inOrder: true })).toMatchObject({ kind: "neck" })
  })

  it("another product: the designer moves to its address, outside an order only", () => {
    const move = garmentMove(jersey, "match-jersey-round", "stand-in-tshirt", free)
    expect(move).toMatchObject({ kind: "product", entry: { handle: "t-shirt" } })
    expect(garmentMove(tshirt, "stand-in-tshirt", "match-jersey-round", free)).toMatchObject({ kind: "product", entry: { handle: "jersey" } })
    // the backend refuses another product's design version: nothing happens inside an order
    expect(garmentMove(jersey, "match-jersey-round", "stand-in-tshirt", { inOrder: true })).toEqual({ kind: "none" })
  })

  it("the current garment, and one nobody knows, do nothing", () => {
    expect(garmentMove(jersey, "match-jersey-round", "match-jersey-round", free)).toEqual({ kind: "none" })
    expect(garmentMove(jersey, "match-jersey-round", "nope", free)).toEqual({ kind: "none" })
  })
})

describe("the product's name where the neck matters (the roster proof's header)", () => {
  it("says the neck for the jersey, and keeps a single-shape product as it is", () => {
    expect(garmentTitle("Jersey", garmentOfDesign(jersey, { product: { id: "match-jersey-round" } }))).toBe("Jersey, round neck")
    expect(garmentTitle("Jersey", garmentOfDesign(jersey, { product: { id: "match-jersey-vneck" } }))).toBe("Jersey, V-neck")
    expect(garmentTitle("T-shirt", tshirt.garments[0]!)).toBe("T-shirt")
    expect(garmentTitle("", jersey.garments[0]!)).toBe("")
  })
})
