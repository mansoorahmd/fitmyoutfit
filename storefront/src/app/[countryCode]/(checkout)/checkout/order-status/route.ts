import { NextResponse } from "next/server"

import { getCartId } from "@lib/data/cookies"
import { findOrderForCart } from "@lib/data/order-status"
import { isCartId } from "@lib/util/order-status"

export const dynamic = "force-dynamic"

/** The route's whole body is `{"cartId":"cart_…"}`: a few kilobytes is far more than it ever is. */
const MAX_BODY_BYTES = 4096

/**
 * The body as text, or null when it is larger than MAX_BODY_BYTES (by its
 * Content-Length, or while it is read: reading stops there).
 */
const readSmallBody = async (request: Request): Promise<string | null> => {
  const declared = Number(request.headers.get("content-length") ?? "0")
  if (declared > MAX_BODY_BYTES) return null
  if (!request.body) return ""
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const all = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    all.set(chunk, at)
    at += chunk.byteLength
  }
  return new TextDecoder().decode(all)
}

const parseBody = (text: string): { cartId?: unknown } | null => {
  try {
    return JSON.parse(text) as { cartId?: unknown } | null
  } catch {
    return null
  }
}

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
  const text = await readSmallBody(request)
  if (text === null) {
    // a body this size is never ours (QA S1-4c, m10): refused unread
    return NextResponse.json({ kind: "cart_lost" }, { status: 413, headers: { "cache-control": "no-store" } })
  }
  const body = parseBody(text)
  const given = body?.cartId
  const cartId = isCartId(given) ? given : await getCartId()

  const status = isCartId(cartId)
    ? await findOrderForCart(cartId, countryCode)
    : ({ kind: "cart_lost" } as const)

  return NextResponse.json(status, { headers: { "cache-control": "no-store" } })
}
