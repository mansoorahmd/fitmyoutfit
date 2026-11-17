import { cookies } from "next/headers"

import { RESET_COOKIE, openReset, resetSecret } from "@lib/util/reset-cookie"

/**
 * The email of the reset link in this browser's cookie, or null when there is
 * no usable link (none, expired, altered). The cookie is opened in here and
 * only the email comes out: the reset page awaits this, so the token is never
 * a value of the page's component. In development React keeps the awaited
 * values of a server component in the data it sends the browser (the RSC
 * payload), which is where the token used to leak.
 *
 * Not a server action (no "use server"): the browser cannot call it.
 */
export const openedResetEmail = async (): Promise<string | null> => {
  const link = await openReset((await cookies()).get(RESET_COOKIE)?.value, resetSecret())
  return link?.email ?? null
}
