/**
 * The free design-help request of a team (CLAUDE.md, "Promises": free design help for teams;
 * dev-plan.md, M3): what a valid request is, which status may follow which, the limits that keep
 * an open form from being abused, and the words a customer sees for a status. Plain TypeScript, no
 * Medusa imports; the Medusa glue is workflows/design-request/ and the routes around it.
 *
 * The form is open to a visitor who has no account, so everything in a request is untrusted text.
 * It is cleaned like the roster's text (Unicode NFC, invisible direction marks removed, white space
 * made one space; Urdu and Arabic text is kept, the zero-width non-joiner included), a control
 * character is refused, and nothing a stranger sent is ever shown back to another visitor (the
 * store answers show a customer their own requests only).
 *
 * No file upload yet: reference pictures are links (up to three, http or https only). Uploads need
 * storage and a scan and come later.
 */
import { cleanText } from "@fitmyoutfit/team-rules"
import { readNeedByDate } from "./team-order"

// ---------------------------------------------------------------------------------------------
// Limits, as data

export const DESIGN_REQUEST_LIMITS = {
  teamName: { max: 100 },
  contactName: { max: 100 },
  /** RFC 5321: 254 characters in all, 64 before the @. */
  email: { max: 254, localMax: 64 },
  /** Digits in a phone or WhatsApp number (the number may also hold + - ( ) . and spaces). */
  phone: { minDigits: 7, maxDigits: 15, maxLength: 30 },
  pieces: { min: 1, max: 10000 },
  message: { min: 10, max: 2000 },
  referenceLinks: { max: 3, maxLength: 500 },
  staffNotes: { max: 5000 },
  /** The body of the store route, in bytes (the route's body parser refuses a larger one). */
  bodyBytes: 16 * 1024,
} as const

/** The regions the form offers (the launch markets): Pakistan, the UK, the UAE and the US. */
export const DESIGN_REQUEST_REGIONS = ["pk", "gb", "ae", "us"] as const
export type DesignRequestRegion = (typeof DESIGN_REQUEST_REGIONS)[number]

/** What the team wants made: the launch garments (their product handles), or something else. */
export const DESIGN_REQUEST_PRODUCTS = ["jersey", "t-shirt", "jacket", "other"] as const
export type DesignRequestProduct = (typeof DESIGN_REQUEST_PRODUCTS)[number]

/**
 * How many requests one visitor may make over time (the store route answers 429 `rate_limited`
 * past them): per address, per email address, and over the whole store as a last cap. Counted over
 * the requests that were accepted and stored in the window. The same answer for every limit, so it
 * never says which one was hit, nor whether an email address is known.
 */
export const DESIGN_REQUEST_RATE_LIMITS = {
  perAddress: { max: 5, windowMinutes: 60 },
  perEmail: { max: 3, windowMinutes: 24 * 60 },
  overall: { max: 300, windowMinutes: 60 },
} as const

/** The field a person never fills in: a request that has it filled in is discarded silently. */
export const TRAP_FIELD = "website"

/** Does this request fill in the trap field (any value but an empty text, null or absent)? */
export function trapFilled(body: Readonly<Record<string, unknown>>): boolean {
  const value = body[TRAP_FIELD]
  if (value === undefined || value === null) return false
  return typeof value === "string" ? value.trim() !== "" : true
}

// ---------------------------------------------------------------------------------------------
// The statuses

export const DESIGN_REQUEST_STATUSES = ["new", "in_progress", "proof_sent", "done"] as const
export type DesignRequestStatus = (typeof DESIGN_REQUEST_STATUSES)[number]

export function isDesignRequestStatus(value: unknown): value is DesignRequestStatus {
  return typeof value === "string" && (DESIGN_REQUEST_STATUSES as readonly string[]).includes(value)
}

/** What staff see. */
export const STATUS_LABELS: Record<DesignRequestStatus, string> = {
  new: "New",
  in_progress: "In progress",
  proof_sent: "Proof sent",
  done: "Done",
}

/** What a customer sees, in plain words (a promise of nothing but where the request stands). */
export const CUSTOMER_STATUS_LABELS: Record<DesignRequestStatus, string> = {
  new: "Received",
  in_progress: "Our designer is working on it",
  proof_sent: "A proof has been sent to you",
  done: "Done",
}

/**
 * The statuses that may follow `from`, in the order the admin offers them: forward one step (the
 * four in order), back one step (for a mistake), and `done` reopened to `in_progress`. Nothing
 * skips a step, and nothing stays where it is.
 */
