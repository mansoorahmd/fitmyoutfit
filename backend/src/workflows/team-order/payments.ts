/**
 * The money of a team order in Medusa (decision 016): thin glue around the plain rules of
 * lib/rules/team-order-payments.ts (the split, the state of each part, when each part may be paid,
 * which step a payment causes, the ship gate).
 *
 * - **One Medusa order per proof.** While a proof is out, a Medusa draft order is priced from its
 *   snapshot: one line per size (the product's variant for that size at the price Medusa's pricing
 *   gives for the region), the region's shipping option at its Medusa price, and, when the order asks
 *   for rush, the rush line of decision 011's rule. Its totals and tax are Medusa's. At signing it
 *   becomes an order, and two payment collections are made: the deposit's and the balance's.
 * - **Payments are Medusa's**: a session of the placeholder provider on the part's collection,
 *   authorised and captured through Medusa's workflow steps (payTeamOrderPartWorkflow); by hand, the
 *   same with a session made for the admin and the capture in their name.
 * - **The status follows the money** (syncPaymentStepsUnderLock): a captured deposit moves the order
 *   `approved -> deposit_paid`; a captured balance is recorded once at `balance_due`.
 * - **One lock per team order** (money-lock.ts) around every money operation.
 *
 * Amounts are never taken from a request: they are the order's (Medusa's) and the rule's.
 * Nothing here logs a name, an address or a payment's details.
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules, QueryContext } from "@medusajs/framework/utils"
import { createWorkflow, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  authorizePaymentSessionStep,
  cancelOrderWorkflow,
  capturePaymentWorkflow,
  convertDraftOrderWorkflow,
  createOrderPaymentCollectionWorkflow,
  createOrderWorkflow,
  createPaymentSessionsWorkflow,
  deleteDraftOrdersWorkflow,
  deleteOrderPaymentCollections,
  getOrderDetailWorkflow,
} from "@medusajs/medusa/core-flows"
import { piecesOf } from "@fitmyoutfit/team-rules"
import { readPublicUrls } from "../../lib/config/public-urls"
import { badRequest, conflict, notAllowed } from "../../lib/http/refusal"
import { exact, toFixedString, type Exact } from "../../lib/rules/exact-amount"
import { amountForJson, rushOffer, RUSH_KIND } from "../../lib/rules/rush-charge"
import { currentProofOf, type StoredProof } from "../../lib/rules/team-order-proof"
import {
  balanceAfterDeposit,
  balanceRecord,
  DEFAULT_TEAM_ORDER_PAYMENT_PROVIDER,
  depositStep,
  isDue,
  isPaid,
  isPaymentPart,
  isTeamOrderPaymentProvider,
  mayShip,
  netCaptured,
  partState,
  paymentLink,
  piecesBySize,
  splitTotal,
  TEAM_ORDER_ID_KEY,
  whyNoPayment,
  whyNoReopenForMoney,
  type PartState,
  type PaymentPart,
  type PayRefusal,
} from "../../lib/rules/team-order-payments"
import { isStatus, type TeamOrderStatus } from "../../lib/rules/team-order-status"
import { balanceNoteRecord, balancePaidRecord } from "../../lib/rules/team-order-steps"
import { readRushPercentage } from "../../lib/settings/rush-percentage"
import { readDepositPercentage, readPaymentPath } from "../../lib/settings/team-order-payments"
import { TeamOrderChanged } from "../../modules/team-order/service"
import { currencyDigits } from "../rush/rush-cart"
import { TeamOrderMoneyBusy, withTeamOrderMoneyLock } from "./money-lock"
import { kindOf, loadOwnTeamOrder, loadProductSizes, loadProofs, service, type TeamOrderRow } from "./team-orders"

// =============================================================================================
// Medusa workflows of our own, made of Medusa's steps

/**
 * Pays a part with a session the organizer started: Medusa's authorisation of the session, then
 * Medusa's capture (which adds the order's payment transaction and emits `payment.captured`). A
 * gateway that defers the authorisation (`pending_authorization`) leaves no payment: nothing is
 * captured then. If the capture fails, the authorisation is cancelled by the step's compensation.
 */
export const payTeamOrderPartWorkflow = createWorkflow(
  "team-order-pay-part",
  (input: { session_id: string; captured_by?: string }) => {
    const payment = authorizePaymentSessionStep({ id: input.session_id })
    when({ payment }, ({ payment }) => !!payment?.id).then(() => {
      const captureInput = transform({ payment, input }, ({ payment, input }) => ({
        payment_id: payment!.id,
        ...(input.captured_by ? { captured_by: input.captured_by } : {}),
      }))
      capturePaymentWorkflow.runAsStep({ input: captureInput })
    })
    return new WorkflowResponse(payment)
  }
)

/**
 * Pays a part by hand (an admin confirms that the money arrived outside the store): what Medusa's
 * own `markPaymentCollectionAsPaid` does (a placeholder session, its authorisation, the capture in
 * the admin's name), without its refusal of a collection on which the organizer has started a
 * session: making the session replaces that one.
 */
export const payTeamOrderPartByHandWorkflow = createWorkflow(
  "team-order-pay-part-by-hand",
  (input: { payment_collection_id: string; captured_by: string }) => {
    const sessionInput = transform({ input }, ({ input }) => ({
      payment_collection_id: input.payment_collection_id,
      provider_id: DEFAULT_TEAM_ORDER_PAYMENT_PROVIDER,
      data: {},
      context: {},
    }))
    const session = createPaymentSessionsWorkflow.runAsStep({ input: sessionInput })
    const payment = authorizePaymentSessionStep({ id: session.id })
    const captureInput = transform({ payment, input }, ({ payment, input }) => ({
      payment_id: payment!.id,
      captured_by: input.captured_by,
    }))
    capturePaymentWorkflow.runAsStep({ input: captureInput })
    return new WorkflowResponse(payment)
  }
)

// =============================================================================================
// Reading

type Metadata = Record<string, unknown> | null | undefined

