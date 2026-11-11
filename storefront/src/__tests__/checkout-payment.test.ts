import { describe, expect, it } from "vitest"

import {
  initialPaymentId,
  paymentChoice,
  selectableOption,
  sessionProviderId,
} from "@lib/util/checkout-payment"
import { parseCheckoutRules } from "@lib/util/checkout-rules"

import {
  checkoutCartPk,
  providersGb,
  providersPk,
  rulesGb10,
  rulesPkAvailable,
  rulesPkOverLimit,
} from "./fixtures/m1-checkout"

const plain = (s: string | undefined) => s?.replace(/\s/g, " ")

describe("which payment options step 2 offers (05, 6.5 b)", () => {
  it("Pakistan at or below the limit: the placeholder, then cash on delivery, both selectable", () => {
    const choice = paymentChoice({ providerIds: providersPk, rules: parseCheckoutRules(rulesPkAvailable) })
    expect(choice.options).toEqual([
      { id: "pp_system_default", kind: "test", selectable: true },
      { id: "pp_cod_cod", kind: "cod", selectable: true },
    ])
    expect(choice.notice).toBeNull()
  })

  it("Pakistan over the limit: cash on delivery shown but inactive, with the limit and W-P6", () => {
    const choice = paymentChoice({ providerIds: providersPk, rules: parseCheckoutRules(rulesPkOverLimit) })
    const cod = choice.options.find((o) => o.kind === "cod")!
    expect(cod.selectable).toBe(false)
    expect(plain(cod.limit)).toBe("PKR 20,000")
    expect(choice.notice).toBe("over_limit")
    // the placeholder still works
    expect(selectableOption(choice, "pp_system_default")).not.toBeNull()
  })

  it("export regions: cash on delivery is not offered", () => {
    const choice = paymentChoice({ providerIds: providersGb, rules: parseCheckoutRules(rulesGb10) })
    expect(choice.options.map((o) => o.kind)).toEqual(["test"])
    expect(choice.notice).toBeNull()
  })

  it("not offered for the region even if an admin links it there (reason region)", () => {
    const choice = paymentChoice({ providerIds: providersPk, rules: parseCheckoutRules(rulesGb10) })
    expect(choice.options.map((o) => o.kind)).toEqual(["test"])
  })

  it("rules failed: only the placeholder, with W-P7, and only where cash on delivery exists", () => {
    expect(paymentChoice({ providerIds: providersPk, rules: null })).toEqual({
      options: [{ id: "pp_system_default", kind: "test", selectable: true }],
      notice: "cod_failed",
    })
    expect(paymentChoice({ providerIds: providersGb, rules: null }).notice).toBeNull()
  })

  it("leaves out a provider it has no words for, and offers nothing when the providers didn't load", () => {
    expect(
      paymentChoice({ providerIds: ["pp_stripe_stripe", ...providersGb], rules: null }).options
    ).toHaveLength(1)
    expect(paymentChoice({ providerIds: [], rules: null }).options).toEqual([])
  })
})

describe("the payment shown as chosen when the page loads", () => {
  const choice = paymentChoice({ providerIds: providersPk, rules: parseCheckoutRules(rulesPkAvailable) })
  const over = paymentChoice({ providerIds: providersPk, rules: parseCheckoutRules(rulesPkOverLimit) })

  it("is the cart's session, else the one chosen before on this cart", () => {
    expect(initialPaymentId({ choice, sessionProviderId: "pp_cod_cod", rememberedId: "pp_system_default" })).toBe("pp_cod_cod")
    // Medusa dropped the session after a quantity change: the earlier choice comes back
    expect(initialPaymentId({ choice, sessionProviderId: null, rememberedId: "pp_cod_cod" })).toBe("pp_cod_cod")
    expect(initialPaymentId({ choice, sessionProviderId: null, rememberedId: null })).toBeNull()
  })

  it("is never cash on delivery once the cart is over the limit", () => {
    expect(initialPaymentId({ choice: over, sessionProviderId: "pp_cod_cod", rememberedId: "pp_cod_cod" })).toBeNull()
  })
})

describe("sessionProviderId", () => {
  it("reads the live session from the cart", () => {
    expect(sessionProviderId(checkoutCartPk())).toBe("pp_cod_cod")
  })

  it("ignores no collection, no session, and an errored session", () => {
    expect(sessionProviderId(checkoutCartPk({ payment_collection: null }))).toBeNull()
    expect(sessionProviderId(checkoutCartPk({ payment_collection: { payment_sessions: [] } }))).toBeNull()
    expect(
      sessionProviderId(
        checkoutCartPk({ payment_collection: { payment_sessions: [{ provider_id: "pp_cod_cod", status: "error" }] } })
      )
    ).toBeNull()
  })
})
