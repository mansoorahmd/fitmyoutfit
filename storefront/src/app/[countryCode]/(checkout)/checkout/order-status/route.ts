import { NextResponse } from "next/server"

import { getCartId } from "@lib/data/cookies"
import { findOrderForCart } from "@lib/data/order-status"
import { isCartId } from "@lib/util/order-status"

export const dynamic = "force-dynamic"

/**
 * POST /[countryCode]/checkout/order-status: has this cart become an
 * order? (lib/util/order-status.ts). A route handler, not a server action,
 * so the answer never waits behind a "Place order" that is still hanging
 * (QA S1-4, D5). The body may name the checkout's cart (`cartId`), since
 * the cookie may be gone once the order exists; otherwise the cart cookie
 * is used. As with Medusa's own routes, knowing the cart id is what gives
 * access. Answers within the backend limit, always as JSON.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ countryCode: string }> }
) {
  const { countryCode } = await params
  const body = (await request.json().catch(() => null)) as { cartId?: unknown } | null
  const given = body?.cartId
  const cartId = isCartId(given) ? given : await getCartId()

  const status = isCartId(cartId)
    ? await findOrderForCart(cartId, countryCode)
    : ({ kind: "cart_lost" } as const)

  return NextResponse.json(status, { headers: { "cache-control": "no-store" } })
}
