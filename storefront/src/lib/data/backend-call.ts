import "server-only"

import { BackendCall } from "@lib/util/checkout-order"

/**
 * A backend call's answer, or its HTTP status (none when nothing came
 * back: no connection, or the time limit ran out). Never throws.
 */
export const call = async <T>(run: () => Promise<T>): Promise<BackendCall<T>> => {
  try {
    return { ok: true, body: await run() }
  } catch (error) {
    const status = (error as { status?: unknown })?.status
    return { ok: false, status: typeof status === "number" ? status : undefined }
  }
}
