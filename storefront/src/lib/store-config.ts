/**
 * The store's name, shown in the header, footer, copyright line and page
 * metadata. This is the only place that reads NEXT_PUBLIC_STORE_NAME.
 * See docs/contracts/sprint-0-dev-setup.md ("Store name").
 *
 * The variable must be referenced as a literal `process.env.NEXT_PUBLIC_...`
 * so that Next.js can inline it into client components.
 */
export const DEFAULT_STORE_NAME = "FitMyOutfit"

export const STORE_NAME: string =
  process.env.NEXT_PUBLIC_STORE_NAME?.trim() || DEFAULT_STORE_NAME
