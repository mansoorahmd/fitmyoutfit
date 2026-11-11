import { OrderCardSkeletons } from "@modules/account/components/order-list"

/** While the order history loads (docs/design/05-m1-pages.md, 9.3): 3 card skeletons at the final size. */
export default function Loading() {
  return (
    <div className="content-container pb-12 pt-6 md:pt-8" data-testid="orders-loading">
      <div className="mx-auto flex max-w-[640px] flex-col gap-6 lg:max-w-none lg:pl-[288px]">
        <span aria-hidden="true" className="h-11 w-24 animate-pulse rounded-control bg-brand-border" />
        <span aria-hidden="true" className="h-10 w-56 animate-pulse rounded-control bg-brand-border" />
        <OrderCardSkeletons />
      </div>
    </div>
  )
}
