// The logic of signing, making and reopening a proof, apart from the page that shows it: what the signing
// form checks, what is said about the need-by date before signing, and the one sentence for every way a step
// can fail (from the backend's machine code, never its message). Plain functions, tested on their own
// (signing.test.ts).

import { proofContent, type ProofAction } from "@content/proof"
import { dayWords } from "@lib/team-order/words"
import { fill } from "@lib/util/wording"

import type { Failure, ScheduleView } from "./types"

/** The typed name's longest length (the contract: 1 to 100 characters after cleaning). */
export const SIGNED_NAME_MAX = 100

const CONTROL = /[\u0000-\u001F\u007F-\u009F]/

/** The name as the backend cleans it: trimmed, runs of white space made one space, Unicode NFC. */
export const cleanSignedName = (raw: string): string => raw.replace(/\s+/g, " ").trim().normalize("NFC")

export type SigningCheck =
  | { ok: true; name: string }
  | { ok: false; field: "name" | "tick"; sentence: string }

/** What the signing form needs before it may send: a name of 1 to 100 characters without control characters, and the box ticked. */
export function checkSigning(input: { name: string; ticked: boolean }): SigningCheck {
  const w = proofContent.sign
  const name = cleanSignedName(input.name)
  if (name === "" || CONTROL.test(name)) return { ok: false, field: "name", sentence: w.needName }
  if (Array.from(name).length > SIGNED_NAME_MAX) return { ok: false, field: "name", sentence: w.nameTooLong }
  if (!input.ticked) return { ok: false, field: "tick", sentence: w.needTick }
  return { ok: true, name }
}

// ---- the need-by date, before signing ---------------------------------------------

export type SigningSchedule = {
  /** The state that is shown, and sent with the signature. */
  state: ScheduleView["state"]
  /** Plain sentences for the organizer before signing; none when there is nothing to say. */
  sentences: string[]
}

/**
 * What the proof page says about the need-by date before the organizer signs. It reports the backend's own state
 * (`ok`, `needs_rush`, `cannot_be_met`, `none`) and the latest days it worked out; nothing is computed here.
 */
export function signingSchedule(schedule: ScheduleView, rushRequested: boolean): SigningSchedule {
  const w = proofContent.sign.schedule
  switch (schedule.state) {
    case "none":
      return { state: "none", sentences: [] }
    case "ok":
      return { state: "ok", sentences: [] }
    case "needs_rush":
      return {
        state: "needs_rush",
        sentences: [
          schedule.latestSignRush ? fill(w.needsRush, { latest: dayWords(schedule.latestSignRush) }) : w.cannotBeMetNoDay,
          rushRequested ? w.needsRushChosen : w.needsRushNotChosen,
        ],
      }
    case "cannot_be_met":
      return {
        state: "cannot_be_met",
        sentences: [w.cannotBeMet],
      }
  }
}

// ---- failures -------------------------------------------------------------------

/** The refusals after which the page must show the store's current proof, because what the organizer saw is out of date. */
const REFRESH_CODES = new Set(["proof_hash_mismatch", "proof_not_current", "schedule_changed"])

export type StepFailure = {
  /** The sentence for the customer. */
  text: string
  /** The page should read the order again: what it showed is out of date. */
  refresh: boolean
  signedOut: boolean
}

const num = (value: unknown): string => (typeof value === "number" && Number.isFinite(value) ? String(value) : "")

/** One sentence for a failed step. A code with no sentence of its own gets the step's general one: never nothing. */
export function stepFailure(action: ProofAction, failure: Failure): StepFailure {
  const g = proofContent.general
  switch (failure.kind) {
    case "signed_out":
      return { text: g.signedOut, refresh: false, signedOut: true }
    case "not_found":
      return { text: g.notFound, refresh: false, signedOut: false }
    case "unavailable":
      return { text: g.unavailable[action], refresh: false, signedOut: false }
    case "stale":
      return { text: g.fallback[action], refresh: true, signedOut: false }
    case "refused": {
      const template = proofContent.refusals[action][failure.code]
      const text = template
        ? fill(template, { required: num(failure.extra?.required), missing: num(failure.extra?.missing), n: num(failure.extra?.indexes_to_fix) })
        : g.fallback[action]
      return { text, refresh: REFRESH_CODES.has(failure.code), signedOut: false }
    }
  }
}
