/** While one order loads (docs/design/05-m1-pages.md, 9.4 and 7.3): bars for the number and date, then line skeletons. */
export default function Loading() {
  return (
    <div className="content-container pb-12 pt-6 md:pt-8" aria-hidden="true" data-testid="order-loading">
      <div className="mx-auto flex max-w-[640px] flex-col gap-6 lg:max-w-none lg:pl-[288px]">
        <span className="h-11 w-32 animate-pulse rounded-control bg-brand-border" />
        <span className="h-10 w-48 animate-pulse rounded-control bg-brand-border" />
        <span className="h-5 w-56 animate-pulse rounded-control bg-brand-border" />
        {[0, 1].map((i) => (
          <span key={i} className="flex gap-3">
            <span className="h-[70px] w-14 animate-pulse rounded-control bg-brand-border" />
            <span className="h-5 flex-1 animate-pulse rounded-control bg-brand-border" />
          </span>
        ))}
      </div>
    </div>
  )
}
