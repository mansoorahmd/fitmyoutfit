"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import { checkoutContent } from "@content/checkout"
import { OrderStatus, requestOrderStatus } from "@lib/util/order-status"
import Alert from "@modules/common/components/alert"
import { Button } from "@modules/common/components/button"
import Spinner from "@modules/common/icons/spinner"

const words = checkoutContent.completedCart

/**
 * One request per page, however many parts of it meet the ordered cart
 * (the cart page and the header's cart): completing again is safe, but
 * one answer is enough.
 */
let pending: Promise<OrderStatus> | null = null
const askOnce = (countryCode: string, cartId: string | null): Promise<OrderStatus> => {
  pending ??= requestOrderStatus({ countryCode, cartId }).finally(() => {
    pending = null
  })
  return pending
}

/**
 * Shown wherever the storefront meets a cart that is already an order
 * (QA S1-4, D1: the answer to "Place order" was lost after the order was
 * made). It asks the order-status route, which completes the cart again
 * (the backend returns the same order), clears the cart cookie, and sends
 * the customer to the confirmation. The ordered cart is never shown as a
 * live one. When the order can't be opened now (the backend is down), it
 * says the order is placed, which is true since the cart is completed,
 * with "Try again".
 *
 * `quiet` (the header's cart): nothing is shown; the order opens when it
 * can, and the header shows an empty cart meanwhile.
 *
 * `cartId`: the ordered cart the page met. It is sent with the request, so
 * a second tab whose cookie the first tab's answer has already cleared
 * still reaches the order (QA S1-4c, m1). The route never completes an
 * open cart, and the id gives nothing that Medusa doesn't give to whoever
 * holds it.
 */
const CompletedCartRecovery = ({
  countryCode,
  cartId = null,
  quiet = false,
}: {
  countryCode: string
  cartId?: string | null
  quiet?: boolean
}) => {
  const router = useRouter()
  const [state, setState] = useState<"opening" | "failed">("opening")
  const started = useRef(false)

  const open = useCallback(async () => {
    setState("opening")
    const status = await askOnce(countryCode, cartId)
    if (status.kind === "order") {
      router.replace(status.url)
      return
    }
    if (status.kind === "open" || status.kind === "cart_lost") {
      // not an order after all (or gone): the page as the backend has it now
      router.refresh()
      return
    }
    setState("failed")
  }, [countryCode, cartId, router])

  useEffect(() => {
    if (started.current) return
    started.current = true
    void open()
  }, [open])

  if (quiet) {
    return null
  }

  return (
    <div className="content-container py-12" data-testid="completed-cart" data-state={state}>
      <div className="mx-auto flex max-w-[560px] flex-col gap-4">
        {state === "opening" ? (
          <Alert variant="success" title={words.title} data-testid="completed-cart-opening">
            <span role="status" className="flex items-center gap-2">
              <Spinner size={16} aria-hidden="true" />
              {words.opening}
            </span>
          </Alert>
        ) : (
          <Alert
            variant="success"
            title={words.title}
            announce
            action={
              <Button onClick={() => void open()} data-testid="completed-cart-retry">
                {words.retry}
              </Button>
            }
            data-testid="completed-cart-failed"
          >
            {words.failed}
          </Alert>
        )}
      </div>
    </div>
  )
}

export default CompletedCartRecovery
