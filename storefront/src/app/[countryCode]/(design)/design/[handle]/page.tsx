import { Metadata } from "next"
import { notFound } from "next/navigation"

import { designContent } from "@content/design"
import { listProducts } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { editorProductFor } from "@lib/editor/products"
import { editorFontFamilies } from "@lib/editor/fonts"
import { STORE_NAME } from "@lib/store-config"
import { hasProductPage } from "@lib/util/product-kind"
import DesignLoader from "@modules/design/components/design-loader"

type Props = {
  params: Promise<{ countryCode: string; handle: string }>
}

export const metadata: Metadata = {
  title: `${designContent.pageTitle} | ${STORE_NAME}`,
  // A tool, not a page to find in a search.
  robots: { index: false },
}

/**
 * The 3D designer for one product: /pk/design/jersey. Only a product that
 * has a model in lib/editor/products.ts, and that the store sells in this
 * region, has one; anything else is the store's not-found page. The editor
 * itself loads in the browser only (see DesignLoader).
 */
export default async function DesignPage(props: Props) {
  const { countryCode, handle } = await props.params

  const entry = editorProductFor(handle)
  if (!entry) notFound()

  const region = await getRegion(countryCode)
  if (!region) notFound()

  const product = await listProducts({
    countryCode,
    queryParams: { handle },
  }).then(({ response }) => response.products[0])
  if (!product || !hasProductPage(product)) notFound()

  return (
    <DesignLoader
      product={entry}
      countryCode={countryCode}
      fontFamilies={editorFontFamilies}
    />
  )
}
