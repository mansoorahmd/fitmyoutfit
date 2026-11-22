// The designer calls the data layer's server actions from the browser. The data layer itself never throws
// (it answers with a Failure), but the call from the browser to the store can: the phone lost its signal,
// the request was cut. A call that throws must be a failure like any other ("we couldn't reach the store"),
// never a save that stays "Saving" for ever or a list that is dropped. Plain functions, tested on their own.

import type { Outcome } from "./types"

/** The same call, with a throw turned into `unavailable`. */
export function guarded<A extends unknown[], T>(call: (...args: A) => Promise<Outcome<T>>): (...args: A) => Promise<Outcome<T>> {
  return async (...args: A) => {
    try {
      return await call(...args)
    } catch {
      return { ok: false, failure: { kind: "unavailable" } }
    }
  }
}
