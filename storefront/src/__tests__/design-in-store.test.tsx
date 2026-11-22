import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { notFound, listProducts, getRegion, push } = vi.hoisted(() => ({
  // like Next.js: notFound() throws so nothing after it runs
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
  listProducts: vi.fn(),
  getRegion: vi.fn(),
  push: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  notFound,
  useRouter: () => ({ push }),
  useParams: () => ({ countryCode: "pk" }),
}))
vi.mock("@lib/data/products", () => ({ listProducts }))
vi.mock("@lib/data/regions", () => ({ getRegion, listRegions: async () => [] }))
// The page asks who is signed in; these tests are about the product, so: nobody.
vi.mock("@lib/data/customer", () => ({ customerState: async () => ({ kind: "signed_out" }) }))
vi.mock("@lib/data/team-orders", () => ({
  retrieveTeamOrder: vi.fn(),
  loadSavedDesign: vi.fn(),
  addSavedDesignVersion: vi.fn(),
  createSavedDesign: vi.fn(),
  createTeamOrder: vi.fn(),
  saveTeamOrderList: vi.fn(),
  setTeamOrderDesignVersion: vi.fn(),
}))
// next/font only runs inside the Next.js compiler.
vi.mock("@lib/editor/fonts", () => ({ editorFontFamilies: { Oswald: "__Oswald_x" } }))
vi.mock("@modules/design/components/design-loader", () => ({
  default: (props: { product: { handle: string }; countryCode: string }) => (
    <div data-testid="loader" data-handle={props.product.handle} data-country={props.countryCode} />
  ),
}))
// The localized link reads the country from the URL; a plain link is enough here.
vi.mock("@modules/common/components/localized-client-link", () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={`/pk${href}`} {...rest}>
      {children}
    </a>
  ),
}))

import { existsSync } from "node:fs"
import { resolve } from "node:path"

import { designContent } from "@content/design"
import { editorAssetUrl, resolveEditorAsset } from "@lib/editor/asset-path"
import { designPath, productReturnPath } from "@lib/editor/paths"
import { earlierModelIds, editorHandles, editorProductFor, isEarlierModelDesign } from "@lib/editor/products"
import { hasSavedDesign, setSavedDesignFlag } from "@lib/editor/saved-design"
import DesignButton from "@modules/design/components/design-button"
import DesignSavedNotice from "@modules/design/components/design-saved-notice"

import DesignNotFound from "../app/[countryCode]/(design)/not-found"
import DesignPage from "../app/[countryCode]/(design)/design/[handle]/page"

describe("which product has which model", () => {
  it("the jersey is our own match jersey (V-neck) with the body under it and no credit line; the T-shirt keeps its stand-in and credit", () => {
    expect(editorHandles()).toEqual(["jersey", "t-shirt"])
    expect(editorProductFor("jersey")).toEqual({
      handle: "jersey",
      definition: "match-jersey-vneck",
      modelFile: "match-jersey-vneck.glb",
      bodyFile: "body-male.glb",
      shortName: "Jersey",
      credit: null,
    })
    expect(editorProductFor("t-shirt")).toMatchObject({
      definition: "stand-in-tshirt",
      modelFile: "stand-in-tshirt.glb",
      credit: { licence: "MIT", author: "Prashant Verma" },
    })
  })

  it("the files the jersey names are served, and exist in the editor's samples", () => {
    const jersey = editorProductFor("jersey")!
    for (const relative of [`models/${jersey.modelFile}`, `models/${jersey.bodyFile}`, `products/${jersey.definition}.json`, `templates/${jersey.definition}/index.json`]) {
      expect(resolveEditorAsset(relative.split("/"))).not.toBeNull()
      expect(existsSync(resolve(import.meta.dirname, "../../../packages/editor/samples", relative))).toBe(true)
    }
  })

  it("a design for the stand-in jersey is an earlier model's: found by its product id, for the jersey only", () => {
    const jersey = editorProductFor("jersey")!
    expect(isEarlierModelDesign({ product: { id: "stand-in-jersey" } }, jersey)).toBe(true)
    expect(isEarlierModelDesign({ product: { id: "match-jersey-vneck" } }, jersey)).toBe(false)
    expect(isEarlierModelDesign({ product: { id: "stand-in-jersey" } }, editorProductFor("t-shirt")!)).toBe(false)
    expect(isEarlierModelDesign(null, jersey)).toBe(false)
    expect(isEarlierModelDesign({}, jersey)).toBe(false)
    expect(earlierModelIds("jersey")).toEqual(["stand-in-jersey"])
    expect(earlierModelIds("t-shirt")).toEqual([])
  })

  it("the jacket, the fit kit, an unknown handle and no handle have none", () => {
    for (const handle of ["jacket", "fit-kit", "rush-add-on", "nope", "", undefined, null]) {
      expect(editorProductFor(handle as string | undefined)).toBeNull()
    }
  })
})

