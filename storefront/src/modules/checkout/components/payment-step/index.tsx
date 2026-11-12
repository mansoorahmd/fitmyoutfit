"use client"

import { clx } from "@medusajs/ui"
import { isRedirectError } from "next/dist/client/components/redirect-error"
import { useRouter } from "next/navigation"
import { Fragment, useEffect, useRef, useState } from "react"

import { checkoutContent } from "@content/checkout"
import {
  PlaceOrderResult,
  choosePayment,
  explainRefusedOrder,
  placeOrder,
} from "@lib/data/checkout"
import { useOnline } from "@lib/hooks/use-online"
import { PlaceOrderAlertState, placeOrderAlert } from "@lib/util/checkout-alerts"
import { PLACE_ORDER_TIMEOUT_MS, RefusalView, placeOrderBlock } from "@lib/util/checkout-order"
import { COD_PROVIDER_ID, initialPaymentId, selectableOption } from "@lib/util/checkout-payment"
import { CheckoutView } from "@lib/util/checkout-view"
import { OrderStatus, requestOrderStatus } from "@lib/util/order-status"
import { countWords, fillParts } from "@lib/util/wording"
import Alert from "@modules/common/components/alert"
import Amount from "@modules/common/components/amount"
import { Button, ButtonLink } from "@modules/common/components/button"
import Spinner from "@modules/common/icons/spinner"
import LineIcon from "@modules/home/components/line-icon"

import { forgetAddressDraft, takeStepFocus } from "../../step-memory"
import DeliveryBlock, { DELIVERY_ALERT_ID } from "../delivery-block"
import OrderCheck from "../order-check"
import PaymentChoice from "../payment-choice"

export const MINIMUM_ALERT_ID = "checkout-minimum-alert"
const REASON_ID = "place-order-reason"

const words = checkoutContent

/** The payment chosen on this cart, kept in the browser: Medusa drops the session when the cart changes. */
const storageKey = (cartId: string) => `fmo-checkout-payment:${cartId}`
const remember = (cartId: string, id: string | null) => {
  try {
    if (id) sessionStorage.setItem(storageKey(cartId), id)
    else sessionStorage.removeItem(storageKey(cartId))
  } catch {
    // private mode: the choice is simply not kept
  }
}
const remembered = (cartId: string): string | null => {
  try {
    return sessionStorage.getItem(storageKey(cartId))
  } catch {
    return null
  }
}

/** Resolves with "timeout" after `ms`, so a lost connection never leaves the button spinning. */
const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T | "timeout"> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve("timeout"), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })

type Phase = "idle" | "placing" | "checking" | "leaving"

/**
 * Step 2, delivery and payment (docs/design/05-m1-pages.md, 6.5 to 6.8):
 * the delivery line and date, the payment choice, "Check your order" (only
 * where the summary box isn't beside the steps; see OrderCheck) and the
 * place-order block. Closed (before step 1 is done): its heading only.
 */