export type ProofWithMoney = StoredProof & {
  order_id?: string | null
  deposit_collection_id?: string | null
  balance_collection_id?: string | null
  deposit_percentage?: number | null
}

type Amount = number | string | { value?: unknown } | null | undefined

type MedusaSession = { id: string; status: string; provider_id: string; amount?: Amount; data?: Record<string, unknown> | null }
type MedusaCapture = { id: string; amount: Amount; created_by?: string | null; created_at?: string | Date }
type MedusaPayment = { id: string; amount?: Amount; captures?: MedusaCapture[]; refunds?: { id: string; amount: Amount }[]; captured_at?: string | Date | null }
type MedusaCollection = {
  id: string
  amount: Amount
  status: string
  captured_amount?: Amount
  refunded_amount?: Amount
  authorized_amount?: Amount
  payment_sessions?: MedusaSession[]
  payments?: MedusaPayment[]
}
type MedusaItem = {
  id: string
  variant_id: string | null
  quantity: Amount
  unit_price: Amount
  total?: Amount
  subtotal?: Amount
  tax_total?: Amount
  metadata?: Metadata
}
type MedusaShippingMethod = { id: string; name: string; amount: Amount; total?: Amount; data?: Metadata }
export type MedusaOrder = {
  id: string
  display_id?: number | null
  status: string
  is_draft_order?: boolean | null
  currency_code: string
  region_id?: string | null
  total: Amount
  subtotal?: Amount
  item_total?: Amount
  item_subtotal?: Amount
  shipping_total?: Amount
  tax_total?: Amount
  payment_status?: string
  metadata?: Metadata
  summary?: { paid_total?: Amount; pending_difference?: Amount; refunded_total?: Amount } | null
  items?: MedusaItem[]
  shipping_methods?: MedusaShippingMethod[]
  payment_collections?: MedusaCollection[]
}

const ORDER_FIELDS = [
  "id",
  "display_id",
  "status",
  "is_draft_order",
  "currency_code",
  "region_id",
  "metadata",
  "total",
  "subtotal",
  "item_total",
  "item_subtotal",
  "shipping_total",
  "tax_total",
  "summary.*",
  "items.id",
  "items.variant_id",
  "items.quantity",
  "items.unit_price",
  "items.total",
  "items.subtotal",
  "items.tax_total",
  "items.metadata",
  "shipping_methods.id",
  "shipping_methods.name",
  "shipping_methods.amount",
  "shipping_methods.total",
  "shipping_methods.data",
  "payment_collections.id",
  "payment_collections.amount",
  "payment_collections.status",
  "payment_collections.captured_amount",
  "payment_collections.refunded_amount",
  "payment_collections.authorized_amount",
  "payment_collections.payment_sessions.id",
  "payment_collections.payment_sessions.status",
  "payment_collections.payment_sessions.provider_id",
  "payment_collections.payment_sessions.amount",
  "payment_collections.payment_sessions.data",
  "payment_collections.payments.id",
  "payment_collections.payments.amount",
  "payment_collections.payments.captured_at",
  "payment_collections.payments.captures.id",
  "payment_collections.payments.captures.amount",
  "payment_collections.payments.captures.created_by",
  "payment_collections.payments.captures.created_at",
  "payment_collections.payments.refunds.id",
  "payment_collections.payments.refunds.amount",
]

/** The Medusa order (draft or placed) with its totals, lines, delivery and payments; null when it is gone. */
export async function loadMedusaOrder(container: MedusaContainer, orderId: string): Promise<MedusaOrder | null> {
  try {
    const { result } = await getOrderDetailWorkflow(container).run({
      input: { order_id: orderId, fields: ORDER_FIELDS } as never,
    })
    return result as unknown as MedusaOrder
  } catch (error) {
    if ((error as { type?: string })?.type === MedusaError.Types.NOT_FOUND) return null
    throw error
  }
}

/** One part (the deposit or the balance) as these functions use it. */
type Part = {
  part: PaymentPart
  collection: MedusaCollection | null
  state: PartState | null
  /** The admin user named on the part's capture, if any (null: the organizer or a gateway). */
  capturedBy: string | null
  paidAt: string | null
  session: MedusaSession | null
}

function collectionInput(collection: MedusaCollection) {
  return {
    amount: collection.amount as never,
    status: collection.status,
    capturedAmount: (collection.captured_amount ?? null) as never,
    refundedAmount: (collection.refunded_amount ?? null) as never,
    authorizedAmount: (collection.authorized_amount ?? null) as never,
    sessions: (collection.payment_sessions ?? []).map((s) => ({ status: s.status })),
  }
}

function partOf(part: PaymentPart, order: MedusaOrder | null, collectionId: string | null | undefined): Part {
  const collection = (collectionId && order?.payment_collections?.find((c) => c.id === collectionId)) || null
  if (!collection) return { part, collection: null, state: null, capturedBy: null, paidAt: null, session: null }
  const captures = (collection.payments ?? []).flatMap((p) => p.captures ?? [])
  const last = [...captures].sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""))).at(-1)
  const session = (collection.payment_sessions ?? [])[0] ?? null
  return {
    part,
    collection,
    state: partState(collectionInput(collection)),
    capturedBy: last?.created_by ?? null,
    paidAt: last?.created_at ? new Date(last.created_at).toISOString() : null,
    session,
  }
}

/** Everything about a team order's money: its current proof, the Medusa order and the two parts. */
export type Money = {
  proof: ProofWithMoney | null
  order: MedusaOrder | null
  deposit: Part
  balance: Part
}

async function loadMoney(container: MedusaContainer, teamOrder: TeamOrderRow): Promise<Money> {
  const proof = currentProofOf(await loadProofs(container, teamOrder.id)) as ProofWithMoney | null
  const order = proof?.order_id ? await loadMedusaOrder(container, proof.order_id) : null
  return {
    proof,
    order,
    deposit: partOf("deposit", order, proof?.deposit_collection_id),
    balance: partOf("balance", order, proof?.balance_collection_id),
  }
}

