/**
 * THE WORDS OF THE EMAIL A DESIGN-HELP REQUESTER GETS. DRAFT WORDING: the founders confirm it.
 *
 * One email: "we received your request". It promises nothing but that: no response time (how soon
 * the designer writes back is for the founders to set), no price, no delivery date. Every value a
 * requester typed (their name, their team's name) is escaped in the html and never put in the
 * subject. A plain function from data to `{ subject, text, html }`, nothing read from a request
 * here.
 */
import { escapeHtml, type EmailContent } from "./team-order-emails"

/** The wording is a draft until the founders confirm it. */
export const DESIGN_REQUEST_WORDING_IS_DRAFT = true

export type ReceivedData = {
  contactName: string
  teamName: string
  reference: string
}

export function receivedEmail(data: ReceivedData): EmailContent {
  const paragraphs = [
    `Hello ${data.contactName},`,
    `We have received your design-help request for "${data.teamName}". Your reference is ${data.reference}.`,
    "Our design team will read it. If you want to add something, reply to this email and quote your reference.",
    "FitMyOutfit",
  ]
  return {
    subject: "We received your design-help request",
    text: paragraphs.join("\n\n") + "\n",
    html: paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n"),
  }
}
