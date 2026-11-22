/**
 * The roster proof of a team order, its signature, the way back to draft, the need-by date and the
 * design version: Medusa glue around the plain rules (lib/rules/team-order-*.ts) and the snapshot
 * of @fitmyoutfit/team-rules. A customer reaches only the team orders they are the organizer of;
 * anyone else's (or an unknown id) is "not found".
 *
 * Every step of the status flow is one conditional write in the module (service.ts): the order moves
 * only if it is still in the state the request read, so two requests at the same moment cannot
 * both make a proof, both sign, or sign over a change; the loser reads the order again and answers
 * with the refusal that fits what it finds (or, for a repeated signature, with the signed proof).
 *
 * The signer's address and the typed name are personal data: neither is logged here.
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { hashSnapshot } from "@fitmyoutfit/team-rules"
import { badRequest, conflict, notAllowed, notFound } from "../../lib/http/refusal"
import { deliveryPromise, promisedDelivery } from "../../lib/rules/delivery-promise"
import {
  proofToApi,
  proofWithSnapshot,
  readSignRequest,
  snapshotOf,
  whyNotReady,
  type StoredProof,
} from "../../lib/rules/team-order-proof"
import { isInThePast } from "../../lib/rules/team-order-schedule"
import { allowedIn, isStatus, mayStep, type TeamOrderStatus } from "../../lib/rules/team-order-status"
import { readNeedByDate, buildRosterView, entriesToLines } from "../../lib/rules/team-order"
import { TeamOrderChanged } from "../../modules/team-order/service"
import { loadOwnVersionById } from "../design/designs"
import { sendDepositDue, sendProofReady } from "./emails"
import {
  describeTeamOrder,
  kindOf,
  loadEntries,
  loadOwnTeamOrder,
  loadProductSizes,
  loadProofs,
  loadRegion,
  loadStoreSettings,
  loadTakenNumbers,
  minimumOfOrder,
  notEditable,
  scheduleOf,
  service,
  todayIn,
  type TeamOrderRow,
} from "./team-orders"
import { printedFieldsOf } from "../../lib/rules/design-input"

const statusOf = (order: Pick<TeamOrderRow, "status">): TeamOrderStatus => (isStatus(order.status) ? order.status : "draft")

async function loadOwnProof(container: MedusaContainer, order: TeamOrderRow, proofId: string): Promise<StoredProof> {
  const found = (await loadProofs(container, order.id)).find((p) => p.id === proofId)
  if (!found) {
    throw notFound("proof_not_found", `Proof ${proofId} was not found.`)
  }
  return found
}

/**
 * Makes a proof of the team list as it is now: `draft -> proof_sent`. Refused when the list is not
 * ready (empty, a problem anywhere, below the region's minimum). Stores the snapshot, its hash and
 * the next proof number. Answers with the whole read answer of the team order.
 */
export async function makeProof(container: MedusaContainer, customerId: string, id: string, now: Date = new Date()) {
  const order = await loadOwnTeamOrder(container, customerId, id)
  if (!mayStep("organizer", statusOf(order), "proof_sent")) {
    throw notAllowed("team_order_not_draft", "A proof can only be made from a draft team order.", { status: order.status })
  }
  const [entries, sizes, region, settings, taken] = await Promise.all([
    loadEntries(container, order.id),
    loadProductSizes(container, order.product_id),
    loadRegion(container, order.region_id),
    loadStoreSettings(container),
    loadTakenNumbers(container, order),
  ])
  const view = buildRosterView({
    lines: entriesToLines(entries),
    prints: { name: order.prints_name, number: order.prints_number },
    sizes: sizes ?? [],
    limits: settings.limits,
    minimum: minimumOfOrder(order, region),
    taken,
  })
  const why = whyNotReady(view.summary, view.problems.length)
  if (why) {
    const messages = {
      roster_empty: "The team list has no lines.",
      roster_has_problems: "The team list has problems to fix before a proof can be made.",
      roster_below_minimum: "The team list is below the minimum number of garments for the region.",
    }
    throw notAllowed(why.code, messages[why.code], why.extra)
  }
  const { text, hash } = hashSnapshot(snapshotOf(order, view.lines))
  let made: { id: string; proof_number: number }
  try {
    made = await service(container).makeProof({
      teamOrderId: order.id,
      from: { listVersion: order.list_version, teamName: order.team_name, designVersionId: order.design_version_id },
      snapshotText: text,
      snapshotHash: hash,
      by: { actor: "organizer", actorId: customerId },
    })
  } catch (error) {
    if (error instanceof TeamOrderChanged) {
      const current = await loadOwnTeamOrder(container, customerId, id)
      if (current.status !== "draft") {
        throw notAllowed("team_order_not_draft", "A proof can only be made from a draft team order.", { status: current.status })
      }
      throw conflict("team_order_changed", "The team order was changed while the proof was made. Read it again.")
    }
    throw error
  }
  const after = await loadOwnTeamOrder(container, customerId, id)
  // "The proof is ready" to the organizer; a failed send is recorded and never fails this request.
  await sendProofReady(container, after, made, now)
  return describeTeamOrder(container, after, now)
}

