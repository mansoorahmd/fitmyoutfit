import { accountContent } from "@content/account"
import { AddressCardView } from "@lib/util/account-address"
import { OrderCardView } from "@lib/util/account-orders"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

import AddressCard from "../components/address-card"
import { NoOrders, OrderList, OrdersFailed } from "../components/order-list"

const words = accountContent

const LINK =
  "inline-flex min-h-[44px] items-center self-start px-1 type-body font-semibold text-brand-ink underline underline-offset-4 hover:decoration-2 focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus"

/**
 * The overview's content (docs/design/05-m1-pages.md, 9.2), under the
 * title band: the latest 3 orders with "See all orders" (or the empty
 * state), then the default address with "Manage addresses" (or "No saved
 * address yet." with "Add an address"). The frame adds the menu on phones.
 */
const AccountOverview = ({
  orders,
  address,
}: {
  /** Null when the orders couldn't load. */
  orders: OrderCardView[] | null
  address: AddressCardView | null
}) => (
  <>
    <section aria-labelledby="overview-orders" className="flex flex-col gap-4" data-testid="overview-orders">
      <h2 id="overview-orders" className="type-h2 text-brand-ink">
        {words.overview.recentOrders}
      </h2>
      {orders === null ? (
        <OrdersFailed />
      ) : orders.length === 0 ? (
        <NoOrders headingLevel={3} />
      ) : (
        <>
          <OrderList cards={orders} data-testid="overview-order-list" />
          <LocalizedClientLink href="/account/orders" className={LINK} data-testid="overview-all-orders">
            {words.overview.seeAllOrders}
          </LocalizedClientLink>
        </>
      )}
    </section>

    <section aria-labelledby="overview-address" className="flex flex-col gap-4" data-testid="overview-address">
      <h2 id="overview-address" className="type-h2 text-brand-ink">
        {words.overview.defaultAddress}
      </h2>
      {address ? (
        <>
          <AddressCard view={address} />
          <LocalizedClientLink href="/account/addresses" className={LINK} data-testid="overview-manage-addresses">
            {words.overview.manageAddresses}
          </LocalizedClientLink>
        </>
      ) : (
        <>
          <p className="type-body text-brand-ink" data-testid="overview-no-address">
            {words.overview.noAddress}
          </p>
          <LocalizedClientLink href="/account/addresses" className={LINK} data-testid="overview-add-address">
            {words.addresses.add}
          </LocalizedClientLink>
        </>
      )}
    </section>
  </>
)

export default AccountOverview
