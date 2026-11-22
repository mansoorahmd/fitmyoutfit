"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { proofContent } from "@content/proof"
import { editorAssetUrl } from "@lib/editor/asset-path"
import { withCurrentFonts } from "@lib/editor/proof-fonts"
import type { EditorProduct } from "@lib/editor/products"

const w = proofContent.document.pictures

/** The pictures' size in pixels: crisp at 240 CSS pixels on a phone with a 2x screen, and on an A4 print. */
export const PICTURE_WIDTH = 480
export const PICTURE_HEIGHT = 600
const TEXTURE = 1024

type Drawn = { front: string; back: string; ms: number }
type State = { kind: "drawing" } | { kind: "ready"; drawn: Drawn } | { kind: "failed" }

async function fetchJson(relative: string): Promise<unknown> {
  const response = await fetch(editorAssetUrl(relative))
  if (!response.ok) throw new Error(`${relative}: HTTP ${response.status}`)
  return response.json() as Promise<unknown>
}

/**
 * Front and back of the kit, drawn from the design saved with the proof, with what the editor offers for pictures
 * of a design: `renderGarmentView` (the garment's triangles from the front or the back, in software, no WebGL) and
 * `drawDesignView` (the design's pattern texture looked up through that view), the same two functions that draw the
 * designer's template cards. The editor's code loads here, after the page is on screen, and nowhere else on the
 * page. It never uses the selection highlight and refuses a design whose logos it cannot reach (a logo file lives
 * on the device that uploaded it, so a proof opened elsewhere cannot show it): the product's picture stands in and
 * the page says so.
 */
export default function ProofPictures({
  entry,
  design,
  fontFamilies,
  fallbackPicture,
  earlierModel,
}: {
  /** The designer's data for the proof's product (model and definition files), or null when it has none. */
  entry: Pick<EditorProduct, "definition" | "modelFile"> | null
  /** The design JSON of the proof's design version, or null when it could not be read. */
  design: unknown
  /** The catalogue's family names to the faces this build has. */
  fontFamilies: Record<string, string>
  /** The product's own picture, shown when the design cannot be drawn. */
  fallbackPicture: string | null
  /** The design was made for an earlier model of the garment: not drawn, and the note says why. */
  earlierModel: boolean
}) {
  const [state, setState] = useState<State>({ kind: "drawing" })
  // The page is read again after a signature: new objects with the same content must not draw the pictures again.
  const designJson = useMemo(() => (design ? JSON.stringify(design) : ""), [design])
  const families = useRef(fontFamilies)
  families.current = fontFamilies
  const definition = entry?.definition ?? ""
  const modelFile = entry?.modelFile ?? ""

  useEffect(() => {
    if (earlierModel || !definition || !designJson) {
      setState({ kind: "failed" })
      return
    }
    let alive = true
    const started = performance.now()
    ;(async () => {
      const ed = await import("@fitmyoutfit/editor")
      const checkedProduct = ed.validateProductDefinition(await fetchJson(`products/${definition}.json`))
      if (!checkedProduct.ok) throw new Error("the product definition is not valid")
      const product = { ...checkedProduct.value, model: { ...checkedProduct.value.model, url: editorAssetUrl(`models/${modelFile}`) } }
      const upgraded = ed.upgradeDesign(withCurrentFonts(JSON.parse(designJson) as { fonts?: unknown }, families.current), { product })
      if (!upgraded.ok) throw new Error("the design does not fit the product")
      const fonts = await ed.loadDesignFonts(document.fonts, upgraded.value)
      if (fonts.missing.length > 0 || fonts.failed.length > 0) throw new Error("a font of the design is not available")
      const model = await ed.loadModel(product.model.url).promise
      const meshes = ed.extractGarmentMeshes(model.scene, product)

      const texture = document.createElement("canvas")
      texture.width = texture.height = TEXTURE
      const ctx = texture.getContext("2d", { willReadFrequently: true })
      if (!ctx) throw new Error("no 2D canvas")
      const inside = document.createElement("canvas")
      inside.width = inside.height = 256
      const insideCtx = inside.getContext("2d", { willReadFrequently: true })

      const picture = (side: "front" | "back"): string => {
        const view = ed.renderGarmentView(meshes, { width: PICTURE_WIDTH, height: PICTURE_HEIGHT, side })
        const out = document.createElement("canvas")
        out.width = view.width
        out.height = view.height
        const outCtx = out.getContext("2d")
        if (!outCtx) throw new Error("no 2D canvas")
        const image = outCtx.createImageData(view.width, view.height)
        const result = ed.drawDesignView(image.data, product, upgraded.value, {
          view,
          // no logo files are reachable here: a design that needs one is refused below, never drawn with a hole
          images: () => null,
          texture: { ctx, size: TEXTURE, read: () => ed.samplerFromRgba(ctx.getImageData(0, 0, TEXTURE, TEXTURE).data, TEXTURE, TEXTURE) },
          ...(insideCtx
            ? { insideTexture: { ctx: insideCtx, size: 256, read: () => ed.samplerFromRgba(insideCtx.getImageData(0, 0, 256, 256).data, 256, 256) } }
            : {}),
        })
        if (result.missingImages.length > 0) throw new Error("a logo of the design is not available here")
        outCtx.putImageData(image, 0, 0)
        return out.toDataURL("image/png")
      }
      const front = picture("front")
      const back = picture("back")
      if (alive) setState({ kind: "ready", drawn: { front, back, ms: Math.round(performance.now() - started) } })
    })().catch((error: unknown) => {
      console.warn("The proof's pictures could not be drawn:", error instanceof Error ? error.message : error)
      if (alive) setState({ kind: "failed" })
    })
    return () => {
      alive = false
    }
  }, [definition, modelFile, designJson, earlierModel])

  if (state.kind === "ready") {
    return (
      <div data-testid="proof-pictures-ready" data-draw-ms={state.drawn.ms}>
        <ul className="fmo-proof-pictures-row">
          {(
            [
              ["front", state.drawn.front, w.front, w.frontAlt],
              ["back", state.drawn.back, w.back, w.backAlt],
            ] as const
          ).map(([side, src, caption, alt]) => (
            <li key={side}>
              <figure>
                {/* a picture drawn in the browser, not a file: nothing for next/image to optimise */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={alt} width={PICTURE_WIDTH} height={PICTURE_HEIGHT} data-testid={`proof-picture-${side}`} />
                <figcaption>{caption}</figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    )
  }
  if (state.kind === "drawing") {
    return (
      <p className="fmo-proof-picture-note" role="status" data-testid="proof-pictures-drawing">
        {w.drawing}
      </p>
    )
  }
  return (
    <div data-testid="proof-pictures-fallback">
      {fallbackPicture ? (
        <ul className="fmo-proof-pictures-row">
          <li style={{ gridColumn: "1 / -1" }}>
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fallbackPicture} alt="" style={{ maxWidth: 200 }} />
            </figure>
          </li>
        </ul>
      ) : null}
      <p className="fmo-proof-picture-note">{earlierModel ? w.earlierNote : design ? w.failedNote : w.fallbackNote}</p>
    </div>
  )
}
