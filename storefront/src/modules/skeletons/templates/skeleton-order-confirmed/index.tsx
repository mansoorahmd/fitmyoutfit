const Bar = ({ className }: { className: string }) => (
  <span className={`block animate-pulse rounded-control bg-brand-border ${className}`} />
)

/**
 * The order confirmation while it loads (docs/design/05-m1-pages.md, 7.3):
 * the band with grey bars for the name and the number, and line skeletons.
 */
const SkeletonOrderConfirmed = () => (
  <div className="content-container pt-6 pb-12 md:pt-8" aria-busy="true" data-testid="order-skeleton">
    <div className="mx-auto flex max-w-[640px] flex-col gap-8 lg:max-w-none">
      <div className="flex flex-col gap-3 rounded-card bg-brand-surface-alt p-6">
        <Bar className="h-8 w-8" />
        <Bar className="h-10 w-64 max-w-full" />
        <Bar className="h-6 w-48" />
        <Bar className="h-4 w-28" />
        <Bar className="h-9 w-24" />
      </div>
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-start gap-3">
            <Bar className="h-[70px] w-14 shrink-0" />
            <div className="flex flex-1 flex-col gap-2">
              <Bar className="h-5 w-40" />
              <Bar className="h-4 w-24" />
            </div>
            <Bar className="h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  </div>
)

export default SkeletonOrderConfirmed
