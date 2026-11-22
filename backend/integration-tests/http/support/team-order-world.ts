/**
 * Shared set-up of the team-order integration specs of M2-3: a seeded store, signing in as a
 * customer or as the admin, a design, a team order, and the routes as small functions. Not a spec
 * itself (the runner only picks up `*.spec.ts` directly in `http/`).
 */
import { seedStore } from "../../../src/scripts/seed-lib/seed-store"
import { addCalendarDays, calendarDateIn } from "../../../src/lib/rules/delivery-promise"

export type Headers = Record<string, string>

export const SIZES = ["YS", "YM", "YL", "YXL", "XS", "S", "M", "L", "XL", "2XL", "3XL"]

export function designJson(opts: { name?: boolean; number?: boolean; note?: string } = {}) {
  const layers: Record<string, unknown>[] = [{ id: "team", kind: "text", role: "team-name", value: "LIONS" }]
  if (opts.name ?? true) layers.push({ id: "pname", kind: "text", role: "player-name", value: "" })
  if (opts.number ?? true) layers.push({ id: "pnum", kind: "number", role: "player-number", value: "" })
  return { schemaVersion: 3, product: { id: "stand-in-jersey" }, teamName: "LIONS", layers, note: opts.note ?? "first" }
}

export const line = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `l${n}`,
  name: `Player ${String.fromCharCode(64 + n)}`,
  number: String(n),
  size: SIZES[4 + (n % 7)],
  count: 1,
  no_name: false,
  no_number: false,
  ...extra,
})

/** A team of `count` players, numbers 1 to `count`. */
export const team = (count: number) => Array.from({ length: count }, (_, i) => line(i + 1))

export type World = Awaited<ReturnType<typeof makeWorld>>

/** Sets up the store and returns the helpers. Call it in `beforeAll`. */
export async function makeWorld(
  api: any,
  getContainer: () => any,
  names: { adminEmail: string; adminPassword: string; prefix: string }
) {
  const { publishableKey } = await seedStore(getContainer(), {
    nodeEnv: "test",
    adminEmail: names.adminEmail,
    adminPassword: names.adminPassword,
  })
  const base: Headers = { "x-publishable-api-key": publishableKey }
  const allow = { validateStatus: () => true }
  const regionIds: Record<string, string> = {}
  const productIds: Record<string, string> = {}
  const { data: regions } = await api.get("/store/regions", { headers: base })
  for (const region of regions.regions) {
    for (const country of region.countries) regionIds[country.iso_2] = region.id
  }
  const { data: products } = await api.get("/store/products?limit=50&fields=id,handle", { headers: base })
  for (const product of products.products) productIds[product.handle] = product.id

  let counter = 0
  const today = () => calendarDateIn(new Date(), "Asia/Karachi")
  const inDays = (n: number) => addCalendarDays(today(), n)

  async function signIn(): Promise<Headers & { __email: string }> {
    counter += 1
    const email = `${names.prefix}-${counter}-${Date.now()}@example.com`
    const password = "customer-test-password"
    const { data: registered } = await api.post("/auth/customer/emailpass/register", { email, password })
    await api.post(
      "/store/customers",
      { email, first_name: "Ali", last_name: "Khan" },
      { headers: { ...base, authorization: `Bearer ${registered.token}` } }
    )
    const { data: login } = await api.post("/auth/customer/emailpass", { email, password })
    return { ...base, authorization: `Bearer ${login.token}`, __email: email } as Headers & { __email: string }
  }

  async function adminHeaders(): Promise<Headers> {
    const { data } = await api.post("/auth/user/emailpass", { email: names.adminEmail, password: names.adminPassword })
    return { authorization: `Bearer ${data.token}` }
  }

  /** Request headers without the helper-only fields. */
  const clean = (as: Headers): Headers => {
    const { __email: _email, ...rest } = as
    return rest
  }

  const saveDesign = (as: Headers, design: unknown = designJson()) =>
    api.post("/store/designs", { name: "Home kit", product_id: productIds["jersey"], design }, { headers: clean(as), ...allow })

  async function aTeamOrder(
    as: Headers,
    opts: { country?: string; need_by_date?: string | null; rush_requested?: boolean; design?: unknown } = {}
  ) {
    const { data: saved } = await saveDesign(as, opts.design)
    const { data, status } = await api.post(
      "/store/team-orders",
      {
        team_name: "Lahore Lions",
        design_version_id: saved.version.id,
        region_id: regionIds[opts.country ?? "gb"],
        ...(opts.need_by_date !== undefined ? { need_by_date: opts.need_by_date } : {}),
        ...(opts.rush_requested !== undefined ? { rush_requested: opts.rush_requested } : {}),
      },
      { headers: clean(as), ...allow }
    )
    expect(status).toBe(201)
    return data
  }

  const h = (as: Headers) => ({ headers: clean(as), ...allow })
  const putRoster = (as: Headers, id: string, version: number, lines: unknown) =>
    api.put(`/store/team-orders/${id}/roster`, { version, lines }, h(as))
  const read = (as: Headers, id: string) => api.get(`/store/team-orders/${id}`, h(as))
  const makeProof = (as: Headers, id: string) => api.post(`/store/team-orders/${id}/proofs`, {}, h(as))
  const sign = (as: Headers, id: string, proofId: string, body: Record<string, unknown>) =>
    api.post(`/store/team-orders/${id}/proofs/${proofId}/sign`, body, h(as))
  const reopen = (as: Headers, id: string) => api.post(`/store/team-orders/${id}/reopen`, {}, h(as))
  const signBody = (answer: any, extra: Record<string, unknown> = {}) => ({
    proof_hash: answer.current_proof.hash,
    signed_name: "Ali Khan",
    confirmed: true,
    schedule_state: answer.schedule.state,
    ...extra,
  })

  /** Saves `lines`, makes the proof and signs it: an `approved` order. Returns the last answer. */
  async function signed(as: Headers, id: string, lines: unknown, version = 1) {
    const saved = await putRoster(as, id, version, lines)
    expect(saved.status).toBe(200)
    const made = await makeProof(as, id)
    expect(made.status).toBe(201)
    const done = await sign(as, id, made.data.current_proof.id, signBody(made.data))
    expect(done.status).toBe(200)
    expect(done.data.team_order.status).toBe("approved")
    return done.data
  }

  /** A team order of `n` players (UK minimum is 10), signed. */
  async function aSignedOrder(as: Headers, n = 20, opts: Parameters<typeof aTeamOrder>[1] = {}) {
    const order = await aTeamOrder(as, opts)
    return signed(as, order.team_order.id, team(n))
  }

  const addOnsPath = (id: string) => `/store/team-orders/${id}/add-ons`
  const startAddOn = (as: Headers, id: string, body: unknown = {}) => api.post(addOnsPath(id), body, h(as))
  const listAddOns = (as: Headers, id: string) => api.get(addOnsPath(id), h(as))
  const startReorder = (as: Headers, id: string, body: unknown = {}) =>
    api.post(`/store/team-orders/${id}/reorders`, body, h(as))

  return {
    api,
    getContainer,
    base,
    allow,
    regionIds,
    productIds,
    today,
    inDays,
    signIn,
    adminHeaders,
    clean,
    saveDesign,
    aTeamOrder,
    putRoster,
    read,
    makeProof,
    sign,
    reopen,
    signBody,
    signed,
    aSignedOrder,
    startAddOn,
    listAddOns,
    startReorder,
    h,
  }
}
