import { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { cache } from "react"

import { paymentsContent } from "@content/payments"
import { teamOrderContent } from "@content/team-order"
import { customerState } from "@lib/data/customer"
import { retrievePayments } from "@lib/data/team-order-payments"
import { retrieveTeamOrder } from "@lib/data/team-orders"
import { authHref } from "@lib/util/account-auth"
import { fill } from "@lib/util/wording"
import { requireCustomer } from "@modules/account/require-customer"
import AccountFrame from "@modules/account/templates/account-frame"
import { ButtonLink } from "@modules/common/components/button"
import ServerError from "@modules/common/components/server-error"
import PayPanel from "@modules/team-order/components/pay-panel"

type Props = { params: Promise<{ countryCode: string; id: string }> }

/** Read once per request, for the title and the page. */
const getOrder = cache((id: string) => retrieveTeamOrder(id))

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { id } = await props.params
  const state = await customerState()
  const found = state.kind === "signed_in" ? await getOrder(id) : null
  return {
    title: found?.ok ? fill(paymentsContent.pay.pageTitle, { team: found.value.teamName }) : teamOrderContent.pageTitles.list,
    robots: { index: false },
  }
}

/**
 * The payment page of a team order (account/team-orders/[id]/pay): the deposit, and later the balance. This is
 * the address in the emails (the backend's setting `team_order_payment_path`). Signed out, the visitor signs in
 * and comes back here. Only the organizer's own order: another customer's, an unknown id and an id that cannot
 * name anything are all the team-order not-found page, with none of the order's data. What it offers follows
 * the backend's status and parts (lib/team-order/payments.ts, `payModel`): nothing is a dead button.
 */
export default async function TeamOrderPayPage(props: Props) {
  const { countryCode, id } = await props.params
  const path = `/account/team-orders/${encodeURIComponent(id)}/pay`
  const customer = await requireCustomer(countryCode, path)
  if (!customer) return <ServerError />

  const found = await getOrder(id)
  if (!found.ok) {
    if (found.failure.kind === "not_found") notFound()
    if (found.failure.kind === "signed_out") redirect(`/${countryCode}${authHref("signin", { next: path })}`)
    return <ServerError />
  }
  const order = found.value
  const orderHref = `/account/team-orders/${encodeURIComponent(id)}`
  const back = { href: orderHref, label: paymentsContent.pay.back, testId: "pay-back-link" }

  // A draft has no price: nothing to pay, and the page says why.
  if (order.status === "draft") {
    const w = paymentsContent.pay.notPriced
    return (
      <AccountFrame page="team-orders" customer={customer} back={back}>
        <div className="flex max-w-[560px] flex-col gap-4" data-testid="pay-panel" data-model="not_priced">
          <h1 className="type-h1">{w.title}</h1>
          <p className="type-body" data-testid="pay-state" data-state="not_priced">
            {w.text}
          </p>
          <div>
            <ButtonLink href={orderHref} variant="secondary">
              {w.action}
            </ButtonLink>
          </div>
        </div>
      </AccountFrame>
    )
  }

  const money = await retrievePayments(id)
  if (!money.ok) {
    if (money.failure.kind === "not_found") notFound()
    if (money.failure.kind === "signed_out") redirect(`/${countryCode}${authHref("signin", { next: path })}`)
    return <ServerError />
  }

  return (
    <AccountFrame page="team-orders" customer={customer} back={back}>
      <PayPanel
        orderId={id}
        teamName={order.teamName}
        initial={money.value}
        orderHref={orderHref}
        proofHref={`${orderHref}/proof`}
        payPath={`/${countryCode}${path}`}
      />
    </AccountFrame>
  )
}
