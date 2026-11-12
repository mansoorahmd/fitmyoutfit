import { Metadata } from "next"

import { accountContent } from "@content/account"
import { customerState } from "@lib/data/customer"
import { listAccountOrders } from "@lib/data/orders"
import { listRegions } from "@lib/data/regions"
import { addressCardView, overviewAddress, storeCountries } from "@lib/util/account-address"
import { authView, queryValue } from "@lib/util/account-auth"
import { orderCardView } from "@lib/util/account-orders"
import AccountOverview from "@modules/account/templates/account-overview"
import AccountFrame from "@modules/account/templates/account-frame"
import AuthTemplate from "@modules/account/templates/auth-template"
import ServerError from "@modules/common/components/server-error"

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** How many orders the overview shows (05, 9.2). */
const RECENT_ORDERS = 3

export async function generateMetadata(props: Props): Promise<Metadata> {
  const [state, query] = await Promise.all([customerState(), props.searchParams])
  if (state.kind === "signed_in") {
    return { title: accountContent.pageTitles.overview }
  }
  return {
    title:
      authView(queryValue(query.view)) === "create"
        ? accountContent.pageTitles.create
        : accountContent.pageTitles.signIn,
  }
}

/**
 * `/account` (docs/design/05-m1-pages.md, 8 and 9.2): signed out, sign-in
 * or create account (`?view=`, `?next=`, `?email=`); signed in, the
 * overview. One plain page, no parallel routes (task S1-5: the
 * `@dashboard` / `@login` slots made the production build answer 500).
 */
export default async function AccountPage(props: Props) {
  const [query, state] = await Promise.all([props.searchParams, customerState()])

  if (state.kind === "failed") {
    return <ServerError />
  }

  if (state.kind === "signed_out") {
    return (
      <AuthTemplate
        view={authView(queryValue(query.view))}
        next={queryValue(query.next) || null}
        email={queryValue(query.email).slice(0, 254)}
      />
    )
  }

  const customer = state.customer
  const [orders, regions] = await Promise.all([
    listAccountOrders(RECENT_ORDERS),
    listRegions().catch(() => []),
  ])
  const countries = storeCountries(regions)
  const address = overviewAddress(customer.addresses)
  const countryName = (code?: string | null) =>
    countries.find((c) => c.code === code?.toLowerCase())?.name ?? null

  return (
    <AccountFrame page="overview" customer={customer}>
      <AccountOverview
        orders={
          orders.ok
            ? orders.orders.map((order, i) => orderCardView(order, orders.promises[i] ?? null))
            : null
        }
        address={address ? addressCardView(address, countryName(address.country_code)) : null}
      />
    </AccountFrame>
  )
}
