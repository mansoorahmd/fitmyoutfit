/**
 * Cache policy for lookups that must not get stuck on an empty answer.
 *
 * Background: with `cache: "force-cache"` and no `revalidate`, Next.js keeps
 * a response forever, in `.next/cache/fetch-cache`, across reloads and dev
 * server restarts. That is wrong for a lookup like "find the garments
 * collection": if the first answer is empty (the backend seed has not run
 * yet) or its id goes stale (the database was wiped and reseeded), the page
 * keeps showing "No products yet." until `.next` is deleted.
 *
 * The rule here:
 *  - a non-empty answer is cached for SHORT_CACHE_SECONDS at most;
 *  - an empty answer is never served from cache: when the cached attempt
 *    comes back empty, the lookup is repeated with `cache: "no-store"`, so
 *    the caller always sees what the backend says right now;
 *  - a failed request throws (Next.js does not cache a thrown fetch).
 */

export const SHORT_CACHE_SECONDS = 60

export type ShortCacheFetchOptions = {
  cache?: "no-store"
  next?: { revalidate?: number; tags?: string[] }
}

export async function fetchShortCached<T>(
  run: (options: ShortCacheFetchOptions) => Promise<T>,
  isEmpty: (result: T) => boolean,
  tags: string[] = []
): Promise<T> {
  const cached = await run({
    next: {
      revalidate: SHORT_CACHE_SECONDS,
      ...(tags.length ? { tags } : {}),
    },
  })

  if (!isEmpty(cached)) {
    return cached
  }

  // The cached attempt may itself have stored the empty answer. Ignore that
  // copy and ask the backend again, uncached.
  return run({ cache: "no-store" })
}
