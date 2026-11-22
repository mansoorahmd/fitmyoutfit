"use client"

import { useRouter } from "next/navigation"
import { useRef, useState } from "react"

import { proofContent } from "@content/proof"
import { makeProof } from "@lib/data/team-orders"
import { stepFailure } from "@lib/team-order/signing"
import { authHref } from "@lib/util/account-auth"
import { Alert } from "@modules/common/components/alert"
import { Button } from "@modules/common/components/button"

const w = proofContent.make

/**
 * "Make the proof", offered only where the backend would accept it (the page checks `readyForProof`). It asks the
 * backend, then opens the proof. A refusal is one sentence for its code under the button; a press while the first
 * is on its way does nothing.
 */
export default function MakeProofButton({ orderId, countryCode }: { orderId: string; countryCode: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<{ text: string; signedOut: boolean; refresh: boolean } | null>(null)
  const busy = useRef(false)
  const orderPath = `/account/team-orders/${encodeURIComponent(orderId)}`

  const press = async () => {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setFailure(null)
    let result
    try {
      result = await makeProof(orderId)
    } catch {
      result = { ok: false as const, failure: { kind: "unavailable" as const } }
    }
    if (result.ok) {
      // a proof is made: the page for it (the button stays locked while the page changes)
      router.push(`/${countryCode}${orderPath}/proof`)
      return
    }
    const step = stepFailure("make", result.failure)
    setFailure({ text: step.text, signedOut: step.signedOut, refresh: false })
    setPending(false)
    busy.current = false
    // the order moved on (a proof exists already): the page reads it again, and then shows where it stands
    if (result.failure.kind === "refused" && (result.failure.code === "team_order_not_draft" || result.failure.code === "team_order_changed")) {
      router.refresh()
    }
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <Button onClick={press} isLoading={pending} loadingText={w.making} fullWidth className="md:w-auto" data-testid="make-proof">
        {w.button}
      </Button>
      {failure && (
        <Alert variant="error" announce data-testid="make-proof-failure">
          <div className="flex flex-col gap-2">
            <p>{failure.text}</p>
            {failure.signedOut && (
              <p>
                <a className="font-semibold underline underline-offset-4" href={`/${countryCode}${authHref("signin", { next: orderPath })}`}>
                  {proofContent.general.signedOut}
                </a>
              </p>
            )}
          </div>
        </Alert>
      )}
    </div>
  )
}
