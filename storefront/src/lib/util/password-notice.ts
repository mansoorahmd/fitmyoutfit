// The "Your password was changed" notice on the sign-in page.
//
// `?notice=password-changed` alone proves nothing: anyone can type it into an
// address. The notice shows only while a short-lived, http-only flag cookie is
// present, which the reset action sets when the backend has accepted the new
// password. The middleware clears the flag on the request that loads the
// sign-in page (the page itself still sees it, so it shows the notice once).
// Plain code only: the middleware (edge) imports this file.

export const NOTICE_COOKIE = "fmo_pw_notice"

/** Seconds the flag lives: the time to load the sign-in page after the reset, not longer. */
export const NOTICE_MAX_AGE = 120

/** Where the flag is sent: the account pages of one country. */
export const noticePath = (countryCode: string): string => `/${countryCode}/account`

const SIGN_IN_PAGE = /^\/([a-z]{2})\/account\/?$/i

/**
 * The country whose flag the middleware should clear on this request, or null.
 * Only a real load of the sign-in page that asks for the notice counts: not a
 * prefetch or a client-side (RSC) fetch, which would use the flag up before
 * the customer sees the page.
 */
export const noticeToClear = (input: {
  pathname: string
  search: string
  hasFlag: boolean
  header: (name: string) => string | null | undefined
}): string | null => {
  if (!input.hasFlag) return null
  const match = SIGN_IN_PAGE.exec(input.pathname)
  if (!match) return null
  if (new URLSearchParams(input.search).get("notice") !== "password-changed") return null
  if (input.header("rsc") || input.header("next-router-prefetch") || /prefetch/i.test(input.header("purpose") ?? "")) return null
  return match[1].toLowerCase()
}