export function nextStatuses(from: DesignRequestStatus): DesignRequestStatus[] {
  const at = DESIGN_REQUEST_STATUSES.indexOf(from)
  const forward = DESIGN_REQUEST_STATUSES[at + 1]
  const back = DESIGN_REQUEST_STATUSES[at - 1]
  const allowed: DesignRequestStatus[] = []
  if (forward) allowed.push(forward)
  if (back) allowed.push(back)
  if (from === "done" && !allowed.includes("in_progress")) allowed.push("in_progress")
  return allowed
}

export function mayChangeStatus(from: DesignRequestStatus, to: DesignRequestStatus): boolean {
  return nextStatuses(from).includes(to)
}

// ---------------------------------------------------------------------------------------------
// A request's fields

export type DesignRequestInput = {
  teamName: string
  contactName: string
  email: string
  phone: string | null
  product: DesignRequestProduct | null
  pieces: number | null
  needByDate: string | null
  region: DesignRequestRegion
  message: string
  referenceLinks: string[]
}

export const FIELD_CODES = [
  "team_name_invalid",
  "contact_name_invalid",
  "email_invalid",
  "phone_invalid",
  "product_invalid",
  "pieces_invalid",
  "need_by_date_invalid",
  "need_by_date_in_past",
  "region_invalid",
  "message_invalid",
  "reference_links_invalid",
] as const
export type FieldCode = (typeof FIELD_CODES)[number]

export const FIELD_MESSAGES: Record<FieldCode, string> = {
  team_name_invalid: `The team or club name must be 1 to ${DESIGN_REQUEST_LIMITS.teamName.max} characters, with no control characters.`,
  contact_name_invalid: `The contact name must be 1 to ${DESIGN_REQUEST_LIMITS.contactName.max} characters, with no control characters.`,
  email_invalid: "Enter an email address, such as name@example.com.",
  phone_invalid: `The phone or WhatsApp number must have ${DESIGN_REQUEST_LIMITS.phone.minDigits} to ${DESIGN_REQUEST_LIMITS.phone.maxDigits} digits (a + and spaces are fine).`,
  product_invalid: `The product must be one of: ${DESIGN_REQUEST_PRODUCTS.join(", ")}.`,
  pieces_invalid: `The number of pieces must be a whole number from ${DESIGN_REQUEST_LIMITS.pieces.min} to ${DESIGN_REQUEST_LIMITS.pieces.max}.`,
  need_by_date_invalid: "The need-by date must be a real date written YYYY-MM-DD.",
  need_by_date_in_past: "The need-by date cannot be in the past.",
  region_invalid: `The region must be one of: ${DESIGN_REQUEST_REGIONS.join(", ")}.`,
  message_invalid: `Tell us what you want, in ${DESIGN_REQUEST_LIMITS.message.min} to ${DESIGN_REQUEST_LIMITS.message.max} characters.`,
  reference_links_invalid: `Reference pictures are up to ${DESIGN_REQUEST_LIMITS.referenceLinks.max} links, each starting with http:// or https://, up to ${DESIGN_REQUEST_LIMITS.referenceLinks.maxLength} characters. Pictures cannot be uploaded yet.`,
}

export type ReadResult =
  | { ok: true; value: DesignRequestInput }
  | { ok: false; code: FieldCode; field: string; message: string; index?: number }

const length = (text: string): number => [...text].length
const HAS_CONTENT = /[\p{L}\p{N}]/u

/** A one-line text as typed: refused with a control character; cleaned; 1 to `max` characters with a letter or digit. */
export function readLine(input: unknown, max: number): string | null {
  if (typeof input !== "string" || /\p{Cc}/u.test(input)) return null
  const text = cleanText(input)
  return text !== "" && length(text) <= max && HAS_CONTENT.test(text) ? text : null
}

/**
 * A text of several lines as typed: line breaks are kept (at most one empty line in a row), each
 * line is cleaned like a one-line text, any other control character (a tab counts as white space)
 * is refused. `min` and `max` count characters after cleaning.
 */
export function readParagraphs(input: unknown, min: number, max: number): string | null {
  if (typeof input !== "string") return null
  const unified = input.replace(/\r\n?/gu, "\n").replace(/\t/gu, " ")
  if (/[\p{Cc}]/u.test(unified.replace(/\n/gu, ""))) return null
  const lines = unified.split("\n").map((line) => cleanText(line))
  const text = lines
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim()
  return length(text) >= min && length(text) <= max && HAS_CONTENT.test(text) ? text : null
}

