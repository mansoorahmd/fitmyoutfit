/**
 * The emails to the organizer of a team order (task M2-3): "the proof is ready", the reminders 3 days
 * and 1 day before the latest day to sign, and "payment due" (the deposit, the balance). Written once
 * at their moment, the reminders on their days with a fixed "today" in the store's time zone, nothing
 * twice when the job runs twice, a failed send recorded and retried without failing the request,
 * nothing sent outside development and test. The texts and the day arithmetic are unit-tested.
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import teamOrderReminders, { config as jobConfig } from "../../src/jobs/team-order-reminders"
import { addCalendarDays } from "../../src/lib/rules/delivery-promise"
import { MAX_EMAIL_ATTEMPTS } from "../../src/lib/rules/team-order-emails"
import { TEAM_ORDER_MODULE } from "../../src/modules/team-order/constants"
import { retryFailedEmails, runReminders, sendTeamOrderEmail } from "../../src/workflows/team-order/emails"
import { line, makeWorld, team, type World } from "./support/team-order-world"

jest.setTimeout(300 * 1000)

const ADMIN_EMAIL = "team-order-emails-test-admin@example.com"
const ADMIN_PASSWORD = "team-order-emails-test-password"

/** Noon in Karachi on `day`: the store's day is `day` whatever the server's own zone is. */
const noonIn = (day: string) => new Date(`${day}T12:00:00+05:00`)

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("Emails to the organizer (M2-3)", () => {
      let w: World
      const teams = () => getContainer().resolve(TEAM_ORDER_MODULE) as any
      const notifications = () => getContainer().resolve(Modules.NOTIFICATION) as any

      beforeAll(async () => {
        w = await makeWorld(api, getContainer, { adminEmail: ADMIN_EMAIL, adminPassword: ADMIN_PASSWORD, prefix: "emails-organizer" })
      })

      /** The emails sent for a team order, oldest first, as the Notification Module stored them. */
      async function sentFor(orderId: string) {
        const rows = (await notifications().listNotifications({ resource_id: orderId }, { order: { created_at: "ASC" } })) as any[]
        return rows.filter((n) => n.channel === "email")
      }
      const templates = async (orderId: string) => (await sentFor(orderId)).map((n) => n.template)
      const rowsFor = async (orderId: string) => (await teams().listTeamOrderEmails({ team_order_id: orderId }, { order: { created_at: "ASC" } })) as any[]
      const adminStep = async (id: string, action: string) =>
        api.post(`/admin/team-orders/${id}/steps`, { action }, { headers: await w.adminHeaders(), ...w.allow })

      // ------------------------------------------------------------------------------------
      describe("the proof is ready", () => {
        it("is written once, when the proof is made: the team, the proof number, the latest day to sign", async () => {
          const as = await w.signIn()
          const needBy = w.inDays(45)
          const latest = addCalendarDays(needBy, -15)
          const order = await w.aTeamOrder(as, { need_by_date: needBy })
          const id = order.team_order.id
          await w.putRoster(as, id, 1, team(12))
          expect(await sentFor(id)).toEqual([])

          const logger = getContainer().resolve(ContainerRegistrationKeys.LOGGER) as any
          const info = jest.spyOn(logger, "info")
          const made = await w.makeProof(as, id)
          expect(made.status).toBe(201)

          const mails = await sentFor(id)
          expect(mails).toHaveLength(1)
          expect(mails[0]).toMatchObject({ to: as.__email, channel: "email", template: "team-order-proof-ready", status: "success" })
          expect(mails[0].data.subject).toBe("Proof 1 for Lahore Lions is ready to sign")
          expect(mails[0].data.text).toContain('Proof 1 for "Lahore Lions" is ready.')
          expect(mails[0].data.text).toContain("Hello Ali,")
          expect(mails[0].data.text).toMatch(new RegExp(`latest day to sign the proof is ${Number(latest.slice(8))} \\w+ ${latest.slice(0, 4)}`))
          expect(mails[0].data.html).toContain("<p>")
          // written to the log, as in development today (the local provider does it)
          expect(info.mock.calls.some(([m]) => String(m).includes("team-order-proof-ready") && String(m).includes(as.__email))).toBe(true)
          info.mockRestore()

          // a proof that is refused sends nothing; the same proof is never sent twice
          expect((await w.makeProof(as, id)).status).toBe(400)
          expect(await sentFor(id)).toHaveLength(1)
          // a new proof is a new email
          await w.reopen(as, id)
          expect((await w.makeProof(as, id)).status).toBe(201)
          const second = await sentFor(id)
          expect(second).toHaveLength(2)
          expect(second[1].data.subject).toBe("Proof 2 for Lahore Lions is ready to sign")
        })

        it("has no sign-by day without a need-by date, and nothing is sent for a refused proof", async () => {
          const as = await w.signIn()
          const order = await w.aTeamOrder(as)
          const id = order.team_order.id
          expect((await w.makeProof(as, id)).status).toBe(400) // empty list
          expect(await sentFor(id)).toEqual([])
          await w.putRoster(as, id, 1, team(12))
          await w.makeProof(as, id)
          const [mail] = await sentFor(id)
          expect(mail.data.text).not.toMatch(/latest day/)
        })

        it("an add-on's and a reorder's emails say which order they are about", async () => {
          const as = await w.signIn()
          const first = await w.aSignedOrder(as, 12)
          const addOn = (await w.startAddOn(as, first.team_order.id)).data.team_order.id
          await w.signed(as, addOn, [line(31, { id: "a", name: "Late", number: "31", size: "M" })])
          const mails = await sentFor(addOn)
          expect(mails.map((m) => m.template)).toEqual(["team-order-proof-ready", "team-order-deposit-due"])
          expect(mails[0].data.text).toContain('add-on order for late players of "Lahore Lions"')
          expect(mails[1].data.text).toContain("The deposit for the add-on order is now due.")

          const reorder = (await w.startReorder(as, first.team_order.id)).data.team_order.id
          await w.signed(as, reorder, team(12), 2)
          const reorderMails = await sentFor(reorder)
          expect(reorderMails[1].data.text).toContain("The deposit for the reorder is now due.")
          // the first order's own emails were not repeated for its add-on's or reorder's steps
          expect(await templates(first.team_order.id)).toEqual(["team-order-proof-ready", "team-order-deposit-due"])
        })
      })

      // ------------------------------------------------------------------------------------
      describe("payment due", () => {
        it("the deposit when the proof is signed (once), the balance when the order becomes balance_due (once); nothing else", async () => {
          const as = await w.signIn()
          const order = await w.aTeamOrder(as)
          const id = order.team_order.id
          await w.putRoster(as, id, 1, team(12))
          const made = await w.makeProof(as, id)
          expect(await templates(id)).toEqual(["team-order-proof-ready"])
          const body = w.signBody(made.data)
          const signedReply = await w.sign(as, id, made.data.current_proof.id, body)
          expect(signedReply.status).toBe(200)
          expect(await templates(id)).toEqual(["team-order-proof-ready", "team-order-deposit-due"])
          // signing again does nothing, and sends nothing
          expect((await w.sign(as, id, made.data.current_proof.id, body)).status).toBe(200)
          expect(await templates(id)).toEqual(["team-order-proof-ready", "team-order-deposit-due"])

          const deposit = (await sentFor(id))[1]
          expect(deposit.to).toBe(as.__email)
          expect(deposit.data.subject).toBe("Deposit due for Lahore Lions")
          expect(deposit.data.text).toContain("The deposit for the team order is now due.")
          expect(deposit.data.text).toContain("We will send you the payment details separately.")
          expect(deposit.data.text).not.toMatch(/\d+\s?%|PKR|GBP|£|\$/)

          // the admin's earlier steps send nothing
          await adminStep(id, "deposit_by_hand")
          await adminStep(id, "start_production")
          expect(await templates(id)).toEqual(["team-order-proof-ready", "team-order-deposit-due"])
          // the balance
          expect((await adminStep(id, "ask_balance")).status).toBe(200)
          expect(await templates(id)).toEqual(["team-order-proof-ready", "team-order-deposit-due", "team-order-balance-due"])
          const balance = (await sentFor(id))[2]
          expect(balance.data.subject).toBe("Balance due for Lahore Lions")
          expect(balance.data.text).toContain("We will send you the payment details separately.")
          // the by-hand note and shipping send nothing
          await adminStep(id, "balance_by_hand")
          await adminStep(id, "ship")
          expect(await templates(id)).toHaveLength(3)
          // every email has its record, sent
          expect((await rowsFor(id)).map((r) => `${r.kind}:${r.status}:${r.attempts}`)).toEqual([
            "proof_ready:sent:1",
            "deposit_due:sent:1",
            "balance_due:sent:1",
          ])
        })
      })

      // ------------------------------------------------------------------------------------
      describe("the reminders", () => {
        it("go on the third and the first day before the latest day to sign, once each, also when the job runs twice", async () => {
          const as = await w.signIn()
          const needBy = w.inDays(70)
          const latest = addCalendarDays(needBy, -15)
          const order = await w.aTeamOrder(as, { need_by_date: needBy })
          const id = order.team_order.id
          await w.putRoster(as, id, 1, team(12)) // still a draft

          // days that send nothing
          for (const offset of [-10, -4, -2, 0, 1, 5]) {
            const run = await runReminders(getContainer(), noonIn(addCalendarDays(latest, offset)))
            expect(run.due).toBe(0)
          }
          expect(await sentFor(id)).toEqual([])

          // three days before
          const day3 = noonIn(addCalendarDays(latest, -3))
          const first = await runReminders(getContainer(), day3)
          expect(first).toMatchObject({ today: addCalendarDays(latest, -3), sent: 1, failed: 0, skipped: 0 })
          let mails = await sentFor(id)
          expect(mails).toHaveLength(1)
          expect(mails[0]).toMatchObject({ to: as.__email, template: "team-order-reminder-3d", status: "success" })
          expect(mails[0].data.subject).toBe("3 days left to sign the proof for Lahore Lions")
          expect(mails[0].data.text).toContain("3 days from now.")

          // the job runs again the same day, and after a "restart": nothing more
          for (let i = 0; i < 2; i += 1) {
            const again = await runReminders(getContainer(), day3)
            expect(again).toMatchObject({ due: expect.any(Number), sent: 0, skipped: again.due })
          }
          expect(await sentFor(id)).toHaveLength(1)
          // the default-exported job does the same work and sends nothing more
          await teamOrderReminders(getContainer() as any)
          expect(await sentFor(id)).toHaveLength(1)

          // one day before (the order has a proof out by now: still reminded)
          await w.makeProof(as, id)
          const day1 = noonIn(addCalendarDays(latest, -1))
          expect(await runReminders(getContainer(), day1)).toMatchObject({ sent: 1 })
          await runReminders(getContainer(), day1)
          mails = (await sentFor(id)).filter((m) => m.template.startsWith("team-order-reminder"))
          expect(mails.map((m) => m.template)).toEqual(["team-order-reminder-3d", "team-order-reminder-1d"])
          expect(mails[1].data.subject).toBe("1 day left to sign the proof for Lahore Lions")
          expect(mails[1].data.text).toContain("1 day from now.")
          expect((await rowsFor(id)).map((r) => r.dedupe_key)).toEqual([
            `reminder_3d:${id}:${latest}`,
            expect.stringMatching(/^proof_ready:/),
            `reminder_1d:${id}:${latest}`,
          ])
        })

        it("use the store's day in the store's time zone, not the server's", async () => {
          const as = await w.signIn()
          const needBy = w.inDays(100)
          const latest = addCalendarDays(needBy, -15)
          const id = (await w.aTeamOrder(as, { need_by_date: needBy })).team_order.id
          const day = addCalendarDays(latest, -3)
          // 20:00 UTC is 01:00 the next day in Karachi (+05:00): that day is 2 days before, no reminder
          expect(await runReminders(getContainer(), new Date(`${day}T20:00:00Z`))).toMatchObject({ today: addCalendarDays(latest, -2), due: 0 })
          // 18:30 UTC is 23:30 the same day in Karachi: the reminder is due
          const run = await runReminders(getContainer(), new Date(`${day}T18:30:00Z`))
          expect(run).toMatchObject({ today: day, sent: 1 })
          expect(await templates(id)).toEqual(["team-order-reminder-3d"])
        })

        it("when standard delivery is already too late and rush still works, the rush day counts, and the email says so", async () => {
          const as = await w.signIn()
          const needBy = w.inDays(130)
          const latestStandard = addCalendarDays(needBy, -15)
          const latestRush = addCalendarDays(needBy, -10)
          const id = (await w.aTeamOrder(as, { need_by_date: needBy })).team_order.id
          const run = await runReminders(getContainer(), noonIn(addCalendarDays(latestRush, -3))) // 2 days after the standard day
          expect(run.sent).toBe(1)
          const [mail] = await sentFor(id)
          expect(mail.template).toBe("team-order-reminder-3d")
          expect(mail.data.text).toContain("Standard delivery can no longer meet your need-by date, but paid rush still can.")
          expect(mail.data.text).toContain(`${Number(latestRush.slice(8))} `)
          expect(latestStandard < addCalendarDays(latestRush, -3)).toBe(true)
          expect((await rowsFor(id))[0].dedupe_key).toBe(`reminder_3d:${id}:${latestRush}`)
          // after the rush day, nothing
          expect((await runReminders(getContainer(), noonIn(addCalendarDays(latestRush, 1)))).due).toBe(0)
        })

        it("are for draft and proof_sent orders with a need-by date only", async () => {
          const as = await w.signIn()
          const needBy = w.inDays(160)
          const latest = addCalendarDays(needBy, -15)
          const noDate = (await w.aTeamOrder(as)).team_order.id
          const signedOrder = await w.aSignedOrder(as, 12, { need_by_date: needBy })
          const later = await w.aSignedOrder(as, 12, { need_by_date: needBy })
          await adminStep(later.team_order.id, "deposit_by_hand")
          await runReminders(getContainer(), noonIn(addCalendarDays(latest, -3)))
          await runReminders(getContainer(), noonIn(addCalendarDays(latest, -1)))
          for (const id of [noDate, signedOrder.team_order.id, later.team_order.id]) {
            expect((await templates(id)).filter((t) => t.startsWith("team-order-reminder"))).toEqual([])
          }
        })

        it("an add-on with a need-by date is reminded too, in its own words", async () => {
          const as = await w.signIn()
          const first = await w.aSignedOrder(as, 12)
          const needBy = w.inDays(190)
          const latest = addCalendarDays(needBy, -15)
          const addOn = (await w.startAddOn(as, first.team_order.id, { need_by_date: needBy })).data.team_order.id
          await runReminders(getContainer(), noonIn(addCalendarDays(latest, -3)))
          const [mail] = await sentFor(addOn)
          expect(mail.template).toBe("team-order-reminder-3d")
          expect(mail.data.text).toContain('add-on order for late players of "Lahore Lions"')
        })

        it("a changed need-by date has a new latest day and is reminded of again", async () => {
          const as = await w.signIn()
          const first = latestPair(w.inDays(220))
          const id = (await w.aTeamOrder(as, { need_by_date: first.needBy })).team_order.id
          await runReminders(getContainer(), noonIn(addCalendarDays(first.latest, -3)))
          expect(await templates(id)).toEqual(["team-order-reminder-3d"])
          const moved = latestPair(w.inDays(250))
          expect((await w.api.post(`/store/team-orders/${id}/schedule`, { need_by_date: moved.needBy }, w.h(as))).status).toBe(200)
          await runReminders(getContainer(), noonIn(addCalendarDays(moved.latest, -3)))
          expect(await templates(id)).toEqual(["team-order-reminder-3d", "team-order-reminder-3d"])
        })
      })

      // ------------------------------------------------------------------------------------
      describe("a failed send", () => {
        it("does not fail the organizer's request, is recorded, and is tried again by the job (once, with no duplicate)", async () => {
          const as = await w.signIn()
          const order = await w.aTeamOrder(as, { need_by_date: w.inDays(60) })
          const id = order.team_order.id
          await w.putRoster(as, id, 1, team(12))
          const spy = jest.spyOn(notifications(), "createNotifications").mockRejectedValueOnce(new Error("provider is down"))
          const made = await w.makeProof(as, id)
          expect(made.status).toBe(201) // the proof is made; the failed email did not fail it
          expect(made.data.team_order.status).toBe("proof_sent")
          expect(spy).toHaveBeenCalledTimes(1)
          spy.mockRestore()

          let [row] = await rowsFor(id)
          expect(row).toMatchObject({ kind: "proof_ready", status: "failed", attempts: 1, last_error: "Error", sent_at: null })
          // the record holds no address and nothing but the error's name
          expect(JSON.stringify(row)).not.toContain(as.__email)
          expect(JSON.stringify(row)).not.toContain("provider is down")
          expect(await sentFor(id)).toEqual([])

          // the job tries again, and sends it
          const run = await runReminders(getContainer(), new Date())
          expect(run).toMatchObject({ retried: expect.any(Number) })
          ;[row] = await rowsFor(id)
          expect(row).toMatchObject({ status: "sent", attempts: 2 })
          expect(await templates(id)).toEqual(["team-order-proof-ready"])
          // and never again
          expect(await retryFailedEmails(getContainer(), new Date())).toEqual({ tried: 0, sent: 0 })
          expect(await sentFor(id)).toHaveLength(1)
        })

        it("is tried again up to a limit and then left alone", async () => {
          const as = await w.signIn()
          const order = await w.aTeamOrder(as)
          const id = order.team_order.id
          await w.putRoster(as, id, 1, team(12))
          const spy = jest.spyOn(notifications(), "createNotifications").mockRejectedValue(new Error("down"))
          try {
            expect((await w.makeProof(as, id)).status).toBe(201)
            for (let i = 1; i < MAX_EMAIL_ATTEMPTS + 2; i += 1) await retryFailedEmails(getContainer(), new Date())
          } finally {
            spy.mockRestore()
          }
          const [row] = await rowsFor(id)
          expect(row).toMatchObject({ status: "failed", attempts: MAX_EMAIL_ATTEMPTS })
          expect(await retryFailedEmails(getContainer(), new Date())).toEqual({ tried: 0, sent: 0 })
        })
      })

      // ------------------------------------------------------------------------------------
      describe("outside development and test", () => {
        it("sends nothing, records nothing as sent, and logs one warning without any personal data", async () => {
          const as = await w.signIn()
          const order = await w.aTeamOrder(as)
          const id = order.team_order.id
          const logger = getContainer().resolve(ContainerRegistrationKeys.LOGGER) as any
          const warn = jest.spyOn(logger, "warn")
          const info = jest.spyOn(logger, "info")
          const error = jest.spyOn(logger, "error")
          const before = process.env.NODE_ENV
          try {
            process.env.NODE_ENV = "production"
            const result = await sendTeamOrderEmail(getContainer(), {
              order: { id, kind: "order" },
              kind: "proof_ready",
              key: `proof_ready:withheld-${id}`,
              payload: { teamName: "Lahore Lions", orderKind: "order", proofNumber: 1 },
            })
            expect(result).toBe("withheld")
            const run = await runReminders(getContainer(), new Date())
            expect(run.withheld).toBe(0) // no order is due a reminder
          } finally {
            process.env.NODE_ENV = before
          }
          expect(await sentFor(id)).toEqual([])
          expect(await rowsFor(id)).toEqual([])
          const lines = [...warn.mock.calls, ...info.mock.calls, ...error.mock.calls].map(([m]) => String(m)).join("\n")
          expect(warn.mock.calls.filter(([m]) => String(m).includes("team-order email was not sent"))).toHaveLength(1)
          expect(lines).not.toContain(as.__email)
          warn.mockRestore()
          info.mockRestore()
          error.mockRestore()
        })
      })

      describe("the job", () => {
        it("is scheduled once a day", () => {
          expect(jobConfig).toMatchObject({ name: "team-order-reminders", schedule: expect.stringMatching(/^\d+ \d+ \* \* \*$/) })
        })
      })
    })
  },
})

/** The need-by date and the latest day to sign for it, with the placeholder 15 standard days. */
function latestPair(needBy: string) {
  return { needBy, latest: addCalendarDays(needBy, -15) }
}
