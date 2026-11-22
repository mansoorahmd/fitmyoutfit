/** While one team order loads: a back bar, the team name, a status line and a block for the list. */
export default function Loading() {
  return (
    <div className="content-container pb-12 pt-6 md:pt-8" aria-hidden="true" data-testid="team-order-loading">
      <div className="mx-auto flex max-w-[640px] flex-col gap-6 lg:max-w-none lg:pl-[288px]">
        <span className="h-11 w-32 animate-pulse rounded-control bg-brand-border" />
        <span className="h-10 w-56 animate-pulse rounded-control bg-brand-border" />
        <span className="h-5 w-40 animate-pulse rounded-control bg-brand-border" />
        <span className="h-40 animate-pulse rounded-card bg-brand-border" />
      </div>
    </div>
  )
}
