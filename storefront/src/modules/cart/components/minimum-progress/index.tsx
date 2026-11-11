import { clx } from "@medusajs/ui"

import { cartContent } from "@content/cart"
import { MinimumView } from "@lib/util/checkout-rules"
import { fill } from "@lib/util/wording"
import LineIcon from "@modules/home/components/line-icon"

/**
 * The minimum's progress (docs/design/05-m1-pages.md, 5.3), from the
 * backend's count. Below the minimum: "7 of 10 garment pieces", an 8 px bar
 * and "Add 3 more to check out." (left out when `compact`). At or above:
 * "Minimum reached: 12 garment pieces" with a full bar. The bar is
 * decorative; the words carry the information.
 */
const MinimumProgress = ({
  minimum,
  compact = false,
  showTitle = true,
  missingId,
  className,
}: {
  minimum: MinimumView
  /** Bar and first line only (the summary, the cart panel). */
  compact?: boolean
  /** Off inside an Alert whose title is already the first line. */
  showTitle?: boolean
  /** The id for the "Add 3 more" text, so a checkout button can point at it. */
  missingId?: string
  className?: string
}) => {
  const { progress, missing, reached, reachedAnnouncement } = cartContent.minimum
  const values = {
    counted: minimum.counted,
    required: minimum.required,
    missing: minimum.missing,
  }

  return (
    <div
      className={clx("flex flex-col gap-2", className)}
      data-testid="minimum-progress"
      data-reached={minimum.reached ? "true" : "false"}
    >
      {/* announces the change once, when the minimum is reached */}
      <span role="status" className="sr-only">
        {minimum.reached ? reachedAnnouncement : ""}
      </span>
      {minimum.reached ? (
        <p className="flex items-center gap-2 type-small font-semibold text-brand-success">
          <LineIcon name="check" className="h-5 w-5 shrink-0" />
          {fill(reached, values)}
        </p>
      ) : (
        showTitle && (
          <p className="flex items-center gap-2 type-body font-semibold text-brand-ink">
            <LineIcon name="team" className="h-5 w-5 shrink-0" />
            {fill(progress, values)}
          </p>
        )
      )}
      <div
        aria-hidden="true"
        className="h-2 w-full overflow-hidden rounded-full border border-brand-border-strong bg-brand-surface-alt"
      >
        <div
          className={clx(
            "h-full rounded-full",
            minimum.reached ? "bg-brand-success" : "bg-brand-ink"
          )}
          style={{ width: `${Math.round(minimum.fraction * 100)}%` }}
          data-testid="minimum-bar"
        />
      </div>
      {!minimum.reached && !compact && (
        <p id={missingId} className="type-small text-brand-ink-muted">
          {fill(missing, values)}
        </p>
      )}
    </div>
  )
}

export default MinimumProgress
