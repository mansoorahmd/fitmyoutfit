import { readFile } from "node:fs/promises"
import path from "node:path"

import { resolveEditorAsset } from "@lib/editor/asset-path"

/**
 * Serves the designer's sample files (the 3D models, the product
 * definitions, the colours, the fonts catalogue and the templates) straight
 * from packages/editor/samples/, so the repository keeps one copy. Only the
 * shapes in lib/editor/asset-path.ts are served. The storefront is started
 * from the repository (npm run dev / npm start in storefront/), so the
 * samples are one folder up from its working directory.
 */
const SAMPLES = path.resolve(process.cwd(), "..", "packages", "editor", "samples")

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await context.params
  const asset = resolveEditorAsset(segments)
  if (!asset) return new Response("Not found", { status: 404 })
  try {
    const bytes = await readFile(path.join(SAMPLES, ...asset.relative.split("/")))
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": asset.type,
        "Cache-Control": "public, max-age=3600",
      },
    })
  } catch {
    return new Response("Not found", { status: 404 })
  }
}
