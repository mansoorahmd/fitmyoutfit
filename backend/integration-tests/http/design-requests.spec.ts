/**
 * The design-help queue, through the store and admin routes: a visitor's request and a signed-in
 * customer's, every invalid field refused with its code, the trap field discarded with the same
 * answer, the limits per address and per email (and that their answer never says whether an email
 * is known), a customer reading only their own requests, staff notes never in a store answer, each
 * status step allowed and each refused one, the record of changes, and the one confirmation email.
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { seedStore } from "../../src/scripts/seed-lib/seed-store"
import { DESIGN_REQUEST_RATE_LIMITS, DESIGN_REQUEST_STATUSES, mayChangeStatus } from "../../src/lib/rules/design-request"
import { sendReceivedEmail } from "../../src/workflows/design-request/design-requests"

jest.setTimeout(300 * 1000)

const ADMIN_EMAIL = "design-test-admin@example.com"
const ADMIN_PASSWORD = "design-test-password"

type Headers = Record<string, string>

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("Design requests", () => {
      let headers: Headers
      let adminHeaders: Headers
      let adminUserId: string
      let counter = 0
      const allow = { validateStatus: () => true }
      const originalHops = process.env.TRUSTED_PROXY_HOPS

      beforeAll(async () => {
        const { publishableKey } = await seedStore(getContainer(), { nodeEnv: "test", adminEmail: ADMIN_EMAIL, adminPassword: ADMIN_PASSWORD })
        headers = { "x-publishable-api-key": publishableKey }
        const { data: login } = await api.post("/auth/user/emailpass", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
        adminHeaders = { authorization: `Bearer ${login.token}` }
        adminUserId = (await api.get("/admin/users/me", { headers: adminHeaders })).data.user.id
      })

      afterAll(() => {
        if (originalHops === undefined) delete process.env.TRUSTED_PROXY_HOPS
        else process.env.TRUSTED_PROXY_HOPS = originalHops
      })

      async function signIn(): Promise<{ headers: Headers; email: string; id: string }> {
        counter += 1
        const email = `team-${counter}-${Date.now()}@example.com`
        const password = "customer-test-password"
        const { data: registered } = await api.post("/auth/customer/emailpass/register", { email, password })
        const created = await api.post("/store/customers", { email, first_name: "Ali", last_name: "Khan" }, { headers: { ...headers, authorization: `Bearer ${registered.token}` } })
        const { data: login } = await api.post("/auth/customer/emailpass", { email, password })
        return { headers: { ...headers, authorization: `Bearer ${login.token}` }, email, id: created.data.customer.id }
      }

      const form = (extra: Record<string, unknown> = {}) => ({
        team_name: "Lahore Lions",
        contact_name: "Ali Khan",
        email: `ali-${++counter}-${Date.now()}@example.com`,
        region: "pk",
        message: "We want a green and white home jersey with a lion on the chest.",
        ...extra,
      })
      const post = (body: unknown, as: Headers = headers, extraHeaders: Headers = {}) =>
        api.post("/store/design-requests", body, { headers: { ...as, ...extraHeaders }, ...allow })
      const adminGet = (path: string) => api.get(path, { headers: adminHeaders, ...allow })
      const adminPost = (path: string, body: unknown) => api.post(path, body, { headers: adminHeaders, ...allow })
      async function sql(statement: string, bindings: unknown[] = []) {
        const knex = getContainer().resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
        return (await knex.raw(statement, bindings)).rows as any[]
      }
      const rows = (reference?: string) =>
        reference ? sql(`SELECT * FROM design_request WHERE reference = ?`, [reference]) : sql(`SELECT * FROM design_request ORDER BY created_at`)
      const idOf = async (reference: string) => (await rows(reference))[0].id as string
      const notificationsFor = async (id: string) =>
        (await getContainer().resolve(Modules.NOTIFICATION).listNotifications({ resource_id: id })) as any[]

      describe("a visitor's request", () => {
        it("is received with a reference, stored as new with no customer, and its text kept as typed", async () => {
          const body = form({
            team_name: "پاکستان کلب",
            contact_name: "علی خان",
            phone: "+92 300 1234567",
            product: "jersey",
            pieces: 25,
            need_by_date: "2099-01-31",
            reference_links: ["https://example.com/lion.png"],
            message: "ہمیں سبز اور سفید جرسی چاہیے۔\n\nشیر کا نشان اور لاہور لکھا ہو۔",
          })
          const answer = await post(body)
          expect(answer.status).toBe(201)
          expect(answer.data).toEqual({ design_request: { reference: expect.stringMatching(/^DR-[A-HJ-NP-Z2-9]{8}$/u), status: "new", status_label: "Received" } })
          const [row] = await rows(answer.data.design_request.reference)
          expect(row).toMatchObject({
            team_name: "پاکستان کلب",
            contact_name: "علی خان",
            email: body.email,
            phone: "+92 300 1234567",
            product: "jersey",
            pieces: 25,
            need_by_date: "2099-01-31",
            region: "pk",
            status: "new",
            customer_id: null,
            staff_notes: null,
            assigned_to: null,
            reference_links: ["https://example.com/lion.png"],
            message: "ہمیں سبز اور سفید جرسی چاہیے۔\n\nشیر کا نشان اور لاہور لکھا ہو۔",
          })
          expect(row.ip_hash).toMatch(/^[0-9a-f]{32}$/u)
          expect(JSON.stringify(row)).not.toContain("127.0.0.1")
        })

        it("gives each request its own reference", async () => {
          const first = await post(form())
          const second = await post(form())
          expect(first.data.design_request.reference).not.toBe(second.data.design_request.reference)
        })

        it("needs no sign-in but does need the publishable key, like every store route", async () => {
          expect((await api.post("/store/design-requests", form(), allow)).status).toBe(400)
          expect((await post(form())).status).toBe(201)
        })

        it("stores HTML as text, untouched, and the admin answer carries it as a plain string", async () => {
          const message = `<script>alert("hi")</script> and <img src=x onerror=alert(1)> text`
          const answer = await post(form({ team_name: "<b>Bold FC</b>", message }))
          expect(answer.status).toBe(201)
          const id = await idOf(answer.data.design_request.reference)
          const detail = await adminGet(`/admin/design-requests/${id}`)
          expect(detail.data.design_request.message).toBe(message)
          expect(detail.data.design_request.team_name).toBe("<b>Bold FC</b>")
        })

        it("ignores a status, a customer or a reference sent in the body", async () => {
          const answer = await post(form({ status: "done", customer_id: "cus_x", reference: "DR-AAAAAAAA", staff_notes: "mine", assigned_to: adminUserId }))
          expect(answer.status).toBe(201)
          const [row] = await rows(answer.data.design_request.reference)
          expect(row).toMatchObject({ status: "new", customer_id: null, staff_notes: null, assigned_to: null })
          expect(row.reference).not.toBe("DR-AAAAAAAA")
        })
      })

      describe("a signed-in customer's request", () => {
        it("is linked to them, and they read only their own", async () => {
          const ali = await signIn()
          const bilal = await signIn()
          const mine = await post(form({ team_name: "Ali's team" }), ali.headers)
          expect(mine.status).toBe(201)
          await post(form({ team_name: "Bilal's team" }), bilal.headers)
          await post(form({ team_name: "A visitor's team" }))
          const [row] = await rows(mine.data.design_request.reference)
          expect(row.customer_id).toBe(ali.id)

          const list = await api.get("/store/design-requests", { headers: ali.headers })
          expect(list.status).toBe(200)
          expect(list.data.count).toBe(1)
          expect(list.data.design_requests[0]).toMatchObject({ reference: mine.data.design_request.reference, team_name: "Ali's team", status: "new", status_label: "Received" })
          expect(JSON.stringify(list.data)).not.toMatch(/Bilal|visitor/u)
          const other = await api.get("/store/design-requests", { headers: bilal.headers })
          expect(other.data.design_requests.map((r: any) => r.team_name)).toEqual(["Bilal's team"])
        })

        it("needs sign-in to read the list", async () => {
          expect((await api.get("/store/design-requests", { headers, ...allow })).status).toBe(401)
          expect((await api.get("/store/design-requests", { headers: { ...headers, authorization: "Bearer nonsense" }, ...allow })).status).toBe(401)
        })

        it("shows the plain status as staff move it, and never staff notes, assignee, steps or addresses", async () => {
          const ali = await signIn()
          const made = await post(form({ message: "Please make it blue with a white stripe." }), ali.headers)
          const reference = made.data.design_request.reference
          const id = await idOf(reference)
          expect((await adminPost(`/admin/design-requests/${id}/notes`, { staff_notes: "TOP SECRET: difficult customer" })).status).toBe(200)
          expect((await adminPost(`/admin/design-requests/${id}/status`, { status: "in_progress" })).status).toBe(200)
          const list = await api.get("/store/design-requests", { headers: ali.headers })
          const [mine] = list.data.design_requests
          expect(mine).toMatchObject({ status: "in_progress", status_label: "Our designer is working on it" })
          expect(Object.keys(mine).sort()).toEqual(
            ["created_at", "message", "need_by_date", "pieces", "product", "reference", "reference_links", "region", "status", "status_label", "team_name", "updated_at"].sort()
          )
          const text = JSON.stringify(list.data)
          expect(text).not.toMatch(/SECRET|staff_notes|assigned_to|ip_hash|email|steps|customer_id|user_/u)
          expect(JSON.stringify(made.data)).not.toMatch(/SECRET|staff|email/u)
        })

        it("treats a token of a deleted customer as a visitor on the open form", async () => {
          const gone = await signIn()
          await getContainer().resolve(Modules.CUSTOMER).deleteCustomers([gone.id])
          const answer = await post(form(), gone.headers)
          expect(answer.status).toBe(201)
          expect((await rows(answer.data.design_request.reference))[0].customer_id).toBeNull()
        })
      })

      describe("every invalid field", () => {
        const cases: [string, Record<string, unknown>, string][] = [
          ["team_name_invalid", { team_name: "" }, "team_name"],
          ["team_name_invalid", { team_name: "x".repeat(101) }, "team_name"],
          ["team_name_invalid", { team_name: "bad\u0007name" }, "team_name"],
          ["team_name_invalid", { team_name: 12 }, "team_name"],
          ["contact_name_invalid", { contact_name: "   " }, "contact_name"],
          ["email_invalid", { email: "not-an-email" }, "email"],
          ["email_invalid", { email: "a@b" }, "email"],
          ["email_invalid", { email: undefined }, "email"],
          ["phone_invalid", { phone: "call me" }, "phone"],
          ["product_invalid", { product: "hat" }, "product"],
          ["pieces_invalid", { pieces: 0 }, "pieces"],
          ["pieces_invalid", { pieces: 1.5 }, "pieces"],
          ["pieces_invalid", { pieces: 10001 }, "pieces"],
          ["need_by_date_invalid", { need_by_date: "31/12/2099" }, "need_by_date"],
          ["need_by_date_in_past", { need_by_date: "2020-01-01" }, "need_by_date"],
          ["region_invalid", { region: "fr" }, "region"],
          ["message_invalid", { message: "short" }, "message"],
          ["message_invalid", { message: "x".repeat(2001) }, "message"],
          ["reference_links_invalid", { reference_links: ["javascript:alert(1)"] }, "reference_links"],
          ["reference_links_invalid", { reference_links: ["ftp://example.com/a"] }, "reference_links"],
          ["reference_links_invalid", { reference_links: ["https://user:pw@example.com/a"] }, "reference_links"],
          ["reference_links_invalid", { reference_links: "https://example.com" }, "reference_links"],
          ["reference_links_invalid", { reference_links: ["https://a.example", "https://b.example", "https://c.example", "https://d.example"] }, "reference_links"],
        ]
        it.each(cases)("%s for %j", async (code, extra, field) => {
          const answer = await post(form(extra))
          expect(answer.status).toBe(400)
          expect(answer.data).toMatchObject({ type: "invalid_data", code, field })
          expect(answer.data.message.length).toBeGreaterThan(10)
          expect(await rows()).toHaveLength(0)
        })

        it("refuses a body that is not an object, and a NUL character, and a body that is too large", async () => {
          expect((await post([1, 2, 3])).status).toBe(400)
          expect((await post(form({ message: "hello there\u0000 and more words" }))).data.code).toBe("text_contains_null_character")
          const big = await post(form({ message: "x".repeat(20 * 1024) }))
          expect(big.status).toBe(413)
          expect(big.data).toMatchObject({ code: "request_too_large" })
          expect(await rows()).toHaveLength(0)
        })

        it("takes a need-by date of today", async () => {
          const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date())
          expect((await post(form({ need_by_date: today }))).status).toBe(201)
        })
      })

      describe("the trap field", () => {
        it("discards a request that fills it in, with the same answer as a real one", async () => {
          const real = await post(form())
          const trapped = await post(form({ website: "http://spam.example" }))
          expect(trapped.status).toBe(real.status)
          expect(Object.keys(trapped.data)).toEqual(Object.keys(real.data))
          expect(trapped.data.design_request).toEqual({ reference: expect.stringMatching(/^DR-[A-HJ-NP-Z2-9]{8}$/u), status: "new", status_label: "Received" })
          expect(await rows(trapped.data.design_request.reference)).toHaveLength(0)
          expect(await rows()).toHaveLength(1)
          // even with fields that would be refused: the trap is looked at first
          const bad = await post({ website: "x", team_name: "" })
          expect(bad.status).toBe(201)
          expect(await rows()).toHaveLength(1)
          expect(await sql(`SELECT 1 FROM design_request_email`)).toHaveLength(1)
        })

        it("is empty text, null or absent in an honest request", async () => {
          expect((await post(form({ website: "" }))).status).toBe(201)
          expect((await post(form({ website: null }))).status).toBe(201)
          expect(await rows()).toHaveLength(2)
        })
      })

      describe("the limits", () => {
        it("stop a fourth request for the same email, with the same answer whether or not the email is known", async () => {
          process.env.TRUSTED_PROXY_HOPS = "1"
          const known = await signIn()
          const email = known.email
          const answers = []
          for (let i = 0; i < DESIGN_REQUEST_RATE_LIMITS.perEmail.max; i++) answers.push(await post(form({ email }), headers, { "x-forwarded-for": "203.0.113.21" }))
          expect(answers.map((a) => a.status)).toEqual([201, 201, 201])
          const refused = await post(form({ email: email.toUpperCase().replace("@EXAMPLE.COM", "@example.com") }), headers, { "x-forwarded-for": "203.0.113.22" })
          expect(refused.status).toBe(429)
          expect(refused.data).toEqual({ type: "not_allowed", code: "rate_limited", message: "Too many requests. Please try again later." })

          const unknownEmail = `nobody-${Date.now()}@example.org`
          for (let i = 0; i < DESIGN_REQUEST_RATE_LIMITS.perEmail.max; i++) await post(form({ email: unknownEmail }), headers, { "x-forwarded-for": "203.0.113.23" })
          const refusedUnknown = await post(form({ email: unknownEmail }), headers, { "x-forwarded-for": "203.0.113.24" })
          expect(refusedUnknown.status).toBe(refused.status)
          expect(refusedUnknown.data).toEqual(refused.data)
          expect(JSON.stringify(refused.data)).not.toMatch(/email|address|known|account/iu)
          expect(await rows()).toHaveLength(6)
          delete process.env.TRUSTED_PROXY_HOPS
        })

        it("stop a sixth request from one address, with the same answer, while another address is fine", async () => {
          process.env.TRUSTED_PROXY_HOPS = "1"
          const at = (ip: string) => ({ "x-forwarded-for": ip })
          for (let i = 0; i < DESIGN_REQUEST_RATE_LIMITS.perAddress.max; i++) {
            expect((await post(form(), headers, at("203.0.113.7"))).status).toBe(201)
          }
          const refused = await post(form(), headers, at("203.0.113.7"))
          expect(refused.status).toBe(429)
          expect(refused.data).toEqual({ type: "not_allowed", code: "rate_limited", message: "Too many requests. Please try again later." })
          expect((await post(form(), headers, at("203.0.113.8"))).status).toBe(201)
          expect(await rows()).toHaveLength(6)
          // a spoofed left-most entry does not move the address: the one our proxy appended counts
          const spoof = await post(form(), headers, at("198.51.100.1, 203.0.113.7"))
          expect(spoof.status).toBe(429)
          delete process.env.TRUSTED_PROXY_HOPS
        })

        it("hold when requests arrive at the same moment", async () => {
          const email = `race-${Date.now()}@example.com`
          const answers = await Promise.all(Array.from({ length: 8 }, () => post(form({ email }))))
          expect(answers.filter((a) => a.status === 201)).toHaveLength(DESIGN_REQUEST_RATE_LIMITS.perEmail.max)
          expect(answers.filter((a) => a.status === 429)).toHaveLength(8 - DESIGN_REQUEST_RATE_LIMITS.perEmail.max)
        })

        it("count again after the window has passed", async () => {
          const email = `window-${Date.now()}@example.com`
          for (let i = 0; i < DESIGN_REQUEST_RATE_LIMITS.perEmail.max; i++) await post(form({ email }))
          expect((await post(form({ email }))).status).toBe(429)
          await sql(`UPDATE design_request SET created_at = now() - interval '25 hours' WHERE email_key = ?`, [email])
          expect((await post(form({ email }))).status).toBe(201)
        })
      })

      describe("the confirmation email", () => {
        it("is sent once to the requester through a record, and says nothing but that the request was received", async () => {
          const body = form()
          const answer = await post(body)
          const id = await idOf(answer.data.design_request.reference)
          const sent = await notificationsFor(id)
          expect(sent).toHaveLength(1)
          expect(sent[0]).toMatchObject({ to: body.email, channel: "email", template: "design-request-received" })
          expect(sent[0].data.text).toContain(answer.data.design_request.reference)
          expect(sent[0].data.text).not.toMatch(/\b(hours?|days?|weeks?|within)\b/iu)
          const records = await sql(`SELECT status, attempts, last_error FROM design_request_email WHERE design_request_id = ?`, [id])
          expect(records).toEqual([{ status: "sent", attempts: 1, last_error: null }])
          expect(JSON.stringify(records)).not.toContain(body.email)
          // sending again does nothing
          const again = await sendReceivedEmail(getContainer(), { id, reference: answer.data.design_request.reference, email: body.email, contactName: "Ali", teamName: "Lions" })
          expect(again).toBe("skipped")
          expect(await notificationsFor(id)).toHaveLength(1)
        })

        it("is not tried again at the same moment by two calls: one row, one email", async () => {
          const answer = await post(form())
          const id = await idOf(answer.data.design_request.reference)
          await sql(`DELETE FROM design_request_email WHERE design_request_id = ?`, [id])
          const results = await Promise.all([1, 2, 3].map(() => sendReceivedEmail(getContainer(), { id, reference: "DR-AAAAAAAA", email: "x@example.com", contactName: "A", teamName: "T" })))
          expect(results.filter((r) => r === "sent")).toHaveLength(1)
          expect(await sql(`SELECT 1 FROM design_request_email WHERE design_request_id = ?`, [id])).toHaveLength(1)
        })

        it("records a failed send by the error's name only, and never fails the request", async () => {
          const notifications = getContainer().resolve(Modules.NOTIFICATION) as any
          const spy = jest.spyOn(notifications, "createNotifications").mockRejectedValueOnce(Object.assign(new Error("provider says: ali@example.com is bad"), { name: "ProviderDown" }))
          try {
            const answer = await post(form())
            expect(answer.status).toBe(201)
            const id = await idOf(answer.data.design_request.reference)
            expect(await sql(`SELECT status, last_error FROM design_request_email WHERE design_request_id = ?`, [id])).toEqual([{ status: "failed", last_error: "ProviderDown" }])
          } finally {
            spy.mockRestore()
          }
        })

        it("is withheld outside development and tests: no notification, no record", async () => {
          const before = process.env.NODE_ENV
          const answer = await post(form())
          const id = await idOf(answer.data.design_request.reference)
          await sql(`DELETE FROM design_request_email WHERE design_request_id = ?`, [id])
          process.env.NODE_ENV = "production"
          try {
            expect(await sendReceivedEmail(getContainer(), { id, reference: "DR-AAAAAAAA", email: "x@example.com", contactName: "A", teamName: "T" })).toBe("withheld")
          } finally {
            process.env.NODE_ENV = before
          }
          expect(await sql(`SELECT 1 FROM design_request_email WHERE design_request_id = ?`, [id])).toHaveLength(0)
        })
      })

      describe("the admin's queue", () => {
        async function make(extra: Record<string, unknown> = {}, as: Headers = headers) {
          const answer = await post(form(extra), as)
          expect(answer.status).toBe(201)
          const reference = answer.data.design_request.reference as string
          return { reference, id: await idOf(reference) }
        }

        it("needs an admin user", async () => {
          const one = await make()
          for (const path of ["/admin/design-requests", `/admin/design-requests/${one.id}`]) {
            expect((await api.get(path, { validateStatus: () => true })).status).toBe(401)
            expect((await api.get(path, { headers, ...allow })).status).toBe(401)
          }
          const customer = await signIn()
          expect((await api.get("/admin/design-requests", { headers: customer.headers, ...allow })).status).toBe(401)
          expect((await api.post(`/admin/design-requests/${one.id}/status`, { status: "in_progress" }, { headers: customer.headers, ...allow })).status).toBe(401)
        })

        it("lists newest first, filters by status and counts the new ones", async () => {
          const a = await make({ team_name: "First" })
          const b = await make({ team_name: "Second" })
          const c = await make({ team_name: "Third" })
          await adminPost(`/admin/design-requests/${b.id}/status`, { status: "in_progress" })
          const all = await adminGet("/admin/design-requests")
          expect(all.status).toBe(200)
          expect(all.data.design_requests.map((r: any) => r.team_name)).toEqual(["Third", "Second", "First"])
          expect(all.data).toMatchObject({ count: 3, new_count: 2, counts: { new: 2, in_progress: 1, proof_sent: 0, done: 0 } })
          expect(all.data.design_requests[0]).not.toHaveProperty("message")
          const inProgress = await adminGet("/admin/design-requests?status=in_progress")
          expect(inProgress.data.design_requests.map((r: any) => r.reference)).toEqual([b.reference])
          expect(inProgress.data.count).toBe(1)
          expect(inProgress.data.counts.new).toBe(2)
          const paged = await adminGet("/admin/design-requests?limit=1&offset=1")
          expect(paged.data.design_requests.map((r: any) => r.team_name)).toEqual(["Second"])
          expect(paged.data.count).toBe(3)
          expect((await adminGet("/admin/design-requests?status=closed")).data.code).toBe("status_invalid")
          expect((await adminGet("/admin/design-requests?limit=0")).data.code).toBe("paging_invalid")
          expect((await adminGet("/admin/design-requests?limit=abc")).data.code).toBe("paging_invalid")
          void a
          void c
        })

        it("shows one request with everything sent, as text", async () => {
          const one = await make({ phone: "0300 1234567", pieces: 12, product: "jacket", reference_links: ["https://example.com/a?b=1"] })
          const detail = await adminGet(`/admin/design-requests/${one.id}`)
          expect(detail.status).toBe(200)
          expect(detail.data.design_request).toMatchObject({
            id: one.id,
            reference: one.reference,
            status: "new",
            status_label: "New",
            phone: "0300 1234567",
            pieces: 12,
            product: "jacket",
            reference_links: ["https://example.com/a?b=1"],
            customer_id: null,
            staff_notes: null,
            assigned_to: null,
          })
          expect(detail.data).toMatchObject({ steps: [], customer: null, team_orders: [], allowed_next: [{ to: "in_progress", label: "In progress" }] })
          expect(JSON.stringify(detail.data)).not.toContain("ip_hash")
        })

        it("answers 404 for an unknown id, and for an id with a NUL or a broken escape", async () => {
          for (const id of ["dreq_nope", "dreq_%00x", "dreq_%"]) {
            const answer = await adminGet(`/admin/design-requests/${id}`)
            expect(answer.status).toBe(404)
            expect(answer.data.code).toBe("design_request_not_found")
          }
          expect((await adminPost("/admin/design-requests/dreq_nope/status", { status: "in_progress" })).status).toBe(404)
          expect((await adminPost("/admin/design-requests/dreq_nope/notes", { staff_notes: "x" })).status).toBe(404)
        })

        describe("each status step", () => {
          const pairs = DESIGN_REQUEST_STATUSES.flatMap((from) => DESIGN_REQUEST_STATUSES.map((to) => [from, to] as const))
          const path: Record<string, string[]> = {
            new: [],
            in_progress: ["in_progress"],
            proof_sent: ["in_progress", "proof_sent"],
            done: ["in_progress", "proof_sent", "done"],
          }
          it.each(pairs)("%s -> %s", async (from, to) => {
            const one = await make()
            for (const step of path[from]!) expect((await adminPost(`/admin/design-requests/${one.id}/status`, { status: step })).status).toBe(200)
            const stepsBefore = (await adminGet(`/admin/design-requests/${one.id}`)).data.steps.length
            const answer = await adminPost(`/admin/design-requests/${one.id}/status`, { status: to })
            if (mayChangeStatus(from, to)) {
              expect(answer.status).toBe(200)
              expect(answer.data.design_request.status).toBe(to)
              expect(answer.data.steps).toHaveLength(stepsBefore + 1)
              expect(answer.data.steps.at(-1)).toMatchObject({ from, to, by: adminUserId, by_email: ADMIN_EMAIL })
            } else {
              expect(answer.status).toBe(400)
              expect(answer.data).toMatchObject({ type: "not_allowed", code: "status_not_allowed", from, to })
              expect(answer.data.allowed).toEqual(expect.any(Array))
              expect((await adminGet(`/admin/design-requests/${one.id}`)).data.steps).toHaveLength(stepsBefore)
              expect((await adminGet(`/admin/design-requests/${one.id}`)).data.design_request.status).toBe(from)
            }
          })

          it("refuses a status that does not exist", async () => {
            const one = await make()
            for (const status of ["closed", "", null, undefined, 3]) {
              const answer = await adminPost(`/admin/design-requests/${one.id}/status`, { status })
              expect(answer.status).toBe(400)
              expect(answer.data.code).toBe("status_invalid")
            }
          })

          it("records every change: who, from, to, when, in order", async () => {
            const one = await make()
            const walk = ["in_progress", "proof_sent", "done", "in_progress", "new"]
            for (const status of walk) expect((await adminPost(`/admin/design-requests/${one.id}/status`, { status })).status).toBe(200)
            const detail = await adminGet(`/admin/design-requests/${one.id}`)
            expect(detail.data.steps.map((s: any) => `${s.from}>${s.to}`)).toEqual([
              "new>in_progress",
              "in_progress>proof_sent",
              "proof_sent>done",
              "done>in_progress",
              "in_progress>new",
            ])
            for (const step of detail.data.steps) {
              expect(step).toMatchObject({ by: adminUserId, by_email: ADMIN_EMAIL })
              expect(new Date(step.at).getTime()).toBeGreaterThan(Date.now() - 600000)
            }
            const times = detail.data.steps.map((s: any) => new Date(s.at).getTime())
            expect([...times].sort((x: number, y: number) => x - y)).toEqual(times)
          })

          it("makes the admin the one working on it at the first move to in progress", async () => {
            const one = await make()
            expect((await adminGet(`/admin/design-requests/${one.id}`)).data.design_request.assigned_to).toBeNull()
            const moved = await adminPost(`/admin/design-requests/${one.id}/status`, { status: "in_progress" })
            expect(moved.data.design_request).toMatchObject({ assigned_to: adminUserId, assigned_to_email: ADMIN_EMAIL })
            const letGo = await adminPost(`/admin/design-requests/${one.id}/assign`, { assign: false })
            expect(letGo.data.design_request.assigned_to).toBeNull()
            expect((await adminPost(`/admin/design-requests/${one.id}/assign`, { assign: "yes" })).data.code).toBe("assign_invalid")
            const taken = await adminPost(`/admin/design-requests/${one.id}/assign`, { assign: true })
            expect(taken.data.design_request.assigned_to).toBe(adminUserId)
          })

          it("lets one of two changes at the same moment win, and records one step", async () => {
            const one = await make()
            const answers = await Promise.all([1, 2, 3, 4].map(() => adminPost(`/admin/design-requests/${one.id}/status`, { status: "in_progress" })))
            expect(answers.filter((a) => a.status === 200)).toHaveLength(1)
            expect(answers.filter((a) => a.status !== 200).every((a) => ["status_not_allowed", "request_changed"].includes(a.data.code))).toBe(true)
            expect(await sql(`SELECT 1 FROM design_request_step WHERE design_request_id = ?`, [one.id])).toHaveLength(1)
          })
        })

        it("keeps staff notes, in the admin only", async () => {
          const one = await make()
          const set = await adminPost(`/admin/design-requests/${one.id}/notes`, { staff_notes: "Called on Monday.\nSend proof Friday." })
          expect(set.status).toBe(200)
          expect(set.data.design_request.staff_notes).toBe("Called on Monday.\nSend proof Friday.")
          expect((await adminPost(`/admin/design-requests/${one.id}/notes`, { staff_notes: 5 })).data.code).toBe("staff_notes_invalid")
          expect((await adminPost(`/admin/design-requests/${one.id}/notes`, { staff_notes: "x".repeat(5001) })).data.code).toBe("staff_notes_invalid")
          const cleared = await adminPost(`/admin/design-requests/${one.id}/notes`, { staff_notes: "  " })
          expect(cleared.data.design_request.staff_notes).toBeNull()
        })

        it("links the customer and their team orders when a signed-in customer asked", async () => {
          const ali = await signIn()
          const one = await make({}, ali.headers)
          await getContainer().resolve<any>("teamOrder").createTeamOrders({
            customer_id: ali.id,
            team_name: "Lions First XI",
            design_id: "design_x",
            design_version_id: "dver_x",
            product_id: "prod_x",
            region_id: "reg_x",
            prints_name: true,
            prints_number: true,
          })
          const detail = await adminGet(`/admin/design-requests/${one.id}`)
          expect(detail.data.customer).toMatchObject({ id: ali.id, email: ali.email, name: "Ali Khan" })
          expect(detail.data.team_orders).toHaveLength(1)
          expect(detail.data.team_orders[0]).toMatchObject({ team_name: "Lions First XI", status: "draft" })
        })
      })
    })
  },
})
