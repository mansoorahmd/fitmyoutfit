/**
 * Order page panel: "Cash on delivery". Shown only on an order paid by cash on delivery.
 *
 * - Not collected: a field for the courier's slip reference and a button "Mark cash as
 *   collected", which captures the payment (Medusa's own payment flow) and then records the
 *   reference (POST /admin/orders/:id/cash-collection).
 * - Partly captured (part of the amount was captured in Medusa's Payments section): the same
 *   field and button, which capture the rest and record the reference, because the courier's
 *   slip is for the whole order.
 * - Captured without slip (captured with Medusa's own "Capture payment" button, or the reference
 *   could not be saved after the capture): the same field, with "Record slip reference"; the
 *   payment is not captured again.
 * - Collected: the reference, when it was recorded, and who captured the payment and when (from
 *   Medusa's own capture record). When the order was canceled or the payment refunded afterwards,
 *   the badge and a note say so ("Collected, then canceled and refunded").
 * - A warning, in any state, when the order's capture transactions do not add up to the payment's
 *   captures (a Medusa fault seen when two captures run at once): staff are told not to refund
 *   from the order's paid figure and to tell the developer.
 *
 * The slip field does not cut what staff type: the server checks the reference (64 characters,
 * counted as typed) and its refusal, which says what is allowed, is shown under the field.
 *
 * All decisions (shown or not, which state, may be submitted or not, valid reference) come from
 * the backend (lib/rules/cash-collection.ts through the admin route); this file only renders them.
 */
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Badge, Button, Container, Heading, Input, Label, Text } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState, type FormEvent, type ReactNode } from "react"

type Stage = "not_collected" | "partly_captured" | "captured_without_slip" | "recorded" | "unavailable"

type CashCollection = {
  applies: boolean
  stage: Stage
  collected: boolean
  can_record: boolean
  capture_needed: boolean
  reason: string | null
  slip_reference: string | null
  collected_at: string | null
  amount: number | null
  captured_amount: number | null
  refunded_amount?: number | null
  order_canceled?: boolean
  captured_by: string | null
  captured_by_email: string | null
  captured_at: string | null
  label?: string
  tone?: "green" | "orange" | "red" | "grey"
  note?: string | null
  capture_warning?: string | null
}

const REASONS: Record<string, string> = {
  order_canceled: "This order is canceled, so the cash cannot be recorded as collected.",
  payment_canceled: "The cash-on-delivery payment is canceled, so the cash cannot be recorded as collected.",
  payment_refunded:
    "The cash-on-delivery payment is refunded, so the cash cannot be recorded as collected.",
  several_payments:
    "This order has more than one open payment. Capture it in the Payments section below.",
}

/** Fallback badges, for an answer without the backend's own label. */
const BADGES: Record<Stage, { label: string; color: "green" | "orange" | "red" | "grey" }> = {
  not_collected: { label: "Not collected", color: "orange" },
  partly_captured: { label: "Partly captured", color: "orange" },
  captured_without_slip: { label: "Captured, no slip", color: "orange" },
  recorded: { label: "Collected", color: "green" },
  unavailable: { label: "Not collected", color: "grey" },
}

async function call(url: string, init?: RequestInit): Promise<{ cash_collection: CashCollection }> {
  const response = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...init,
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(typeof body?.message === "string" ? body.message : `Error ${response.status}`)
  }
  return body
}

function formatDate(iso: string | null): string {
  if (!iso) {
    return "-"
  }
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
}

function formatAmount(amount: number | null, currencyCode: string): string {
  if (amount === null) {
    return "-"
  }
  return `${currencyCode.toUpperCase()} ${amount.toLocaleString("en-GB")}`
}

/** What is still open of the payment, for the text only (the backend captures the exact rest). */
function remaining(state: CashCollection): number | null {
  if (state.amount === null || state.captured_amount === null) {
    return null
  }
  return Math.max(0, Math.round((state.amount - state.captured_amount) * 100) / 100)
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 items-start gap-x-2">
      <Text size="small" weight="plus">{label}</Text>
      <Text size="small">{children}</Text>
    </div>
  )
}

