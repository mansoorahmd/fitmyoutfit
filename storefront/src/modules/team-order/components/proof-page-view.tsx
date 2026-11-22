"use client"

import { useState } from "react"

import { proofContent } from "@content/proof"
import { dayOfMoment, momentWords, signatureLine, type ProofDocument } from "@lib/team-order/proof"
import type { SigningSchedule } from "@lib/team-order/signing"
import type { ProofView } from "@lib/team-order/types"
import { formatCalendarDateWithYear } from "@lib/util/calendar-date"
import { Alert } from "@modules/common/components/alert"
import { Button } from "@modules/common/components/button"
import BackLink from "@modules/account/components/back-link"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

import ProofPictures from "./proof-pictures"
import ReopenButton from "./reopen-button"
import RosterProof from "./roster-proof"
import SignProof, { SignedPanel } from "./sign-proof"

const w = proofContent.page

type PicturesProps = React.ComponentProps<typeof ProofPictures>

/**
 * The proof page: the proof itself (a plain component, built from the proof's snapshot), the pictures of the kit,
 * "Print or save as PDF", and below it, by the proof's state, the signing form, the signed panel, or the note that
 * an earlier proof is only to be read. Everything shown comes from the proof the server read; after a refusal that
 * says the page is out of date, the page reads the order again and says so.
 */
export default function ProofPageView({
  orderId,
  countryCode,
  document: doc,
  proof,
  isCurrent,
  currentProofId,
  schedule,
  pictures,
  changeListPath,
}: {
  orderId: string
  countryCode: string
  document: ProofDocument
  proof: ProofView
  /** This proof is the one the order holds now. */
  isCurrent: boolean
  /** The id of the proof that counts now (to link to it from an earlier one), or null. */
  currentProofId: string | null
  /** The need-by date's state and what to say about it (only for a proof waiting for a signature). */
  schedule: SigningSchedule
  pictures: PicturesProps
  /** Where "Change the list" goes after the order is a draft again (a path with the country code). */
  changeListPath: string
}) {
  const [notice, setNotice] = useState<string | null>(null)
  const [justSigned, setJustSigned] = useState<ProofView | null>(null)

  const shown = justSigned ?? proof
  const signed = shown.status === "signed"
  const sent = shown.status === "sent" && isCurrent
  const orderPath = `/${countryCode}/account/team-orders/${encodeURIComponent(orderId)}`
  const proofPath = `${orderPath}/proof`

  // the document's foot follows what was just signed, before the server's copy of the page has been read again
  const document = justSigned ? { ...doc, status: justSigned.status, signature: signatureLine(justSigned) } : doc
  const whenText = momentWords(shown.signedAt) ?? ""
  const promisedText = shown.promisedDeliveryDate ? (formatCalendarDateWithYear(shown.promisedDeliveryDate) ?? shown.promisedDeliveryDate) : null

  return (
    <div className="content-container pb-12 pt-6 md:pt-8 print:p-0" data-testid="proof-page" data-status={shown.status}>
      <div className="mx-auto flex max-w-[760px] flex-col gap-6 print:max-w-none">
        <div className="fmo-no-print">
          <BackLink href={`/account/team-orders/${encodeURIComponent(orderId)}`} label={w.back} data-testid="proof-back" />
        </div>

        {notice && (
          <Alert variant="info" announce className="fmo-no-print" data-testid="proof-updated">
            <p>{notice}</p>
            <p className="mt-1">{w.updated}</p>
          </Alert>
        )}

        {(shown.status === "withdrawn" || shown.status === "replaced") && (
          <Alert variant="info" className="fmo-no-print" data-testid="proof-earlier">
            <div className="flex flex-col gap-2">
              <p>{shown.status === "withdrawn" ? w.earlier.withdrawn : w.earlier.replaced}</p>
              {currentProofId && (
                <p>
                  {w.earlier.current}{" "}
                  <LocalizedClientLink className="font-semibold underline underline-offset-4" href={`/account/team-orders/${encodeURIComponent(orderId)}/proof`}>
                    {w.earlier.openCurrent}
                  </LocalizedClientLink>
                </p>
              )}
            </div>
          </Alert>
        )}

        <RosterProof document={document} pictures={<ProofPictures {...pictures} />} />

        <div className="fmo-no-print flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => window.print()} data-testid="proof-print">
            {w.print}
          </Button>
        </div>

        {signed ? (
          <>
            <SignedPanel proof={shown} whenText={whenText || (dayOfMoment(shown.signedAt) ?? "")} promisedText={promisedText} />
            {isCurrent && (
              <div className="fmo-no-print">
                <ReopenButton orderId={orderId} signed afterHref={changeListPath} />
              </div>
            )}
          </>
        ) : sent ? (
          <>
            <SignProof
              key={proof.hash}
              orderId={orderId}
              proof={proof}
              schedule={schedule}
              orderHref={orderPath}
              signedInPath={proofPath}
              onSigned={(p) => setJustSigned(p)}
              onStale={(sentence) => setNotice(sentence)}
            />
            <div className="fmo-no-print">
              <ReopenButton orderId={orderId} signed={false} afterHref={changeListPath} variant="text" />
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