describe("the files the designer may fetch", () => {
  it("serves the model, definition, palette, fonts and template shapes", () => {
    expect(resolveEditorAsset(["models", "stand-in-jersey.glb"])).toEqual({
      relative: "models/stand-in-jersey.glb",
      type: "model/gltf-binary",
    })
    expect(resolveEditorAsset(["products", "stand-in-tshirt.json"])?.type).toBe("application/json")
    expect(resolveEditorAsset(["palettes", "placeholder-palette.json"])).not.toBeNull()
    expect(resolveEditorAsset(["fonts", "placeholder-fonts.json"])).not.toBeNull()
    expect(resolveEditorAsset(["templates", "stand-in-jersey", "index.json"])).not.toBeNull()
    expect(editorAssetUrl("models/a.glb")).toBe("/api/editor-assets/models/a.glb")
  })

  it("refuses anything else: other folders, other file types, climbing out", () => {
    for (const segments of [
      ["models", "..", "..", "package.json"],
      ["..", "package.json"],
      ["models", "stand-in-jersey.LICENSE.txt"],
      ["models", "x.json"],
      ["products", "a.glb"],
      ["templates", "a", "b", "c.json"],
      ["models", ".env"],
      ["models", "axglb"],
      ["products", "a", "json"],
      ["products", "ajson"],
      ["products", "a..json"],
      ["models", "a..glb"],
      ["models", "a.b.glb"],
      ["templates", "a", "b..json"],
      ["templates", "a..", "b.json"],
      ["models", "a%2f..%2fb.glb"],
      [],
    ]) {
      expect(resolveEditorAsset(segments)).toBeNull()
    }
  })
})

describe("the way in: the product page's button", () => {
  beforeEach(() => window.localStorage.clear())

  it("reads Design your kit and leads to the designer page of the product", () => {
    render(<DesignButton handle="jersey" />)
    const link = screen.getByRole("link", { name: "Design your kit" })
    expect(link).toHaveAttribute("href", "/pk/design/jersey")
    expect(designPath("jersey")).toBe("/design/jersey")
  })

  it("is secondary: the page's red button stays Add to cart", () => {
    render(<DesignButton handle="jersey" />)
    expect(screen.getByTestId("design-button").className).not.toContain("bg-brand-primary")
  })

  it("reads Continue your design when this device has a saved design for the product", async () => {
    setSavedDesignFlag("jersey", true)
    render(<DesignButton handle="jersey" />)
    expect(await screen.findByRole("link", { name: "Continue your design" })).toHaveAttribute(
      "href",
      "/pk/design/jersey"
    )
  })

  it("a design saved for the jersey does not change the T-shirt's button", () => {
    setSavedDesignFlag("jersey", true)
    render(<DesignButton handle="t-shirt" />)
    expect(screen.getByRole("link", { name: "Design your kit" })).toBeInTheDocument()
    expect(hasSavedDesign("t-shirt")).toBe(false)
  })

  it("keeps working when the browser refuses storage", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    render(<DesignButton handle="jersey" />)
    expect(screen.getByRole("link", { name: "Design your kit" })).toBeInTheDocument()
    expect(() => setSavedDesignFlag("jersey", true)).not.toThrow()
    get.mockRestore()
    set.mockRestore()
  })
})

