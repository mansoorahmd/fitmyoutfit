import { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { orderContent } from "@content/order"
import { retrieveCustomer } from "@lib/data/customer"
import {
  getOrderDeliveryPromise,
  retrieveOrderForConfirmation,
} from "@lib/data/order-confirmation"
import { getRegion, listRegions } from "@lib/data/regions"
import {
  confirmationElsewhere,
  orderBelongsTo,
  orderConfirmationView,
} from "@lib/util/order-confirmation"
import ServerError from "@modules/common/components/server-error"
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
 * backend's own route (Medusa's order route doesn't return metadata). The
 * date waits at most a few seconds (QA S1-4, D4). "We can't find that
 * order" only when the backend says so; the server-error block when it
 * doesn't answer (D3). An order opened under another country's address
 * moves to its own (D15).
 */
export default async function OrderConfirmedPage(props: Props) {
  const { id, countryCode } = await props.params
  const [read, promise, customer] = await Promise.all([
    retrieveOrderForConfirmation(id),
    getOrderDeliveryPromise(id),
    retrieveCustomer().catch(() => null),
  ])

  if (read.kind === "not_found") {
    notFound()
  }
  if (read.kind === "failed") {
    return <ServerError />
  }
  const { order } = read

  const country = order.shipping_address?.country_code?.toLowerCase() ?? countryCode
  const elsewhere = confirmationElsewhere({
    orderId: order.id,
    orderCountry: country,
    urlCountry: countryCode,
    storeCountries: ((await listRegions().catch(() => null)) ?? []).flatMap((r) =>
      (r.countries ?? []).map((c) => c.iso_2?.toLowerCase() ?? "")
    ),
  })
  if (elsewhere) {
    redirect(elsewhere)
  }

  const region = await getRegion(country)
  const countryName =
    region?.countries?.find((c) => c.iso_2 === country)?.display_name ?? null

  return (
    <OrderCompletedTemplate
      view={orderConfirmationView({ order, promise, countryName })}
      ownOrder={orderBelongsTo(order as { customer_id?: string | null }, customer)}
    />
  )
}