/** The proofs of a team order, newest first, without their snapshots. */
export async function listOwnProofs(container: MedusaContainer, customerId: string, id: string) {
  const order = await loadOwnTeamOrder(container, customerId, id)
  const proofs = (await loadProofs(container, order.id)).map(proofToApi)
  return { proofs, count: proofs.length }
}

/** One proof with its snapshot. */
export async function readOwnProof(container: MedusaContainer, customerId: string, id: string, proofId: string) {
  const order = await loadOwnTeamOrder(container, customerId, id)
  return { proof: proofWithSnapshot(await loadOwnProof(container, order, proofId)) }
}

/**
 * Signs the current proof. The organizer sends the hash of the proof they looked at, their name as
 * typed, the ticked box and the schedule state they were shown. Refused (409) when the hash is not
 * the proof's, the proof is not the current one, or the schedule state today differs from the one
 * shown. Signing a proof that is already signed (the same hash) answers as the first time and
 * writes nothing. `ip` is the address the backend sees (lib/rules/team-order-proof.ts, clientIp).
 */
export async function signProof(
  container: MedusaContainer,
  customerId: string,
  id: string,
  proofId: string,
  body: Record<string, unknown>,
  context: { ip: string | null },
  now: Date = new Date()
) {
  const order = await loadOwnTeamOrder(container, customerId, id)
  const proof = await loadOwnProof(container, order, proofId)
  const request = readSignRequest(body)
  if (!request.ok) {
    const messages = {
      proof_hash_required: "`proof_hash` must be the hash of the proof that was looked at (64 hexadecimal characters).",
      signed_name_required: "`signed_name` must be the name as typed: 1 to 100 characters.",
      confirmation_required: "`confirmed` must be true: the organizer confirms the proof.",
      schedule_state_required: "`schedule_state` must be the state that was shown: none, ok, needs_rush or cannot_be_met.",
    }
    throw badRequest(request.code, messages[request.code])
  }
  const { proofHash, signedName, scheduleState } = request.value

  const hashMismatch = () =>
    conflict("proof_hash_mismatch", "The list that was looked at is not the list on record. Read the proof again.", {
      current_hash: proof.snapshot_hash,
    })

  // Signed already: the same answer, no second record.
  if (proof.status === "signed") {
    if (proofHash !== proof.snapshot_hash) throw hashMismatch()
    return describeTeamOrder(container, order, now)
  }
  if (proof.status !== "sent") {
    throw conflict("proof_not_current", `Proof ${proof.proof_number} was ${proof.status}: it can no longer be signed.`)
  }
  if (!mayStep("organizer", statusOf(order), "approved")) {
    throw conflict("proof_not_current", "The team order is not waiting for a signature.", { status: order.status })
  }
  if (proofHash !== proof.snapshot_hash) throw hashMismatch()

  const settings = await loadStoreSettings(container)
  const schedule = scheduleOf(order, settings, now)
  if (schedule.state !== scheduleState) {
    throw conflict("schedule_changed", "The schedule is not what was shown. Read the team order again.", { schedule })
  }
  const rush = order.rush_requested === true
  const promised = promisedDelivery(deliveryPromise(schedule.today, settings.deliveryDays, rush ? "rush" : "standard"))

  try {
    await service(container).signProof({
      teamOrderId: order.id,
      proofId: proof.id,
      snapshotHash: proof.snapshot_hash,
      customerId,
      signedName,
      ip: context.ip,
      scheduleState: schedule.state,
      needByDate: order.need_by_date,
      rush,
      promisedDeliveryDate: promised.date,
      by: { actor: "organizer", actorId: customerId },
    })
  } catch (error) {
    if (!(error instanceof TeamOrderChanged)) throw error
    // Another request moved the order first. If it signed this very proof, this is the repeat.
    const again = await loadOwnTeamOrder(container, customerId, id)
    const now2 = (await loadOwnProof(container, again, proofId)).status
    if (now2 === "signed") return describeTeamOrder(container, again, now)
    if (again.status === "proof_sent") {
      throw conflict("schedule_changed", "The schedule was changed while the proof was signed. Read the team order again.", {
        schedule: scheduleOf(again, settings, now),
      })
    }
    throw conflict("proof_not_current", `Proof ${proof.proof_number} can no longer be signed.`, { status: again.status })
  }
  const after = await loadOwnTeamOrder(container, customerId, id)
  // "Payment due: the deposit", once for this proof; a failed send never fails the signature.
  await sendDepositDue(container, after, proof.id, now)
  return describeTeamOrder(container, after, now)
}

/**
 * Back to draft, to change something: from `proof_sent` (the proof becomes withdrawn) or from
 * `approved` (the signed proof becomes replaced; nothing is paid yet). A new proof must be made
 * and signed afterwards. Refused after the deposit.
 */
