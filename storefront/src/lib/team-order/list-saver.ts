// Saving the team list to its order as the organizer goes (docs/design/08-team-list.md,
// 11.1; contract section 2, `PUT .../roster`). The editor already waits for a second of
// quiet before it hands the list over (`teamList.debounceMs`); this is what happens next:
//
// - one save at a time, always from the version the last answer gave; a list that arrives
//   while one is on its way waits and only the newest is sent (nothing between is sent);
// - a failed save is never dropped: the list stays pending, and a network failure is tried
//   again by itself (after 2, 5, 15 and then every 30 seconds) and by `retry()`;
// - 409 `roster_version_stale` (the list was saved elsewhere since): nothing is sent until the
//   organizer chooses, `keepMine()` (save over it, from the server's version) or `adopt()`
//   (take the server's list; the pending one is let go by that choice, not silently);
// - the state is what the top bar and the banner tell, so it is the truth.
//
// Plain logic with injected timers and no React or network, so it is tested on its own.

import type { Failure, Outcome } from "./types"

export type SaveReason =
  /** The backend could not be reached (or answered with a server error): tried again by itself. */
  | "network"
  /** The backend refused the list itself (too long a text and the like): trying again will not help. */
  | "refused"
  /** The sign-in has ended. */
  | "signed_out"
  /** The order is no longer a draft: the list cannot change. */
  | "locked"
  /** The order is gone (deleted elsewhere). */
  | "gone"

export type ListSaveState =
  | { kind: "saved" }
  | { kind: "saving" }
  | { kind: "failed"; reason: SaveReason; code?: string }
  | { kind: "conflict"; currentVersion: number }

export type ListSaver<L> = {
  /** The newest list: saved after the (optional) delay. */
  push(list: L): void
  /** Sends what is pending now and waits until nothing is left to send or it cannot be sent. */
  flush(): Promise<ListSaveState>
  /** Tries again at once (the button, or the browser coming back online). */
  retry(): void
  /** After a conflict: save the pending list over the server's, from the server's version. */
  keepMine(): void
  /** After a conflict: take the server's list; its version is the one to save from now on. The pending list is dropped. */
  adopt(version: number): void
  /** Whether a list waits to be sent (or is on its way). */
  readonly unsent: boolean
  readonly state: ListSaveState
  /** The version the next save is made from. */
  readonly version: number
  dispose(): void
}

export type ListSaverOptions<L, T extends { listVersion: number }> = {
  /** The list's version now (the order's `roster.version`). */
  version: number
  save: (version: number, list: L) => Promise<Outcome<T>>
  onState: (state: ListSaveState) => void
  /** The server's whole answer to a save that worked: the checks, the new version. */
  onSaved?: (answer: T) => void
  delayMs?: number
  retryDelaysMs?: readonly number[]
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export const DEFAULT_RETRY_DELAYS_MS = [2000, 5000, 15000, 30000] as const

/** What a failure of the save means for the list. */
export function reasonOf(failure: Failure): SaveReason | "stale" {
  switch (failure.kind) {
    case "stale":
      return "stale"
    case "signed_out":
      return "signed_out"
    case "not_found":
      return "gone"
    case "unavailable":
      return "network"
    case "refused":
      return failure.code === "team_order_not_editable" ? "locked" : "refused"
  }
}

export function createListSaver<L, T extends { listVersion: number }>(options: ListSaverOptions<L, T>): ListSaver<L> {
  const delay = options.delayMs ?? 0
  const delays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))

  let version = options.version
  let pending: { list: L } | null = null
  let state: ListSaveState = { kind: "saved" }
  let running: Promise<void> | null = null
  /** A failure or a conflict stops sending until retry, keepMine or adopt. */
  let halted = false
  let delayTimer: unknown = null
  let retryTimer: unknown = null
  let attempts = 0
  let disposed = false

  const set = (next: ListSaveState) => {
    state = next
    if (!disposed) options.onState(next)
  }
  const stopTimers = () => {
    if (delayTimer !== null) clearTimer(delayTimer)
    if (retryTimer !== null) clearTimer(retryTimer)
    delayTimer = null
    retryTimer = null
  }

  async function drain(): Promise<void> {
    while (pending && !halted && !disposed) {
      const sending = pending
      pending = null
      set({ kind: "saving" })
      const result = await options.save(version, sending.list)
      if (disposed) return
      if (result.ok) {
        version = result.value.listVersion
        attempts = 0
        options.onSaved?.(result.value)
        continue
      }
      // A list that failed is never dropped: it waits, unless a newer one has already replaced it.
      pending = pending ?? sending
      halted = true
      const failure = result.failure
      if (failure.kind === "stale") {
        set({ kind: "conflict", currentVersion: failure.currentVersion })
        return
      }
      const reason = reasonOf(failure) as SaveReason
      const code = failure.kind === "refused" ? failure.code : undefined
      set({ kind: "failed", reason, ...(code ? { code } : {}) })
      if (reason === "network") {
        const wait = delays[Math.min(attempts, delays.length - 1)] ?? 30000
        attempts++
        retryTimer = setTimer(() => {
          retryTimer = null
          retry()
        }, wait)
      }
      return
    }
    if (!pending && !halted && !disposed) set({ kind: "saved" })
  }

  function kick(): Promise<void> {
    if (running) return running
    running = drain().finally(() => {
      running = null
      // a list that arrived at the very end of a pass
      if (pending && !halted && !disposed) void kick()
    })
    return running
  }

  function retry() {
    if (disposed || state.kind === "conflict") return
    if (retryTimer !== null) clearTimer(retryTimer)
    retryTimer = null
    halted = false
    if (pending) void kick()
    else set({ kind: "saved" })
  }

  return {
    push(list) {
      if (disposed) return
      pending = { list }
      if (halted) return // the list waits with the failure or the conflict; the state keeps saying so
      if (state.kind !== "saving") set({ kind: "saving" })
      if (delayTimer !== null) clearTimer(delayTimer)
      if (delay <= 0) {
        delayTimer = null
        void kick()
      } else {
        delayTimer = setTimer(() => {
          delayTimer = null
          void kick()
        }, delay)
      }
    },
    async flush() {
      if (delayTimer !== null) clearTimer(delayTimer)
      delayTimer = null
      if (pending && !halted) await kick()
      else if (running) await running
      return state
    },
    retry,
    keepMine() {
      if (state.kind !== "conflict") return
      version = state.currentVersion
      halted = false
      if (pending) void kick()
      else set({ kind: "saved" })
    },
    adopt(next) {
      version = next
      pending = null
      halted = false
      attempts = 0
      stopTimers()
      set({ kind: "saved" })
    },
    get unsent() {
      return pending !== null || running !== null
    },
    get state() {
      return state
    },
    get version() {
      return version
    },
    dispose() {
      disposed = true
      stopTimers()
      pending = null
    },
  }
}
