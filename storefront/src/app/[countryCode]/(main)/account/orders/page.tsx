import { Metadata } from "next"

import { accountContent } from "@content/account"
import { listAccountOrders } from "@lib/data/orders"
import { nextShown, orderCardView, ordersShown } from "@lib/util/account-orders"
import { queryValue } from "@lib/util/account-auth"
import { NoOrders, OrderList, OrdersFailed } from "@modules/account/components/order-list"
import { requireCustomer } from "@modules/account/require-customer"
import AccountFrame from "@modules/account/templates/account-frame"
import ServerError from "@modules/common/components/server-error"

export const metadata: Metadata = {
  title: accountContent.pageTitles.orders,
}

type Props = {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * The order history (docs/design/05-m1-pages.md, 9.3): newest first, 10
 * at a time with "Show more orders" (`?shown=20`, 30…). No order-transfer
 * request here: it needs email, which M1 doesn't send (task S1-5).
 */
export default async function OrdersPage(props: Props) {
  const [{ countryCode }, query] = await Promise.all([props.params, props.searchParams])
  const customer = await requireCustomer(countryCode, "/account/orders")
  if (!customer) {
    return <ServerError />
  }

  const shown = ordersShown(queryValue(query.shown))
  const list = await listAccountOrders(shown)
  const more = list.ok ? nextShown(shown, list.count) : null

  return (
    <AccountFrame page="orders" customer={customer}>
      <div className="flex flex-col gap-6" data-testid="orders-page">
        <h1 className="type-h1 text-brand-ink">{accountContent.orders.title}</h1>
        {!list.ok ? (
          <OrdersFailed />
        ) : list.orders.length === 0 ? (
          <NoOrders />
        ) : (
          <OrderList
            cards={list.orders.map((order, i) => orderCardView(order, list.promises[i] ?? null))}
            moreHref={more ? `/account/orders?shown=${more}` : null}
          />
        )}
      </div>
    </AccountFrame>
  )
}
