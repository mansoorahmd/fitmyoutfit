import { HttpTypes } from "@medusajs/types"

import { productContent } from "@content/product"
import { descriptionOf, fabricRows } from "@lib/util/product-page"
import ChevronDown from "@modules/common/icons/chevron-down"

const Item = ({
  title,
  children,
  testId,
}: {
  title: string
  children: React.ReactNode
  testId: string
}) => (
  <details className="group border-b border-brand-border" data-testid={testId}>
    <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 py-3 type-body font-semibold text-brand-ink [&::-webkit-details-marker]:hidden">
      {title}
      <ChevronDown
        size={20}
        aria-hidden="true"
        className="shrink-0 transition-transform duration-150 ease-out group-open:rotate-180"
      />
    </summary>
    <div className="pb-4 pr-10">{children}</div>
  </details>
)

/**
 * The product's details as native `<details>`, like the home page's
 * Questions: they open without JavaScript, by keyboard and by find-in-page.
 * Two only: "Description" (the backend's description) and "Fabric and
 * decoration" (only the rows the product has data for). Either is left out
 * when it would be empty, and with neither there is nothing at all.
 *
 * The starter's "Shipping & Returns" is gone on purpose: it promised
 * delivery in 3 to 5 days, exchanges and returns, which are not ours.
 */
const ProductDetails = ({ product }: { product: HttpTypes.StoreProduct }) => {
  const { details } = productContent
  const description = descriptionOf(product)
  const rows = fabricRows(product, details.rows)

  if (!description && rows.length === 0) {
    return null
  }

  return (
    <div className="border-t border-brand-border" data-testid="product-details">
      {description && (
        <Item title={details.description} testId="product-description">
          <p className="whitespace-pre-line type-body text-brand-ink-muted">
            {description}
          </p>
        </Item>
      )}
      {rows.length > 0 && (
        <Item title={details.fabric} testId="product-fabric">
          <dl className="flex flex-col gap-3">
            {rows.map((row) => (
              <div key={row.label} className="flex flex-col">
                <dt className="type-small font-semibold text-brand-ink">{row.label}</dt>
                <dd className="type-body text-brand-ink-muted">{row.value}</dd>
              </div>
            ))}
          </dl>
        </Item>
      )}
    </div>
  )
}

export default ProductDetails
