/**
 * While an account page loads: a title bar and a block of grey bars at the
 * page's width, so nothing jumps when it arrives (03-direction, "Loading").
 */
export default function Loading() {
  return (
    <div className="content-container pb-12 pt-6 md:pt-8" aria-hidden="true" data-testid="account-loading">
      <div className="mx-auto flex max-w-[640px] flex-col gap-6 lg:max-w-none lg:pl-[288px]">
        <span className="h-10 w-56 animate-pulse rounded-control bg-brand-border" />
        <span className="h-5 w-3/4 animate-pulse rounded-control bg-brand-border" />
        <span className="h-32 w-full animate-pulse rounded-card bg-brand-border" />
      </div>
    </div>
  )
}
