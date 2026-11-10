import { Metadata } from "next"

import { listingContent } from "@content/listing"
import { getGarmentsCollection } from "@lib/data/collections"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import StoreTemplate from "@modules/store/templates"

export const metadata: Metadata = {
  title: listingContent.title,
  description: listingContent.metaDescription,
}

type Params = {
  searchParams: Promise<{
    sortBy?: SortOptions
    page?: string
  }>
  params: Promise<{
    countryCode: string
  }>
}

export default async function StorePage(props: Params) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { sortBy, page } = searchParams

  // The store listing shows the garments collection only (filtered by the
  // backend). No collection yet means an empty state.
  const garments = await getGarmentsCollection()

  return (
    <StoreTemplate
      sortBy={sortBy}
      page={page}
      countryCode={params.countryCode}
      collectionId={garments?.id}
    />
  )
}
