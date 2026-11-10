import { Metadata } from "next"
import { STORE_NAME } from "@lib/store-config"
import { homeContent } from "@content/home"

import FeaturedProducts from "@modules/home/components/featured-products"
import Hero from "@modules/home/components/hero"
import EmptyProducts from "@modules/store/components/empty-products"
import { getGarmentsCollection } from "@lib/data/collections"
import { getRegion } from "@lib/data/regions"

export const metadata: Metadata = {
  title: STORE_NAME,
  description: homeContent.subline,
}

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
      <div className="py-12">
        {garments ? (
          <ul className="flex flex-col gap-x-6">
            <FeaturedProducts collections={[garments]} region={region} />
          </ul>
        ) : (
          <EmptyProducts />
        )}
      </div>
    </>
  )
}
