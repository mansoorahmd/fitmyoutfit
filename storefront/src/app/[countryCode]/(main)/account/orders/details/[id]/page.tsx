import { Metadata } from "next"
import { notFound } from "next/navigation"
import { cache } from "react"

import { accountContent } from "@content/account"
import { customerState } from "@lib/data/customer"
import { retrieveAccountOrder } from "@lib/data/orders"
import { listRegions } from "@lib/data/regions"
import { storeCountries } from "@lib/util/account-address"
import { accountOrderView, orderNumber } from "@lib/util/account-orders"
import { fill } from "@lib/util/wording"
import { requireCustomer } from "@modules/account/require-customer"
import AccountFrame from "@modules/account/templates/account-frame"
import AccountOrderTemplate from "@modules/account/templates/account-order-template"
import ServerError from "@modules/common/components/server-error"

type Props = {
  params: Promise<{ countryCode: string; id: string }>
}

/** Read once per request, for the title and the page. */
const getOrder = cache((id: string, customerId: string) => retrieveAccountOrder(id, customerId))

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { id } = await props.params
  const state = await customerState()
  const found = state.kind === "signed_in" ? await getOrder(id, state.customer.id) : null
  const number = found?.kind === "found" ? orderNumber(found.order.display_id) : null
  return {
    title: number ? fill(accountContent.pageTitles.order, { number }) : accountContent.pageTitles.orders,
  }
}

/**
 * One order (docs/design/05-m1-pages.md, 9.4), only the signed-in
 * customer's own: another customer's order, or an unknown id, is "We
 * can't find that order". The promised date comes from the backend's
 * delivery-promise route; without it the date line is left out and the
 * page still shows.
 */
export default async function AccountOrderPage(props: Props) {
  const { countryCode, id } = await props.params
  const customer = await requireCustomer(countryCode, `/account/orders/details/${id}`)
  if (!customer) {
    return <ServerError />
  }

  const [found, regions] = await Promise.all([
    getOrder(id, customer.id),
    listRegions().catch(() => []),
  ])
  if (found.kind === "not_found") {
    notFound()
  }
  if (found.kind === "failed") {
    return <ServerError />
  }

  const country = found.order.shipping_address?.country_code?.toLowerCase()
  const countryName = storeCountries(regions).find((c) => c.code === country)?.name ?? null
  const view = accountOrderView({ order: found.order, promise: found.promise, countryName })

  return (
    <AccountFrame
      page="orders"
      customer={customer}
      back={{ href: "/account/orders", label: accountContent.order.back, testId: "order-back" }}
    >
      <AccountOrderTemplate view={view} />
    </AccountFrame>
  )
}
