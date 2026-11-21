// The files the designer may fetch from the storefront, and nothing else.
// They are served from packages/editor/samples/ by
// app/api/editor-assets/[...path]/route.ts. A request is checked here against
// a short list of shapes, so no other file of the repository can be read
// through the route.

const NAME = "[a-z0-9][a-z0-9-]*"

const SHAPES: { pattern: RegExp; type: string }[] = [
  { pattern: new RegExp(`^models/${NAME}\.glb$`), type: "model/gltf-binary" },
  { pattern: new RegExp(`^(products|palettes|fonts)/${NAME}\.json$`), type: "application/json" },
  { pattern: new RegExp(`^templates/${NAME}/${NAME}\.json$`), type: "application/json" },
]

/** The address the browser fetches a sample file from ("models/x.glb" gives "/api/editor-assets/models/x.glb"). */
export function editorAssetUrl(relative: string): string {
  return `/api/editor-assets/${relative}`
}

/** The file's path inside samples/ and its media type, or null when the request is not one of the allowed shapes. */
export function resolveEditorAsset(segments: readonly string[]): { relative: string; type: string } | null {
  const relative = segments.join("/")
  const shape = SHAPES.find((s) => s.pattern.test(relative))
  return shape ? { relative, type: shape.type } : null
}
