import { Metadata } from "next"
import { STORE_NAME } from "@lib/store-config"
import { homeContent } from "@content/home"

import ProductRail, {
  GarmentsSection,
} from "@modules/home/components/featured-products/product-rail"
import Hero from "@modules/home/components/hero"
import HowItWorks from "@modules/home/components/how-it-works"
import PromiseStrip from "@modules/home/components/promise-strip"
import Questions from "@modules/home/components/questions"
import RosterProof from "@modules/home/components/roster-proof"
import Sizing from "@modules/home/components/sizing"
import EmptyProducts from "@modules/store/components/empty-products"
import { getGarmentsCollection } from "@lib/data/collections"
import { getRegion } from "@lib/data/regions"

export const metadata: Metadata = {
  title: STORE_NAME,
  description: homeContent.subline,
}

/**
 * The home page, in the order of docs/design/03-direction.md ("Home page"):
 * hero, promise strip, garments, how team orders work, the roster proof,
 * sizing, questions. The free design help form, club logos and reviews are
 * left out until they exist (decision 007).
 */
export default async function Home(props: {
  params: Promise<{ countryCode: string }>
}) {
  const params = await props.params

  const { countryCode } = params

  const region = await getRegion(countryCode)

  // The home page lists the garments collection only. If the backend has no
  // such collection yet, show an empty state instead of failing.
  const garments = await getGarmentsCollection()

  if (!region) {
    return null
  }

  return (
    <>
      <Hero />
      <PromiseStrip countryCode={countryCode} />
      <GarmentsSection>
        {garments ? (
          <ProductRail collection={garments} region={region} />
        ) : (
          <EmptyProducts />
        )}
      </GarmentsSection>
      <HowItWorks />
      <RosterProof />
      <Sizing />
      <Questions countryCode={countryCode} />
    </>
  )
}
