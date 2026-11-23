import { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { designContent } from "@content/design"
import { teamOrderContent } from "@content/team-order"
import { customerState } from "@lib/data/customer"
import { listProducts } from "@lib/data/products"
import { getRegion, listRegions } from "@lib/data/regions"
import { loadSavedDesign, retrieveTeamOrder } from "@lib/data/team-orders"
import { designOrderPath, type DesignerContext } from "@lib/editor/designer-context"
import { editorProductFor, garmentById } from "@lib/editor/products"
import { editorFontFamilies } from "@lib/editor/fonts"
import { listMinimum, regionPhrase, teamListSizes, teamNoun } from "@lib/editor/team-list-host"
import { STORE_NAME } from "@lib/store-config"
import { authHref } from "@lib/util/account-auth"
import { regionMinimum } from "@lib/util/checkout-rules"
import { hasProductPage } from "@lib/util/product-kind"
import { parseSizeChart } from "@lib/util/size-chart"
import DesignLoader from "@modules/design/components/design-loader"
import DesignMessage from "@modules/design/components/design-message"

type Props = {
  params: Promise<{ countryCode: string; handle: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const metadata: Metadata = {
  title: `${designContent.pageTitle} | ${STORE_NAME}`,
  // A tool, not a page to find in a search.
  robots: { index: false },
}

const first = (value: string | string[] | undefined): string => (Array.isArray(value) ? (value[0] ?? "") : (value ?? ""))

/**
 * The 3D designer for one product: /pk/design/jersey. Only a product that
 * has a model in lib/editor/products.ts, and that the store sells in this
 * region, has one; anything else is the store's not-found page. The editor
 * itself loads in the browser only (see DesignLoader).
 *
 * `?order=teamord_...` opens it for a team order of the signed-in customer:
 * the order's design and team list are loaded here, on the server, with the
 * customer's token. Signed out, the visitor goes to sign in and comes back.
 * Another customer's order, an unknown one, and an order of another product
 * are all "not found": nothing of them is in the page.
 * `?start=1` is where a visitor lands after signing in to finish starting a
 * team order from the design on this device.
 */
export default async function DesignPage(props: Props) {
  const [{ countryCode, handle }, query] = await Promise.all([props.params, props.searchParams])

  const entry = editorProductFor(handle)
  if (!entry) notFound()

  const region = await getRegion(countryCode)
  if (!region) notFound()

  const product = await listProducts({
    countryCode,
    queryParams: { handle },
  }).then(({ response }) => response.products[0])
  if (!product || !hasProductPage(product)) notFound()

  const state = await customerState()
  const orderId = first(query.order)

  let order: DesignerContext["order"] = null
  let regionPhraseOfOrder = regionPhrase(region)
  let minimum = regionMinimum(region)
  if (orderId) {
    if (state.kind === "signed_out") {
      redirect(`/${countryCode}${authHref("signin", { next: designOrderPath(handle, orderId) })}`)
    }
    const found = await retrieveTeamOrder(orderId)
    if (!found.ok) {
      if (found.failure.kind === "signed_out") {
        redirect(`/${countryCode}${authHref("signin", { next: designOrderPath(handle, orderId) })}`)
      }
      if (found.failure.kind === "not_found") notFound()
      return failedPage(handle, orderId)
    }
    const view = found.value
    if (view.productId !== product.id) notFound()
    const saved = await loadSavedDesign({ designId: view.designId, versionId: view.designVersionId })
    if (!saved.ok) {
      if (saved.failure.kind === "not_found") notFound()
      return failedPage(handle, orderId)
    }
    order = { view, design: saved.value.design }
    // the order's own region decides the minimum and its name
    const regions = await listRegions().catch(() => [])
    const own = regions.find((r) => r.id === view.regionId)
    if (own) regionPhraseOfOrder = regionPhrase(own)
    minimum = view.summary.minimum?.required ?? null
  }

  const context: DesignerContext = {
    productId: product.id,
    productTitle: product.title ?? entry.shortName,
    sizes: teamListSizes(product.options),
    noun: teamNoun(entry.shortName),
    sizeChart: parseSizeChart(product.metadata),
    region: {
      id: order?.view.regionId ?? region.id,
      phrase: regionPhraseOfOrder,
      minimum: listMinimum(minimum, regionPhraseOfOrder)?.pieces ?? null,
    },
    signedIn: state.kind === "signed_in",
    resumeStart: first(query.start) === "1",
    // a chooser card names its garment; inside a team order the order's design decides
    requestedGarment: orderId ? null : (garmentById(entry, first(query.garment))?.definition ?? null),
    order,
  }

  return <DesignLoader product={entry} countryCode={countryCode} fontFamilies={editorFontFamilies} context={context} />
}

/** The order could not be read (the store did not answer): a way to try again and a way back, never a blank page. */
function failedPage(handle: string, orderId: string) {
  const words = teamOrderContent.designer.loadFailed
  return (
    <DesignMessage
      title={words.title}
      text={words.text}
      backHref="/account/team-orders"
      backLabel={words.back}
      retry={{ href: designOrderPath(handle, orderId), label: words.retry }}
    />
  )
}
