// A time limit for a call to the backend. The call gets an AbortSignal that
// fires when the time is up, and the wait ends then even if the call
// ignores the signal: a hung request never keeps the customer waiting
// longer than the limit. Plain timers, so tests can run the clock.

/** The error a call ends with when its time is up. */
export class DeadlineError extends Error {
  constructor(ms: number) {
    super(`No answer within ${ms} ms`)
    this.name = "DeadlineError"
  }
}

/**
 * Runs `call` with a signal that aborts after `ms`, and rejects with a
 * DeadlineError at that moment if the call hasn't settled. The error has no
 * HTTP status, so the data layer reads it as "no answer".
 */
export const within = <T>(ms: number, call: (signal: AbortSignal) => Promise<T>): Promise<T> => {
  const controller = new AbortController()
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort()
      reject(new DeadlineError(ms))
    }, ms)
    call(controller.signal).then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}
