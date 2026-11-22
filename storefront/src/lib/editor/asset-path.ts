// The files the designer may fetch from the storefront, and nothing else.
// They are served from packages/editor/samples/ by
// app/api/editor-assets/[...path]/route.ts. A request is checked here against
// a short list of shapes, so no other file of the repository can be read
// through the route.

// A name is lowercase letters, digits and hyphens, starting with a letter or digit.
// Regex literals, so "\." is a real escaped dot (in a template string it lost its backslash).
const SHAPES: { pattern: RegExp; type: string }[] = [
  { pattern: /^models\/[a-z0-9][a-z0-9-]*\.glb$/, type: "model/gltf-binary" },
  { pattern: /^(products|palettes|fonts)\/[a-z0-9][a-z0-9-]*\.json$/, type: "application/json" },
  { pattern: /^pictures\/[a-z0-9][a-z0-9-]*\.png$/, type: "image/png" },
  { pattern: /^templates\/[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*\.json$/, type: "application/json" },
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