const CashOnDeliveryCollectedWidget = ({ data: order }: DetailWidgetProps<AdminOrder>) => {
  const url = `/admin/orders/${order.id}/cash-collection`
  const queryKey = ["fitmyoutfit", "cash-collection", order.id]
  const queryClient = useQueryClient()
  const [reference, setReference] = useState("")

  const { data, isLoading, error } = useQuery({ queryKey, queryFn: () => call(url) })
  const mark = useMutation({
    mutationFn: (slip: string) =>
      call(url, { method: "POST", body: JSON.stringify({ slip_reference: slip }) }),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result)
      setReference("")
    },
    onSettled: () => {
      // Refresh this panel (another press may have recorded it) and the rest of the order page
      // (payment status, Payments section).
      void queryClient.invalidateQueries()
    },
  })

  const state = data?.cash_collection
  if (isLoading || error || !state?.applies) {
    // An order paid another way shows no panel. A failed load shows none either: Medusa's own
    // payment section still works.
    return null
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!mark.isPending) {
      mark.mutate(reference)
    }
  }
  const capturedBy = state.captured_by_email ?? state.captured_by
  const fallback = BADGES[state.stage] ?? BADGES.unavailable
  const badge = { label: state.label ?? fallback.label, color: state.tone ?? fallback.color }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Cash on delivery</Heading>
        <Badge color={badge.color} size="2xsmall">
          {badge.label}
        </Badge>
      </div>

      {state.capture_warning ? (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-error" role="alert" data-testid="cod-capture-warning">
            {state.capture_warning}
          </Text>
        </div>
      ) : null}

      {mark.error && !state.can_record ? (
        // The press failed and the panel has moved on (another press recorded it, for example).
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-error" role="alert">
            {mark.error.message}
          </Text>
        </div>
      ) : null}

      {state.stage === "recorded" ? (
        <div className="flex flex-col gap-y-2 px-6 py-4">
          <Row label="Slip reference">
            <span data-testid="cod-slip-reference">{state.slip_reference}</span>
          </Row>
          <Row label="Recorded">{formatDate(state.collected_at)}</Row>
          {capturedBy ? <Row label="Captured by">{capturedBy}</Row> : null}
          {state.captured_at ? <Row label="Captured">{formatDate(state.captured_at)}</Row> : null}
          {state.refunded_amount ? (
            <Row label="Refunded">{formatAmount(state.refunded_amount, order.currency_code)}</Row>
          ) : null}
          {state.note ? (
            <Text size="small" className="text-ui-fg-subtle" data-testid="cod-note">
              {state.note}
            </Text>
          ) : null}
        </div>
      ) : state.can_record ? (
        <form className="flex flex-col gap-y-3 px-6 py-4" onSubmit={submit}>
          <Text size="small" className="text-ui-fg-subtle">
            {state.stage === "partly_captured"
              ? `Part of this payment is already captured. When the courier hands over the slip for this order, enter its reference. This captures the remaining ${formatAmount(
                  remaining(state),
                  order.currency_code
                )}.`
              : state.capture_needed
                ? "When the courier hands over the slip for this order, enter its reference. This captures the payment."
                : "The payment is already captured, but no courier slip reference is recorded. Enter it here; the payment is not captured again."}
          </Text>
          {state.stage === "partly_captured" ? (
            <Row label="Captured">
              {formatAmount(state.captured_amount, order.currency_code)} of{" "}
              {formatAmount(state.amount, order.currency_code)}
            </Row>
          ) : null}
          {!state.capture_needed && capturedBy ? (
            <Row label="Captured by">
              {capturedBy}, {formatDate(state.captured_at)}
            </Row>
          ) : null}
          <div className="flex flex-col gap-y-1">
            <Label htmlFor="cod-slip-reference" size="small">
              Courier slip reference
            </Label>
            <Input
              id="cod-slip-reference"
              size="small"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              disabled={mark.isPending}
            />
          </div>
          {mark.error ? (
            <Text size="small" className="text-ui-fg-error" role="alert">
              {mark.error.message}
            </Text>
          ) : null}
          <Button
            type="submit"
            size="small"
            variant="secondary"
            isLoading={mark.isPending}
            disabled={mark.isPending || reference.trim() === ""}
          >
            {state.capture_needed ? "Mark cash as collected" : "Record slip reference"}
          </Button>
        </form>
      ) : (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            {REASONS[state.reason ?? ""] ?? "The cash cannot be recorded as collected."}
          </Text>
        </div>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.before",
})

export default CashOnDeliveryCollectedWidget
