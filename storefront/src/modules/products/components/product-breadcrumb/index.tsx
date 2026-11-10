import { productContent } from "@content/product"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

/**
 * "Team kit › Jersey" above the gallery (docs/design/03-direction.md,
 * "Product page" 1). The first crumb links to the listing; the last is the
 * current page. The separator is decoration only.
 */
const ProductBreadcrumb = ({ title }: { title: string }) => {
  const { label, parent } = productContent.breadcrumb

  return (
    <nav aria-label={label} data-testid="product-breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-2 type-small text-brand-ink-muted">
        <li>
          <LocalizedClientLink
            href={parent.href}
            className="inline-flex min-h-[44px] items-center rounded-control text-brand-ink underline underline-offset-4 decoration-1 hover:decoration-2"
          >
            {parent.label}
          </LocalizedClientLink>
        </li>
        <li aria-hidden="true">›</li>
        <li aria-current="page" className="min-w-0 truncate">
          {title}
        </li>
      </ol>
    </nav>
  )
}

export default ProductBreadcrumb
