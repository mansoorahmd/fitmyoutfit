import { Metadata } from "next"

import { accountContent } from "@content/account"
import { profileRows } from "@lib/util/account-rows"
import ProfileRows from "@modules/account/components/profile-rows"
import { requireCustomer } from "@modules/account/require-customer"
import AccountFrame from "@modules/account/templates/account-frame"
import ServerError from "@modules/common/components/server-error"

export const metadata: Metadata = {
  title: accountContent.pageTitles.profile,
}

/**
 * Profile (docs/design/05-m1-pages.md, 9.6): the name and the phone can be
 * changed; the email is shown read-only. No password row: Medusa's store
 * API can't change a password without the reset flow (a later task). No
 * billing address: addresses live on their own page.
 */
export default async function ProfilePage(props: { params: Promise<{ countryCode: string }> }) {
  const { countryCode } = await props.params
  const customer = await requireCustomer(countryCode, "/account/profile")
  if (!customer) {
    return <ServerError />
  }

  return (
    <AccountFrame page="profile" customer={customer}>
      <div className="flex flex-col gap-6" data-testid="profile-page">
        <h1 className="type-h1 text-brand-ink">{accountContent.profile.title}</h1>
        <ProfileRows
          rows={profileRows(customer)}
          initial={{
            firstName: customer.first_name ?? "",
            lastName: customer.last_name ?? "",
            phone: customer.phone ?? "",
          }}
        />
      </div>
    </AccountFrame>
  )
}
