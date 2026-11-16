"use client"

import { clx } from "@medusajs/ui"
import { useRouter } from "next/navigation"
import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react"

import { cartContent } from "@content/cart"
import { chooseRush } from "@lib/data/rush"
import { formatDeliveryDate } from "@lib/util/calendar-date"
import { DeliverySpeed, RushControlView } from "@lib/util/rush"
import { fill } from "@lib/util/wording"
import Amount from "@modules/common/components/amount"
import FieldError from "@modules/common/components/field-error"
import RadioCard from "@modules/common/components/radio-card"

const words = cartContent.rush

/**
 * After a saved choice the page waits for the backend's new cart (the
 * server action's re-render, or the refresh it asks for) before the
 * totals show again; it never waits longer than this.
 */
export const SETTLE_LIMIT_MS = 8_000

type RushChoiceState = {
  /** The control as the backend has it, or null when rush isn't offered. */
  control: RushControlView | null
  /** The card shown as chosen: the one being saved, else the backend's. */
  shown: DeliverySpeed
  /** The choice being saved (until the new cart is on the page), or null. */
  saving: DeliverySpeed | null
  /** The choice that couldn't be saved, for "Try again". */
  failed: DeliverySpeed | null
  /** Announced once a choice is saved. */
  announcement: string | null
  choose: (speed: DeliverySpeed) => void
}

const RushChoiceContext = createContext<RushChoiceState | null>(null)

/** The choice's state for the parts of the page that follow it (the totals, "Place order", the cash on delivery hint). */
export const useRushChoice = (): RushChoiceState | null => useContext(RushChoiceContext)

/** A choice of delivery speed is being saved: the totals show grey bars and "Place order" waits. */
export const useRushSaving = (): boolean => !!useContext(RushChoiceContext)?.saving

type Router = ReturnType<typeof useRouter>

/**
 * Hands the page's router to the provider. Rendered only while the control
 * is shown, beside the page rather than around it, so a page without rush
 * needs no router (and nothing remounts when the control comes or goes).
 */
const RouterBridge = ({ routerRef }: { routerRef: React.RefObject<Router | null> }) => {
  routerRef.current = useRouter()
  return null
}

const announcementFor = (control: RushControlView, speed: DeliverySpeed): string | null => {
  const iso = speed === "rush" ? control.rushDate : control.standardDate
  const date = iso ? formatDeliveryDate(iso) : null
  return date ? fill(speed === "rush" ? words.chosenRush : words.chosenStandard, { date }) : null
}

/**
 * Holds the delivery speed choice for a page (the cart page, the
 * checkout), so the control, the totals and the cash on delivery hint's
 * "Choose Standard delivery" share one state. Choosing calls the backend
 * (POST or DELETE /store/carts/:id/rush, a 409 sent again once by itself);
 * while it saves, `onSaving(true)` lets the page show grey bars for the
 * totals, which stay until the backend's new cart is on the page, so they
 * never flicker between figures. A failure puts the choice back, says so
 * with "Try again", and reads the cart again so the control ends in a true
 * state.
 */
export const RushChoiceProvider = ({
  control,
  onSaving,
  children,
}: {
  control: RushControlView | null
  onSaving?: (saving: boolean) => void
  children: React.ReactNode
}) => {
  const router = useRef<Router | null>(null)
  const chosen: DeliverySpeed = control?.chosen ?? "standard"
  const [saving, setSaving] = useState<DeliverySpeed | null>(null)
  const [settling, setSettling] = useState(false)
  const [failed, setFailed] = useState<DeliverySpeed | null>(null)
  const [announcement, setAnnouncement] = useState<string | null>(null)
  const busy = useRef(false)
  const reportSaving = useRef(onSaving)
  reportSaving.current = onSaving

  useEffect(() => {
    reportSaving.current?.(saving !== null)
  }, [saving])

  // Saved: the totals come back once the page shows the backend's new cart.
  useEffect(() => {
    if (!settling || saving === null) return
    if (chosen === saving || !control) {
      if (control) setAnnouncement(announcementFor(control, saving))
      setSaving(null)
      setSettling(false)
    }
  }, [chosen, control, saving, settling])

  useEffect(() => {
    if (!settling) return
    const timer = setTimeout(() => {
      setSaving(null)
      setSettling(false)
    }, SETTLE_LIMIT_MS)
    return () => clearTimeout(timer)
  }, [settling])

  const choose = useCallback(
    async (speed: DeliverySpeed) => {
      if (busy.current || !control) return
      if (speed === chosen && saving === null) return
      busy.current = true
      setSaving(speed)
      setFailed(null)
      setAnnouncement(null)
      let ok = false
      try {
        ok = (await chooseRush(speed === "rush")).ok
      } catch {
        ok = false
      }
      busy.current = false
      if (ok) {
        setSettling(true)
      } else {
        setSaving(null)
        setFailed(speed)
      }
      // the cart as the backend has it now: the new figures, or the true state after a failure
      router.current?.refresh()
    },
    [chosen, control, saving]
  )

  return (
    <RushChoiceContext.Provider
      value={{ control, shown: saving ?? chosen, saving, failed: control ? failed : null, announcement, choose }}
    >
      {control && <RouterBridge routerRef={router} />}
      {children}
    </RushChoiceContext.Provider>
  )
}