const statusOf = (order: Pick<TeamOrderRow, "status">): TeamOrderStatus => (isStatus(order.status) ? order.status : "draft")

async function reloadTeamOrder(container: MedusaContainer, id: string): Promise<TeamOrderRow | null> {
  const [found] = (await service(container).listTeamOrders({ id })) as TeamOrderRow[]
  return found ?? null
}

// =============================================================================================
// Settings

async function storeMetadata(container: MedusaContainer): Promise<Metadata> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "store", fields: ["metadata"] })
  return (data as unknown as { metadata?: Metadata }[])[0]?.metadata
}

function settingOrFail<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `The store's team order payment settings are incomplete: ${result.error}`)
  }
  return result.value
}

const fail = (message: string) => new MedusaError(MedusaError.Types.UNEXPECTED_STATE, message)

// =============================================================================================
// Pricing: the Medusa draft order of a proof

type Region = { id: string; name: string; currency_code: string; countries?: { iso_2: string }[]; metadata?: Metadata }

async function loadRegionForMoney(container: MedusaContainer, regionId: string): Promise<Region> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "region",
    fields: ["id", "name", "currency_code", "countries.iso_2", "metadata"],
    filters: { id: regionId },
  })
  const region = (data as unknown as Region[])[0]
  if (!region) throw fail(`Region ${regionId} of the team order was not found.`)
  return region
}

type VariantRow = { id: string; options?: { value: string; option?: { title?: string | null } | null }[] }

/** The product's variant for each size (its "Size" option value). */
async function variantsBySize(container: MedusaContainer, productId: string): Promise<Map<string, string>> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "variants.id", "variants.options.value", "variants.options.option.title"],
    filters: { id: productId },
  })
  const variants = ((data as unknown as { variants?: VariantRow[] }[])[0]?.variants ?? []) as VariantRow[]
  const map = new Map<string, string>()
  for (const variant of variants) {
    const options = variant.options ?? []
    const size = options.find((o) => (o.option?.title ?? "").trim().toLowerCase() === "size") ?? (options.length === 1 ? options[0] : undefined)
    if (size && !map.has(size.value)) map.set(size.value, variant.id)
  }
  return map
}

type CalculatedPrice = { calculated_amount?: number | null; is_calculated_price_tax_inclusive?: boolean | null } | null

/** Medusa's price of each variant for the region, its currency and the organizer. */
async function variantPrices(
  container: MedusaContainer,
  ids: string[],
  context: { currency_code: string; region_id: string; customer_id: string }
): Promise<Map<string, { amount: number; taxInclusive: boolean }>> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id", "calculated_price.calculated_amount", "calculated_price.is_calculated_price_tax_inclusive"],
    filters: { id: ids },
    context: { calculated_price: QueryContext(context) },
  })
  const map = new Map<string, { amount: number; taxInclusive: boolean }>()
  for (const row of data as unknown as { id: string; calculated_price?: CalculatedPrice }[]) {
    const amount = row.calculated_price?.calculated_amount
    if (typeof amount === "number" && Number.isFinite(amount)) {
      map.set(row.id, { amount, taxInclusive: row.calculated_price?.is_calculated_price_tax_inclusive === true })
    }
  }
  return map
}

type ShippingOptionRow = {
  id: string
  name: string
  data?: Metadata
  service_zone?: { geo_zones?: { country_code: string }[] } | null
  rules?: { attribute: string; value: unknown }[]
  calculated_price?: CalculatedPrice
}

/** The region's shipping option (Pakistan's delivery, or the duty-paid export line) at its Medusa price. */
async function regionShipping(container: MedusaContainer, region: Region) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "shipping_option",
    fields: [
      "id",
      "name",
      "data",
      "service_zone.geo_zones.country_code",
      "rules.attribute",
      "rules.value",
      "calculated_price.calculated_amount",
      "calculated_price.is_calculated_price_tax_inclusive",
    ],
    context: { calculated_price: QueryContext({ currency_code: region.currency_code, region_id: region.id }) },
  })
  const countries = new Set((region.countries ?? []).map((c) => c.iso_2.toLowerCase()))
  const candidates = (data as unknown as ShippingOptionRow[]).filter((option) => {
    const inRegion = (option.service_zone?.geo_zones ?? []).some((zone) => countries.has(zone.country_code.toLowerCase()))
    const isReturn = (option.rules ?? []).some((rule) => rule.attribute === "is_return" && String(rule.value) === "true")
    const hasPrice = typeof option.calculated_price?.calculated_amount === "number"
    return inRegion && !isReturn && hasPrice
  })
  if (candidates.length !== 1) {
    throw fail(
      `The region ${region.name} needs exactly one shipping option with a price in ${region.currency_code.toUpperCase()} for team orders; it has ${candidates.length}.`
    )
  }
  const option = candidates[0]!
  return {
    id: option.id,
    name: option.name,
    data: option.data ?? {},
    amount: option.calculated_price!.calculated_amount as number,
    taxInclusive: option.calculated_price?.is_calculated_price_tax_inclusive === true,
  }
}

async function rushVariantId(container: MedusaContainer): Promise<string> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "product", fields: ["id", "metadata", "variants.id"] })
  const product = (data as unknown as { metadata?: Metadata; variants?: { id: string }[] }[]).find(
    (p) => p.metadata?.kind === RUSH_KIND
  )
  const variant = product?.variants?.[0]?.id
  if (!variant) throw fail("The rush product (metadata.kind rush_add_on) is missing: run `npm run seed`.")
  return variant
}

async function customerEmail(container: MedusaContainer, customerId: string): Promise<string | undefined> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "customer", fields: ["id", "email"], filters: { id: customerId } })
  return (data as unknown as { email?: string | null }[])[0]?.email ?? undefined
}

/**
 * Makes the Medusa draft order of a proof (decision 016) and returns its id. `rush`: whether the
 * order asks for rush (the order's choice while the proof is out; the proof's record once signed).
 * Every amount is Medusa's: the variants' calculated prices for the region, the shipping option's
 * price; the rush line is decision 011's rule on those garment lines.
 */
