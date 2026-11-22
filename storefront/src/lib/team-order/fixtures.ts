// Test data: an answer shaped as docs/contracts/m2-team-orders.md says (snake_case), and its
// parts. Used by the tests of the mapping, the saving and the pages. Not shipped.

export const apiLine = (over: Record<string, unknown> = {}) => ({
  id: "ln_1",
  name: "Bilal",
  number: "7",
  size: "M",
  count: 1,
  no_name: false,
  no_number: false,
  ...over,
})

export const apiSummary = (over: Record<string, unknown> = {}) => ({
  players: 2,
  pieces: 3,
  by_size: [
    { size: "S", pieces: 0 },
    { size: "M", pieces: 2 },
    { size: "L", pieces: 1 },
  ],
  other_sizes: [],
  lines_without_size: 0,
  pieces_without_size: 0,
  ready_lines: 2,
  lines_to_fix: 0,
  indexes_to_fix: [],
  minimum: { required: 10, missing: 7, met: false },
  ready_for_proof: false,
  ...over,
})

export const apiSchedule = (over: Record<string, unknown> = {}) => ({
  state: "none",
  need_by_date: null,
  today: "2026-11-22",
  days: { standard: 15, rush: 10 },
  latest_sign_standard: null,
  latest_sign_rush: null,
  days_left_standard: null,
  days_left_rush: null,
  delivery_if_signed_today: { standard: "2026-12-07", rush: "2026-12-02" },
  ...over,
})

export const apiAnswer = (over: { team_order?: Record<string, unknown>; roster?: Record<string, unknown>; [k: string]: unknown } = {}) => {
  const { team_order, roster, ...rest } = over
  return {
    team_order: {
      id: "teamord_1",
      team_name: "Lahore Lions",
      status: "draft",
      kind: "order",
      linked_order_id: null,
      design_id: "design_1",
      design_version_id: "desver_1",
      product_id: "prod_1",
      region_id: "reg_uk",
      need_by_date: null,
      rush_requested: false,
      prints: { name: true, number: true },
      list_version: 3,
      created_at: "2026-11-22T10:00:00.000Z",
      updated_at: "2026-11-22T10:00:00.000Z",
      ...team_order,
    },
    sizes: ["YS", "YM", "S", "M", "L"],
    roster: {
      version: 3,
      lines: [apiLine(), apiLine({ id: "ln_2", name: "علی", number: "٧", size: "L" })],
      problems: [],
      notes: [],
      summary: apiSummary(),
      ...roster,
    },
    limits: { max_lines: 100, min_count: 1, max_count: 10, max_name_length: 18 },
    schedule: apiSchedule(),
    current_proof: null,
    links: { kind: "order", source: null, add_ons: { count: 0, items: [] }, reorders: { count: 0, items: [] } },
    ...rest,
  }
}
