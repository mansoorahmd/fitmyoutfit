/**
 * Order page panel: "Fit kit". Shown only on an order with a fit kit line (the backend says so:
 * GET /admin/orders/:id/fit-kit-refund, `applies`).
 *
 * - Kits out, kits returned, refunded so far and by whom, from the backend's record.
 * - When something is left to refund: how many kits came back (1 up to what is left), the amount
 *   that will be refunded for that many (worked out by the backend, never typed here), and the
 *   button "Kit returned: refund the deposit". It asks for a confirmation that names the amount,
 *   then POSTs the quantity only. A payment made with cash on delivery has no money to give back
 *   through the store: the button says "record the refund by hand" and the confirmation says that
 *   no money moves.
 * - When nothing can be refunded (not paid, canceled, all kits refunded...): the backend's sentence.
 *
 * All decisions come from the backend (lib/rules/fit-kit-refund.ts through the admin route); this
 * file only renders them. Medusa's own order page shows the refund in its Payments section.
 */
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Badge, Button, Container, Heading, Label, Text } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState, type ReactNode } from "react"

type Method = "medusa" | "by_hand"

type FitKit = {
  applies: boolean
  kits_total: number
  kits_returned: number
  kits_left: number
  refunded_amount: number
  amounts_by_quantity: number[]
  can_refund: boolean
  reason: string | null
  message: string | null
  method: Method | null
  currency_code: string
  currency_digits: number
  returns: { quantity: number; amount: string; method: Method; by: string; by_email: string | null; at: string }[]
}

async function call(url: string, init?: RequestInit): Promise<{ fit_kit: FitKit }> {
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

function formatDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
}

function formatAmount(amount: number | string, code: string, digits: number): string {
  const number = Number(amount)
  return `${code.toUpperCase()} ${number.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 items-start gap-x-2">
      <Text size="small" weight="plus">{label}</Text>
      <Text size="small">{children}</Text>
    </div>
  )
}

const FitKitRefundWidget = ({ data: order }: DetailWidgetProps<AdminOrder>) => {
  const url = `/admin/orders/${order.id}/fit-kit-refund`
  const queryKey = ["fitmyoutfit", "fit-kit-refund", order.id]
  const queryClient = useQueryClient()
  const [quantity, setQuantity] = useState(1)
  const [confirming, setConfirming] = useState(false)

  const { data, isLoading, error } = useQuery({ queryKey, queryFn: () => call(url) })
  const refund = useMutation({
    mutationFn: (kits: number) => call(url, { method: "POST", body: JSON.stringify({ quantity: kits }) }),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result)
      setConfirming(false)
      setQuantity(1)
    },
    onError: () => setConfirming(false),
    onSettled: () => {
      // Refresh this panel and the rest of the order page (payment status, Payments section).
      void queryClient.invalidateQueries()
    },
  })

  const state = data?.fit_kit
  if (isLoading || error || !state?.applies) {
    return null
  }

  const chosen = Math.min(Math.max(1, quantity), Math.max(1, state.kits_left))
  const amount = state.amounts_by_quantity[chosen - 1]
  const money = (value: number | string) => formatAmount(value, state.currency_code, state.currency_digits)
  const byHand = state.method === "by_hand"
  const badge =
    state.kits_left === 0
      ? { label: "All refunded", color: "green" as const }
      : state.kits_returned > 0
        ? { label: "Partly refunded", color: "orange" as const }
        : { label: "Kit out", color: "grey" as const }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Fit kit</Heading>
        <Badge color={badge.color} size="2xsmall">{badge.label}</Badge>
      </div>

      <div className="flex flex-col gap-y-2 px-6 py-4">
        <Row label="Kits out"><span data-testid="kit-total">{state.kits_total}</span></Row>
        <Row label="Kits returned"><span data-testid="kit-returned">{state.kits_returned}</span></Row>
        <Row label="Refunded">
          <span data-testid="kit-refunded">{money(state.refunded_amount)}</span>
        </Row>
        {state.returns.map((entry, index) => (
          <Text key={index} size="small" className="text-ui-fg-subtle" data-testid="kit-return-record">
            {entry.quantity} kit{entry.quantity === 1 ? "" : "s"}, {money(entry.amount)},{" "}
            {entry.method === "by_hand" ? "refunded by hand (no money moved by the store)" : "refunded to the payment"}, by{" "}
            {entry.by_email ?? entry.by}, {formatDate(entry.at)}
          </Text>
        ))}
      </div>

      {state.can_refund ? (
        <div className="flex flex-col gap-y-3 px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            {byHand
              ? "This order was paid by cash on delivery, so the store has no payment to refund: pressing the button records the refund you pay back by hand. No money is moved by the store."
              : "Refunds the deposit for the kits that came back, through the payment that paid for them. Only the kit's price is refunded, not delivery or garments."}
          </Text>
          {confirming ? (
            <div className="flex flex-col gap-y-2" data-testid="kit-confirmation">
              <Text size="small" weight="plus">
                {byHand
                  ? `Record that ${money(amount ?? 0)} is refunded by hand for ${chosen} kit${chosen === 1 ? "" : "s"}?`
                  : `Refund ${money(amount ?? 0)} for ${chosen} kit${chosen === 1 ? "" : "s"}?`}
              </Text>
              <div className="flex gap-x-2">
                <Button size="small" isLoading={refund.isPending} disabled={refund.isPending} onClick={() => refund.mutate(chosen)} data-testid="kit-confirm">
                  Yes, {byHand ? "record it" : "refund"}
                </Button>
                <Button size="small" variant="secondary" disabled={refund.isPending} onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              {state.kits_left > 1 ? (
                <div className="flex flex-col gap-y-1">
                  <Label htmlFor="kit-quantity" size="small">How many kits came back</Label>
                  <select
                    id="kit-quantity"
                    className="bg-ui-bg-field text-ui-fg-base shadow-borders-base rounded-md px-2 py-1 text-sm"
                    value={chosen}
                    onChange={(event) => setQuantity(Number(event.target.value))}
                  >
                    {Array.from({ length: state.kits_left }, (_, index) => index + 1).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              ) : null}
              <Row label="Will refund"><span data-testid="kit-amount">{money(amount ?? 0)}</span></Row>
              <Button size="small" variant="secondary" onClick={() => setConfirming(true)} data-testid="kit-refund-button">
                {byHand ? "Kit returned: record refund by hand" : "Kit returned: refund the deposit"}
              </Button>
            </>
          )}
          {refund.error ? (
            <Text size="small" className="text-ui-fg-error" role="alert">{refund.error.message}</Text>
          ) : null}
        </div>
      ) : (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle" data-testid="kit-reason">
            {state.message ?? "A refund cannot be made now."}
          </Text>
          {refund.error ? (
            <Text size="small" className="text-ui-fg-error" role="alert">{refund.error.message}</Text>
          ) : null}
        </div>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.before",
})

export default FitKitRefundWidget