export async function reopenTeamOrder(container: MedusaContainer, customerId: string, id: string, now: Date = new Date()) {
  const order = await loadOwnTeamOrder(container, customerId, id)
  const status = statusOf(order)
  if (status === "draft") {
    throw notAllowed("team_order_already_draft", "The team order is a draft already.", { status: order.status })
  }
  if (!mayStep("organizer", status, "draft") || (status !== "proof_sent" && status !== "approved")) {
    throw notAllowed(
      "team_order_not_reopenable",
      "After the deposit is paid the team order can no longer go back to draft by the organizer.",
      { status: order.status }
    )
  }
  if (kindOf(order) !== "add_on") {
    const addOns = (await service(container).listTeamOrders({ linked_order_id: order.id, kind: "add_on" }, { select: ["id"] })) as { id: string }[]
    if (addOns.length > 0) {
      throw notAllowed(
        "team_order_has_add_ons",
        "A team order with add-ons cannot go back to draft: the add-ons depend on its signed list.",
        { status: order.status, add_ons: addOns.length }
      )
    }
  }
  try {
    await service(container).backToDraft({ teamOrderId: order.id, from: status, by: { actor: "organizer", actorId: customerId } })
  } catch (error) {
    if (error instanceof TeamOrderChanged) {
      const current = await loadOwnTeamOrder(container, customerId, id)
      if (current.status === "draft") {
        throw notAllowed("team_order_already_draft", "The team order is a draft already.", { status: current.status })
      }
      throw conflict("team_order_changed", "The team order was changed at the same moment. Read it again.", { status: current.status })
    }
    throw error
  }
  return describeTeamOrder(container, await loadOwnTeamOrder(container, customerId, id), now)
}

/**
 * Sets the need-by date (`need_by_date`: a date, or null to clear it) and/or the rush choice
 * (`rush_requested`), while the team order is a draft or has a proof out. A date before today (the
 * store's day) is refused; nothing is refused for being late: the schedule's state says it.
 */
export async function setSchedule(
  container: MedusaContainer,
  customerId: string,
  id: string,
  body: Record<string, unknown>,
  now: Date = new Date()
) {
  const order = await loadOwnTeamOrder(container, customerId, id)
  const hasDate = Object.prototype.hasOwnProperty.call(body, "need_by_date")
  const hasRush = Object.prototype.hasOwnProperty.call(body, "rush_requested")
  if (!hasDate && !hasRush) {
    throw badRequest("schedule_empty", "Send `need_by_date` and/or `rush_requested`.")
  }
  const needBy = hasDate ? readNeedByDate(body.need_by_date) : { ok: true as const, value: null }
  if (!needBy.ok) {
    throw badRequest("need_by_date_invalid", "`need_by_date` must be a calendar date written YYYY-MM-DD, or null.")
  }
  if (hasRush && typeof body.rush_requested !== "boolean") {
    throw badRequest("rush_requested_invalid", "`rush_requested` must be true or false.")
  }
  if (!allowedIn(statusOf(order)).editSchedule) {
    throw notAllowed(
      "team_order_not_editable",
      "The need-by date and the rush choice can only be changed while the team order is a draft or has a proof out.",
      { status: order.status }
    )
  }
  if (hasDate && needBy.value !== null) {
    const today = todayIn(await loadStoreSettings(container), now)
    if (isInThePast(needBy.value, today)) {
      throw badRequest("need_by_date_in_past", "`need_by_date` is before today.", { today })
    }
  }
  try {
    await service(container).updateSchedule({
      teamOrderId: order.id,
      ...(hasDate ? { needByDate: needBy.value } : {}),
      ...(hasRush ? { rushRequested: body.rush_requested as boolean } : {}),
    })
  } catch (error) {
    if (error instanceof TeamOrderChanged) {
      throw notAllowed(
        "team_order_not_editable",
        "The need-by date and the rush choice can only be changed while the team order is a draft or has a proof out.",
        { status: (await loadOwnTeamOrder(container, customerId, id)).status }
      )
    }
    throw error
  }
  return describeTeamOrder(container, await loadOwnTeamOrder(container, customerId, id), now)
}

/**
 * Points a draft team order at another version of the same design (the editor saved a new one):
 * `{ design_version_id }`. The product must be the same; what the design prints is read again.
 */
export async function setDesignVersion(container: MedusaContainer, customerId: string, id: string, body: Record<string, unknown>) {
  const order = await loadOwnTeamOrder(container, customerId, id)
  const version = await loadOwnVersionById(container, customerId, body.design_version_id)
  if (!allowedIn(statusOf(order)).editTeam) {
    throw notEditable(order, "The design version")
  }
  if (version.design_id !== order.design_id) {
    throw badRequest("design_mismatch", "`design_version_id` is a version of another design.")
  }
  if (version.product_id !== order.product_id) {
    throw badRequest("product_mismatch", "`design_version_id` is a version for another product.")
  }
  const prints = printedFieldsOf(version.data)
  try {
    await service(container).updateWhileDraft({
      teamOrderId: order.id,
      design: { designVersionId: version.id, printsName: prints.name, printsNumber: prints.number },
    })
  } catch (error) {
    if (error instanceof TeamOrderChanged) {
      throw notEditable(await loadOwnTeamOrder(container, customerId, id), "The design version")
    }
    throw error
  }
  return describeTeamOrder(container, await loadOwnTeamOrder(container, customerId, id))
}
