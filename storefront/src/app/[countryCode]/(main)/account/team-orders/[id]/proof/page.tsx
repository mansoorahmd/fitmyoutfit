import { Metadata } from "next"
import { cache } from "react"

import { proofContent } from "@content/proof"
import { customerState } from "@lib/data/customer"
import { retrieveTeamOrder } from "@lib/data/team-orders"
import { fill } from "@lib/util/wording"
import ProofRoute from "@modules/team-order/templates/proof-route"

type Props = { params: Promise<{ countryCode: string; id: string }> }

const getOrder = cache((id: string) => retrieveTeamOrder(id))

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { id } = await props.params
  const state = await customerState()
  const found = state.kind === "signed_in" ? await getOrder(id) : null
  const proof = found?.ok ? found.value.currentProof : null
  return {
    title: found?.ok && proof ? fill(proofContent.pageTitles.proof, { team: found.value.teamName, number: proof.number }) : proofContent.document.heading,
    robots: { index: false },
  }
}

/**
 * The proof of a team order, the one it holds now (/account/team-orders/teamord_.../proof): the proof waiting for
 * a signature, or the signed one. With no proof yet the visitor goes to the order's own page.
 */
export default async function ProofPage(props: Props) {
  const { countryCode, id } = await props.params
  return <ProofRoute countryCode={countryCode} orderId={id} />
}
