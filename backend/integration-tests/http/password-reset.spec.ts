/**
 * Password reset, backend part (docs/contracts/m1-password-reset.md, section 2): the subscriber on
 * Medusa's `auth.password_reset` asks the Notification Module for one `email` notification with
 * the template `password-reset` and the link, email, actor type and lifetime; nothing for an
 * actor type without a reset page or an unknown email; and in production nothing at all, with one
 * warning that holds neither the token nor the link.
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import { createCustomerAccountWorkflow, createUserAccountWorkflow } from "@medusajs/medusa/core-flows"
import sendPasswordResetLink from "../../src/subscribers/password-reset-link"
import middlewaresConfig, { redactCredentialsInRequestLog } from "../../src/api/middlewares"

jest.setTimeout(300 * 1000)

const STOREFRONT_URL = "http://shop.reset-test.local:8123"
const BACKEND_URL = "http://api.reset-test.local:9123"
/** A customer only. */
const CUSTOMER_EMAIL = "zoë+reset@example.com"
/** An admin user only. */
const USER_EMAIL = "staff.reset@example.com"
/** Both a customer and an admin user (one identity). */
const BOTH_EMAIL = "both.reset@example.com"
const PASSWORD = "first-password-1"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const allow = { validateStatus: () => true }

medusaIntegrationTestRunner({
  env: { STOREFRONT_URL, BACKEND_URL },
  testSuite: ({ api, getContainer }) => {
    describe("password reset link (subscriber on auth.password_reset)", () => {
      /** Every auth.password_reset event seen, so a test can tell "no event" from "no notification". */
      const events: { actor_type: unknown; entity_id: unknown }[] = []

      const notifications = (filter: Record<string, unknown> = {}) =>
        getContainer()
          .resolve(Modules.NOTIFICATION)
          .listNotifications({ template: "password-reset", ...filter }, { order: { created_at: "ASC" } })

      /** Waits until `count` events have been seen and the event bus has had time to run subscribers. */
      async function waitForEvents(count: number) {
        for (let i = 0; i < 100 && events.length < count; i++) {
          await sleep(100)
        }
        expect(events.length).toBe(count)
        await sleep(1500)
      }

      beforeAll(async () => {
        getContainer()
          .resolve(Modules.EVENT_BUS)
          .subscribe("auth.password_reset", async ({ data }: { data: any }) => {
            events.push({ actor_type: data.actor_type, entity_id: data.entity_id })
          })
        // Each email gets its identity (Medusa's register route) and then its account(s), the way
        // the store's sign-up and the admin's invite create them: that writes customer_id / user_id
        // into the identity's app_metadata.
        for (const [email, kinds] of [
          [CUSTOMER_EMAIL, ["customer"]],
          [USER_EMAIL, ["user"]],
          [BOTH_EMAIL, ["customer", "user"]],
        ] as const) {
          const res = await api.post(`/auth/${kinds[0]}/emailpass/register`, { email, password: PASSWORD })
          expect(res.status).toBe(200)
          const authIdentityId = JSON.parse(
            Buffer.from(String(res.data.token).split(".")[1], "base64url").toString("utf8")
          ).auth_identity_id
          for (const kind of kinds) {
            if (kind === "customer") {
              await createCustomerAccountWorkflow(getContainer()).run({
                input: { authIdentityId, customerData: { email } },
              })
            } else {
              await createUserAccountWorkflow(getContainer()).run({
                input: { authIdentityId, userData: { email } },
              })
            }
          }
        }
        const [both] = await getContainer()
          .resolve(Modules.AUTH)
          .listProviderIdentities({ entity_id: BOTH_EMAIL }, { relations: ["auth_identity"] })
        expect(Object.keys(both.auth_identity?.app_metadata ?? {}).sort()).toEqual(["customer_id", "user_id"])
      })

      it("sends a customer one email notification with the storefront's link, and the token works", async () => {
        const res = await api.post(
          "/auth/customer/emailpass/reset-password",
          { identifier: CUSTOMER_EMAIL },
          allow
        )
        expect(res.status).toBe(201)
        await waitForEvents(1)
        const sent = await notifications({ to: CUSTOMER_EMAIL })
        expect(sent).toHaveLength(1)
        const [notification] = sent
        expect(notification).toMatchObject({
          to: CUSTOMER_EMAIL,
          channel: "email",
          template: "password-reset",
          trigger_type: "auth.password_reset",
          provider_id: "local",
          status: "success",
        })
        const data = notification.data as Record<string, any>
        expect(Object.keys(data).sort()).toEqual(["actor_type", "email", "expires_in_minutes", "link"])
        expect(data.email).toBe(CUSTOMER_EMAIL)
        expect(data.actor_type).toBe("customer")
        expect(data.expires_in_minutes).toBe(15)
        const link = new URL(data.link)
        expect(link.origin + link.pathname).toBe(`${STOREFRONT_URL}/account/reset-password`)
        expect(link.searchParams.get("email")).toBe(CUSTOMER_EMAIL)
        expect(data.link).toContain("email=zo%C3%AB%2Breset%40example.com")
        const token = link.searchParams.get("token")!

        const update = await api.post(
          "/auth/customer/emailpass/update",
          { password: "second-password-2" },
          { headers: { authorization: `Bearer ${token}` }, ...allow }
        )
        expect(update.status).toBe(200)
        expect(update.data).toEqual({ success: true })
        const oldLogin = await api.post(
          "/auth/customer/emailpass",
          { email: CUSTOMER_EMAIL, password: PASSWORD },
          allow
        )
        expect(oldLogin.status).toBe(401)
        const newLogin = await api.post(
          "/auth/customer/emailpass",
          { email: CUSTOMER_EMAIL, password: "second-password-2" },
          allow
        )
        expect(newLogin.status).toBe(200)
      })

      it("sends an admin user the admin's own reset page", async () => {
        const res = await api.post("/auth/user/emailpass/reset-password", { identifier: USER_EMAIL }, allow)
        expect(res.status).toBe(201)
        await waitForEvents(2)
        const sent = await notifications({ to: USER_EMAIL })
        expect(sent).toHaveLength(1)
        const data = sent[0].data as Record<string, any>
        expect(data.actor_type).toBe("user")
        expect(data.expires_in_minutes).toBe(15)
        const link = new URL(data.link)
        expect(link.origin + link.pathname).toBe(`${BACKEND_URL}/app/reset-password`)
        // In the fragment, never in the query: a browser does not send it to the server.
        expect(link.search).toBe("")
        const fragment = new URLSearchParams(link.hash.slice(1))
        expect([...fragment.keys()]).toEqual(["token", "email"])
        expect(fragment.get("email")).toBe(USER_EMAIL)
        const token = fragment.get("token")!
        expect(token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/)
        const update = await api.post(
          "/auth/user/emailpass/update",
          { password: "second-password-2" },
          { headers: { authorization: `Bearer ${token}` }, ...allow }
        )
        expect(update.status).toBe(200)
      })

      it("sends nothing for an actor type without a reset page, though Medusa emits the event", async () => {
        const before = (await notifications()).length
        const res = await api.post(
          "/auth/vendor/emailpass/reset-password",
          { identifier: CUSTOMER_EMAIL },
          allow
        )
        expect(res.status).toBe(201)
        await waitForEvents(3)
        expect(events[2]).toEqual({ actor_type: "vendor", entity_id: CUSTOMER_EMAIL })
        expect(await notifications()).toHaveLength(before)
      })

      it("sends nothing for an unknown email (Medusa emits no event) and answers the same", async () => {
        const before = (await notifications()).length
        const res = await api.post(
          "/auth/customer/emailpass/reset-password",
          { identifier: "nobody@example.com" },
          allow
        )
        expect(res.status).toBe(201)
        await sleep(2000)
        expect(events).toHaveLength(3)
        expect(await notifications()).toHaveLength(before)
      })

      describe("only for an account of the asked kind (QA's fifteenth review, B1)", () => {
        it("sends a customer-only email nothing through the admin route", async () => {
          const before = (await notifications()).length
          const res = await api.post("/auth/user/emailpass/reset-password", { identifier: CUSTOMER_EMAIL }, allow)
          expect(res.status).toBe(201)
          await waitForEvents(4)
          expect(events[3]).toEqual({ actor_type: "user", entity_id: CUSTOMER_EMAIL })
          expect(await notifications()).toHaveLength(before)
        })

        it("sends an admin-only email nothing through the customer route", async () => {
          const before = (await notifications()).length
          const res = await api.post("/auth/customer/emailpass/reset-password", { identifier: USER_EMAIL }, allow)
          expect(res.status).toBe(201)
          await waitForEvents(5)
          expect(events[4]).toEqual({ actor_type: "customer", entity_id: USER_EMAIL })
          expect(await notifications()).toHaveLength(before)
        })

        it("sends an email that is both the kind of link asked for", async () => {
          expect(await notifications({ to: BOTH_EMAIL })).toHaveLength(0)
          const asCustomer = await api.post(
            "/auth/customer/emailpass/reset-password",
            { identifier: BOTH_EMAIL },
            allow
          )
          expect(asCustomer.status).toBe(201)
          await waitForEvents(6)
          const asUser = await api.post("/auth/user/emailpass/reset-password", { identifier: BOTH_EMAIL }, allow)
          expect(asUser.status).toBe(201)
          await waitForEvents(7)
          const sent = await notifications({ to: BOTH_EMAIL })
          expect(sent.map((n) => (n.data as Record<string, any>).actor_type)).toEqual(["customer", "user"])
          const [customerLink, userLink] = sent.map((n) => new URL((n.data as Record<string, any>).link))
          expect(customerLink.origin + customerLink.pathname).toBe(`${STOREFRONT_URL}/account/reset-password`)
          expect(userLink.origin + userLink.pathname).toBe(`${BACKEND_URL}/app/reset-password`)
        })
      })

      describe("request log (QA's fifteenth review, B2)", () => {
        it("runs the redaction middleware for every request, ahead of the routes", () => {
          const entry = middlewaresConfig.routes?.find((route) =>
            (route.middlewares as unknown[] | undefined)?.includes(redactCredentialsInRequestLog)
          )
          expect(entry).toEqual({ matcher: "/", middlewares: [redactCredentialsInRequestLog] })
          expect(middlewaresConfig.routes?.[0]).toBe(entry)
        })

        it("hands Medusa's request log a redacted address and referrer, and leaves routing alone", () => {
          const req = {
            url: "/auth/user/emailpass/update?token=a.b.c",
            originalUrl: "/auth/user/emailpass/update?token=a.b.c",
            headers: { referer: "https://api.example.com/app/reset-password?token=a.b.c&email=x" },
          }
          const next = jest.fn()
          redactCredentialsInRequestLog(req as never, {} as never, next)
          expect(next).toHaveBeenCalledWith()
          expect(req.originalUrl).toBe("/auth/user/emailpass/update?token=[redacted]")
          expect(req.headers.referer).toBe("https://api.example.com/app/reset-password?token=[redacted]&email=x")
          expect(req.url).toBe("/auth/user/emailpass/update?token=a.b.c")
        })

        it("a reset still works through the middleware when the Referer carries the token", async () => {
          const res = await api.post("/auth/customer/emailpass/reset-password", { identifier: CUSTOMER_EMAIL }, allow)
          expect(res.status).toBe(201)
          await waitForEvents(8)
          const [last] = (await notifications({ to: CUSTOMER_EMAIL })).slice(-1)
          const link = (last.data as Record<string, any>).link as string
          const token = new URL(link).searchParams.get("token")!
          const update = await api.post(
            "/auth/customer/emailpass/update",
            { password: "third-password-3" },
            { headers: { authorization: `Bearer ${token}`, referer: link }, ...allow }
          )
          expect(update.status).toBe(200)
        })
      })

      describe("a token works once, also for two updates at the same moment (QA's fifteenth review, S3)", () => {
        it("answers one of two simultaneous updates with 200 and the other with 401, in 5 rounds of 5", async () => {
          for (let round = 0; round < 5; round++) {
            const before = (await notifications({ to: CUSTOMER_EMAIL })).length
            const res = await api.post("/auth/customer/emailpass/reset-password", { identifier: CUSTOMER_EMAIL }, allow)
            expect(res.status).toBe(201)
            await waitForEvents(9 + round)
            const sent = await notifications({ to: CUSTOMER_EMAIL })
            expect(sent).toHaveLength(before + 1)
            const token = new URL((sent[sent.length - 1].data as Record<string, any>).link).searchParams.get("token")!
            const statuses = await Promise.all(
              [0, 1, 2, 3, 4].map((i) =>
                api
                  .post(
                    "/auth/customer/emailpass/update",
                    { password: `round-${round}-password-${i}` },
                    { headers: { authorization: `Bearer ${token}` }, ...allow }
                  )
                  .then((r: { status: number }) => r.status)
              )
            )
            expect(statuses.sort()).toEqual([200, 401, 401, 401, 401])
          }
        })
      })

      describe("called directly", () => {
        const token =
          "eyJhbGciOiJIUzI1NiJ9." +
          Buffer.from(JSON.stringify({ iat: 1000, exp: 1900 })).toString("base64url") +
          ".c2lnbmF0dXJl"

        /**
         * The real container, with a recording logger and notification module, and an auth module
         * whose one identity has `appMetadata` (or whose lookup throws `lookupError`).
         */
        function fakeContainer(
          options: { appMetadata?: unknown; lookupError?: Error } = { appMetadata: { customer_id: "cus_1" } }
        ) {
          const log = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
          const createNotifications = jest.fn()
          const auth = {
            listProviderIdentities: jest.fn(async () => {
              if (options.lookupError) throw options.lookupError
              return [{ auth_identity_id: "authid_1" }]
            }),
            retrieveAuthIdentity: jest.fn(async () => ({ id: "authid_1", app_metadata: options.appMetadata })),
          }
          const container = {
            resolve: (key: string) => {
              if (key === "logger") return log
              if (key === Modules.NOTIFICATION) return { createNotifications }
              if (key === Modules.AUTH) return auth
              return getContainer().resolve(key)
            },
          }
          return { log, createNotifications, auth, container }
        }

        async function run(data: Record<string, unknown>, container: unknown) {
          await sendPasswordResetLink({
            event: { name: "auth.password_reset", data },
            container,
            pluginOptions: {},
          } as never)
        }

        it("in production sends nothing and logs one warning without the token or link", async () => {
          const saved = { ...process.env }
          Object.assign(process.env, {
            NODE_ENV: "production",
            STOREFRONT_URL: "https://shop.example.com",
            BACKEND_URL: "https://api.example.com",
          })
          try {
            const { log, createNotifications, container } = fakeContainer()
            await run({ entity_id: "secret.person@example.org", actor_type: "customer", token }, container)
            expect(createNotifications).not.toHaveBeenCalled()
            expect(log.warn).toHaveBeenCalledTimes(1)
            expect(log.info).not.toHaveBeenCalled()
            expect(log.error).not.toHaveBeenCalled()
            const line = String(log.warn.mock.calls[0][0])
            expect(line).toContain("customer account at example.org was not sent")
            expect(line).not.toContain(token)
            expect(line).not.toContain(token.split(".")[1])
            expect(line).not.toMatch(/secret\.person|reset-password\?|https?:\/\//)
          } finally {
            for (const key of ["NODE_ENV", "STOREFRONT_URL", "BACKEND_URL"]) {
              if (saved[key] === undefined) delete process.env[key]
              else process.env[key] = saved[key]
            }
          }
        })

        it.each([
          ["production", "production"],
          ["staging", "staging"],
          ["Production", "Production"],
          ["Development", "Development"],
          ["blank", "   "],
          ["empty", ""],
          ["unset", undefined],
        ])(
          "with NODE_ENV %s creates no notification row (real modules, a real customer account)",
          async (_name, NODE_ENV) => {
            const saved = { ...process.env }
            Object.assign(process.env, {
              STOREFRONT_URL: "https://shop.example.com",
              BACKEND_URL: "https://api.example.com",
            })
            if (NODE_ENV === undefined) delete process.env.NODE_ENV
            else process.env.NODE_ENV = NODE_ENV
            try {
              const log = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
              const container = {
                resolve: (key: string) => (key === "logger" ? log : getContainer().resolve(key)),
              }
              const rowsBefore = await getContainer().resolve(Modules.NOTIFICATION).listNotifications({})
              await run({ entity_id: CUSTOMER_EMAIL, actor_type: "customer", token }, container)
              const rowsAfter = await getContainer().resolve(Modules.NOTIFICATION).listNotifications({})
              expect(rowsAfter).toHaveLength(rowsBefore.length)
              expect(log.warn).toHaveBeenCalledTimes(1)
              expect(String(log.warn.mock.calls[0][0])).toContain("customer account at example.com was not sent")
              expect(log.error).not.toHaveBeenCalled()
            } finally {
              for (const key of ["NODE_ENV", "STOREFRONT_URL", "BACKEND_URL"]) {
                if (saved[key] === undefined) delete process.env[key]
                else process.env[key] = saved[key]
              }
            }
          }
        )

        it("outside development and test logs only the error's name when something fails", async () => {
          const saved = { ...process.env }
          Object.assign(process.env, {
            NODE_ENV: "production",
            STOREFRONT_URL: "https://shop.example.com",
            BACKEND_URL: "https://api.example.com",
          })
          try {
            const failing = fakeContainer()
            // The one call that can fail after the plan there: the warning itself.
            failing.log.warn.mockImplementation(() => {
              throw new TypeError(`data: ${STOREFRONT_URL}/account/reset-password?token=${token}`)
            })
            await run({ entity_id: "a@example.com", actor_type: "customer", token }, failing.container)
            expect(failing.log.error).toHaveBeenCalledTimes(1)
            expect(String(failing.log.error.mock.calls[0][0])).toBe(
              "Could not send a password reset link (TypeError). A new link can be asked for."
            )
          } finally {
            for (const key of ["NODE_ENV", "STOREFRONT_URL", "BACKEND_URL"]) {
              if (saved[key] === undefined) delete process.env[key]
              else process.env[key] = saved[key]
            }
          }
        })

        it("in test sends the notification it planned, and nothing for an unknown actor type", async () => {
          const sending = fakeContainer()
          await run({ entity_id: "a@example.com", actor_type: "customer", token }, sending.container)
          expect(sending.createNotifications).toHaveBeenCalledTimes(1)
          expect(sending.createNotifications.mock.calls[0][0]).toMatchObject({
            to: "a@example.com",
            channel: "email",
            template: "password-reset",
            data: {
              link: `${STOREFRONT_URL}/account/reset-password?token=${token}&email=a%40example.com`,
              email: "a@example.com",
              actor_type: "customer",
              expires_in_minutes: 15,
            },
          })
          expect(sending.log.warn).not.toHaveBeenCalled()
          expect(sending.log.info).not.toHaveBeenCalled()

          const skipping = fakeContainer()
          await run({ entity_id: "a@example.com", actor_type: "vendor", token }, skipping.container)
          expect(skipping.createNotifications).not.toHaveBeenCalled()
          expect(skipping.log.info).toHaveBeenCalledTimes(1)
          expect(String(skipping.log.info.mock.calls[0][0])).not.toContain("a@example.com")
        })

        it("looks up the email's emailpass identity, and sends no admin link to a customer-only identity", async () => {
          const customerOnly = fakeContainer({ appMetadata: { customer_id: "cus_1" } })
          await run({ entity_id: "a@example.com", actor_type: "user", token }, customerOnly.container)
          expect(customerOnly.auth.listProviderIdentities).toHaveBeenCalledWith(
            { entity_id: "a@example.com", provider: "emailpass" },
            { select: ["auth_identity_id"] }
          )
          expect(customerOnly.auth.retrieveAuthIdentity).toHaveBeenCalledWith("authid_1", { select: ["app_metadata"] })
          expect(customerOnly.createNotifications).not.toHaveBeenCalled()
          expect(customerOnly.log.info).toHaveBeenCalledTimes(1)
          expect(String(customerOnly.log.info.mock.calls[0][0])).toBe(
            'Password reset asked for actor type "user" by an email that has no user account: no link sent.'
          )

          const userOnly = fakeContainer({ appMetadata: { user_id: "user_1" } })
          await run({ entity_id: "a@example.com", actor_type: "user", token }, userOnly.container)
          expect(userOnly.createNotifications).toHaveBeenCalledTimes(1)
          expect(userOnly.createNotifications.mock.calls[0][0].data.actor_type).toBe("user")

          const noMetadata = fakeContainer({ appMetadata: null })
          await run({ entity_id: "a@example.com", actor_type: "customer", token }, noMetadata.container)
          expect(noMetadata.createNotifications).not.toHaveBeenCalled()

          const unknownActor = fakeContainer()
          await run({ entity_id: "a@example.com", actor_type: "vendor", token }, unknownActor.container)
          expect(unknownActor.auth.listProviderIdentities).not.toHaveBeenCalled()
        })

        it("sends nothing when the lookup fails, and logs the error's name and the domain only", async () => {
          const failing = fakeContainer({
            lookupError: Object.assign(new Error("select ... where entity_id = 'secret.person@example.org'"), {
              name: "DriverException",
            }),
          })
          await run({ entity_id: "secret.person@example.org", actor_type: "customer", token }, failing.container)
          expect(failing.createNotifications).not.toHaveBeenCalled()
          expect(failing.log.error).toHaveBeenCalledTimes(1)
          const line = String(failing.log.error.mock.calls[0][0])
          expect(line).toBe(
            "Password reset for a customer account at example.org: the account could not be looked up " +
              "(DriverException); no link sent."
          )
          expect(failing.log.info).not.toHaveBeenCalled()
          expect(failing.log.warn).not.toHaveBeenCalled()
        })

        it("logs a failed send as an error and never throws", async () => {
          const failing = fakeContainer()
          failing.createNotifications.mockRejectedValue(new Error("provider down"))
          await expect(
            run({ entity_id: "a@example.com", actor_type: "customer", token }, failing.container)
          ).resolves.toBeUndefined()
          expect(failing.log.error).toHaveBeenCalledTimes(1)
          expect(String(failing.log.error.mock.calls[0][0])).toBe(
            "Could not send a password reset link (provider down). A new link can be asked for."
          )
        })
      })
    })
  },
})
