import { clx } from "@medusajs/ui"

import {
  cardFrameClasses,
  cardImageBoxClasses,
} from "@modules/products/components/product-preview"

/**
 * The product card while it loads: the same frame, the 4:5 image box and two
 * text bars at the heights of the name and the price line, so nothing moves
 * when the card arrives.
 */
const SkeletonProductPreview = () => {
  return (
    <div
      className={clx(cardFrameClasses, "animate-pulse")}
      aria-hidden="true"
      data-testid="product-card-skeleton"
    >
      <div className={cardImageBoxClasses} />
      <div className="flex flex-col gap-1 p-4">
        <div className="flex h-[26px] items-center md:h-7">
          <div className="h-5 w-2/5 rounded-control bg-brand-surface-alt" />
        </div>
        <div className="flex h-6 items-center">
          <div className="h-4 w-3/5 rounded-control bg-brand-surface-alt" />
        </div>
      </div>
    </div>
  )
}

export default SkeletonProductPreview
