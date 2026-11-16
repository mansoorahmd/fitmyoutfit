"use server"

import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { HttpTypes } from "@medusajs/types"
import { revalidateTag } from "next/cache"
import { redirect } from "next/navigation"
import {
  getAuthHeaders,
  getCacheOptions,
  getCacheTag,
  getCartId,
  removeCartId,
  setCartId,
} from "./cookies"
import { getRegion } from "./regions"
import { getLocale } from "@lib/data/locale-actions"
import { AddedToCartView, addedToCartView } from "@lib/util/added-to-cart"
import { getCheckoutRules } from "./checkout-rules"
import { revalidateCartCaches } from "./cart-cache"
import { findOrderForCart } from "./order-status"
import { CompletedCartError } from "@lib/util/order-status"

/**
 * Retrieves a cart by its ID. If no ID is provided, it will use the cart ID from the cookies.
 * @param cartId - optional - The ID of the cart to retrieve.
 * @returns The cart object if found, or null if not found.
 */
export async function retrieveCart(cartId?: string, fields?: string) {
  const id = cartId || (await getCartId())
  fields ??=
    "*items, *region, *items.product, *items.variant, *items.thumbnail, *items.metadata, +items.total, *promotions, +shipping_methods.name, +shipping_methods.shipping_option_id, +completed_at"

  if (!id) {
    return null
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("carts")),
  }

  return await sdk.client
    .fetch<HttpTypes.StoreCartResponse>(`/store/carts/${id}`, {
      method: "GET",
      query: {
        fields,
      },
      headers,
      next,
      cache: "force-cache",
    })
    .then(({ cart }: { cart: HttpTypes.StoreCart }) => cart)
    .catch(() => null)
}

/**
 * The cart page's fields. `*items.product` brings the product's kind;
 * `shipping_methods.shipping_option_id` tells which option a chosen method
 * came from, the only way to know it is the duty-paid one (contract section 3).
 */
const CART_PAGE_FIELDS =
  "*items, *region, *items.product, *items.variant, *items.thumbnail, *items.metadata, +items.total, *promotions, +shipping_methods.name, +shipping_methods.shipping_option_id, +completed_at"

/**
 * The cart for the cart page, telling "no cart" from "couldn't load". No
 * cookie, or a cart the backend doesn't know (4xx), is no cart: the page
 * shows the empty cart. No answer or a 5xx is a failure: the page shows the
 * server-error block (05, 4.6).
 *
 * Read fresh, never from the cache: Medusa answers a completed cart with
 * HTTP 200 and its items, and only `completed_at` tells it is an order. A
 * cached copy from before "Place order" would show the ordered cart as a
 * live one (QA S1-4, D1).
 */
export async function retrieveCartForPage(): Promise<{
  cart: HttpTypes.StoreCart | null
  failed: boolean
}> {
  const id = await getCartId()

  if (!id) {
    return { cart: null, failed: false }
  }

  try {
    const { cart } = await sdk.client.fetch<HttpTypes.StoreCartResponse>(
      `/store/carts/${id}`,
      {
        method: "GET",
        query: { fields: CART_PAGE_FIELDS },
        headers: { ...(await getAuthHeaders()) },
        cache: "no-store",
      }
    )
    return { cart, failed: false }
  } catch (error) {
    const status = (error as { status?: number })?.status
    const failed = typeof status !== "number" || status >= 500
    return { cart: null, failed }
  }
}

/** A cart from the cookie, read fresh, for adding to it: an ordered cart must never get new lines. */
const retrieveCartToAddTo = async () => {
  const id = await getCartId()
  if (!id) return null
  return sdk.client
    .fetch<HttpTypes.StoreCartResponse>(`/store/carts/${encodeURIComponent(id)}`, {
      method: "GET",
      query: { fields: "id,region_id,completed_at" },
      headers: { ...(await getAuthHeaders()) },
      cache: "no-store",
    })
    .then(({ cart }) => cart)
    .catch(() => null)
}

