/**
 * Order page panel: "Cash on delivery". Shown only on an order paid by cash on delivery.
 *
 * Before the cash is collected: a field for the courier's slip reference and a button
 * "Mark cash as collected". Pressing it calls POST /admin/orders/:id/cash-collection, which
 * captures the payment through Medusa's own payment flow and keeps the reference on the order.
 * After: the reference, the date and who recorded it, and no form.
 *
 * All decisions (shown or not, may be submitted or not, valid reference) come from the backend
 * (lib/rules/cash-collection.ts through the admin route); this file only renders them.
 */
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Badge, Button, Container, Heading, Input, Label, Text } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState, type FormEvent } from "react"

type CashCollection = {
  applies: boolean
  collected: boolean
  can_collect: boolean
  reason: string | null
  slip_reference: string | null
  collected_at: string | null
  collected_by: string | null
  collected_by_email: string | null
}

const REASONS: Record<string, string> = {
  order_canceled: "This order is canceled.",
  payment_canceled: "The cash-on-delivery payment is canceled.",
  several_payments:
    "This order has more than one open payment. Capture it in the Payments section below.",
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
      // Refresh the rest of the order page (payment status, Payments section).
      void queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== "fitmyoutfit",
      })
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

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Cash on delivery</Heading>
        <Badge color={state.collected ? "green" : "orange"} size="2xsmall">
          {state.collected ? "Collected" : "Not collected"}
        </Badge>
      </div>

      {state.collected ? (
        <div className="flex flex-col gap-y-2 px-6 py-4">
          <div className="grid grid-cols-2 items-start gap-x-2">
            <Text size="small" weight="plus">Slip reference</Text>
            <Text size="small" data-testid="cod-slip-reference">
              {state.slip_reference ?? "Not recorded (captured in Payments)"}
            </Text>
          </div>
          <div className="grid grid-cols-2 items-start gap-x-2">
            <Text size="small" weight="plus">Recorded</Text>
            <Text size="small">{formatDate(state.collected_at)}</Text>
          </div>
          {state.collected_by_email || state.collected_by ? (
            <div className="grid grid-cols-2 items-start gap-x-2">
              <Text size="small" weight="plus">By</Text>
              <Text size="small">{state.collected_by_email ?? state.collected_by}</Text>
            </div>
          ) : null}
        </div>
      ) : state.can_collect ? (
        <form className="flex flex-col gap-y-3 px-6 py-4" onSubmit={submit}>
          <Text size="small" className="text-ui-fg-subtle">
            When the courier hands over the slip for this order, enter its reference. This
            captures the payment.
          </Text>
          <div className="flex flex-col gap-y-1">
            <Label htmlFor="cod-slip-reference" size="small">
              Courier slip reference
            </Label>
            <Input
              id="cod-slip-reference"
              size="small"
              value={reference}
              maxLength={64}
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
            Mark cash as collected
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
