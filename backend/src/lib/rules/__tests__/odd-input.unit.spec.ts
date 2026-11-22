import { hasNullInParams, isPathDecodeError, scanJson } from "../odd-input"

const nest = (levels: number) => {
  let value: unknown = []
  for (let i = 1; i < levels; i += 1) value = [value]
  return value
}

describe("scanJson", () => {
  it("finds a NUL in a string, in a key and deep inside, and not in text that only mentions it", () => {
    expect(scanJson({ a: "x\u0000y" }).hasNull).toBe(true)
    expect(scanJson({ "k\u0000": 1 }).hasNull).toBe(true)
    expect(scanJson(["ok", [{ deep: ["\u0000"] }]]).hasNull).toBe(true)
    expect(scanJson({ a: "\\u0000", b: "0", c: 0 }).hasNull).toBe(false)
  })

  it("counts levels: the root is 1, and the limit itself is allowed", () => {
    expect(scanJson(nest(3), { maxDepth: 3 }).tooDeep).toBe(false)
    expect(scanJson(nest(4), { maxDepth: 3 }).tooDeep).toBe(true)
    expect(scanJson({ a: { b: 1 } }, { maxDepth: 2 }).tooDeep).toBe(false)
    expect(scanJson({ a: { b: {} } }, { maxDepth: 2 }).tooDeep).toBe(true)
    expect(scanJson("text", { maxDepth: 1 }).tooDeep).toBe(false)
  })

  it("does not overflow the stack on a value nested 50,000 levels deep", () => {
    expect(scanJson(nest(50_000), { maxDepth: 64 }).tooDeep).toBe(true)
    expect(scanJson(nest(50_000)).tooDeep).toBe(false)
  })

  it("leaves the skipped top-level keys alone, and only those", () => {
    expect(scanJson({ design: { a: "\u0000" } }, { skipTopLevelKeys: ["design"] }).hasNull).toBe(false)
    expect(scanJson({ other: { design: "\u0000" } }, { skipTopLevelKeys: ["design"] }).hasNull).toBe(true)
  })
})

describe("hasNullInParams and isPathDecodeError", () => {
  it("sees a NUL in a decoded parameter", () => {
    expect(hasNullInParams({ id: "a\u0000b" })).toBe(true)
    expect(hasNullInParams({ id: "teamord_1", proofId: "x" })).toBe(false)
    expect(hasNullInParams(undefined)).toBe(false)
  })

  it("recognises Express's decoding error and nothing else", () => {
    const decode = Object.assign(new URIError("Failed to decode param '%'"), { status: 400, statusCode: 400 })
    expect(isPathDecodeError(decode)).toBe(true)
    expect(isPathDecodeError(new Error("Failed to decode param 'x'"))).toBe(false)
    expect(isPathDecodeError(new Error("boom"))).toBe(false)
    expect(isPathDecodeError(null)).toBe(false)
  })
})
