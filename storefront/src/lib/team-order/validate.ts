// The two things the organizer types when a team order starts, checked before any call
// (the backend checks them again: contract section 2, `team_name_invalid`,
// `need_by_date_invalid`). Plain functions.

/** The longest team name the backend takes (contract: 1 to 100 characters). */
export const TEAM_NAME_MAX = 100

export type TeamNameCheck = { ok: true; value: string } | { ok: false; reason: "empty" | "too_long" | "control" }

// Control characters, the line and paragraph separators and the NUL the database cannot store.
const CONTROL = new RegExp("[\u0000-\u001f\u007f-\u009f\u2028\u2029]")

/** The name as it will be sent: trimmed. Nothing is cut: a name that is too long is refused, not shortened. */
export function checkTeamName(raw: string): TeamNameCheck {
  const value = raw.trim()
  if (value.length === 0) return { ok: false, reason: "empty" }
  if (CONTROL.test(value)) return { ok: false, reason: "control" }
  if (value.length > TEAM_NAME_MAX) return { ok: false, reason: "too_long" }
  return { ok: true, value }
}

export type NeedByCheck = { ok: true; value: string | null } | { ok: false }

/** An empty field is no date. A date is `YYYY-MM-DD` and a real day (the backend decides whether it has passed). */
export function checkNeedByDate(raw: string): NeedByCheck {
  const text = raw.trim()
  if (text === "") return { ok: true, value: null }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) return { ok: false }
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(y, m - 1, d))
  const real = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
  return real ? { ok: true, value: text } : { ok: false }
}
