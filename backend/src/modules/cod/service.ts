/**
 * Cash on delivery, as a Medusa payment provider. Thin on purpose: no money moves through it.
 *
 * - A session is authorized at once, so the cart can complete and become an order.
 * - The payment is captured later, by hand in the admin, when the courier has collected the cash.
 * - Whether cash on delivery is allowed for a cart (Pakistan only, up to `cod_max_total`) is not
 *   decided here: a provider cannot see the region or the store's settings. The checks are in
 *   lib/rules/cash-on-delivery.ts, applied by api/middlewares.ts (when the session is created) and
 *   workflows/hooks/complete-cart-checkout-rules.ts (when the cart is completed).
 *
 * Registered in lib/config/build-config.ts with the id "cod"; Medusa names it
 * `pp_<identifier>_<id>`, so its provider id is `pp_cod_cod` (COD_PAYMENT_PROVIDER_ID).
 */
import { randomUUID } from "node:crypto"
import { AbstractPaymentProvider, PaymentActions, PaymentSessionStatus } from "@medusajs/framework/utils"
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
import { COD_PROVIDER_IDENTIFIER } from "./constants"

class CashOnDeliveryProviderService extends AbstractPaymentProvider {
  static identifier = COD_PROVIDER_IDENTIFIER

  // Medusa's base constructor is protected; the module loader needs a public one.
  constructor(cradle: Record<string, unknown>, options?: Record<string, unknown>) {
    super(cradle, options)
  }

  async initiatePayment(_input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    return { id: randomUUID(), data: { method: "cash_on_delivery" } }
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    return { status: PaymentSessionStatus.AUTHORIZED, data: input.data ?? {} }
  }

  async getPaymentStatus(_input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    return { status: PaymentSessionStatus.AUTHORIZED }
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    return { data: input.data ?? {} }
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: input.data ?? {} }
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data ?? {} }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    return { data: input.data ?? {} }
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: input.data ?? {} }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    return { data: input.data ?? {} }
  }

  async getWebhookActionAndData(
    _payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    return { action: PaymentActions.NOT_SUPPORTED }
  }
}

export default CashOnDeliveryProviderService