/** A card's title with its price at the end: "Rush … + PKR 400". */
const CardTitle = ({ label, price }: { label: string; price: React.ReactNode }) => (
  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
    <span>{label}</span>
    <span className="font-normal">{price}</span>
  </span>
)

const DateLine = ({ date }: { date: string | null }) => {
  const shown = date ? formatDeliveryDate(date) : null
  return shown ? (
    <span className="block text-brand-ink" data-testid="speed-date">
      {fill(words.deliveredBy, { date: shown })}
    </span>
  ) : null
}

/**
 * "Delivery speed" (the coordinator's design for task S1-6c): two radio
 * cards, Standard ("Included") and Rush ("+ PKR 400" and what it is), each
 * with its date from the rules. A labelled radio group of native radios
 * (arrow keys, Space, the choice announced); while a choice saves, its
 * card shows a spinner and the other ignores presses. Shown only when rush
 * is offered; nothing at all otherwise.
 */
const RushChoice = ({
  heading: Heading = "h2",
  className,
}: {
  /** The heading's level on this page: h2 on the cart page, h3 inside checkout step 2. */
  heading?: "h2" | "h3"
  className?: string
}) => {
  const state = useRushChoice()
  const titleId = useId()
  const errorId = useId()
  if (!state?.control) {
    return null
  }
  const { control, shown, saving, failed, announcement, choose } = state

  return (
    <section aria-labelledby={titleId} className={clx("flex flex-col gap-3", className)} data-testid="rush-choice">
      <Heading id={titleId} className="type-h3 text-brand-ink">
        {words.title}
      </Heading>
      <div
        role="radiogroup"
        aria-labelledby={titleId}
        aria-describedby={failed ? errorId : undefined}
        aria-busy={saving !== null || undefined}
        className="flex flex-col gap-3"
      >
        <RadioCard
          id={`${titleId}-standard`}
          name={`${titleId}-speed`}
          value="standard"
          checked={shown === "standard"}
          onSelect={() => choose("standard")}
          title={<CardTitle label={words.standard} price={words.included} />}
          loading={saving === "standard"}
          busy={saving !== null && saving !== "standard"}
          data-testid="speed-standard"
        >
          <DateLine date={control.standardDate} />
        </RadioCard>
        <RadioCard
          id={`${titleId}-rush`}
          name={`${titleId}-speed`}
          value="rush"
          checked={shown === "rush"}
          onSelect={() => choose("rush")}
          title={
            <CardTitle
              label={words.rush}
              price={<Amount data-testid="speed-rush-amount">{fill(words.price, { amount: control.amount })}</Amount>}
            />
          }
          loading={saving === "rush"}
          busy={saving !== null && saving !== "rush"}
          data-testid="speed-rush"
        >
          <DateLine date={control.rushDate} />
          <span className="block" data-testid="speed-rush-note">
            {fill(words.note, { percentage: control.percentage })}
          </span>
        </RadioCard>
      </div>
      {failed && (
        <FieldError
          id={errorId}
          data-testid="speed-error"
          action={
            <button
              type="button"
              onClick={() => choose(failed)}
              className="min-h-[44px] px-1 type-small font-semibold text-brand-ink underline underline-offset-4"
              data-testid="speed-try-again"
            >
              {words.tryAgain}
            </button>
          }
        >
          <span role="alert">{words.failed}</span>
        </FieldError>
      )}
      <p role="status" className="sr-only" data-testid="speed-announcement">
        {announcement}
      </p>
    </section>
  )
}

/**
 * The cash on delivery over-limit hint while the cart holds rush (the
 * coordinator's design, 5): the sentence and one tap to Standard. Nothing
 * when the page has no rush choice.
 */
export const RushCodHint = ({ className }: { className?: string }) => {
  const state = useRushChoice()
  if (!state?.control) {
    return null
  }
  return (
    // the sentence, then the action on a line of its own, so its 44 px hit area never spreads the sentence's lines
    <div className={clx("flex flex-col items-start type-small text-brand-ink", className)} data-testid="cod-rush-hint">
      <p>{words.codHint}</p>
      <button
        type="button"
        onClick={() => state.choose("standard")}
        aria-disabled={state.saving !== null || undefined}
        className="inline-flex min-h-[44px] items-center font-semibold underline underline-offset-4 hover:decoration-2"
        data-testid="choose-standard"
      >
        {words.chooseStandard}
      </button>
    </div>
  )
}

export default RushChoice
