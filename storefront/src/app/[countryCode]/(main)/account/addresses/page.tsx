import { Metadata } from "next"

import { accountContent } from "@content/account"
import { listRegions } from "@lib/data/regions"
import { addressCardView, sortAddresses, storeCountries } from "@lib/util/account-address"
import AddressBook from "@modules/account/components/address-book"
import { requireCustomer } from "@modules/account/require-customer"
import AccountFrame from "@modules/account/templates/account-frame"
import ServerError from "@modules/common/components/server-error"

export const metadata: Metadata = {
  title: accountContent.pageTitles.addresses,
}

/**
 * Addresses (docs/design/05-m1-pages.md, 9.5): the saved addresses, the
 * default first, with add, edit, remove and "Make this my default
 * address". The country choice is the store's countries; the fields and
 * checks are the checkout's.
 */
export default async function AddressesPage(props: { params: Promise<{ countryCode: string }> }) {
  const { countryCode } = await props.params
  const customer = await requireCustomer(countryCode, "/account/addresses")
  if (!customer) {
    return <ServerError />
  }

  const countries = storeCountries(await listRegions().catch(() => []))
  const saved = sortAddresses(customer.addresses)
  const name = (code?: string | null) =>
    countries.find((c) => c.code === code?.toLowerCase())?.name ?? null

  return (
    <AccountFrame page="addresses" customer={customer}>
      <div className="flex flex-col gap-6" data-testid="addresses-page">
        <h1 className="type-h1 text-brand-ink">{accountContent.addresses.title}</h1>
        <AddressBook
          cards={saved.map((a) => addressCardView(a, name(a.country_code)))}
          saved={saved}
          countries={countries}
          countryCode={countryCode}
        />
      </div>
    </AccountFrame>
  )
}
