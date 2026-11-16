import { checkoutLayout } from "../checkout-page/layout"

const Bar = ({ className }: { className: string }) => (
  <span className={`block animate-pulse rounded-control bg-brand-border ${className}`} />
)

/**
 * The checkout while it loads (docs/design/05-m1-pages.md, 6.7): the step
 * label, the summary bar with a grey total, the step title, three field
 * boxes and a button box, at their final sizes. No words: nothing to read
 * yet.
 */
const CheckoutSkeleton = () => (
  <div className={checkoutLayout.page} aria-busy="true" data-testid="checkout-skeleton">
    <Bar className="h-5 w-56" />
    <div className={checkoutLayout.columns}>
      <div className={checkoutLayout.main}>
        <div className="-mx-4 flex h-14 items-center justify-between bg-brand-surface-alt px-4 md:mx-0 md:rounded-card lg:hidden">
          <Bar className="h-5 w-48" />
          <Bar className="h-5 w-24" />
        </div>
        <Bar className="h-8 w-64" />
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Bar className="h-5 w-32" />
              <Bar className="h-12 w-full" />
            </div>
          ))}
        </div>
        <Bar className="h-12 w-full md:w-60" />
      </div>
      <div className={checkoutLayout.aside}>
        <div className="flex flex-col gap-4 rounded-card border border-brand-border p-6">
          <Bar className="h-6 w-40" />
          <Bar className="h-[70px] w-full" />
          <Bar className="h-5 w-full" />
          <Bar className="h-6 w-full" />
        </div>
      </div>
    </div>
  </div>
)

export default CheckoutSkeleton