async function createPricedDraft(container: MedusaContainer, teamOrder: TeamOrderRow, proof: ProofWithMoney, rush: boolean): Promise<string> {
  const snapshot = JSON.parse(proof.snapshot_text) as { product_id: string; region_id: string; lines: { size: string; count: number }[] }
  const [region, sizes, variants, email] = await Promise.all([
    loadRegionForMoney(container, snapshot.region_id),
    loadProductSizes(container, snapshot.product_id),
    variantsBySize(container, snapshot.product_id),
    customerEmail(container, teamOrder.customer_id),
  ])
  const pieces = piecesBySize(snapshot.lines, sizes ?? [], piecesOf)
  const lines = pieces.map((p) => {
    const variant = variants.get(p.size)
    if (!variant) throw fail(`The product of team order ${teamOrder.id} has no variant for the size ${p.size}.`)
    return { ...p, variant }
  })
  const prices = await variantPrices(
    container,
    lines.map((l) => l.variant),
    { currency_code: region.currency_code, region_id: region.id, customer_id: teamOrder.customer_id }
  )
  const items: Record<string, unknown>[] = lines.map((line) => {
    const price = prices.get(line.variant)
    if (!price) {
      throw fail(`The size ${line.size} of the team order's product has no price in ${region.currency_code.toUpperCase()}.`)
    }
    return {
      variant_id: line.variant,
      quantity: line.quantity,
      unit_price: price.amount,
      is_tax_inclusive: price.taxInclusive,
      metadata: { team_order_size: line.size },
    }
  })
  if (rush) {
    const percentage = readRushPercentage(await storeMetadata(container))
    if (!percentage.ok) throw fail(`The store's checkout settings are incomplete: ${percentage.error}`)
    const digits = await currencyDigits(container, region.currency_code)
    const offer = rushOffer(
      items.map((item) => ({
        kind: "garment",
        unitPrice: item.unit_price as number,
        quantity: item.quantity as number,
        taxInclusive: item.is_tax_inclusive as boolean,
      })),
      percentage.value,
      digits
    )
    // A rush percentage of 0 means rush is not offered (decision 011): no line, nothing charged.
    if (offer.available) {
      items.push({
        variant_id: await rushVariantId(container),
        quantity: 1,
        unit_price: amountForJson(offer.amount),
        is_tax_inclusive: false,
        metadata: { team_order_line: "rush", rush_percentage: percentage.value },
      })
    }
  }
  const shipping = await regionShipping(container, region)
  const { result } = await createOrderWorkflow(container).run({
    input: {
      status: "draft",
      is_draft_order: true,
      region_id: region.id,
      currency_code: region.currency_code,
      customer_id: teamOrder.customer_id,
      ...(email ? { email } : {}),
      items,
      shipping_methods: [
        {
          shipping_option_id: shipping.id,
          name: shipping.name,
          amount: shipping.amount,
          is_tax_inclusive: shipping.taxInclusive,
          data: shipping.data,
        },
      ],
      no_notification: true,
      metadata: {
        [TEAM_ORDER_ID_KEY]: teamOrder.id,
        team_order_proof_id: proof.id,
        team_order_kind: kindOf(teamOrder),
        team_order_rush: rush,
      },
    } as never,
  })
  return (result as unknown as { id: string }).id
}

/** Deletes a draft order (best effort: a failure is logged, never thrown). */
async function dropDraft(container: MedusaContainer, orderId: string): Promise<void> {
  try {
    await deleteDraftOrdersWorkflow(container).run({ input: { order_ids: [orderId] } })
  } catch (error) {
    logError(container, `Could not delete the draft order ${orderId} of a team order`, error)
  }
}

function logError(container: MedusaContainer, what: string, error: unknown) {
  // The error's name and message only: Medusa's messages name ids, never a person or a payment's details.
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  container.resolve(ContainerRegistrationKeys.LOGGER).error(`${what} (${message}).`)
}

/** The rush choice the priced order must follow: the proof's record once signed, else the order's. */
const rushFor = (teamOrder: TeamOrderRow, proof: ProofWithMoney): boolean =>
  proof.status === "signed" ? proof.rush === true : teamOrder.rush_requested === true

/**
 * Makes sure the current proof has its priced Medusa order (under the money lock). A draft whose
 * rush choice no longer matches is dropped and priced again (only while nothing was paid: a draft
 * has no collections). Returns the proof as stored after.
 */
async function ensurePricedUnderLock(container: MedusaContainer, teamOrder: TeamOrderRow): Promise<ProofWithMoney | null> {
  const proof = currentProofOf(await loadProofs(container, teamOrder.id)) as ProofWithMoney | null
  if (!proof) return null
  const rush = rushFor(teamOrder, proof)
  if (proof.order_id) {
    const order = await loadMedusaOrder(container, proof.order_id)
    const stale = !order || (order.is_draft_order === true && order.metadata?.team_order_rush !== rush)
    if (!stale) return proof
    if (!(await service(container).clearProofOrder({ proofId: proof.id, orderId: proof.order_id }))) return proof
    if (order?.is_draft_order) await dropDraft(container, order.id)
  }
  const orderId = await createPricedDraft(container, teamOrder, proof, rush)
  if (!(await service(container).setProofOrder({ proofId: proof.id, orderId }))) {
    await dropDraft(container, orderId)
  }
  return currentProofOf(await loadProofs(container, teamOrder.id)) as ProofWithMoney | null
}

/**
 * Makes sure a signed proof's order is placed and has its two payment collections (under the money
 * lock): prices it if needed, converts the draft, splits the order's total by the rule and makes
 * the deposit's and the balance's collections.
 */
