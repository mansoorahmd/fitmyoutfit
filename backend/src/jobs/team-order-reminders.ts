/**
 * The team-order reminder job: once a day it emails the organizer of every team order in `draft` or
 * `proof_sent` that has a need-by date, exactly 3 days and exactly 1 day before the latest day to
 * sign the proof (the rush day when the standard one is past and rush still works), and tries again
 * the emails that failed. "Today" is the store's day in the store's time zone (the Store's
 * `schedule_time_zone` setting). Each reminder is sent once per order, kind and latest day: the
 * record is in the database, so running twice, or a restart, sends nothing twice.
 *
 * The time of day is a placeholder (04:00 server time, 09:00 in Pakistan when the server runs in
 * UTC): the founders choose it. A day on which the job does not run sends no reminder for that day
 * (it does not catch up). The work is in workflows/team-order/emails.ts (`runReminders`); this file
 * only schedules it and logs counts (never an address).
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { runReminders } from "../workflows/team-order/emails"

export default async function teamOrderReminders(container: MedusaContainer): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const run = await runReminders(container)
    logger.info(
      `Team-order reminders for ${run.today}: ${run.due} due, ${run.sent} sent, ${run.skipped} already sent, ${run.failed} failed, ` +
        `${run.retried} earlier emails tried again (${run.retriedSent} sent).`
    )
  } catch (error) {
    logger.error(`The team-order reminder job failed (${error instanceof Error ? error.name : "Error"}).`)
  }
}

export const config = {
  name: "team-order-reminders",
  // Placeholder time of day. Cron fields: minute hour day month weekday.
  schedule: "0 4 * * *",
}
