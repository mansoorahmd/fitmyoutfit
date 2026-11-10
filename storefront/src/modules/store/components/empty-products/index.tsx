import { listingContent } from "@content/listing"
import { ButtonLink } from "@modules/common/components/button"

/**
 * Shown by the product listings when there is nothing to list, for example
 * when the backend has no `garments` collection yet, or none of its
 * garments is sold in this region (docs/design/03-direction.md, "Loading,
 * empty and failure"). The spec's contact link waits for a contact page.
 */
const EmptyProducts = () => {
  const { message, link } = listingContent.empty

  return (
    <div
      className="flex flex-col items-start gap-2 rounded-card bg-brand-surface-alt px-4 py-8 md:px-8"
      data-testid="empty-products"
    >
      <p className="type-body-lg font-semibold text-brand-ink">{message}</p>
      <ButtonLink href={link.href} variant="text">
        {link.label}
      </ButtonLink>
    </div>
  )
}

export default EmptyProducts
