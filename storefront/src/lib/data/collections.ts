"use server"

import { sdk } from "@lib/config"
import { GARMENTS_COLLECTION_HANDLE } from "@lib/garments"
import { HttpTypes } from "@medusajs/types"
import { getCacheOptions } from "./cookies"
import { fetchShortCached } from "./short-cache"

export const retrieveCollection = async (id: string) => {
  const next = {
    ...(await getCacheOptions("collections")),
  }

  return sdk.client
    .fetch<{ collection: HttpTypes.StoreCollection }>(
      `/store/collections/${id}`,
      {
        next,
        cache: "force-cache",
      }
    )
    .then(({ collection }) => collection)
}

export const listCollections = async (
  queryParams: Record<string, string> = {}
): Promise<{ collections: HttpTypes.StoreCollection[]; count: number }> => {
  const next = {
    ...(await getCacheOptions("collections")),
  }

  queryParams.limit = queryParams.limit || "100"
  queryParams.offset = queryParams.offset || "0"

  return sdk.client
    .fetch<{ collections: HttpTypes.StoreCollection[]; count: number }>(
      "/store/collections",
      {
        query: queryParams,
        next,
        cache: "force-cache",
      }
    )
    .then(({ collections }) => ({ collections, count: collections.length }))
}

export const getCollectionByHandle = async (
  handle: string
): Promise<HttpTypes.StoreCollection> => {
  const { tags } = (await getCacheOptions("collections")) as { tags?: string[] }

  // Short cache, and an empty answer is never reused. See ./short-cache.ts.
  return fetchShortCached(
    (options) =>
      sdk.client
        .fetch<HttpTypes.StoreCollectionListResponse>(`/store/collections`, {
          query: { handle, fields: "*products" },
          ...options,
        })
        .then(({ collections }) => collections[0]),
    (collection) => !collection,
    tags
  )
}

/**
 * The collection the main listings show. Returns undefined when the backend
 * has no such collection (for example before the seed has run), so callers
 * can render an empty state instead of failing.
 *
 * Cache: a found collection is cached for at most 60 seconds, and an empty
 * answer is never reused, so seeding the backend (or wiping and reseeding it,
 * which gives the collection a new id) is picked up without deleting `.next`.
 * See ./short-cache.ts.
 */
export const getGarmentsCollection = async (): Promise<
  HttpTypes.StoreCollection | undefined
> => {
  const { tags } = (await getCacheOptions("collections")) as { tags?: string[] }

  return fetchShortCached(
    (options) =>
      sdk.client
        .fetch<HttpTypes.StoreCollectionListResponse>(`/store/collections`, {
          query: {
            handle: GARMENTS_COLLECTION_HANDLE,
            fields: "id,handle,title",
          },
          ...options,
        })
        .then(({ collections }) => collections?.[0]),
    (collection) => !collection,
    tags
  )
}
