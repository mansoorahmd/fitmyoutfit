/**
 * Password reset, backend part (docs/contracts/m1-password-reset.md, section 2): the subscriber on
 * Medusa's `auth.password_reset` asks the Notification Module for one `email` notification with
 * the template `password-reset` and the link, email, actor type and lifetime; nothing for an
 * actor type without a reset page or an unknown email; and in production nothing at all, with one
 * warning that holds neither the token nor the link.
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import sendPasswordResetLink from "../../src/subscribers/password-reset-link"

jest.setTimeout(300 * 1000)

const STOREFRONT_URL = "http://shop.reset-test.local:8123"
const BACKEND_URL = "http://api.reset-test.local:9123"
const CUSTOMER_EMAIL = "zoë+reset@example.com"
const USER_EMAIL = "staff.reset@example.com"
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
        for (const [actor, email] of [
          ["customer", CUSTOMER_EMAIL],
          ["user", USER_EMAIL],
        ]) {
          const res = await api.post(`/auth/${actor}/emailpass/register`, { email, password: PASSWORD })
          expect(res.status).toBe(200)
        }
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
        expect(link.searchParams.get("email")).toBe(USER_EMAIL)
        expect(link.searchParams.get("token")).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/)
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

      describe("called directly", () => {
        const token =
          "eyJhbGciOiJIUzI1NiJ9." +
          Buffer.from(JSON.stringify({ iat: 1000, exp: 1900 })).toString("base64url") +
          ".c2lnbmF0dXJl"

        function fakeContainer() {
          const log = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
          const createNotifications = jest.fn()
          const container = {
            resolve: (key: string) => {
              if (key === "logger") return log
              if (key === Modules.NOTIFICATION) return { createNotifications }
              return getContainer().resolve(key)
            },
          }
          return { log, createNotifications, container }
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

        it("logs a failed send as an error and never throws", async () => {
          const failing = fakeContainer()
          failing.createNotifications.mockRejectedValue(new Error("provider down"))
          await expect(
            run({ entity_id: "a@example.com", actor_type: "customer", token }, failing.container)
          ).resolves.toBeUndefined()
          expect(failing.log.error).toHaveBeenCalledTimes(1)
          expect(String(failing.log.error.mock.calls[0][0])).toContain("Could not send a password reset link")
        })
      })
    })
  },
})
