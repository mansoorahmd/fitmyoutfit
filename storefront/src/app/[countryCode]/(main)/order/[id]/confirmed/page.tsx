import { Metadata } from "next"
import { notFound } from "next/navigation"

import { orderContent } from "@content/order"
import { retrieveCustomer } from "@lib/data/customer"
import {
  getOrderDeliveryPromise,
  retrieveOrderForConfirmation,
} from "@lib/data/order-confirmation"
import { getRegion } from "@lib/data/regions"
import { orderConfirmationView } from "@lib/util/order-confirmation"
import OrderCompletedTemplate from "@modules/order/templates/order-completed-template"

type Props = {
  params: Promise<{ id: string; countryCode: string }>
}

export const metadata: Metadata = {
  title: orderContent.pageTitle,
}

/**
 * The order confirmation (docs/design/05-m1-pages.md, section 7): the
 * order, and the delivery date it kept when it was placed, read from the
 * backend's own route (Medusa's order route doesn't return metadata).
 */
export default async function OrderConfirmedPage(props: Props) {
  const { id, countryCode } = await props.params
  const [order, promise, customer] = await Promise.all([
    retrieveOrderForConfirmation(id),
    getOrderDeliveryPromise(id),
    retrieveCustomer().catch(() => null),
  ])

  if (!order) {
    notFound()
  }

  const country = order.shipping_address?.country_code ?? countryCode
  const region = await getRegion(country)
  const countryName =
    region?.countries?.find((c) => c.iso_2 === country)?.display_name ?? null

  return (
    <OrderCompletedTemplate
      view={orderConfirmationView({ order, promise, countryName })}
      signedIn={!!customer}
    />
  )
}
