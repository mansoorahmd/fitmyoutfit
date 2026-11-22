import { describe, expect, it, vi } from "vitest"

import { guarded } from "./guarded"
import { createListSaver } from "./list-saver"

describe("a call from the browser that throws", () => {
  it("is an unavailable failure, and passes a real answer through", async () => {
    const ok = guarded(async (n: number) => ({ ok: true as const, value: n + 1 }))
    expect(await ok(1)).toEqual({ ok: true, value: 2 })
    const down = guarded(async () => {
      throw new TypeError("Failed to fetch")
    })
    expect(await down()).toEqual({ ok: false, failure: { kind: "unavailable" } })
  })

  it("a list save whose call throws ends 'Not saved' and keeps the list for the retry (it used to stay 'Saving')", async () => {
    const states: string[] = []
    let calls = 0
    const save = guarded(async (_version: number, _list: string) => {
      calls++
      if (calls === 1) throw new TypeError("Failed to fetch")
      return { ok: true as const, value: { listVersion: 3 } }
    })
    const timers: (() => void)[] = []
    const saver = createListSaver<string, { listVersion: number }>({
      version: 2,
      delayMs: 0,
      save,
      onState: (s) => states.push(s.kind === "failed" ? `failed:${s.reason}` : s.kind),
      setTimer: (fn) => timers.push(fn),
      clearTimer: vi.fn(),
    })
    saver.push("list")
    await saver.flush()
    expect(states.at(-1)).toBe("failed:network")
    expect(states).not.toContain("saved")
    saver.retry()
    await saver.flush()
    expect(states.at(-1)).toBe("saved")
    expect(saver.version).toBe(3)
  })
})
