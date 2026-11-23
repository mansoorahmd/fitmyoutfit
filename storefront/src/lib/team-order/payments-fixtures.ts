// Test data: the answers of docs/contracts/m3-team-order-payments.md (snake_case). Not shipped.

export const apiPart = (over: Record<string, unknown> = {}) => ({
  amount: 35125,
  state: "unpaid",
  due: false,
  paid_at: null,
  by_hand: null,
  session: null,
  ...over,
})

export const apiCost = (over: Record<string, unknown> = {}) => ({
  state: "quote",
  proof_id: "proof_1",
  currency_code: "pkr",
  tax_final: false,
  lines: [
    { size: "M", quantity: 3, unit_price: 3500, total: 10500 },
    { size: "L", quantity: 17, unit_price: 3500, total: 59500 },
  ],
  pieces: 20,
  delivery: { name: "Delivery in Pakistan", amount: 250, duty_paid: false },
  rush: null,
  subtotal: 70250,
  tax_total: 0,
  total: 70250,
  deposit_percentage: 50,
  ...over,
})

export const apiPayments = (
  over: { team_order?: Record<string, unknown>; cost?: Record<string, unknown>; deposit?: Record<string, unknown>; balance?: Record<string, unknown>; payments?: Record<string, unknown>; order?: unknown } = {}
) => ({
  team_order: { id: "teamord_1", status: "approved", kind: "order", ...over.team_order },
  cost: apiCost({ state: "ordered", ...over.cost }),
  payments: {
    deposit: apiPart({ due: true, ...over.deposit }),
    balance: apiPart({ ...over.balance }),
    paid_total: 0,
    outstanding: 70250,
    payment_status: "not_paid",
    ...over.payments,
  },
  order: over.order === undefined ? { id: "order_1", display_id: 4, status: "pending" } : over.order,
})

export const apiStarted = (over: { provider?: string; next?: unknown; part?: string } = {}) => ({
  ...apiPayments(),
  payment: {
    part: over.part ?? "deposit",
    amount: 35125,
    currency_code: "pkr",
    session: { id: "payses_1", provider_id: over.provider ?? "pp_system_default", status: "pending", data: {} },
    next: over.next === undefined ? { type: "confirm" } : over.next,
  },
})
