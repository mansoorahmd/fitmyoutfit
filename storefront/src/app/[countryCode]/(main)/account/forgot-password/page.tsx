import { Metadata } from "next"
import { redirect } from "next/navigation"

import { accountContent } from "@content/account"
import { customerState } from "@lib/data/customer"
import ForgotPasswordTemplate from "@modules/account/templates/forgot-password-template"
import ServerError from "@modules/common/components/server-error"

export const metadata: Metadata = {
  title: accountContent.pageTitles.forgotPassword,
}

/**
 * `/account/forgot-password` (contract m1-password-reset, section 3). A
 * signed-in visitor is sent to the profile, whose Password row does the same
 * thing for the account's own email.
 */
export default async function ForgotPasswordPage(props: { params: Promise<{ countryCode: string }> }) {
  const { countryCode } = await props.params
  const state = await customerState()
  if (state.kind === "signed_in") {
    redirect(`/${countryCode}/account/profile`)
  }
  if (state.kind === "failed") {
    return <ServerError />
  }
  return <ForgotPasswordTemplate />
}
