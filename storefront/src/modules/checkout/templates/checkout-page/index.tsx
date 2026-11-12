"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect } from "react"

import { checkoutContent } from "@content/checkout"
import { useOnline } from "@lib/hooks/use-online"
import { CheckoutView, openStep } from "@lib/util/checkout-view"
import { fill } from "@lib/util/wording"
import RegionMovedNotice from "@modules/cart/components/region-moved-notice"
import Alert from "@modules/common/components/alert"
import { ButtonLink } from "@modules/common/components/button"

import AddressStep from "../../components/address-step"
import { focusStepOnOpen } from "../../step-memory"
import { OrderSummaryBox, OrderSummaryDisclosure } from "../../components/order-summary"
import PaymentStep, { MINIMUM_ALERT_ID } from "../../components/payment-step"
import { checkoutLayout } from "./layout"

/**
 * The checkout (docs/design/05-m1-pages.md, section 6): two steps on one
 * URL, `?step=address` and `?step=payment`. Each step change is a history
 * entry (router.push), so the browser's Back goes from step 2 to step 1,
 * not out of the checkout; the steps stay mounted, so what was typed is
 * kept. Below 1024 px one column with the order summary bar on top; from
 * 1024 px the summary box on the right.
 */
const CheckoutPage = ({ view }: { view: CheckoutView }) => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const online = useOnline()
  const asked = searchParams.get("step")
  const step = openStep(asked, view.address.done)
  const stepWords = checkoutContent.steps[step]
  const countryName =
    view.address.countries.find((c) => c.code === view.countryCode)?.name ??
    view.address.countries[0]?.name ??
    view.countryCode.toUpperCase()
  const go = (to: "address" | "payment") => {
    focusStepOnOpen(to)
    router.push(`/${view.countryCode}/checkout?step=${to}`)
  }

  // Back and Forward show the cached page; read the cart again, so step 2
  // never shows a payment or a total from before a change.
  useEffect(() => {
    const onPop = () => router.refresh()
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [router])

  // The URL names the step that is open: a link to step 2 with step 1 not
  // done (or no longer done: the cart moved region) shows step 1 (QA D10).
  useEffect(() => {
    if (asked === "payment" && step === "address") {
      router.replace(`/${view.countryCode}/checkout?step=address`)
    }
  }, [asked, step, router, view.countryCode])

  const minimum = view.minimumBlocks ? view.minimum : null

  return (
    <div className={checkoutLayout.page} data-testid="checkout-page" data-step={step}>
      <p className="type-small text-brand-ink-muted" data-testid="step-label" aria-live="polite">
        {fill(checkoutContent.stepLabel, { n: stepWords.number, name: stepWords.name })}
      </p>

      <div className="mt-4 empty:hidden">
        <RegionMovedNotice
          countryCode={view.countryCode}
          countryName={countryName}
          currencyCode={view.currencyCode}
        />
      </div>

      {!online && (
        <div role="status" className="mt-4" data-testid="offline-banner">
          <Alert variant="info" icon="alert" title={checkoutContent.errors.offline} />
        </div>
      )}

      <div className={checkoutLayout.columns}>
        <div className={checkoutLayout.main}>
          <div className={checkoutLayout.summaryCollapsed}>
            <OrderSummaryDisclosure view={view} />
          </div>

          {minimum && (
            <Alert
              id={MINIMUM_ALERT_ID}
              variant="error"
              icon="team"
              focusable
              title={fill(checkoutContent.minimum.title, { required: minimum.required })}
              action={
                <ButtonLink href="/cart" variant="secondary" data-testid="minimum-back-to-cart">
                  {checkoutContent.minimum.backToCart}
                </ButtonLink>
              }
              data-testid="checkout-minimum-alert"
            >
              {fill(checkoutContent.minimum.text, {
                counted: minimum.counted,
                missing: minimum.missing,
              })}
            </Alert>
          )}

          <AddressStep
            view={view}
            open={step === "address"}
            onSaved={() => go("payment")}
            onChange={() => go("address")}
          />

          <div className="border-t border-brand-border pt-8">
            <PaymentStep view={view} open={step === "payment"} />
          </div>
        </div>

        <aside className={checkoutLayout.aside}>
          <OrderSummaryBox view={view} />
        </aside>
      </div>
    </div>
  )
}

export default CheckoutPage
