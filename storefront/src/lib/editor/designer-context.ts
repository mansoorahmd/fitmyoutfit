// What the designer page (server side) hands to the designer (client side) besides the product's
// 3D data: whether the visitor is signed in, what the team list needs from the product and the
// region, and, when the address names a team order (`?order=teamord_...`), that order with its
// design. Plain data: it crosses from the server to the browser.

import type { TeamListSize, TeamListNoun } from "@fitmyoutfit/editor"

import type { SizeChart } from "@lib/util/size-chart"
import type { TeamOrderView } from "@lib/team-order/types"

export type DesignerContext = {
  productId: string
  productTitle: string
  /** The product's sizes for the list; undefined: the editor's usual ones. */
  sizes: TeamListSize[] | undefined
  noun: TeamListNoun
  sizeChart: SizeChart | null
  region: {
    id: string
    /** The region as a sentence wants it ("the UK"). */
    phrase: string
    /** Pieces the region needs, when more than one. */
    minimum: number | null
  }
  signedIn: boolean
  /** The visitor came back from signing in to finish starting a team order (`?start=1`). */
  resumeStart: boolean
  /** The garment (an editor product id) the address asks for (`?garment=`), outside a team order and when the product has it; else null. */
  requestedGarment?: string | null
  /** The team order this designer is open for, with its design JSON as the server holds it. */
  order: { view: TeamOrderView; design: unknown } | null
}

/** The designer's address for a team order, without the country code: /design/jersey?order=teamord_1. */
export const designOrderPath = (handle: string, orderId: string): string =>
  `/design/${handle}?order=${encodeURIComponent(orderId)}`

/** Where a visitor returns to after signing in, to finish starting a team order. */
export const designStartPath = (handle: string): string => `/design/${handle}?start=1`

/** The team order's page in the account, without the country code. */
export const teamOrderPath = (orderId: string): string => `/account/team-orders/${encodeURIComponent(orderId)}`
export const TEAM_ORDERS_PATH = "/account/team-orders"
