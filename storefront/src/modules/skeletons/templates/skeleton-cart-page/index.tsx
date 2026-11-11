import repeat from "@lib/util/repeat"
import { cartLayout } from "@modules/cart/templates/layout"

const bar = "animate-pulse rounded-control bg-brand-surface-alt"

/**
 * The cart page while it loads (docs/design/05-m1-pages.md, 4.6): the
 * title, three line skeletons at their final sizes (a 72 × 90 box and two
 * text bars) and a summary skeleton, in the page's own layout.
 */
const SkeletonCartPage = () => (
  <div className={cartLayout.page} data-testid="cart-skeleton">
    <div className={cartLayout.columns}>
      <div className={cartLayout.main}>
        <div className={`h-[38px] w-56 md:h-[46px] xl:h-[54px] ${bar}`} />
        <ul className="flex flex-col divide-y divide-brand-border border-y border-brand-border">
          {repeat(3).map((index) => (
            <li
              key={index}
              className="grid grid-cols-[72px_1fr] gap-3 py-4 md:grid-cols-[96px_1fr]"
            >
              <div className={`h-[90px] w-[72px] md:h-[120px] md:w-24 ${bar}`} />
              <div className="flex flex-col gap-2">
                <div className={`h-6 w-3/4 ${bar}`} />
                <div className={`h-5 w-1/2 ${bar}`} />
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className={cartLayout.aside}>
        <div className={cartLayout.summaryBox}>
          <div className={`h-6 w-full ${bar}`} />
          <div className={`h-6 w-full ${bar}`} />
          <div className={`h-7 w-full ${bar}`} />
        </div>
        <div className={`h-12 w-full ${bar}`} />
      </div>
    </div>
  </div>
)

export default SkeletonCartPage
