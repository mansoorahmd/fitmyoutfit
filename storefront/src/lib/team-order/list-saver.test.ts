import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createListSaver, reasonOf, type ListSaveState } from "./list-saver"
import type { Failure, Outcome } from "./types"

type View = { listVersion: number }
type L = { n: number }

const ok = (listVersion: number): Outcome<View> => ({ ok: true, value: { listVersion } })
const fail = (failure: Failure): Outcome<View> => ({ ok: false, failure })

/** A save whose answers the test hands out one by one. */
function harness(options: { version?: number; delayMs?: number } = {}) {
  const calls: { version: number; list: L }[] = []
  const waiting: ((o: Outcome<View>) => void)[] = []
  const states: ListSaveState[] = []
  const saved: View[] = []
  const saver = createListSaver<L, View>({
    version: options.version ?? 1,
    delayMs: options.delayMs,
    save: (version, list) =>
      new Promise((resolve) => {
        calls.push({ version, list })
        waiting.push(resolve)
      }),
    onState: (s) => states.push(s),
    onSaved: (v) => saved.push(v),
  })
  const answer = async (o: Outcome<View>) => {
    waiting.shift()!(o)
    // let the saver's promise chain run
    await vi.advanceTimersByTimeAsync(0)
  }
  return { saver, calls, states, saved, answer, last: () => states[states.length - 1] }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("saving the list as the organizer goes", () => {
  it("saves a list from the version it has and moves to the version the server gives", async () => {
    const h = harness({ version: 4 })
    h.saver.push({ n: 1 })
    expect(h.calls).toEqual([{ version: 4, list: { n: 1 } }])
    expect(h.last()).toEqual({ kind: "saving" })
    await h.answer(ok(5))
    expect(h.last()).toEqual({ kind: "saved" })
    expect(h.saver.version).toBe(5)
    expect(h.saved).toEqual([{ listVersion: 5 }])
    h.saver.push({ n: 2 })
    expect(h.calls[1]).toEqual({ version: 5, list: { n: 2 } })
  })

  it("sends one save at a time and only the newest list that waited (a debounce of what arrives meanwhile)", async () => {
    const h = harness()
    h.saver.push({ n: 1 })
    h.saver.push({ n: 2 })
    h.saver.push({ n: 3 })
    h.saver.push({ n: 4 })
    expect(h.calls).toHaveLength(1)
    await h.answer(ok(2))
    expect(h.calls).toHaveLength(2)
    expect(h.calls[1]).toEqual({ version: 2, list: { n: 4 } })
    expect(h.last()).toEqual({ kind: "saving" })
    await h.answer(ok(3))
    expect(h.last()).toEqual({ kind: "saved" })
  })

  it("with a delay, waits for quiet and sends the last list once", async () => {
    const h = harness({ delayMs: 500 })
    h.saver.push({ n: 1 })
    await vi.advanceTimersByTimeAsync(300)
    h.saver.push({ n: 2 })
    await vi.advanceTimersByTimeAsync(300)
    expect(h.calls).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(300)
    expect(h.calls).toEqual([{ version: 1, list: { n: 2 } }])
  })

  it("flush sends at once and waits for the answer", async () => {
    const h = harness({ delayMs: 5000 })
    h.saver.push({ n: 1 })
    const done = h.saver.flush()
    expect(h.calls).toHaveLength(1)
    await h.answer(ok(2))
    expect(await done).toEqual({ kind: "saved" })
  })

  it("reports 'saved' without a call when nothing was pushed", async () => {
    const h = harness()
    expect(await h.saver.flush()).toEqual({ kind: "saved" })
    expect(h.calls).toHaveLength(0)
  })
})

describe("a save that fails", () => {
  it("says 'failed', keeps the list, and tries again by itself after 2 seconds", async () => {
    const h = harness()
    h.saver.push({ n: 1 })
    await h.answer(fail({ kind: "unavailable" }))
    expect(h.last()).toEqual({ kind: "failed", reason: "network" })
    expect(h.saver.unsent).toBe(true)
    await vi.advanceTimersByTimeAsync(1999)
    expect(h.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(2)
    expect(h.calls).toHaveLength(2)
    expect(h.calls[1]).toEqual({ version: 1, list: { n: 1 } })
    await h.answer(ok(2))
    expect(h.last()).toEqual({ kind: "saved" })
    expect(h.saver.unsent).toBe(false)
  })

  it("waits longer each time (2, 5, 15, then 30 seconds)", async () => {
    const h = harness()
    h.saver.push({ n: 1 })
    await h.answer(fail({ kind: "unavailable" }))
    for (const [wait, calls] of [
      [2000, 2],
      [5000, 3],
      [15000, 4],
      [30000, 5],
      [30000, 6],
    ] as const) {
      await vi.advanceTimersByTimeAsync(wait - 1)
      expect(h.calls).toHaveLength(calls - 1)
      await vi.advanceTimersByTimeAsync(1)
      expect(h.calls).toHaveLength(calls)
      await h.answer(fail({ kind: "unavailable" }))
    }
  })

  it("retry() tries at once, and a list typed meanwhile replaces the failed one", async () => {
    const h = harness()
    h.saver.push({ n: 1 })
    await h.answer(fail({ kind: "unavailable" }))
    h.saver.push({ n: 2 })
    expect(h.calls).toHaveLength(1)
    expect(h.last()).toEqual({ kind: "failed", reason: "network" })
    h.saver.retry()
    expect(h.calls).toHaveLength(2)
    expect(h.calls[1]).toEqual({ version: 1, list: { n: 2 } })
    await h.answer(ok(2))
    expect(h.last()).toEqual({ kind: "saved" })
  })

  it("a refusal of the list itself is not tried again by itself", async () => {
    const h = harness()
    h.saver.push({ n: 1 })
    await h.answer(fail({ kind: "refused", status: 400, code: "roster_malformed" }))
    expect(h.last()).toEqual({ kind: "failed", reason: "refused", code: "roster_malformed" })
    await vi.advanceTimersByTimeAsync(120000)
    expect(h.calls).toHaveLength(1)
    expect(h.saver.unsent).toBe(true)
  })

  it("tells a locked order, a deleted order and an ended sign-in apart", async () => {
    for (const [failure, reason] of [
      [{ kind: "refused", status: 400, code: "team_order_not_editable" }, "locked"],
      [{ kind: "not_found" }, "gone"],
      [{ kind: "signed_out" }, "signed_out"],
    ] as const) {
      const h = harness()
      h.saver.push({ n: 1 })
      await h.answer(fail(failure))
      expect(h.last()).toMatchObject({ kind: "failed", reason })
      await vi.advanceTimersByTimeAsync(120000)
      expect(h.calls).toHaveLength(1)
    }
  })

  it("reasonOf covers every kind of failure", () => {
    expect(reasonOf({ kind: "unavailable" })).toBe("network")
    expect(reasonOf({ kind: "stale", currentVersion: 2 })).toBe("stale")
  })
})

describe("the same order open in two places (409 roster_version_stale)", () => {
  async function conflict() {
    const h = harness({ version: 2 })
    h.saver.push({ n: 1 })
    await h.answer(fail({ kind: "stale", currentVersion: 5 }))
    return h
  }

  it("stops, keeps what was typed and says so", async () => {
    const h = await conflict()
    expect(h.last()).toEqual({ kind: "conflict", currentVersion: 5 })
    expect(h.saver.unsent).toBe(true)
    h.saver.push({ n: 2 })
    await vi.advanceTimersByTimeAsync(60000)
    expect(h.calls).toHaveLength(1)
    expect(h.last()).toEqual({ kind: "conflict", currentVersion: 5 })
  })

  it("keepMine saves the newest list over the server's, from the server's version", async () => {
    const h = await conflict()
    h.saver.push({ n: 2 })
    h.saver.keepMine()
    expect(h.calls[1]).toEqual({ version: 5, list: { n: 2 } })
    await h.answer(ok(6))
    expect(h.last()).toEqual({ kind: "saved" })
    expect(h.saver.version).toBe(6)
  })

  it("adopt takes the server's list: its version counts and the pending list is let go by that choice", async () => {
    const h = await conflict()
    h.saver.adopt(5)
    expect(h.last()).toEqual({ kind: "saved" })
    expect(h.saver.unsent).toBe(false)
    expect(h.saver.version).toBe(5)
    h.saver.push({ n: 3 })
    expect(h.calls[1]).toEqual({ version: 5, list: { n: 3 } })
  })

  it("retry does not get past a conflict", async () => {
    const h = await conflict()
    h.saver.retry()
    expect(h.calls).toHaveLength(1)
  })
})

describe("disposing", () => {
  it("sends nothing and says nothing afterwards", async () => {
    const h = harness({ delayMs: 100 })
    h.saver.push({ n: 1 })
    h.saver.dispose()
    const before = h.states.length
    await vi.advanceTimersByTimeAsync(1000)
    expect(h.calls).toHaveLength(0)
    expect(h.states).toHaveLength(before)
  })
})
