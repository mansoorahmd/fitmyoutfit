/** While the team orders load: a back bar, a title and card skeletons at the final size. */
export default function Loading() {
  return (
    <div className="content-container pb-12 pt-6 md:pt-8" aria-hidden="true" data-testid="team-orders-loading">
      <div className="mx-auto flex max-w-[640px] flex-col gap-6 lg:max-w-none lg:pl-[288px]">
        <span className="h-11 w-24 animate-pulse rounded-control bg-brand-border" />
        <span className="h-10 w-56 animate-pulse rounded-control bg-brand-border" />
        {[0, 1].map((i) => (
          <span key={i} className="h-[132px] animate-pulse rounded-card bg-brand-border" />
        ))}
      </div>
    </div>
  )
}
