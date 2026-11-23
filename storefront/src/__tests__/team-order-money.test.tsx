import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { state } = vi.hoisted(() => ({
  state: {
    refreshed: 0,
    started: [] as unknown[],
    completed: [] as unknown[],
    reads: 0,
    start: null as unknown as () => Promise<unknown>,
    complete: null as unknown as () => Promise<unknown>,
    read: null as unknown as () => Promise<unknown>,
  },
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: () => void (state.refreshed += 1) }),
  useParams: () => ({ countryCode: "pk" }),
}))
vi.mock("@modules/common/components/localized-client-link", () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={`/pk${href}`} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock("@lib/data/team-order-payments", () => ({
  startPayment: async (...args: unknown[]) => {
    state.started.push(args)
    return state.start()
  },
  completePayment: async (...args: unknown[]) => {
    state.completed.push(args)
    return state.complete()
  },
  retrievePayments: async () => {
    state.reads += 1
    return state.read()
  },
}))
vi.mock("@lib/data/team-orders", () => ({ signProof: vi.fn(), reopenTeamOrder: vi.fn(), makeProof: vi.fn() }))
vi.mock("@modules/team-order/components/proof-pictures", () => ({ default: () => <div data-testid="pictures" /> }))

import { apiAnswer, apiProof, apiSnapshot } from "@lib/team-order/fixtures"
import { parseProofAnswer } from "@lib/team-order/map"
import { parsePaymentsAnswer, parseStartAnswer, type PaymentsView } from "@lib/team-order/payments"
import { apiPayments, apiStarted } from "@lib/team-order/payments-fixtures"
import { buildProofDocument } from "@lib/team-order/proof"
import type { TeamOrderStatus } from "@lib/team-order/types"
import { parseSizeChart } from "@lib/util/size-chart"
import CostBlock from "@modules/team-order/components/cost-block"
import MoneySection from "@modules/team-order/components/money-section"
import PayPanel from "@modules/team-order/components/pay-panel"
import ProofPageView from "@modules/team-order/components/proof-page-view"

void apiAnswer

const money = (over: Parameters<typeof apiPayments>[0] = {}): PaymentsView => parsePaymentsAnswer(apiPayments(over))!
const ok = <T,>(value: T) => ({ ok: true, value })
const refused = (code: string) => ({ ok: false, failure: { kind: "refused", status: 400, code } })
const down = { ok: false, failure: { kind: "unavailable" } }
// the text of an element with its pieces apart by a space (a term and its amount), and no-break spaces made plain
const text = (id: string) => {
  const walker = document.createTreeWalker(screen.getByTestId(id), NodeFilter.SHOW_TEXT)
  const parts: string[] = []
  while (walker.nextNode()) parts.push(walker.currentNode.textContent ?? "")
  return parts.join(" ").replace(/ /g, " ").replace(/\s+/g, " ").trim()
}

const PAID_AT = "2026-11-23T10:00:00.000Z"
const paidDeposit = { state: "paid", due: false, paid_at: PAID_AT }

beforeEach(() => {
  state.refreshed = 0
  state.started = []
  state.completed = []
  state.reads = 0
  state.start = async () => ok(parseStartAnswer(apiStarted())!)
  state.complete = async () =>
    ok(money({ team_order: { status: "deposit_paid" }, deposit: paidDeposit, payments: { paid_total: 35125, outstanding: 35125 } }))
  state.read = async () => down
})

const panel = (initial: PaymentsView) =>
  render(<PayPanel orderId="teamord_1" teamName="Lahore Lions" initial={initial} orderHref="/account/team-orders/teamord_1" proofHref="/account/team-orders/teamord_1/proof" payPath="/pk/account/team-orders/teamord_1/pay" />)

describe("the payment page: what is due and the action", () => {
  it("deposit due: the amount due now, the order's total, what is paid, the Medusa order number and one button", () => {
    panel(money())
    expect(text("pay-title")).toBe("Pay the deposit")
    expect(text("pay-due")).toBe("Due now PKR 35,125")
    expect(text("pay-total")).toBe("Order total PKR 70,250")
    expect(text("pay-paid")).toBe("Already paid PKR 0")
    expect(text("pay-order-number")).toContain("# 4")
    expect(text("pay-start")).toContain("Pay deposit PKR 35,125")
  })

  it("start, then the confirmation marked as a test (placeholder only), then complete: paid, with the new state and what is next", async () => {
    panel(money())
    fireEvent.click(screen.getByTestId("pay-start"))
    await screen.findByTestId("pay-confirm")
    expect(state.started).toEqual([["teamord_1", "deposit"]])
    expect(text("pay-test-notice")).toContain("No money moves")
    expect(text("pay-confirm-button")).toContain("Confirm test payment PKR 35,125")
    fireEvent.click(screen.getByTestId("pay-confirm-button"))
    await screen.findByTestId("pay-done")
    expect(state.completed).toEqual([["teamord_1", "deposit", "payses_1"]])
    expect(text("pay-done-text")).toContain("We have your deposit of PKR 35,125")
    expect(text("pay-done-text")).toMatch(/23 November 2026/)
    expect(text("pay-done-status")).toBe("Your order is now: Deposit paid.")
    expect(text("pay-done-next")).toContain("production")
    expect(state.refreshed).toBe(1)
    expect(screen.queryByTestId("pay-start")).toBeNull()
  })

  it("a real gateway never shows the test notice", async () => {
    state.start = async () => ok(parseStartAnswer(apiStarted({ provider: "pp_stripe_stripe" }))!)
    panel(money())
    fireEvent.click(screen.getByTestId("pay-start"))
    await screen.findByTestId("pay-confirm")
    expect(screen.queryByTestId("pay-test-notice")).toBeNull()
  })

  it("a double press on pay starts once, and a double press on confirm pays once", async () => {
    panel(money())
    fireEvent.click(screen.getByTestId("pay-start"))
    fireEvent.click(screen.getByTestId("pay-start"))
    await screen.findByTestId("pay-confirm")
    expect(state.started).toHaveLength(1)
    const confirm = screen.getByTestId("pay-confirm-button")
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await screen.findByTestId("pay-done")
    expect(state.completed).toHaveLength(1)
  })

  it("a next type the page does not know is 'not available here yet', not a crash, and nothing is completed", async () => {
    state.start = async () => ok(parseStartAnswer(apiStarted({ next: { type: "wallet_pop_up" } }))!)
    panel(money())
    fireEvent.click(screen.getByTestId("pay-start"))
    await screen.findByTestId("pay-unknown-next")
    expect(text("pay-unknown-next")).toContain("not available here yet")
    expect(state.completed).toEqual([])
  })

  it("a start that could not be made says nothing was taken and offers the button again", async () => {
    state.start = async () => down
    panel(money())
    fireEvent.click(screen.getByTestId("pay-start"))
    await screen.findByTestId("pay-error")
    expect(text("pay-error")).toContain("Nothing was taken")
    expect(screen.getByTestId("pay-start")).toBeInTheDocument()
  })

  it("a refusal to start is its sentence (the deposit is not due)", async () => {
    state.start = async () => refused("deposit_not_due")
    panel(money())
    fireEvent.click(screen.getByTestId("pay-start"))
    await screen.findByTestId("pay-error")
    expect(text("pay-error")).toContain("The deposit is not due now")
  })

  it("the completing request lost: never 'paid', never 'pay again'; checking again shows paid when the store says so", async () => {
    state.complete = async () => down
    panel(money())
    fireEvent.click(screen.getByTestId("pay-start"))
    fireEvent.click(await screen.findByTestId("pay-confirm-button"))
    await screen.findByTestId("pay-unsure")
    expect(text("pay-unsure")).toContain("Please do not pay again")
    expect(screen.queryByTestId("pay-done")).toBeNull()
    expect(screen.queryByTestId("pay-start")).toBeNull()
    // the store still cannot be reached
    fireEvent.click(screen.getByTestId("pay-check-again"))
    await waitFor(() => expect(text("pay-unsure")).toContain("still can't reach"))
    expect(screen.queryByTestId("pay-done")).toBeNull()
    // then it answers: paid
    state.read = async () => ok(money({ team_order: { status: "deposit_paid" }, deposit: paidDeposit, payments: { paid_total: 35125, outstanding: 35125 } }))
    fireEvent.click(screen.getByTestId("pay-check-again"))
    await screen.findByTestId("pay-done")
    expect(state.completed).toHaveLength(1)
  })

  it("the completing request lost and the store says it is not paid: said so, with the confirmation to try again (the same session)", async () => {
    state.complete = async () => down
    panel(money())
    fireEvent.click(screen.getByTestId("pay-start"))
    fireEvent.click(await screen.findByTestId("pay-confirm-button"))
    await screen.findByTestId("pay-unsure")
    state.read = async () => ok(money({ deposit: { due: true, state: "started" } }))
    fireEvent.click(screen.getByTestId("pay-check-again"))
    await screen.findByTestId("pay-not-paid")
    expect(screen.getByTestId("pay-confirm-button")).toBeInTheDocument()
    state.complete = async () => ok(money({ team_order: { status: "deposit_paid" }, deposit: paidDeposit }))
    fireEvent.click(screen.getByTestId("pay-confirm-button"))
    await screen.findByTestId("pay-done")
    expect(state.completed.map((c) => (c as string[])[2])).toEqual(["payses_1", "payses_1"])
  })

  it("'already paid' at completion (another press won) is shown as paid, once", async () => {
    state.complete = async () => refused("deposit_already_paid")
    state.read = async () => ok(money({ team_order: { status: "deposit_paid" }, deposit: paidDeposit }))
    panel(money())
    fireEvent.click(screen.getByTestId("pay-start"))
    fireEvent.click(await screen.findByTestId("pay-confirm-button"))
    await screen.findByTestId("pay-done")
  })

  it("a refusal at completion (the payment failed) says nothing was taken and goes back to start", async () => {
    state.complete = async () => refused("payment_failed")
    panel(money())
    fireEvent.click(screen.getByTestId("pay-start"))
    fireEvent.click(await screen.findByTestId("pay-confirm-button"))
    await screen.findByTestId("pay-error")
    expect(text("pay-error")).toContain("Nothing was taken")
    expect(screen.getByTestId("pay-start")).toBeInTheDocument()
  })

  it("signed out in the middle: a link to sign in that returns to this page", async () => {
    state.start = async () => ({ ok: false, failure: { kind: "signed_out" } })
    panel(money())
    fireEvent.click(screen.getByTestId("pay-start"))
    const alert = await screen.findByTestId("pay-error")
    expect(alert.querySelector("a")!.getAttribute("href")).toContain("next=%2Fpk%2Faccount%2Fteam-orders%2Fteamord_1%2Fpay")
  })
})

describe("the payment page: the other states", () => {
  it("balance before it is due: not due yet, no action, the deposit's date", () => {
    panel(money({ team_order: { status: "in_production" }, deposit: paidDeposit }))
    expect(screen.getByTestId("pay-state")).toHaveAttribute("data-state", "balance_not_due")
    expect(text("pay-state")).toContain("The balance is not due yet")
    expect(text("pay-state")).toContain("PKR 35,125")
    expect(screen.queryByTestId("pay-start")).toBeNull()
  })

  it("balance due: the balance is the action", () => {
    panel(money({ team_order: { status: "balance_due" }, deposit: paidDeposit, balance: { due: true }, payments: { paid_total: 35125, outstanding: 35125 } }))
    expect(text("pay-title")).toBe("Pay the balance")
    expect(text("pay-start")).toContain("Pay balance PKR 35,125")
    expect(text("pay-paid")).toBe("Already paid PKR 35,125")
  })

  it("the balance paid through the page: paid, and the next step is shipping", async () => {
    state.start = async () => ok(parseStartAnswer({ ...apiStarted({ part: "balance" }), team_order: { id: "teamord_1", status: "balance_due", kind: "order" } })!)
    state.complete = async () => ok(money({ team_order: { status: "balance_due" }, deposit: paidDeposit, balance: { state: "paid", due: false, paid_at: PAID_AT }, payments: { paid_total: 70250, outstanding: 0 } }))
    panel(money({ team_order: { status: "balance_due" }, deposit: paidDeposit, balance: { due: true } }))
    fireEvent.click(screen.getByTestId("pay-start"))
    fireEvent.click(await screen.findByTestId("pay-confirm-button"))
    await screen.findByTestId("pay-done")
    expect(text("pay-done-text")).toContain("We have your balance of PKR 35,125")
    expect(text("pay-done-next")).toContain("Everything is paid")
    expect(state.started).toEqual([["teamord_1", "balance"]])
  })

  it("paid in full, and shipped", () => {
    const paid = { team_order: { status: "balance_due" }, deposit: paidDeposit, balance: { state: "paid", due: false, paid_at: PAID_AT }, payments: { paid_total: 70250, outstanding: 0 } }
    const { unmount } = panel(money(paid))
    expect(screen.getByTestId("pay-state")).toHaveAttribute("data-state", "paid_in_full")
    expect(text("pay-state")).toContain("Everything on this order is paid: PKR 70,250")
    expect(text("pay-state")).not.toContain("has shipped")
    unmount()
    panel(money({ ...paid, team_order: { status: "shipped" } }))
    expect(text("pay-state")).toContain("Your order has shipped")
    expect(screen.queryByTestId("pay-start")).toBeNull()
  })

  it("a proof that is out: nothing to pay, the way to the proof", () => {
    panel(money({ team_order: { status: "proof_sent" }, deposit: { due: false } }))
    expect(screen.getByTestId("pay-state")).toHaveAttribute("data-state", "proof_out")
    expect(screen.getByText("Open the proof").closest("a")).toHaveAttribute("href", "/pk/account/team-orders/teamord_1/proof")
    expect(screen.queryByTestId("pay-start")).toBeNull()
  })

  it("a payment with the payment system: processing, no payment button, a way to check", async () => {
    state.read = async () => ok(money({ team_order: { status: "approved" }, deposit: { due: false, state: "authorized" } }))
    panel(money({ deposit: { due: false, state: "authorized" } }))
    expect(screen.getByTestId("pay-state")).toHaveAttribute("data-state", "processing")
    expect(text("pay-state")).toContain("Do not pay again")
    expect(screen.queryByTestId("pay-start")).toBeNull()
    fireEvent.click(screen.getByTestId("pay-processing-check"))
    await waitFor(() => expect(state.reads).toBe(1))
  })

  it("refunded and canceled are said, with no payment button", () => {
    panel(money({ team_order: { status: "balance_due" }, deposit: { ...paidDeposit, state: "refunded" } }))
    expect(screen.getByTestId("pay-state")).toHaveAttribute("data-state", "refunded")
    expect(screen.queryByTestId("pay-start")).toBeNull()
  })
})

describe("the money on the order page, at every status", () => {
  const show = (status: TeamOrderStatus, v: PaymentsView | null, failed = false) =>
    render(<MoneySection orderId="teamord_1" status={status} money={v} failed={failed} />)
  const key = () => screen.getByTestId("money-section").getAttribute("data-money")

  it("a draft is not priced yet, with no button", () => {
    show("draft", null)
    expect(key()).toBe("draft")
    expect(text("money-title")).toBe("Not priced yet")
    expect(screen.queryByTestId("money-pay")).toBeNull()
  })

  it("a proof that is out is priced, with its total and no button", () => {
    show("proof_sent", money({ team_order: { status: "proof_sent" }, cost: { state: "quote" }, deposit: { due: false }, order: null }))
    expect(text("money-title")).toBe("Priced")
    expect(text("money-text")).toContain("PKR 70,250")
    expect(screen.queryByTestId("money-pay")).toBeNull()
  })

  it("approved: the deposit is due, the amounts and the button to the payment page", () => {
    show("approved", money())
    expect(text("money-title")).toBe("Deposit due")
    expect(text("money-text")).toContain("PKR 35,125")
    expect(text("money-total")).toBe("Total PKR 70,250")
    expect(text("money-order-number")).toContain("# 4")
    expect(text("money-outstanding")).toBe("Still to pay PKR 70,250")
    expect(screen.getByTestId("money-pay")).toHaveAttribute("href", "/pk/account/team-orders/teamord_1/pay")
    expect(text("money-pay")).toBe("Pay the deposit")
  })

  it("approved with a started payment says it was not finished and nothing was taken", () => {
    show("approved", money({ deposit: { due: true, state: "started" } }))
    expect(text("money-started")).toContain("Nothing was taken")
    expect(screen.getByTestId("money-pay")).toBeInTheDocument()
  })

  it("deposit paid: paid and in production comes next, with the date, no button", () => {
    show("deposit_paid", money({ team_order: { status: "deposit_paid" }, deposit: paidDeposit, payments: { paid_total: 35125, outstanding: 35125 } }))
    expect(key()).toBe("deposit_paid")
    expect(text("money-title")).toBe("Deposit paid")
    expect(text("money-text")).toContain("Next comes production")
    expect(text("money-deposit")).toContain("Deposit paid on 23 November 2026")
    expect(text("money-paid")).toBe("Paid PKR 35,125")
    expect(screen.queryByTestId("money-pay")).toBeNull()
  })

  it("in production: the balance is due before shipping, no button", () => {
    show("in_production", money({ team_order: { status: "in_production" }, deposit: paidDeposit }))
    expect(text("money-title")).toBe("In production")
    expect(text("money-text")).toContain("before shipping")
    expect(screen.queryByTestId("money-pay")).toBeNull()
  })

  it("balance due: the balance and its button; paid before shipping: paid in full, no button", () => {
    const { unmount } = show("balance_due", money({ team_order: { status: "balance_due" }, deposit: paidDeposit, balance: { due: true } }))
    expect(key()).toBe("balance_due")
    expect(text("money-pay")).toBe("Pay the balance")
    unmount()
    show("balance_due", money({ team_order: { status: "balance_due" }, deposit: paidDeposit, balance: { state: "paid", due: false, paid_at: PAID_AT }, payments: { paid_total: 70250, outstanding: 0 } }))
    expect(key()).toBe("balance_paid")
    expect(text("money-title")).toBe("Paid in full")
    expect(screen.queryByTestId("money-pay")).toBeNull()
    expect(text("money-outstanding")).toBe("Still to pay PKR 0")
  })

  it("shipped: paid in full and shipped", () => {
    show("shipped", money({ team_order: { status: "shipped" }, deposit: paidDeposit, balance: { state: "paid", due: false, paid_at: PAID_AT }, payments: { paid_total: 70250, outstanding: 0 } }))
    expect(text("money-title")).toBe("Paid in full and shipped")
    expect(screen.queryByTestId("money-pay")).toBeNull()
  })

  it("an add-on or a reorder shows its money like any order", () => {
    show("approved", money({ team_order: { kind: "add_on" } }))
    expect(text("money-title")).toBe("Deposit due")
  })

  it("money that could not be read claims nothing", () => {
    show("approved", null, true)
    expect(text("money-failed")).toContain("couldn't load the money details")
    expect(screen.queryByTestId("money-pay")).toBeNull()
    expect(screen.queryByTestId("money-figures")).toBeNull()
  })

  it("a refunded part is said and not offered", () => {
    show("balance_due", money({ team_order: { status: "balance_due" }, deposit: paidDeposit, balance: { state: "refunded", due: false } }))
    expect(screen.getByTestId("money-refunded")).toBeInTheDocument()
    expect(screen.queryByTestId("money-pay")).toBeNull()
  })
})

describe("the cost on the proof page, before signing", () => {
  const chart = parseSizeChart({ size_chart: { unit: "cm", draft: true, columns: [{ key: "chest", label: "Chest" }], rows: [{ size: "M", values: { chest: 54 } }] } })
  const proof = parseProofAnswer({ proof: { ...apiProof(), snapshot: apiSnapshot(), snapshot_text: "t" } })!
  const doc = buildProofDocument({ proof, productName: "Jersey", sizes: ["S", "M", "L"], chart, letterCase: "upper", needByDate: null })
  const view = (money: PaymentsView | null, props: Record<string, unknown> = {}) =>
    render(
      <ProofPageView
        orderId="teamord_1"
        countryCode="pk"
        document={doc}
        proof={proof}
        isCurrent
        currentProofId={proof.id}
        schedule={{ state: "ok", sentences: [] }}
        pictures={{} as never}
        changeListPath="/pk/design/jersey"
        orderStatus="proof_sent"
        money={money}
        {...props}
      />
    )

  it("shows the cost between the proof and the signing form, and the statement names the total and the deposit", () => {
    view(money({ team_order: { status: "proof_sent" }, cost: { state: "quote" }, deposit: { due: false }, order: null }))
    const cost = screen.getByTestId("cost-block")
    const form = screen.getByTestId("sign-form")
    expect(cost.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getAllByTestId("cost-line")).toHaveLength(2)
    expect(text("cost-total")).toContain("PKR 70,250")
    expect(text("cost-deposit")).toContain("PKR 35,125")
    expect(text("cost-balance")).toContain("PKR 35,125")
    expect(text("sign-statement")).toContain("the total is PKR 70,250")
  })

  it("shows the rush line and the duty-paid delivery in words, in pounds", () => {
    view(
      money({
        team_order: { status: "proof_sent" },
        cost: { state: "quote", currency_code: "gbp", delivery: { name: "Shipping & duties included", amount: 0, duty_paid: true }, rush: { amount: 88, percentage: 20 }, lines: [{ size: "M", quantity: 20, unit_price: 22, total: 440 }], total: 528 },
        deposit: { due: false, amount: 264 },
        balance: { amount: 264 },
        order: null,
      })
    )
    expect(text("cost-delivery")).toBe("Shipping & duties included Included")
    expect(text("cost-rush")).toContain("GBP 88.00")
    expect(text("cost-total")).toContain("GBP 528.00")
    expect(text("cost-tax")).toContain("Tax not final")
  })

  it("when the cost cannot be read the proof shows and signing is not offered, and it says what happened", () => {
    view(null)
    expect(screen.getByTestId("roster-proof")).toBeInTheDocument()
    expect(screen.queryByTestId("sign-form")).toBeNull()
    expect(screen.queryByTestId("sign-submit")).toBeNull()
    expect(text("cost-failed")).toContain("can't sign it until you have seen what it costs")
    fireEvent.click(screen.getByTestId("cost-retry"))
    expect(state.refreshed).toBe(1)
  })

  it("after signing: the deposit amount and the way to pay it; no payment button before the deposit is due", async () => {
    const signed = parseProofAnswer({ proof: { ...apiProof({ status: "signed", signed_name: "Ali", signed_at: PAID_AT }), snapshot: apiSnapshot(), snapshot_text: "t" } })!
    view(money({ cost: { proof_id: "proof_1" } }), { proof: signed, orderStatus: "approved" })
    expect(text("signed-next")).toBe("Next is the deposit: PKR 35,125.")
    expect(screen.getByTestId("signed-pay")).toHaveAttribute("href", "/pk/account/team-orders/teamord_1/pay")
    expect(screen.getByTestId("reopen-open")).toBeInTheDocument()
  })

  it("after the deposit: no pay button and no Change the list", () => {
    const signed = parseProofAnswer({ proof: { ...apiProof({ status: "signed", signed_name: "Ali", signed_at: PAID_AT }), snapshot: apiSnapshot(), snapshot_text: "t" } })!
    view(money({ team_order: { status: "deposit_paid" }, deposit: paidDeposit }), { proof: signed, orderStatus: "deposit_paid" })
    expect(text("signed-next")).toBe("The deposit of PKR 35,125 is paid.")
    expect(screen.queryByTestId("signed-pay")).toBeNull()
    expect(screen.queryByTestId("reopen-open")).toBeNull()
  })

  it("signed with the money unreadable: the order page is the way on, nothing is promised", () => {
    const signed = parseProofAnswer({ proof: { ...apiProof({ status: "signed", signed_name: "Ali", signed_at: PAID_AT }), snapshot: apiSnapshot(), snapshot_text: "t" } })!
    view(null, { proof: signed, orderStatus: "approved" })
    expect(text("signed-next")).toContain("couldn't load the amount")
    expect(screen.queryByTestId("signed-pay")).toBeNull()
    expect(screen.getByTestId("signed-open-order")).toBeInTheDocument()
  })
})

describe("the cost block alone", () => {
  it("is a plain component: it fetches nothing", () => {
    render(<CostBlock money={money({ cost: { state: "quote" } })} />)
    expect(screen.getByTestId("cost-block")).toHaveAttribute("data-state", "quote")
    expect(state.reads).toBe(0)
    void act
  })
})