async function ensurePlacedUnderLock(container: MedusaContainer, teamOrder: TeamOrderRow): Promise<Money> {
  const priced = await ensurePricedUnderLock(container, teamOrder)
  if (!priced || priced.status !== "signed" || !priced.order_id) return loadMoney(container, teamOrder)
  let order = await loadMedusaOrder(container, priced.order_id)
  if (!order) throw fail(`The Medusa order of team order ${teamOrder.id} is gone.`)
  if (order.is_draft_order) {
    await convertDraftOrderWorkflow(container).run({ input: { id: order.id } })
    order = (await loadMedusaOrder(container, order.id))!
  }
  if (!priced.deposit_collection_id && order.status !== "canceled") {
    const percentage = settingOrFail(readDepositPercentage(await storeMetadata(container)))
    const digits = await currencyDigits(container, order.currency_code)
    const split = splitTotal(order.total as never, percentage, digits)
    const made: string[] = []
    try {
      for (const amount of [split.deposit, split.balance]) {
        const { result } = await createOrderPaymentCollectionWorkflow(container).run({
          input: { order_id: order.id, amount: amountForJson(amount) },
        })
        made.push((result as unknown as { id: string }[])[0]!.id)
      }
      const kept = await service(container).setProofCollections({
        proofId: priced.id,
        depositCollectionId: made[0]!,
        balanceCollectionId: made[1]!,
        depositPercentage: percentage,
      })
      if (!kept) throw new Error("The proof's payment collections were set by another request.")
    } catch (error) {
      for (const id of made) {
        try {
          await deleteOrderPaymentCollections(container).run({ input: { id } })
        } catch (cleanup) {
          logError(container, `Could not remove the payment collection ${id} of team order ${teamOrder.id}`, cleanup)
        }
      }
      throw error
    }
  }
  return loadMoney(container, teamOrder)
}

/**
 * The step the money causes, if any (under the money lock): a paid deposit moves `approved ->
 * deposit_paid` (by the system, or by the admin named on the capture); a paid balance is recorded
 * once at `balance_due`. Safe to run any number of times.
 */
async function syncPaymentStepsUnderLock(container: MedusaContainer, teamOrderId: string): Promise<void> {
  let teamOrder = await reloadTeamOrder(container, teamOrderId)
  if (!teamOrder) return
  let money = await loadMoney(container, teamOrder)
  if (!money.order) return
  const step = depositStep(statusOf(teamOrder), money.deposit.state, { userId: money.deposit.capturedBy })
  if (step) {
    try {
      await service(container).paymentStep({
        teamOrderId,
        from: step.from,
        to: step.to,
        by: { actor: step.actor, actorId: step.actorId },
        byHand: step.byHand,
      })
    } catch (error) {
      if (!(error instanceof TeamOrderChanged)) throw error
    }
    teamOrder = (await reloadTeamOrder(container, teamOrderId)) ?? teamOrder
    money = await loadMoney(container, teamOrder)
  }
  const record = balanceRecord(statusOf(teamOrder), money.balance.state, { userId: money.balance.capturedBy }, false)
  if (record) {
    await service(container).recordBalanceReceived({
      teamOrderId,
      record: record.actor === "admin" ? balanceNoteRecord(record.actorId) : balancePaidRecord(),
    })
  }
}

/** Runs `fn` under the team order's money lock; a lock held too long is 409 `payment_busy`. */
async function locked<T>(container: MedusaContainer, teamOrderId: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await withTeamOrderMoneyLock(container, teamOrderId, fn)
  } catch (error) {
    if (error instanceof TeamOrderMoneyBusy) {
      throw conflict("payment_busy", "Another payment request for this team order is still running. Try again in a moment.")
    }
    throw error
  }
}

// =============================================================================================
// What the team order costs, and what is paid: the answer

const toAmount = (value: Amount): number => amountForJson(exact((value ?? 0) as never))

export type CostAnswer = Awaited<ReturnType<typeof moneyToApi>>

async function moneyToApi(container: MedusaContainer, teamOrder: TeamOrderRow, money: Money) {
  const order = money.order
  const status = statusOf(teamOrder)
  if (!order || !money.proof) {
    return { team_order: { id: teamOrder.id, status, kind: kindOf(teamOrder) }, cost: null, payments: null, order: null }
  }
  const region = await loadRegionForMoney(container, teamOrder.region_id)
  const digits = await currencyDigits(container, order.currency_code)
  const sizes = (await loadProductSizes(container, teamOrder.product_id)) ?? []
  const items = order.items ?? []
  const garments = items
    .filter((item) => typeof item.metadata?.team_order_size === "string")
    .map((item) => ({
      size: item.metadata!.team_order_size as string,
      quantity: toAmount(item.quantity),
      unit_price: toAmount(item.unit_price),
      total: toAmount(item.total ?? null),
    }))
    .sort((a, b) => sizes.indexOf(a.size) - sizes.indexOf(b.size))
  const rushItem = items.find((item) => item.metadata?.team_order_line === "rush")
  const shipping = (order.shipping_methods ?? [])[0]
  const percentage = money.proof.deposit_percentage ?? settingOrFail(readDepositPercentage(await storeMetadata(container)))
  // Before the collections exist (a proof out): the split the rule will make of this total.
  const planned = splitTotal(order.total as never, percentage, digits)
  const depositAmount: Exact = money.deposit.collection ? exact(money.deposit.collection.amount as never) : planned.deposit
  const balanceAmount: Exact = money.balance.collection
    ? exact(money.balance.collection.amount as never)
    : planned.balance
  const partToApi = (part: Part, amount: Exact) => ({
    amount: amountForJson(amount),
    state: part.state ?? "unpaid",
    due: money.proof!.status === "signed" && isDue(part.part, status, part.state),
    paid_at: part.state === "paid" ? part.paidAt : null,
    by_hand: part.state === "paid" ? part.capturedBy !== null : null,
    session: part.session && (part.state === "started" || part.state === "awaiting")
      ? { id: part.session.id, provider_id: part.session.provider_id, status: part.session.status }
      : null,
  })
  const paid = exact((order.summary?.paid_total ?? 0) as never)
  return {
    team_order: { id: teamOrder.id, status, kind: kindOf(teamOrder) },
    cost: {
      state: money.proof.status === "signed" ? ("ordered" as const) : ("quote" as const),
      proof_id: money.proof.id,
      currency_code: order.currency_code,
      tax_final: region.metadata?.tax_final === true,
      lines: garments,
      pieces: garments.reduce((n, g) => n + g.quantity, 0),
      delivery: shipping
        ? { name: shipping.name, amount: toAmount(shipping.amount), duty_paid: shipping.data?.ddp === true }
        : null,
      rush: rushItem
        ? { amount: toAmount(rushItem.unit_price), percentage: Number(rushItem.metadata?.rush_percentage ?? NaN) }
        : null,
      subtotal: toAmount(order.subtotal ?? null),
      tax_total: toAmount(order.tax_total ?? null),
      total: toAmount(order.total),
      deposit_percentage: percentage,
    },
    payments: {
      deposit: partToApi(money.deposit, depositAmount),
      balance: partToApi(money.balance, balanceAmount),
      paid_total: amountForJson(paid),
      outstanding: amountForJson(exact((order.summary?.pending_difference ?? order.total ?? 0) as never)),
      payment_status: order.payment_status ?? null,
    },
    order: order.is_draft_order ? null : { id: order.id, display_id: order.display_id ?? null, status: order.status },
  }
}

