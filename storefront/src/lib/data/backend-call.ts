import "server-only"

import { BackendCall } from "@lib/util/checkout-order"

/**
 * A backend call's answer, or its HTTP status (none when nothing came
 * back: no connection, or the time limit ran out), with the backend's
 * message when it sent one. The message stays on the server: it is read
 * only where the contract names an answer by it (section 9, the
 * completion's "Payment sessions are required"), never shown. Never throws.
 */
export const call = async <T>(run: () => Promise<T>): Promise<BackendCall<T>> => {
  try {
    return { ok: true, body: await run() }
  } catch (error) {
    const status = (error as { status?: unknown })?.status
    const message = (error as { message?: unknown })?.message
    return {
      ok: false,
      status: typeof status === "number" ? status : undefined,
      ...(typeof status === "number" && typeof message === "string" ? { message } : {}),
    }
  }
}