const PaymentStep = ({ view, open }: { view: CheckoutView; open: boolean }) => {
  const router = useRouter()
  const online = useOnline()
  const { payment } = view
  const [chosen, setChosen] = useState<string | null>(
    () => selectableOption(payment, payment.sessionProviderId)?.id ?? null
  )
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [selectFailed, setSelectFailed] = useState(false)
  const [phase, setPhase] = useState<Phase>("idle")
  const [alert, setAlert] = useState<{ state: PlaceOrderAlertState; key: number } | null>(null)
  const placing = useRef(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const groupRef = useRef<HTMLDivElement>(null)

  // The choice made before a cart change, once the page is in the browser.
  useEffect(() => {
    setChosen(
      (current) =>
        current ??
        initialPaymentId({
          choice: payment,
          sessionProviderId: payment.sessionProviderId,
          rememberedId: remembered(view.cartId),
        })
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.cartId])

  // The rules changed (another tab, a refusal): a choice that can't be made any more goes.
  useEffect(() => {
    setChosen((current) => (current && !selectableOption(payment, current) ? null : current))
  }, [payment])

  // Opened from step 1: focus moves to the step's heading.
  useEffect(() => {
    if (open && takeStepFocus("payment")) headingRef.current?.focus()
  }, [open])

  const show = (state: PlaceOrderAlertState) => {
    setAlert((current) => ({ state, key: (current?.key ?? 0) + 1 }))
    const shown = placeOrderAlert(state)
    if (shown.deselectCod) {
      setChosen((current) => (current === COD_PROVIDER_ID ? null : current))
      remember(view.cartId, null)
    }
    if (shown.focus === "payment") requestAnimationFrame(() => groupRef.current?.focus())
  }

  /** The order exists: the server action is taking the visitor to the confirmation. */
  const leaving = () => {
    setPhase("leaving")
    remember(view.cartId, null)
    forgetAddressDraft(view.cartId)
  }

  const choose = async (id: string) => {
    if (loadingId || phase !== "idle" || id === chosen) return
    const previous = chosen
    setChosen(id)
    setLoadingId(id)
    setSelectFailed(false)
    try {
      const result = await choosePayment(id)
      if (result.ok) {
        remember(view.cartId, id)
      } else {
        setChosen(previous)
        if (result.kind === "cart_lost") show({ kind: "cart_lost" })
        else setSelectFailed(true)
        // a refusal means the rules changed: read them again
        if (result.kind === "refused") router.refresh()
      }
    } catch {
      setChosen(previous)
      setSelectFailed(true)
    } finally {
      setLoadingId(null)
    }
  }

  const block = placeOrderBlock({
    online,
    minimum: view.minimum,
    deliveryReady: view.deliveryReady,
    choice: payment,
    chosenId: chosen,
  })

  const explain = async (): Promise<RefusalView> => {
    try {
      return await explainRefusedOrder(chosen)
    } catch {
      return { kind: "generic" }
    }
  }

  /** The order exists: to its confirmation. */
  const toOrder = (url: string) => {
    leaving()
    router.replace(url)
  }

  /**
   * After an unknown outcome or a 5xx: one quiet look at the cart. If it
   * became an order, the customer goes to it (rule 6.8 c: never an order
   * the customer cannot see); otherwise the alert stays as it is, since the
   * first request may still be running. It also refreshes every cached read
   * of the cart, so no other page shows the ordered cart as a live one.
   */
  const lookQuietly = async () => {
    const status = await requestOrderStatus({ countryCode: view.countryCode, cartId: view.cartId })
    if (status.kind === "order" && !placing.current) toOrder(status.url)
  }

  const place = async () => {
    if (placing.current || !chosen) return
    placing.current = true
    setPhase("placing")
    setAlert(null)

    let result: PlaceOrderResult | "timeout"
    try {
      result = await withTimeout(placeOrder(chosen, view.countryCode), PLACE_ORDER_TIMEOUT_MS)
    } catch (error) {
      if (isRedirectError(error)) {
        leaving()
        return // the button keeps loading until the confirmation shows
      }
      result = "timeout"
    }

    if (result === "timeout" || result.kind === "unknown") {
      show({ kind: "unknown" })
    } else if (result.kind === "refused") {
      setPhase("checking")
      show({ kind: "refusal", refusal: await explain() })
      router.refresh()
    } else {
      show({ kind: result.kind })
    }
    placing.current = false
    setPhase("idle")
    if (result === "timeout" || result.kind === "unknown" || result.kind === "server") {
      void lookQuietly()
    }
  }

  /**
   * "Check my order" (05, 6.8 c). Asks the order-status route with fetch,
   * not a server action, so it never waits behind a "Place order" that is
   * still hanging (QA D5), and always ends within CHECK_ORDER_TIMEOUT_MS.
   */
  const checkMyOrder = async () => {
    if (placing.current) return
    placing.current = true
    setPhase("checking")
    const status: OrderStatus = await requestOrderStatus({
      countryCode: view.countryCode,
      cartId: view.cartId,
    })
    placing.current = false
    if (status.kind === "order") {
      toOrder(status.url)
      return
    }
    if (status.kind === "open") show({ kind: "refusal", refusal: { kind: "generic" } })
    else if (status.kind === "cart_lost") show({ kind: "cart_lost" })
    else if (status.kind === "placed") show({ kind: "placed" })
    else show({ kind: "unknown", rechecked: true })
    setPhase("idle")
  }

  const onBlockedPress = () => {
    if (!block) return
    const target =
      block.kind === "minimum"
        ? document.getElementById(MINIMUM_ALERT_ID)
        : block.kind === "delivery"
          ? document.getElementById(DELIVERY_ALERT_ID)
          : block.kind === "payment"
            ? groupRef.current
            : null
    target?.scrollIntoView?.({ block: "center" })
    target?.focus({ preventScroll: true })
  }

  const shown = alert ? placeOrderAlert(alert.state) : null
  const reason =
    block?.kind === "offline"
      ? words.errors.offlineReason
      : block?.kind === "minimum"
        ? countWords(block.missing, words.placeOrder.minimum)
        : block?.kind === "payment"
          ? words.placeOrder.choosePayment
          : null
  const reasonId = block ? (block.kind === "delivery" ? DELIVERY_ALERT_ID : REASON_ID) : undefined
  const busy = phase === "placing" || phase === "leaving"

  return (
    <section aria-labelledby="step-payment-title" data-testid="step-payment" data-state={open ? "open" : "closed"}>
      <h2
        ref={headingRef}
        id="step-payment-title"
        tabIndex={-1}
        className={clx("type-h2", open ? "text-brand-ink" : "text-brand-ink-muted")}
      >
        {words.steps.payment.title}
      </h2>

      {open && (
        <div className="mt-6 flex flex-col gap-8">
          <section aria-label={words.deliveryBlock.title}>
            <DeliveryBlock view={view} />
          </section>

          <PaymentChoice
            choice={payment}
            chosen={chosen}
            loadingId={loadingId}
            selectFailed={selectFailed}
            onChoose={choose}
            groupRef={groupRef}
          />

          <OrderCheck view={view} />

          <div className="flex flex-col gap-4" data-testid="place-order-block">
            {chosen === COD_PROVIDER_ID && (
              <p className="flex items-start gap-2 type-body text-brand-ink" data-testid="cod-will-pay">
                <LineIcon name="payment" className="h-6 w-6 shrink-0" />
                <span>
                  {fillParts(words.payment.codWillPay, {
                    total: <Amount className="font-semibold">{view.summary.total}</Amount>,
                  }).map((part, i) => (
                    <Fragment key={i}>{part}</Fragment>
                  ))}
                </span>
              </p>
            )}

            {words.placeOrder.showTerms && (
              <p className="type-small text-brand-ink-muted">{words.placeOrder.terms}</p>
            )}

            {shown && alert && (
              <Alert
                key={alert.key}
                variant={shown.variant}
                announce
                focusOnMount={shown.focus === "alert"}
                title={shown.title}
                action={
                  shown.action === "back_to_cart" ? (
                    <ButtonLink href="/cart" variant="secondary" data-testid="alert-back-to-cart">
                      {words.errors.backToCart}
                    </ButtonLink>
                  ) : shown.action === "go_to_cart" ? (
                    <ButtonLink href="/cart" data-testid="alert-go-to-cart">
                      {words.errors.goToCart}
                    </ButtonLink>
                  ) : shown.action === "check_order" ? (
                    <Button
                      onClick={checkMyOrder}
                      isLoading={phase === "checking" || phase === "leaving"}
                      loadingText={words.placeOrder.checking}
                      data-testid="check-my-order"
                    >
                      {words.errors.checkOrder}
                    </Button>
                  ) : undefined
                }
                data-testid="place-order-alert"
              >
                {shown.text}
              </Alert>
            )}

            {phase === "checking" && !shown?.hidePlaceOrder && (
              <p role="status" className="flex items-center gap-2 type-body text-brand-ink" data-testid="checking-order">
                <Spinner size={18} aria-hidden="true" />
                {words.placeOrder.checking}
              </p>
            )}

            {reason && (
              <p id={REASON_ID} className="type-small text-brand-ink" data-testid="place-order-reason">
                {reason}
              </p>
            )}

            {!shown?.hidePlaceOrder && (
              // The Button ignores presses while inactive; the press still
              // reaches this wrapper, which moves the customer to the reason.
              <div onClick={block ? onBlockedPress : undefined} className="w-full md:w-auto md:self-start">
                <Button
                  onClick={place}
                  disabled={!!block || phase === "checking"}
                  isLoading={busy}
                  loadingText={words.placeOrder.placing}
                  aria-describedby={reasonId}
                  className="w-full md:w-auto md:min-w-[240px]"
                  data-testid="place-order"
                >
                  {shown?.retryLabel ? words.errors.tryAgain : words.placeOrder.button}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export default PaymentStep
