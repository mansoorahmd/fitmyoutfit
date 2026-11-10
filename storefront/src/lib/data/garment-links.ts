import { GarmentLink, toGarmentLinks } from "@lib/util/garment-links"
import { getGarmentsCollection } from "./collections"
import { listProducts } from "./products"

/**
 * The garments collection's products as header and menu links. An empty
 * list (no collection yet, or the backend is down) leaves the links out
 * instead of breaking every page's header.
 */
export const listGarmentLinks = async (
  countryCode: string
): Promise<GarmentLink[]> => {
  try {
    const collection = await getGarmentsCollection()
    if (!collection) {
      return []
    }

    const { response } = await listProducts({
      countryCode,
      queryParams: {
        collection_id: [collection.id],
        fields: "id,handle,title,thumbnail",
        limit: 12,
      },
    })

    return toGarmentLinks(response.products)
  } catch {
    return []
  }
}