/**
 * The cart to add to: the visitor's, moved to the URL's region, or a new
 * one. Throws CompletedCartError when the visitor's cart is already an
 * order: the caller opens that order instead.
 */
export async function getOrSetCart(countryCode: string) {
  const region = await getRegion(countryCode)

  if (!region) {
    throw new Error(`Region not found for country code: ${countryCode}`)
  }

  let cart = await retrieveCartToAddTo()

  if (cart?.completed_at) {
    throw new CompletedCartError(cart.id)
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  if (!cart) {
    const locale = await getLocale()
    const cartResp = await sdk.store.cart.create(
      { region_id: region.id, locale: locale || undefined },
      {},
      headers
    )
    cart = cartResp.cart

    await setCartId(cart.id)

    await revalidateCartCaches()
  }

  if (cart && cart?.region_id !== region.id) {
    await sdk.store.cart.update(cart.id, { region_id: region.id }, {}, headers)
    await revalidateCartCaches()
  }

  return cart
}

export async function updateCart(data: HttpTypes.StoreUpdateCart) {
  const cartId = await getCartId()

  if (!cartId) {
    throw new Error("No existing cart found, please create one before updating")
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.store.cart
    .update(cartId, data, {}, headers)
    .then(async ({ cart }: { cart: HttpTypes.StoreCart }) => {
      await revalidateCartCaches()
      return cart
    })
    .catch(medusaError)
}

export async function addToCart({
  variantId,
  quantity,
  countryCode,
}: {
  variantId: string
  quantity: number
  countryCode: string
}) {
  if (!variantId) {
    throw new Error("Missing variant ID when adding to cart")
  }

  const cart = await getOrSetCart(countryCode)

  if (!cart) {
    throw new Error("Error retrieving or creating cart")
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  await sdk.store.cart
    .createLineItem(
      cart.id,
      {
        variant_id: variantId,
        quantity,
      },
      {},
      headers
    )
    .then(async () => {
      await revalidateCartCaches()
    })
    .catch(medusaError)
}

export type AddToCartResult =
  | { ok: true; added: AddedToCartView | null }
  /** `orderUrl`: the cart was already an order; the page opens it (QA S1-4, D1). */
  | { ok: false; orderUrl?: string }

/**
 * Adds to the cart and returns what the "Added to your cart" confirmation
 * shows (docs/design/05-m1-pages.md, 4.7): the added line, the cart's piece
 * count and total, and the minimum from the backend's rules. A failure is
 * returned, not thrown, so the page can say "We couldn't add this to your
 * cart" (W-A5) without the error boundary.
 */
export async function addToCartAndConfirm({
  variantId,
  quantity,
  countryCode,
}: {
  variantId: string
  quantity: number
  countryCode: string
}): Promise<AddToCartResult> {
  if (!variantId) {
    return { ok: false }
  }

  try {
    const cart = await getOrSetCart(countryCode)

    if (!cart) {
      return { ok: false }
    }

    const headers = {
      ...(await getAuthHeaders()),
    }

    // `*items.product` brings each line's kind: the rush line is no piece (contract 9)
    const { cart: updated } = await sdk.store.cart.createLineItem(
      cart.id,
      { variant_id: variantId, quantity },
      { fields: "*items,*items.product" },
      headers
    )

    await revalidateCartCaches()

    const rules = await getCheckoutRules(updated.id)

    return {
      ok: true,
      added: addedToCartView({
        cart: updated,
        variantId,
        quantity,
        rules,
        key: `${updated.id}:${Date.now()}`,
      }),
    }
  } catch (error) {
    if (error instanceof CompletedCartError) {
      // The answer to "Place order" was lost after the order was made. The
      // order opens; it is never added to. When it can't be read now, the
      // add fails as any other (W-A5) and the cart page opens it later.
      const status = await findOrderForCart(error.cartId, countryCode)
      return status.kind === "order" ? { ok: false, orderUrl: status.url } : { ok: false }
    }
    return { ok: false }
  }
}

export async function updateLineItem({
  lineId,
  quantity,
}: {
  lineId: string
  quantity: number
}) {
  if (!lineId) {
    throw new Error("Missing lineItem ID when updating line item")
  }

  const cartId = await getCartId()

  if (!cartId) {
    throw new Error("Missing cart ID when updating line item")
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  await sdk.store.cart
    .updateLineItem(cartId, lineId, { quantity }, {}, headers)
    .then(async () => {
      await revalidateCartCaches()
    })
    .catch(medusaError)
}

export async function deleteLineItem(lineId: string) {
  if (!lineId) {
    throw new Error("Missing lineItem ID when deleting line item")
  }

  const cartId = await getCartId()

  if (!cartId) {
    throw new Error("Missing cart ID when deleting line item")
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  await sdk.store.cart
    .deleteLineItem(cartId, lineId, {}, headers)
    .then(async () => {
      await revalidateCartCaches()
    })
    .catch(medusaError)
}

export async function setShippingMethod({
  cartId,
  shippingMethodId,
}: {
  cartId: string
  shippingMethodId: string
}) {
  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.store.cart
    .addShippingMethod(cartId, { option_id: shippingMethodId }, {}, headers)
    .then(async () => {
      await revalidateCartCaches()
    })
    .catch(medusaError)
}

export async function initiatePaymentSession(
  cart: HttpTypes.StoreCart,
  data: HttpTypes.StoreInitializePaymentSession
) {
  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.store.payment
    .initiatePaymentSession(cart, data, {}, headers)
    .then(async (resp) => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)
      return resp
    })
    .catch(medusaError)
}

export async function applyPromotions(codes: string[]) {
  const cartId = await getCartId()

  if (!cartId) {
    throw new Error("No existing cart found")
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.store.cart
    .update(cartId, { promo_codes: codes }, {}, headers)
    .then(async () => {
      await revalidateCartCaches()
    })
    .catch(medusaError)
}

export async function applyGiftCard(code: string) {
  //   const cartId = getCartId()
  //   if (!cartId) return "No cartId cookie found"
  //   try {
  //     await updateCart(cartId, { gift_cards: [{ code }] }).then(() => {
  //       revalidateTag("cart")
  //     })
  //   } catch (error: any) {
  //     throw error
  //   }
}

export async function removeDiscount(code: string) {
  // const cartId = getCartId()
  // if (!cartId) return "No cartId cookie found"
  // try {
  //   await deleteDiscount(cartId, code)
  //   revalidateTag("cart")
  // } catch (error: any) {
  //   throw error
  // }
}

export async function removeGiftCard(
  codeToRemove: string,
  giftCards: any[]
  // giftCards: GiftCard[]
) {
  //   const cartId = getCartId()
  //   if (!cartId) return "No cartId cookie found"
  //   try {
  //     await updateCart(cartId, {
  //       gift_cards: [...giftCards]
  //         .filter((gc) => gc.code !== codeToRemove)
  //         .map((gc) => ({ code: gc.code })),
  //     }).then(() => {
  //       revalidateTag("cart")
  //     })
  //   } catch (error: any) {
  //     throw error
  //   }
}

export async function submitPromotionForm(
  currentState: unknown,
  formData: FormData
) {
  const code = formData.get("code") as string
  try {
    await applyPromotions([code])
  } catch (e: any) {
    return e.message
  }
}

// TODO: Pass a POJO instead of a form entity here
export async function setAddresses(currentState: unknown, formData: FormData) {
  try {
    if (!formData) {
      throw new Error("No form data found when setting addresses")
    }
    const cartId = getCartId()
    if (!cartId) {
      throw new Error("No existing cart found when setting addresses")
    }

    const data = {
      shipping_address: {
        first_name: formData.get("shipping_address.first_name"),
        last_name: formData.get("shipping_address.last_name"),
        address_1: formData.get("shipping_address.address_1"),
        address_2: "",
        company: formData.get("shipping_address.company"),
        postal_code: formData.get("shipping_address.postal_code"),
        city: formData.get("shipping_address.city"),
        country_code: formData.get("shipping_address.country_code"),
        province: formData.get("shipping_address.province"),
        phone: formData.get("shipping_address.phone"),
      },
      email: formData.get("email"),
    } as any

    const sameAsBilling = formData.get("same_as_billing")
    if (sameAsBilling === "on") data.billing_address = data.shipping_address

    if (sameAsBilling !== "on")
      data.billing_address = {
        first_name: formData.get("billing_address.first_name"),
        last_name: formData.get("billing_address.last_name"),
        address_1: formData.get("billing_address.address_1"),
        address_2: "",
        company: formData.get("billing_address.company"),
        postal_code: formData.get("billing_address.postal_code"),
        city: formData.get("billing_address.city"),
        country_code: formData.get("billing_address.country_code"),
        province: formData.get("billing_address.province"),
        phone: formData.get("billing_address.phone"),
      }
    await updateCart(data)
  } catch (e: any) {
    return e.message
  }

  redirect(
    `/${formData.get("shipping_address.country_code")}/checkout?step=delivery`
  )
}

/**
 * Places an order for a cart. If no cart ID is provided, it will use the cart ID from the cookies.
 * @param cartId - optional - The ID of the cart to place an order for.
 * @returns The cart object if the order was successful, or null if not.
 */
export async function placeOrder(cartId?: string) {
  const id = cartId || (await getCartId())

  if (!id) {
    throw new Error("No existing cart found when placing an order")
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  const cartRes = await sdk.store.cart
    .complete(id, {}, headers)
    .then(async (cartRes) => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)
      return cartRes
    })
    .catch(medusaError)

  if (cartRes?.type === "order") {
    const countryCode =
      cartRes.order.shipping_address?.country_code?.toLowerCase()

    const orderCacheTag = await getCacheTag("orders")
    revalidateTag(orderCacheTag)

    removeCartId()
    redirect(`/${countryCode}/order/${cartRes?.order.id}/confirmed`)
  }

  return cartRes.cart
}

/**
 * Moves the visitor's cart to the region of the URL's country, the same
 * cart update the region selector makes (updateRegion, below), without
 * leaving the page. For a cart page or checkout opened under another
 * region's URL: the page then shows the cart in that region (prices,
 * currency and delivery; Medusa drops an address and a delivery method
 * that belong to the old region). False when nothing could be moved.
 */
export async function moveCartToRegion(countryCode: string): Promise<boolean> {
  const cartId = await getCartId()
  const region = await getRegion(countryCode)
  if (!cartId || !region) {
    return false
  }
  try {
    await updateCart({ region_id: region.id })
    return true
  } catch {
    return false
  }
}

/**
 * Updates the countrycode param and revalidates the regions cache
 * @param regionId
 * @param countryCode
 */
export async function updateRegion(countryCode: string, currentPath: string) {
  const cartId = await getCartId()
  const region = await getRegion(countryCode)

  if (!region) {
    throw new Error(`Region not found for country code: ${countryCode}`)
  }

  if (cartId) {
    // updateCart revalidates every cached read of the cart, the shipping
    // options included: they change with the region.
    await updateCart({ region_id: region.id })
  }

  const regionCacheTag = await getCacheTag("regions")
  revalidateTag(regionCacheTag)

  const productsCacheTag = await getCacheTag("products")
  revalidateTag(productsCacheTag)

  redirect(`/${countryCode}${currentPath}`)
}

export async function listCartOptions() {
  const cartId = await getCartId()
  const headers = {
    ...(await getAuthHeaders()),
  }
  const next = {
    ...(await getCacheOptions("shippingOptions")),
  }

  return await sdk.client.fetch<{
    shipping_options: HttpTypes.StoreCartShippingOption[]
  }>("/store/shipping-options", {
    query: { cart_id: cartId },
    next,
    headers,
    cache: "force-cache",
  })
}
