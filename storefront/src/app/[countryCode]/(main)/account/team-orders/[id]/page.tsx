import { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { cache } from "react"

import { teamOrderContent } from "@content/team-order"
import { customerState } from "@lib/data/customer"
import { listProducts } from "@lib/data/products"
import { listProofs, retrieveTeamOrder } from "@lib/data/team-orders"
import { editorProductFor } from "@lib/editor/products"
import { authHref } from "@lib/util/account-auth"
import { fill } from "@lib/util/wording"
import { requireCustomer } from "@modules/account/require-customer"
import AccountFrame from "@modules/account/templates/account-frame"
import ServerError from "@modules/common/components/server-error"
import TeamOrderDetail from "@modules/team-order/components/team-order-detail"

type Props = {
  params: Promise<{ countryCode: string; id: string }>
}

/** Read once per request, for the title and the page. */
const getOrder = cache((id: string) => retrieveTeamOrder(id))

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { id } = await props.params
  const state = await customerState()
  const found = state.kind === "signed_in" ? await getOrder(id) : null
  return {
    title: found?.ok
      ? fill(teamOrderContent.pageTitles.order, { team: found.value.teamName })
      : teamOrderContent.pageTitles.list,
  }
}

/**
 * One team order (account/team-orders/[id]), only the signed-in customer's own: another customer's order, an
 * unknown id and an id that cannot name anything are all "We couldn't find this team order" (the backend answers
 * 404 for all of them, and none of their data is in the page). Signed out: the sign-in page, then back here.
 */
export default async function TeamOrderPage(props: Props) {
  const { countryCode, id } = await props.params
  const path = `/account/team-orders/${encodeURIComponent(id)}`
  const customer = await requireCustomer(countryCode, path)
  if (!customer) {
    return <ServerError />
  }

  const found = await getOrder(id)
  if (!found.ok) {
    if (found.failure.kind === "not_found") notFound()
    if (found.failure.kind === "signed_out") {
      redirect(`/${countryCode}${authHref("signin", { next: path })}`)
    }
    return <ServerError />
  }
  const order = found.value

  const product = await listProducts({ countryCode, queryParams: { id: [order.productId], limit: 1 } })
    .then(({ response }) => response.products[0])
    .catch(() => undefined)

  // The proofs ever made, for the list on the page; the page works without it when they cannot be read.
  const proofs = await listProofs(id)

  return (
    <AccountFrame
      page="team-orders"
      customer={customer}
      back={{ href: "/account/team-orders", label: teamOrderContent.order.back, testId: "team-order-back" }}
    >
      <TeamOrderDetail
        order={order}
        proofs={proofs.ok ? proofs.value : null}
        countryCode={countryCode}
        product={{
          name: product?.title ?? "",
          thumbnail: product?.thumbnail ?? null,
          designerHandle: product?.handle && editorProductFor(product.handle) ? product.handle : null,
        }}
      />
    </AccountFrame>
  )
}
