import { describe, expect, it } from "vitest"

import { topBarState } from "./save-words"

const base = { device: null, designUnsent: false, touched: true } as const

describe("the top bar's save state", () => {
  it("says nothing before anything happened", () => {
    expect(topBarState({ ...base, list: { kind: "saved" }, touched: false }).state).toBeNull()
  })
  it("says 'Saved' (server words) when the list is on the server and the design has nothing unsent", () => {
    expect(topBarState({ ...base, list: { kind: "saved" } })).toEqual({ state: "saved", savedWords: "server" })
  })
  it("keeps 'Saved on this device' while the design has changes only this device has", () => {
    expect(topBarState({ ...base, list: { kind: "saved" }, designUnsent: true })).toEqual({ state: "saved", savedWords: "device" })
  })
  it("says 'Saving' while the list or the device copy is being written", () => {
    expect(topBarState({ ...base, list: { kind: "saving" } }).state).toBe("saving")
    expect(topBarState({ ...base, list: { kind: "saved" }, device: "saving" }).state).toBe("saving")
  })
  it("says 'Not saved' for a failed save, a conflict and a failed device write, whatever else is going on", () => {
    expect(topBarState({ ...base, list: { kind: "failed", reason: "network" }, device: "saving" }).state).toBe("failed")
    expect(topBarState({ ...base, list: { kind: "conflict", currentVersion: 3 } }).state).toBe("failed")
    expect(topBarState({ ...base, list: { kind: "saved" }, device: "failed" }).state).toBe("failed")
  })
})