describe("the designer page: not found", () => {
  beforeEach(() => {
    notFound.mockClear()
    listProducts.mockReset()
    getRegion.mockReset()
    getRegion.mockResolvedValue({ id: "reg_pk" })
  })

  const open = (handle: string, countryCode = "pk") =>
    DesignPage({ params: Promise.resolve({ countryCode, handle }), searchParams: Promise.resolve({}) })

  it("a product with a model shows the designer", async () => {
    listProducts.mockResolvedValue({
      response: { products: [{ handle: "jersey", metadata: { kind: "garment" } }] },
    })
    const page = await open("jersey")
    render(page)
    expect(screen.getByTestId("loader")).toHaveAttribute("data-handle", "jersey")
    expect(screen.getByTestId("loader")).toHaveAttribute("data-country", "pk")
    expect(notFound).not.toHaveBeenCalled()
  })

  it("the jacket (a product with no model) is not found, without asking the backend", async () => {
    await expect(open("jacket")).rejects.toThrow("NEXT_NOT_FOUND")
    expect(listProducts).not.toHaveBeenCalled()
  })

  it("an unknown handle is not found", async () => {
    await expect(open("no-such-thing")).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("a handle with a model that the backend does not have is not found", async () => {
    listProducts.mockResolvedValue({ response: { products: [] } })
    await expect(open("jersey")).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("a region the store does not have is not found", async () => {
    getRegion.mockResolvedValue(null)
    await expect(open("jersey", "xx")).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("the not-found page is the store's, with its two links", () => {
    render(<DesignNotFound />)
    expect(screen.getByRole("heading", { name: "We can't find that page" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Browse garments" })).toHaveAttribute("href", "/pk/store")
  })
})

describe("the way out: the return path and the notice", () => {
  it("returns to the product page of the same country; Done adds the notice flag", () => {
    expect(productReturnPath("pk", "jersey", { saved: false })).toBe("/pk/products/jersey")
    expect(productReturnPath("gb", "t-shirt", { saved: true })).toBe("/gb/products/t-shirt?design=saved")
  })

  it("the notice says the design is saved on this device and that team orders are not available yet", () => {
    render(<DesignSavedNotice />)
    const notice = screen.getByRole("status")
    expect(notice).toHaveTextContent(designContent.saved.title)
    expect(notice).toHaveTextContent("Ordering a designed kit as a team order is not available yet.")
    // honest: no date, no promise
    expect(notice.textContent).not.toMatch(/soon|coming|\d/i)
  })

  it("the notice can be closed", () => {
    render(<DesignSavedNotice />)
    fireEvent.click(screen.getByRole("button", { name: designContent.saved.dismiss }))
    expect(screen.queryByRole("status")).toBeNull()
  })
})

/** What the designer page gives the designer (lib/editor/designer-context.ts): a visitor, no team order. */
const designerContext = (over: Record<string, unknown> = {}) => ({
  productId: "prod_jersey",
  productTitle: "Jersey",
  sizes: undefined,
  noun: { one: "jersey", many: "jerseys" },
  sizeChart: null,
  region: { id: "reg_pk", phrase: "Pakistan", minimum: null },
  signedIn: false,
  resumeStart: false,
  order: null,
  ...over,
})

describe("the designer returns to the product page", () => {
  const saveDesign = vi.fn()
  const flush = vi.fn()
  const kvGet = vi.fn()

  beforeEach(() => {
    push.mockClear()
    saveDesign.mockReset()
    flush.mockReset()
    kvGet.mockReset()
    kvGet.mockResolvedValue(undefined)
    flush.mockResolvedValue(undefined)
    window.localStorage.clear()
    vi.resetModules()
    vi.doMock("@fitmyoutfit/editor", () => {
      const ok = (value: unknown) => ({ ok: true, value })
      const design = { teamColors: { main: { id: "a" } } }
      return {
        EDITOR_WORDING: { lettering: { sampleName: "N", sampleNumber: "7" }, frame: { otherTab: "x", reload: "y" } },
        DeviceDesignStore: class {
          loadDesign = vi.fn().mockResolvedValue(null)
          saveDesign = saveDesign
          pruneAssets = vi.fn().mockResolvedValue(undefined)
          clearDesign = vi.fn().mockResolvedValue(undefined)
        },
        openIndexedDbStore: vi.fn().mockResolvedValue({ get: kvGet }),
        createMemoryKeyValueStore: vi.fn(),
        upgradeDesign: () => ok(design),
        createDeviceAssetStore: () => ({ restore: vi.fn().mockResolvedValue([]) }),
        createAutosave: (o: { save: (d: unknown) => Promise<void> }) => ({
          schedule: (d: unknown) => void o.save(d),
          flush,
          dispose: vi.fn(),
        }),
        watchOtherTabs: () => null,
        designAssetIds: () => [],
        createDesign: () => design,
        applyTemplate: (d: unknown) => d,
        validateProductDefinition: () => ok({ id: "stand-in-jersey", model: { url: "/x.glb", format: "glb" }, palette: { id: "p" } }),
        validateFontCatalog: () => ok({ fonts: [] }),
        validatePalette: () => ok({ id: "p" }),
        validateTemplate: () => ok({}),
        ResumePrompt: () => null,
        EditorShell: (props: { onDone: (d: unknown) => void; onClose: () => void; onDesignChange: (d: unknown, i: { started: boolean }) => void }) => (
          <div>
            <button onClick={() => props.onDesignChange(design, { started: true })}>change</button>
            <button onClick={() => props.onDone(design)}>done</button>
            <button onClick={props.onClose}>close</button>
          </div>
        ),
      }
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () => (String(url).endsWith("index.json") ? { templates: [] } : { fonts: [] }),
      }))
    )
  })

  async function mount(context: Record<string, unknown> = {}) {
    const { default: DesignEditor } = await import("@modules/design/components/design-editor")
    render(
      <DesignEditor
        product={editorProductFor("jersey")!}
        countryCode="pk"
        fontFamilies={{}}
        context={designerContext(context) as never}
      />
    )
    await screen.findByText("done")
  }

  it("a design this device holds for the earlier stand-in jersey is not opened: the designer says so, and keeps it", async () => {
    kvGet.mockImplementation(async (_store: string, key: string) =>
      key === "last:stand-in-jersey" ? { version: 1, productId: "stand-in-jersey", design: {} } : undefined
    )
    await mount()
    const note = await screen.findByTestId("design-earlier-model")
    expect(note).toHaveTextContent("earlier model of the jersey")
    expect(note).toHaveTextContent("nothing was deleted")
    fireEvent.click(screen.getByTestId("design-earlier-model-dismiss"))
    expect(screen.queryByTestId("design-earlier-model")).toBeNull()
  })

  it("shows no such note when this device holds nothing for an earlier model", async () => {
    await mount()
    expect(screen.queryByTestId("design-earlier-model")).toBeNull()
  })

  it("Done, signed out, saves the design on this device and asks to sign in, then comes back to finish", async () => {
    await mount()
    fireEvent.click(screen.getByText("change"))
    fireEvent.click(screen.getByText("done"))
    const step = await screen.findByTestId("team-order-sign-in")
    expect(flush).toHaveBeenCalled()
    expect(hasSavedDesign("jersey")).toBe(true)
    expect(push).not.toHaveBeenCalled()
    // the sign-in comes back to the designer with ?start=1 (the address is safe: a path of ours)
    expect(screen.getByTestId("team-order-sign-in-link")).toHaveAttribute("href", "/pk/account?view=signin&next=%2Fdesign%2Fjersey%3Fstart%3D1")
    expect(step).toHaveTextContent("stay on this device")
  })

  it("Done, signed in, asks for the team name and a need-by date; nothing is made before it is answered", async () => {
    await mount({ signedIn: true })
    fireEvent.click(screen.getByText("done"))
    expect(await screen.findByTestId("team-order-start")).toBeInTheDocument()
    expect(screen.getByTestId("team-order-submit")).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it("the close button returns to the product page without the notice", async () => {
    await mount()
    fireEvent.click(screen.getByText("close"))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/pk/products/jersey"))
  })

  it("keeps the page from scrolling while the designer is open, and lets go after", async () => {
    const { default: DesignEditor } = await import("@modules/design/components/design-editor")
    const view = render(
      <DesignEditor product={editorProductFor("jersey")!} countryCode="pk" fontFamilies={{}} context={designerContext() as never} />
    )
    expect(document.body.style.overflow).toBe("hidden")
    expect(document.documentElement.style.overscrollBehavior).toBe("none")
    view.unmount()
    expect(document.body.style.overflow).toBe("")
  })
})
