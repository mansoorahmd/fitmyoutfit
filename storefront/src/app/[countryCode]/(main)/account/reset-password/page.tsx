import { Metadata } from "next"

import { accountContent } from "@content/account"
import { openedResetEmail } from "@lib/data/reset-email"
import ResetPasswordTemplate from "@modules/account/templates/reset-password-template"

export const metadata: Metadata = {
  title: accountContent.pageTitles.resetPassword,
  // a link's page is for one person: no search listing, no Referer to anywhere
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

// reads the visitor's cookie, so never prerendered or cached
export const dynamic = "force-dynamic"

/**
 * `/account/reset-password` (contract m1-password-reset, section 3). The
 * link's token and email were taken from the address by the middleware and
 * sealed into a cookie (lib/util/reset-cookie.ts); this page opens the cookie
 * on the server (lib/data/reset-email.ts, which returns the email only) and
 * gives the form the email. With no usable cookie (a
 * link with no token or email, one that expired, or one already used) it says
 * the link no longer works. Never an error page.
 */
export default async function ResetPasswordPage() {
  // the cookie is opened inside this call and only the email comes back: the token is never a value here
  return <ResetPasswordTemplate email={await openedResetEmail()} />
}
