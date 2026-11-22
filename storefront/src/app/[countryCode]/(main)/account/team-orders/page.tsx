import { Metadata } from "next"

import { teamOrderContent } from "@content/team-order"
import { homeContent } from "@content/home"
import { listProducts } from "@lib/data/products"
import { listTeamOrders } from "@lib/data/team-orders"
import { requireCustomer } from "@modules/account/require-customer"
import AccountFrame from "@modules/account/templates/account-frame"
import { ButtonLink } from "@modules/common/components/button"
import ServerError from "@modules/common/components/server-error"
import TeamOrderCard from "@modules/team-order/components/team-order-card"

export const metadata: Metadata = {
  title: teamOrderContent.pageTitles.list,
}

type Props = {
  params: Promise<{ countryCode: string }>
}

/**
 * The organizer's team orders (account/team-orders): newest first, each with its team name, product, players
 * and pieces, status in plain words and need-by date. Only the signed-in customer's own (the backend answers
 * with only those). Signed out: the sign-in page, then back here.
 */
export default async function TeamOrdersPage(props: Props) {
  const { countryCode } = await props.params
  const customer = await requireCustomer(countryCode, "/account/team-orders")
  if (!customer) {
    return <ServerError />
  }

  const list = await listTeamOrders()

  const words = teamOrderContent.list
  const orders = list.ok ? list.value : []
  const ids = Array.from(new Set(orders.map((o) => o.productId)))
  const products = ids.length
    ? await listProducts({ countryCode, queryParams: { id: ids, limit: 50 } })
        .then(({ response }) => response.products)
        .catch(() => [])
    : []
  const byId = new Map(products.map((p) => [p.id, p]))

  return (
    <AccountFrame page="team-orders" customer={customer}>
      <div className="flex flex-col gap-6" data-testid="team-orders-page">
        <h1 className="type-h1 text-brand-ink">{words.title}</h1>
        {!list.ok ? (
          <div className="flex flex-col items-start gap-4 rounded-card bg-brand-surface-alt p-6" data-testid="team-orders-failed">
            <h2 className="type-h2 text-brand-ink">{words.failed.title}</h2>
            <p className="type-body text-brand-ink-muted">{words.failed.text}</p>
            <ButtonLink href="/account/team-orders" variant="secondary">
              {words.failed.retry}
            </ButtonLink>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-start gap-4 rounded-card bg-brand-surface-alt p-6" data-testid="team-orders-empty">
            <h2 className="type-h2 text-brand-ink">{words.empty.title}</h2>
            <p className="type-body text-brand-ink-muted">{words.empty.text}</p>
            <ButtonLink href={homeContent.button.href} fullWidth className="md:w-auto">
              {words.empty.cta}
            </ButtonLink>
          </div>
        ) : (
          <ul className="flex flex-col gap-4" data-testid="team-order-list">
            {orders.map((order) => {
              const product = byId.get(order.productId)
              return (
                <li key={order.id}>
                  <TeamOrderCard order={order} productName={product?.title ?? ""} thumbnail={product?.thumbnail ?? null} />
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </AccountFrame>
  )
}
