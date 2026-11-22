import { designContent } from "@content/design"

/** The plain loading state, in the store's style, while the editor's code and the model arrive. */
export default function DesignLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[100dvh] items-center justify-center"
      data-testid="design-loading"
    >
      <p className="type-body-lg text-brand-ink-muted">{designContent.loading}</p>
    </div>
  )
}
