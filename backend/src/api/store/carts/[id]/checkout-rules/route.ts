/**
 * GET /store/carts/:id/checkout-rules
 *
 * The cart's checkout rules, exactly as docs/contracts/m1-checkout.md (section 6) describes:
 * minimum quantity, cash on delivery and the delivery promise. Needs the publishable key, like
 * every store route. The storefront reads this to explain a refusal; it never parses the message
 * of a refused request.
 *
 * Thin: loading in workflows/checkout-rules/load-checkout-rules.ts, rules in lib/rules/.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadCheckoutRules } from "../../../../../workflows/checkout-rules/load-checkout-rules"

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const { rules } = await loadCheckoutRules(req.scope, req.params.id)
  res.json(rules)
}
