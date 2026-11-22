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
vi.mock("@lib/data/regions", () => ({ getRegion }))
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

import { designContent } from "@content/design"
import { editorAssetUrl, resolveEditorAsset } from "@lib/editor/asset-path"
import { designPath, productReturnPath } from "@lib/editor/paths"
import { editorHandles, editorProductFor } from "@lib/editor/products"
import { hasSavedDesign, setSavedDesignFlag } from "@lib/editor/saved-design"
import DesignButton from "@modules/design/components/design-button"
import DesignSavedNotice from "@modules/design/components/design-saved-notice"

import DesignNotFound from "../app/[countryCode]/(design)/not-found"
import DesignPage from "../app/[countryCode]/(design)/design/[handle]/page"

describe("which product has which model", () => {
  it("the jersey and the T-shirt have a model, each with its own definition, file and credit", () => {
    expect(editorHandles()).toEqual(["jersey", "t-shirt"])
    expect(editorProductFor("jersey")).toMatchObject({
      definition: "stand-in-jersey",
      modelFile: "stand-in-jersey.glb",
      credit: { licence: "CC BY 4.0", author: "Wearable3D", changed: true },
    })
    expect(editorProductFor("t-shirt")).toMatchObject({
      definition: "stand-in-tshirt",
      modelFile: "stand-in-tshirt.glb",
    })
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
    DesignPage({ params: Promise.resolve({ countryCode, handle }) })

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

describe("the designer returns to the product page", () => {
  const saveDesign = vi.fn()
  const flush = vi.fn()

  beforeEach(() => {
    push.mockClear()
    saveDesign.mockReset()
    flush.mockReset()
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
        openIndexedDbStore: vi.fn().mockResolvedValue({}),
        createMemoryKeyValueStore: vi.fn(),
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

  async function mount() {
    const { default: DesignEditor } = await import("@modules/design/components/design-editor")
    render(
      <DesignEditor
        product={editorProductFor("jersey")!}
        countryCode="pk"
        fontFamilies={{}}
      />
    )
    await screen.findByText("done")
  }

  it("Done saves the design, remembers it for the button and returns with the notice flag", async () => {
    await mount()
    fireEvent.click(screen.getByText("change"))
    fireEvent.click(screen.getByText("done"))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/pk/products/jersey?design=saved"))
    expect(flush).toHaveBeenCalled()
    expect(hasSavedDesign("jersey")).toBe(true)
  })

  it("the close button returns to the product page without the notice", async () => {
    await mount()
    fireEvent.click(screen.getByText("close"))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/pk/products/jersey"))
  })

  it("keeps the page from scrolling while the designer is open, and lets go after", async () => {
    const { default: DesignEditor } = await import("@modules/design/components/design-editor")
    const view = render(
      <DesignEditor product={editorProductFor("jersey")!} countryCode="pk" fontFamilies={{}} />
    )
    expect(document.body.style.overflow).toBe("hidden")
    expect(document.documentElement.style.overscrollBehavior).toBe("none")
    view.unmount()
    expect(document.body.style.overflow).toBe("")
  })
})