/** An email address as typed: trimmed, 254 characters at most, name@host.tld with no spaces. Case is kept. */
export function readEmail(input: unknown): string | null {
  if (typeof input !== "string" || /\p{Cc}/u.test(input) || /\p{Z}/u.test(input.trim())) return null
  const email = input.trim().normalize("NFC")
  if (email === "" || email.length > DESIGN_REQUEST_LIMITS.email.max) return null
  const at = email.lastIndexOf("@")
  if (at < 1 || at !== email.indexOf("@")) return null
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (local.length > DESIGN_REQUEST_LIMITS.email.localMax || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null
  if (/[<>(),;:"\\[\]]/u.test(local)) return null
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/iu.test(domain)) return null
  return email
}

/** The key an email address is limited and looked up by: lower case. */
export function emailKey(email: string): string {
  return email.trim().toLowerCase()
}

/** An optional phone or WhatsApp number: digits with + - ( ) . and spaces; null when blank. `undefined` for an invalid one. */
export function readPhone(input: unknown): string | null | undefined {
  if (input === undefined || input === null || (typeof input === "string" && input.trim() === "")) return null
  if (typeof input !== "string") return undefined
  const phone = input.trim().replace(/\s+/gu, " ")
  if (phone.length > DESIGN_REQUEST_LIMITS.phone.maxLength || !/^\+?[\d\s().-]+$/u.test(phone)) return undefined
  const digits = phone.replace(/\D/gu, "").length
  return digits >= DESIGN_REQUEST_LIMITS.phone.minDigits && digits <= DESIGN_REQUEST_LIMITS.phone.maxDigits ? phone : undefined
}

/** The links to reference pictures: up to three, http or https, no credentials in them. Returns the links as a browser writes them, or null when invalid. */
export function readReferenceLinks(input: unknown): string[] | null {
  if (input === undefined || input === null) return []
  if (!Array.isArray(input) || input.length > DESIGN_REQUEST_LIMITS.referenceLinks.max) return null
  const links: string[] = []
  for (const item of input) {
    if (typeof item !== "string" || /\p{Cc}/u.test(item) || /\p{Z}/u.test(item.trim())) return null
    const text = item.trim()
    if (text === "" || text.length > DESIGN_REQUEST_LIMITS.referenceLinks.maxLength) return null
    let url: URL
    try {
      url = new URL(text)
    } catch {
      return null
    }
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username !== "" || url.password !== "" || url.hostname === "") return null
    links.push(url.href)
  }
  return links
}

/**
 * Reads the store form's body. `today` is the store's calendar day (YYYY-MM-DD), so a need-by date
 * before it is refused. The first problem found is returned, in the order of the form. Anything in
 * the body that is not a field of the form is ignored (the status, the customer, a reference: a
 * stranger never sets those).
 */
export function readDesignRequest(body: Readonly<Record<string, unknown>>, today: string): ReadResult {
  const fail = (code: FieldCode, field: string, index?: number): ReadResult => ({
    ok: false,
    code,
    field,
    message: FIELD_MESSAGES[code],
    ...(index === undefined ? {} : { index }),
  })
  const teamName = readLine(body.team_name, DESIGN_REQUEST_LIMITS.teamName.max)
  if (teamName === null) return fail("team_name_invalid", "team_name")
  const contactName = readLine(body.contact_name, DESIGN_REQUEST_LIMITS.contactName.max)
  if (contactName === null) return fail("contact_name_invalid", "contact_name")
  const email = readEmail(body.email)
  if (email === null) return fail("email_invalid", "email")
  const phone = readPhone(body.phone)
  if (phone === undefined) return fail("phone_invalid", "phone")
  let product: DesignRequestProduct | null = null
  if (body.product !== undefined && body.product !== null && body.product !== "") {
    if (typeof body.product !== "string" || !(DESIGN_REQUEST_PRODUCTS as readonly string[]).includes(body.product)) return fail("product_invalid", "product")
    product = body.product as DesignRequestProduct
  }
  let pieces: number | null = null
  if (body.pieces !== undefined && body.pieces !== null && body.pieces !== "") {
    const number = typeof body.pieces === "number" ? body.pieces : typeof body.pieces === "string" && /^\d{1,6}$/u.test(body.pieces.trim()) ? Number(body.pieces.trim()) : Number.NaN
    if (!Number.isInteger(number) || number < DESIGN_REQUEST_LIMITS.pieces.min || number > DESIGN_REQUEST_LIMITS.pieces.max) return fail("pieces_invalid", "pieces")
    pieces = number
  }
  let needByDate: string | null = null
  if (body.need_by_date !== undefined && body.need_by_date !== null && body.need_by_date !== "") {
    const date = readNeedByDate(body.need_by_date)
    if (!date.ok) return fail("need_by_date_invalid", "need_by_date")
    if (date.value !== null && date.value < today) return fail("need_by_date_in_past", "need_by_date")
    needByDate = date.value
  }
  if (typeof body.region !== "string" || !(DESIGN_REQUEST_REGIONS as readonly string[]).includes(body.region)) return fail("region_invalid", "region")
  const message = readParagraphs(body.message, DESIGN_REQUEST_LIMITS.message.min, DESIGN_REQUEST_LIMITS.message.max)
  if (message === null) return fail("message_invalid", "message")
  const referenceLinks = readReferenceLinks(body.reference_links)
  if (referenceLinks === null) return fail("reference_links_invalid", "reference_links")
  return {
    ok: true,
    value: {
      teamName,
      contactName,
      email,
      phone,
      product,
      pieces,
      needByDate,
      region: body.region as DesignRequestRegion,
      message,
      referenceLinks,
    },
  }
}

/** Staff notes: up to 5000 characters, line breaks kept; an empty text clears them (null). `undefined` when invalid. */
export function readStaffNotes(input: unknown): string | null | undefined {
  if (typeof input !== "string") return undefined
  if (input.trim() === "") return null
  return readParagraphs(input, 1, DESIGN_REQUEST_LIMITS.staffNotes.max) ?? undefined
}

// ---------------------------------------------------------------------------------------------
// The reference a requester is given

const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no I, O, 0, 1: easy to read out loud
const REFERENCE_LENGTH = 8

/** `DR-` and eight characters, from a random source `random(n)` that returns a whole number from 0 to n - 1. */
export function makeReference(random: (below: number) => number): string {
  let code = ""
  for (let index = 0; index < REFERENCE_LENGTH; index++) {
    code += REFERENCE_ALPHABET[random(REFERENCE_ALPHABET.length)]
  }
  return `DR-${code}`
}

export function isReference(value: unknown): boolean {
  return typeof value === "string" && new RegExp(`^DR-[${REFERENCE_ALPHABET}]{${REFERENCE_LENGTH}}$`, "u").test(value)
}

// ---------------------------------------------------------------------------------------------
// The limits, applied

export type RateCounts = { address: number | null; email: number; overall: number }

/** Is another request allowed, given what was accepted in each window? `address` is null when the address is unknown. */
export function withinRateLimits(counts: RateCounts): boolean {
  return (
    (counts.address === null || counts.address < DESIGN_REQUEST_RATE_LIMITS.perAddress.max) &&
    counts.email < DESIGN_REQUEST_RATE_LIMITS.perEmail.max &&
    counts.overall < DESIGN_REQUEST_RATE_LIMITS.overall.max
  )
}

// ---------------------------------------------------------------------------------------------
// What the store shows a customer: their own requests, never the staff's notes

export type StoredDesignRequest = {
  reference: string
  team_name: string
  status: DesignRequestStatus
  product: string | null
  pieces: number | null
  need_by_date: string | null
  region: string
  message: string
  reference_links: string[] | null
  created_at: Date | string
  updated_at: Date | string
}

export type OwnDesignRequest = {
  reference: string
  team_name: string
  status: DesignRequestStatus
  status_label: string
  product: string | null
  pieces: number | null
  need_by_date: string | null
  region: string
  message: string
  reference_links: string[]
  created_at: Date | string
  updated_at: Date | string
}

/**
 * A request for its own requester's answer: the fields they sent and the plain status. By choice
 * of fields, never staff notes, the assignee, the address hash, the record of changes or the
 * customer id.
 */
export function toOwnDesignRequest(row: StoredDesignRequest): OwnDesignRequest {
  return {
    reference: row.reference,
    team_name: row.team_name,
    status: row.status,
    status_label: CUSTOMER_STATUS_LABELS[row.status],
    product: row.product,
    pieces: row.pieces,
    need_by_date: row.need_by_date,
    region: row.region,
    message: row.message,
    reference_links: row.reference_links ?? [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}
