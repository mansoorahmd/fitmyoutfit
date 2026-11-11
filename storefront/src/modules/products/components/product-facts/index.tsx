import { HttpTypes } from "@medusajs/types"

import { productContent } from "@content/product"
import { factsFor } from "@lib/util/product-page"
import { ButtonLink } from "@modules/common/components/button"
import LineIcon from "@modules/home/components/line-icon"

/**
 * The facts boxes under the main button (docs/design/04-reference-spized.md,
 * point 3): a line icon, a short title and one line each. The wording is
 * data in src/content/product.ts; this only lays it out. Garments only:
 * on the fit kit and any product without a kind it renders nothing, and the
 * buy block runs straight into the details. Export regions add the shipping
 * box.
 */
const ProductFacts = ({
  product,
  countryCode,
}: {
  product: HttpTypes.StoreProduct
  countryCode: string
}) => {
  const facts = factsFor(productContent.facts, countryCode, product)

  if (facts.length === 0) {
    return null
  }

  return (
    <ul className="flex flex-col gap-2" data-testid="product-facts">
      {facts.map((fact) => (
        <li
          key={fact.title}
          className="flex gap-3 rounded-card border border-brand-border-strong p-4"
          data-testid="product-fact"
        >
          <LineIcon name={fact.icon} className="mt-0.5 shrink-0 text-brand-ink" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="type-body font-semibold text-brand-ink">{fact.title}</p>
            <p className="type-small text-brand-ink-muted">{fact.text}</p>
            {fact.link && (
              <ButtonLink
                href={fact.link.href}
                variant="text"
                className="-ml-1 self-start"
                data-testid="product-fact-link"
              >
                {fact.link.label}
              </ButtonLink>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

export default ProductFacts