/**
 * What the team order costs and what is paid, for its organizer (or staff): prices the proof that
 * is out, places a signed one, makes the step a payment caused, then answers. A draft (no proof) is
 * refused: nothing to price.
 */
export async function readMoney(container: MedusaContainer, teamOrder: TeamOrderRow) {
  if (statusOf(teamOrder) === "draft") {
    throw notAllowed("team_order_not_priced", "A team order is priced from its proof: make the proof first.", { status: teamOrder.status })
  }
  await locked(container, teamOrder.id, async () => {
    if (statusOf(teamOrder) === "proof_sent") await ensurePricedUnderLock(container, teamOrder)
    else await ensurePlacedUnderLock(container, teamOrder)
    await syncPaymentStepsUnderLock(container, teamOrder.id)
  })
  const after = (await reloadTeamOrder(container, teamOrder.id)) ?? teamOrder
  return (await moneyToApi(container, after, await loadMoney(container, after)))
}

export async function readOwnMoney(container: MedusaContainer, customerId: string, id: string) {
  return readMoney(container, await loadOwnTeamOrder(container, customerId, id))
}

/** The money for the admin's order page: the same answer plus who captured each part; never throws for a draft. */
export async function readMoneyForAdmin(container: MedusaContainer, teamOrder: TeamOrderRow) {
  if (statusOf(teamOrder) === "draft") return null
  try {
    return await readMoney(container, teamOrder)
  } catch (error) {
    logError(container, `Could not read the money of team order ${teamOrder.id}`, error)
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

// =============================================================================================
// Hooks into the steps of the proof (proofs.ts): never fail the organizer's step

/** After a proof is made, or its rush choice changed: price it now (a failure is logged; the next read prices it). */
export async function priceProofQuietly(container: MedusaContainer, teamOrderId: string): Promise<void> {
  try {
    await withTeamOrderMoneyLock(container, teamOrderId, async () => {
      const teamOrder = await reloadTeamOrder(container, teamOrderId)
      if (teamOrder && statusOf(teamOrder) === "proof_sent") await ensurePricedUnderLock(container, teamOrder)
    })
  } catch (error) {
    logError(container, `Could not price the proof of team order ${teamOrderId}`, error)
  }
}

/**
 * Before a signature: the proof must have its price (the draft order), so the organizer signs a
 * priced order. A failure (a missing price or setting) is a server error naming it; nothing is signed.
 */
export async function priceBeforeSigning(container: MedusaContainer, teamOrderId: string): Promise<void> {
  await locked(container, teamOrderId, async () => {
    const teamOrder = await reloadTeamOrder(container, teamOrderId)
    if (teamOrder && statusOf(teamOrder) === "proof_sent") await ensurePricedUnderLock(container, teamOrder)
  })
}

/** After a signature: place the order and make the collections (a failure is logged; the next read does it). */
export async function placeAfterSigningQuietly(container: MedusaContainer, teamOrderId: string): Promise<void> {
  try {
    await withTeamOrderMoneyLock(container, teamOrderId, async () => {
      const teamOrder = await reloadTeamOrder(container, teamOrderId)
      if (teamOrder && statusOf(teamOrder) === "approved") await ensurePlacedUnderLock(container, teamOrder)
    })
  } catch (error) {
    logError(container, `Could not place the order of team order ${teamOrderId}`, error)
  }
}

/**
 * Going back to draft (proofs.ts, reopenTeamOrder) runs inside this: under the money lock, from
 * `approved` the deposit must hold no money (rule `whyNoReopenForMoney`: refused with
 * `payment_in_progress`); then `back()` moves the order; then the proof's Medusa order is let go:
 * a draft order is deleted, a placed one cancelled (with its started session; nothing was taken).
 */
export async function reopenWithMoney<T>(container: MedusaContainer, teamOrderId: string, back: () => Promise<T>): Promise<T> {
  return locked(container, teamOrderId, async () => {
    const teamOrder = await reloadTeamOrder(container, teamOrderId)
    // Gone or moved on: `back()` finds it so and answers with the refusal that fits.
    if (!teamOrder) return back()
    const money = await loadMoney(container, teamOrder)
    if (statusOf(teamOrder) === "approved") {
      const why = whyNoReopenForMoney(money.deposit.state)
      if (why) {
        throw notAllowed(why, "A payment of the deposit is made or under way: the team order can no longer go back to draft.", {
          status: teamOrder.status,
          deposit: money.deposit.state,
        })
      }
    }
    const result = await back()
    if (money.order) {
      try {
        if (money.order.is_draft_order) await deleteDraftOrdersWorkflow(container).run({ input: { order_ids: [money.order.id] } })
        else if (money.order.status !== "canceled") await cancelOrderWorkflow(container).run({ input: { order_id: money.order.id } })
      } catch (error) {
        logError(container, `Could not let go of the Medusa order of team order ${teamOrder.id}`, error)
      }
    }
    return result
  })
}

// =============================================================================================
// The organizer pays

const PAY_MESSAGES: Record<PayRefusal, string> = {
  deposit_not_due: "The deposit is due once the proof is signed, and only then.",
  deposit_already_paid: "The deposit is paid already.",
  balance_not_due: "The balance is due once the order is ready to ship (balance due), and only then.",
  balance_already_paid: "The balance is paid already.",
  payment_in_progress: "A payment of this part is under way with the payment provider. Wait for it to finish.",
  order_canceled: "The order was canceled by the store. Contact us.",
}

function readPart(raw: unknown): PaymentPart {
  if (!isPaymentPart(raw)) throw badRequest("payment_part_invalid", "The part must be `deposit` or `balance`.")
  return raw
}

function refusePayment(why: PayRefusal, teamOrder: TeamOrderRow) {
  return notAllowed(why, PAY_MESSAGES[why], { status: teamOrder.status })
}

/** The part's collection, with its amount set from the rule and the order's current total while it is unpaid. */
async function amountForPart(container: MedusaContainer, money: Money, part: PaymentPart): Promise<MedusaCollection> {
  const target = part === "deposit" ? money.deposit : money.balance
  if (!target.collection || !money.order) throw fail("The team order's payment collections are missing.")
  if (target.state !== "unpaid" && target.state !== "started") return target.collection
  const digits = await currencyDigits(container, money.order.currency_code)
  const percentage = money.proof?.deposit_percentage ?? settingOrFail(readDepositPercentage(await storeMetadata(container)))
  const amount =
    part === "deposit"
      ? splitTotal(money.order.total as never, percentage, digits).deposit
      : balanceAfterDeposit(money.order.total as never, money.deposit.collection ? netCaptured(collectionInput(money.deposit.collection)) : 0)
  if (toFixedString(amount, 6) !== toFixedString(exact(target.collection.amount as never), 6)) {
    await container.resolve(Modules.PAYMENT).updatePaymentCollections(target.collection.id, { amount: amountForJson(amount) })
  }
  return target.collection
}

/**
 * Starts paying a part (`deposit` or `balance`): a session of the provider on the part's Medusa
 * payment collection, for the amount the rule gives (never one from the request). Starting again
 * replaces the earlier session. With the placeholder provider "complete" is a plain confirmation;
 * a redirecting gateway's session data (`session.data`) will carry where to send the organizer.
 */
export async function startPayment(container: MedusaContainer, customerId: string, id: string, rawPart: unknown, body: Record<string, unknown>) {
  const part = readPart(rawPart)
  const provider = body.provider_id ?? DEFAULT_TEAM_ORDER_PAYMENT_PROVIDER
  if (!isTeamOrderPaymentProvider(provider)) {
    throw badRequest("payment_provider_invalid", "`provider_id` must be a payment provider team orders can be paid with (today: pp_system_default).")
  }
  const teamOrder = await loadOwnTeamOrder(container, customerId, id)
  return locked(container, teamOrder.id, async () => {
    const current = await loadOwnTeamOrder(container, customerId, id)
    const early = whyNoPayment({ part, status: statusOf(current), state: null })
    if (early && early !== "deposit_already_paid" && early !== "balance_already_paid") throw refusePayment(early, current)
    const money = await ensurePlacedUnderLock(container, current)
    const target = part === "deposit" ? money.deposit : money.balance
    const why = whyNoPayment({
      part,
      status: statusOf(current),
      state: target.state,
      orderCanceled: money.order?.status === "canceled",
      forStart: true,
    })
    if (why) throw refusePayment(why, current)
    const collection = await amountForPart(container, money, part)
    const { result: session } = await createPaymentSessionsWorkflow(container).run({
      input: { payment_collection_id: collection.id, provider_id: provider as string, customer_id: customerId, data: {}, context: {} },
    })
    const after = await loadMoney(container, current)
    const answer = (await moneyToApi(container, current, after))
    const s = session as unknown as MedusaSession
    return {
      ...answer,
      payment: {
        part,
        amount: answer.payments ? answer.payments[part].amount : null,
        currency_code: after.order?.currency_code ?? null,
        session: { id: s.id, provider_id: s.provider_id, status: s.status, data: s.data ?? {} },
        // What the storefront does next: the placeholder needs only a confirmation (POST .../complete).
        next: { type: "confirm" as const },
      },
    }
  })
}

/**
 * Completes the payment of a part with the session that was started (`session_id`): Medusa
 * authorises and captures it; the step the payment causes follows (the deposit moves the order to
 * `deposit_paid`). Two requests at once: one pays, the other is refused (already paid). A session
 * that is not the part's current one (started again since, or dropped when the order went back to
 * draft) is refused.
 */
export async function completePayment(container: MedusaContainer, customerId: string, id: string, rawPart: unknown, body: Record<string, unknown>) {
  const part = readPart(rawPart)
  if (typeof body.session_id !== "string" || body.session_id === "") {
    throw badRequest("payment_session_required", "`session_id` must be the id of the payment session that was started.")
  }
  const sessionId = body.session_id
  const teamOrder = await loadOwnTeamOrder(container, customerId, id)
  return locked(container, teamOrder.id, async () => {
    const current = await loadOwnTeamOrder(container, customerId, id)
    const money = await loadMoney(container, current)
    const target = part === "deposit" ? money.deposit : money.balance
    const why = whyNoPayment({ part, status: statusOf(current), state: target.state, orderCanceled: money.order?.status === "canceled" })
    if (why) throw refusePayment(why, current)
    if (!target.session || target.session.id !== sessionId || (target.state !== "started" && target.state !== "awaiting")) {
      throw conflict("payment_session_stale", "This payment session is not the one in progress for this part. Start the payment again.")
    }
    const { errors } = await payTeamOrderPartWorkflow(container).run({ input: { session_id: sessionId }, throwOnError: false })
    if (errors?.length) {
      const error = errors[0]?.error as { type?: string } | undefined
      if (error?.type === MedusaError.Types.PAYMENT_REQUIRES_MORE_ERROR) {
        throw notAllowed("payment_requires_action", "The payment provider needs more from the organizer before the payment is made.")
      }
      logError(container, `A payment of team order ${current.id} failed`, errors[0]?.error)
      throw notAllowed("payment_failed", "The payment was not made. Start it again.")
    }
    await syncPaymentStepsUnderLock(container, current.id)
    const after = (await reloadTeamOrder(container, current.id)) ?? current
    return (await moneyToApi(container, after, await loadMoney(container, after)))
  })
}

// =============================================================================================
// Staff

/**
 * The admin marks a part as received by hand: the part's placeholder payment is captured for its
 * amount in the admin's name (Medusa keeps who and when on the capture), then the step follows (the
 * deposit: `approved -> deposit_paid`, recorded as the admin's by-hand step; the balance: the
 * by-hand record). Refused (`step_not_allowed`) when the part is paid already or not due.
 */
export async function payPartByHand(container: MedusaContainer, adminId: string, teamOrder: TeamOrderRow, part: PaymentPart) {
  await locked(container, teamOrder.id, async () => {
    const current = (await reloadTeamOrder(container, teamOrder.id)) ?? teamOrder
    const money = await ensurePlacedUnderLock(container, current)
    const target = part === "deposit" ? money.deposit : money.balance
    const why = whyNoPayment({ part, status: statusOf(current), state: target.state, orderCanceled: money.order?.status === "canceled" })
    if (why === "deposit_already_paid" || why === "balance_already_paid") {
      // Paid, but the step may not have followed yet (an event missed): make it now.
      await syncPaymentStepsUnderLock(container, current.id)
      throw notAllowed("step_not_allowed", `The ${part} is paid already.`, { status: current.status, action: `${part}_by_hand` })
    }
    if (why) throw notAllowed("step_not_allowed", PAY_MESSAGES[why], { status: current.status, action: `${part}_by_hand` })
    if (target.state === "awaiting" || target.state === "authorized") {
      throw notAllowed("payment_in_progress", PAY_MESSAGES.payment_in_progress, { status: current.status })
    }
    const collection = await amountForPart(container, money, part)
    await payTeamOrderPartByHandWorkflow(container).run({ input: { payment_collection_id: collection.id, captured_by: adminId } })
    await syncPaymentStepsUnderLock(container, current.id)
  })
}

/** What the admin's buttons need to know: whether each part is paid (makes the step a payment caused first). */
export async function moneyFactsForAdmin(container: MedusaContainer, teamOrder: TeamOrderRow) {
  if (statusOf(teamOrder) === "draft" || statusOf(teamOrder) === "proof_sent") return { depositPaid: false, balancePaid: false }
  const money = await loadMoney(container, teamOrder)
  return { depositPaid: isPaid(money.deposit.state), balancePaid: mayShip(money.balance.state) }
}

/**
 * The ship step, under the money lock: refused (`balance_not_paid`) unless the balance is paid
 * (rule `mayShip`); `ship()` makes the step.
 */
export async function shipWithMoney<T>(container: MedusaContainer, teamOrder: TeamOrderRow, ship: () => Promise<T>): Promise<T> {
  return locked(container, teamOrder.id, async () => {
    const money = await loadMoney(container, teamOrder)
    if (!mayShip(money.balance.state)) {
      throw notAllowed("balance_not_paid", "The balance is not paid: the order cannot be shipped yet.", {
        status: teamOrder.status,
        balance: money.balance.state ?? "unpaid",
      })
    }
    return ship()
  })
}

/** Makes the step a payment caused, for the subscriber on `payment.captured` (takes the lock). */
export async function syncPaymentSteps(container: MedusaContainer, teamOrderId: string): Promise<void> {
  await withTeamOrderMoneyLock(container, teamOrderId, () => syncPaymentStepsUnderLock(container, teamOrderId))
}

/** The team order a payment collection belongs to (the deposit's or the balance's of one of its proofs), if any. */
export async function teamOrderOfCollection(container: MedusaContainer, collectionId: string): Promise<string | null> {
  const teams = service(container)
  for (const field of ["deposit_collection_id", "balance_collection_id"] as const) {
    const [proof] = (await teams.listProofApprovals({ [field]: collectionId } as never, { select: ["team_order_id"] })) as { team_order_id: string }[]
    if (proof) return proof.team_order_id
  }
  return null
}

// =============================================================================================
// The emails' payment link and amount

/**
 * The data of a payment email (deposit or balance): the link to the storefront's payment page for
 * the order (STOREFRONT_URL + the store setting `team_order_payment_path`), and the part's amount
 * and currency for the template. Each is null when it cannot be worked out (never fails the email).
 */
export async function paymentEmailData(container: MedusaContainer, teamOrder: TeamOrderRow, part: PaymentPart) {
  let paymentUrl: string | null = null
  let amount: { value: number; currency_code: string } | null = null
  try {
    const region = await loadRegionForMoney(container, teamOrder.region_id)
    const pattern = readPaymentPath(await storeMetadata(container))
    const country = region.countries?.[0]?.iso_2
    if (pattern.ok && country) {
      paymentUrl = paymentLink(readPublicUrls(process.env).storefrontUrl, pattern.value, { countryCode: country, id: teamOrder.id })
    }
  } catch (error) {
    logError(container, `Could not make the payment link of team order ${teamOrder.id}`, error)
  }
  try {
    const money = await loadMoney(container, teamOrder)
    const collection = (part === "deposit" ? money.deposit : money.balance).collection
    if (collection && money.order) amount = { value: toAmount(collection.amount), currency_code: money.order.currency_code }
  } catch (error) {
    logError(container, `Could not read the ${part} of team order ${teamOrder.id} for its email`, error)
  }
  return { paymentUrl, amount }
}
