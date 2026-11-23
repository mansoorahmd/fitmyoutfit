import { notFound, redirect } from "next/navigation"

import { proofContent } from "@content/proof"
import { customerState } from "@lib/data/customer"
import { listProducts } from "@lib/data/products"
import { retrievePayments } from "@lib/data/team-order-payments"
import { loadSavedDesign, retrieveProof, retrieveTeamOrder } from "@lib/data/team-orders"
import { designOrderPath } from "@lib/editor/designer-context"
import { editorFontFamilies } from "@lib/editor/fonts"
import { editorProductFor, garmentOfDesign, garmentTitle, isEarlierModelDesign } from "@lib/editor/products"
import { buildProofDocument, nameLetterCase, snapshotMatchesHash } from "@lib/team-order/proof"
import { signingSchedule } from "@lib/team-order/signing"
import type { TeamOrderView } from "@lib/team-order/types"
import { authHref } from "@lib/util/account-auth"
import { parseSizeChart } from "@lib/util/size-chart"
import ServerError from "@modules/common/components/server-error"
import BackLink from "@modules/account/components/back-link"

import ProofPageView from "../components/proof-page-view"

/**
 * The proof page, for the order's current proof (`proofId` undefined) or an earlier one: only its organizer sees
 * it (another customer's order or proof is the not-found page, with none of its data; signed out is the sign-in
 * page, then back here). Built from the proof's snapshot as the backend returns it, never from the live list.
 */
export default async function ProofRoute({
  countryCode,
  orderId,
  proofId,
  order: given,
}: {
  countryCode: string
  orderId: string
  proofId?: string
  /** The order, when the page has read it already (the same request). */
  order?: TeamOrderView
}) {
  const path = `/account/team-orders/${encodeURIComponent(orderId)}/proof${proofId ? `/${encodeURIComponent(proofId)}` : ""}`
  const state = await customerState()
  if (state.kind === "signed_out") redirect(`/${countryCode}${authHref("signin", { next: path })}`)
  if (state.kind !== "signed_in") return <ServerError />

  let order = given
  if (!order) {
    const read = await retrieveTeamOrder(orderId)
    if (!read.ok) {
      if (read.failure.kind === "not_found") notFound()
      if (read.failure.kind === "signed_out") redirect(`/${countryCode}${authHref("signin", { next: path })}`)
      return <ServerError />
    }
    order = read.value
  }

  const wanted = proofId ?? order.currentProof?.id
  // No proof to show: the order's own page says where it stands.
  if (!wanted) redirect(`/${countryCode}/account/team-orders/${encodeURIComponent(orderId)}`)

  const read = await retrieveProof(orderId, wanted)
  if (!read.ok) {
    if (read.failure.kind === "not_found") notFound()
    if (read.failure.kind === "signed_out") redirect(`/${countryCode}${authHref("signin", { next: path })}`)
    return <ServerError />
  }
  const proof = read.value

  if (!snapshotMatchesHash(proof)) {
    const words = proofContent.page.unverified
    return (
      <section className="content-container flex min-h-[40vh] flex-col items-start justify-center gap-4 py-12" data-testid="proof-unverified">
        <BackLink href={`/account/team-orders/${encodeURIComponent(orderId)}`} label={proofContent.page.back} />
        <h1 className="type-h1">{words.title}</h1>
        <p className="type-body-lg max-w-xl text-brand-ink-muted">{words.text}</p>
      </section>
    )
  }

  const product = await listProducts({ countryCode, queryParams: { id: [proof.snapshot.productId], limit: 1 } })
    .then(({ response }) => response.products[0])
    .catch(() => undefined)
  const entry = product?.handle ? editorProductFor(product.handle) : null
  // The design as saved with the proof's design version: the letter case of the names and the pictures come from it.
  const saved = await loadSavedDesign({ designId: order.designId, versionId: proof.designVersionId })
  const design = saved.ok ? saved.value.design : null
  const chart = parseSizeChart(product?.metadata)
  // The neck the proof's design was made for (the jersey has two): its pictures and its header show it, since the factory
  // makes what the proof shows. A design that names none of the product's garments is the first one's.
  const garment = entry ? garmentOfDesign(entry, design) : null

  const isCurrent = order.currentProof?.id === proof.id
  const document = buildProofDocument({
    proof,
    productName: garment ? garmentTitle(product?.title ?? "", garment) : (product?.title ?? ""),
    sizes: order.sizes,
    chart,
    letterCase: nameLetterCase(design),
    needByDate: proof.needByDate ?? (isCurrent ? order.needByDate : null),
  })
  const waiting = proof.status === "sent" && isCurrent
  // The price of the proof that is out (the organizer reads it before signing), or of the signed order. Only when it is
  // the price of this very proof: anything else is "not read", and signing is not offered.
  const priced = isCurrent && (waiting || proof.status === "signed")
  const paymentsRead = priced ? await retrievePayments(orderId) : null
  const money = paymentsRead?.ok && paymentsRead.value.cost.proofId === proof.id ? paymentsRead.value : null
  const designerHref =
    entry && product?.handle ? `/${countryCode}${designOrderPath(product.handle, orderId)}` : `/${countryCode}/account/team-orders/${encodeURIComponent(orderId)}`

  return (
    <ProofPageView
      orderId={orderId}
      countryCode={countryCode}
      document={document}
      proof={proof}
      isCurrent={isCurrent}
      currentProofId={order.currentProof?.id ?? null}
      schedule={waiting ? signingSchedule(order.schedule, order.rushRequested) : { state: "none", sentences: [] }}
      pictures={{
        entry: garment ? { definition: garment.definition, modelFile: garment.modelFile } : null,
        design,
        fontFamilies: editorFontFamilies,
        fallbackPicture: product?.thumbnail ?? null,
        earlierModel: !!entry && isEarlierModelDesign(design, entry),
      }}
      changeListPath={designerHref}
      orderStatus={order.status}
      money={money}
    />
  )
}
