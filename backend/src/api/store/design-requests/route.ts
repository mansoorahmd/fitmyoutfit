/**
 * Free design help for teams (the contract for the storefront; CLAUDE.md, "Promises").
 *
 * POST /store/design-requests   a team asks for design help. OPEN: a visitor with no account may
 *   send it; a signed-in customer's request is linked to them. A publishable API key is needed like
 *   for every store route.
 *   Body (JSON, at most 16 KB): `team_name`, `contact_name`, `email`, `region` (pk, gb, ae, us) and
 *   `message` are required; `phone`, `product` (jersey, t-shirt, jacket, other), `pieces`,
 *   `need_by_date` (YYYY-MM-DD, not in the past) and `reference_links` (up to three http or https
 *   links) are optional. There is no file upload yet. `website` is a field a person never fills in:
 *   a request that has it filled in is dropped and answered exactly like a real one.
 *   Answers 201 `{ design_request: { reference, status: "new", status_label } }`: the same for every
 *   email address, so it never says whether the address is known to the store. Nothing a visitor
 *   sent is returned by this route or shown to another visitor.
 *   Refusals: 400 `team_name_invalid`, `contact_name_invalid`, `email_invalid`, `phone_invalid`,
 *   `product_invalid`, `pieces_invalid`, `need_by_date_invalid`, `need_by_date_in_past`,
 *   `region_invalid`, `message_invalid`, `reference_links_invalid` (each with `field`),
 *   `text_contains_null_character`; 413 `request_too_large`; 429 `rate_limited` (per address, per
 *   email address and overall; one answer for all, so it never says which limit or whether the
 *   email is known).
 *
 * GET /store/design-requests   the signed-in customer's own requests, newest first, with their plain
 *   status (`status`, `status_label`). Never staff notes or anything staff keep. 401 without sign-in.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { bodyOf, customerIdOf, withRefusals } from "../../../lib/http/refusal"
import { clientIp, readTrustedProxyHops } from "../../../lib/rules/team-order-proof"
import { createDesignRequest, listOwnDesignRequests } from "../../../workflows/design-request/design-requests"

export const POST = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  const actor = (req as MedusaRequest & { auth_context?: { actor_id?: string; actor_type?: string } }).auth_context
  const answer = await createDesignRequest(req.scope, {
    body: bodyOf(req),
    customerId: actor?.actor_type === "customer" && actor.actor_id ? actor.actor_id : null,
    ip: clientIp({
      forwardedFor: req.headers["x-forwarded-for"],
      socketAddress: req.socket?.remoteAddress,
      trustedHops: readTrustedProxyHops(process.env.TRUSTED_PROXY_HOPS),
    }),
  })
  res.status(201).json(answer)
})

export const GET = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  res.status(200).json(await listOwnDesignRequests(req.scope, customerIdOf(req)))
})
