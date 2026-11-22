import { Metadata } from "next"
import { notFound } from "next/navigation"

import { designContent } from "@content/design"
import { loadChooser } from "@lib/data/design-chooser"
import { getRegion } from "@lib/data/regions"
import { chooserCardHref } from "@lib/editor/chooser"
import { STORE_NAME } from "@lib/store-config"
import { ButtonLink } from "@modules/common/components/button"
import DesignCardAction from "@modules/design/components/design-card-action"
import { productCardImageSizes, productGridClasses } from "@modules/products/components/product-grid/grid"
import ProductPreview from "@modules/products/components/product-preview"

export const metadata: Metadata = {
  title: `${designContent.chooser.title} | ${STORE_NAME}`,
  description: designContent.chooser.metaDescription,
}

/**
 * The way into the 3D designer from the whole store (/pk/design): the garments the designer knows,
 * each with its picture, name and "from" price as the listing shows them, each opening the designer
 * for that garment. With one garment it still shows (more are coming). The designer itself is
 * /[countryCode]/design/[handle].
 */
export default async function DesignChooserPage(props: { params: Promise<{ countryCode: string }> }) {
  const { countryCode } = await props.params
  const region = await getRegion(countryCode)
  if (!region) notFound()

  const words = designContent.chooser
  const state = await loadChooser(region)

  return (
    <div className="content-container flex flex-col gap-6 py-8 md:gap-8 md:py-12 xl:py-16" data-testid="design-chooser">
      <header className="flex max-w-[640px] flex-col gap-2">
        <h1 className="type-h1 text-brand-ink" data-testid="design-chooser-title">
          {words.title}
        </h1>
        <p className="type-body-lg text-brand-ink-muted">{words.text}</p>
      </header>

      {state.kind === "ok" && (
        <>
          <ul className={productGridClasses(state.products.length)} data-testid="design-chooser-list">
            {state.products.map((product) => (
              <li key={product.id}>
                <ProductPreview
                  product={product}
                  region={region}
                  href={chooserCardHref(product.handle ?? "")}
                  footer={<DesignCardAction handle={product.handle ?? ""} />}
                  imageSizes={productCardImageSizes(state.products.length)}
                />
              </li>
            ))}
          </ul>
          <p className="type-body text-brand-ink-muted" data-testid="design-chooser-more">
            {words.more}
          </p>
        </>
      )}

      {state.kind === "empty" && (
        <div className="flex flex-col items-start gap-3 rounded-card bg-brand-surface-alt p-6" data-testid="design-chooser-empty">
          <h2 className="type-h2 text-brand-ink">{words.empty.title}</h2>
          <p className="type-body text-brand-ink-muted">{words.empty.text}</p>
          <ButtonLink href={words.empty.link.href} variant="secondary">
            {words.empty.link.label}
          </ButtonLink>
        </div>
      )}

      {state.kind === "failed" && (
        <div className="flex flex-col items-start gap-3 rounded-card bg-brand-surface-alt p-6" role="alert" data-testid="design-chooser-failed">
          <h2 className="type-h2 text-brand-ink">{words.failed.title}</h2>
          <p className="type-body text-brand-ink-muted">{words.failed.text}</p>
          <ButtonLink href="/design" variant="secondary">
            {words.failed.retry}
          </ButtonLink>
        </div>
      )}
    </div>
  )
}
