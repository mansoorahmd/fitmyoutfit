import { listingContent } from "@content/listing"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"

/** "Complete the kit" while it loads: its heading and two card skeletons. */
const SkeletonRelatedProducts = () => {
  return (
    <section className="flex flex-col gap-6 md:gap-8" aria-busy="true">
      <h2 className="type-h2 text-brand-ink">{listingContent.relatedTitle}</h2>
      <SkeletonProductGrid numberOfProducts={2} />
    </section>
  )
}

export default SkeletonRelatedProducts
