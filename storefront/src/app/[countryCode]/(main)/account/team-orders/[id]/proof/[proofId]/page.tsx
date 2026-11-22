import { Metadata } from "next"

import { proofContent } from "@content/proof"
import ProofRoute from "@modules/team-order/templates/proof-route"

type Props = { params: Promise<{ countryCode: string; id: string; proofId: string }> }

export const metadata: Metadata = { title: proofContent.document.heading, robots: { index: false } }

/** An earlier proof of a team order (withdrawn or replaced), to read; the current one opens here too. */
export default async function EarlierProofPage(props: Props) {
  const { countryCode, id, proofId } = await props.params
  return <ProofRoute countryCode={countryCode} orderId={id} proofId={proofId} />
}
