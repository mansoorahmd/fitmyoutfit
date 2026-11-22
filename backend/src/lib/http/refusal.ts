/**
 * A refusal a store route answers with: an HTTP status and a body `{ type, code, message, ... }`.
 * Medusa's own error handler replaces the message of every 409 and has no place for a machine
 * code, so the routes of the design and team-order modules send their refusals themselves, in one
 * shape (docs of the routes: each route file's comment).
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export class Refusal extends Error {
  constructor(
    readonly status: number,
    readonly type: "invalid_data" | "not_found" | "not_allowed" | "conflict",
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {}
  ) {
    super(message)
    this.name = "Refusal"
  }
}

export const badRequest = (code: string, message: string, extra?: Record<string, unknown>) =>
  new Refusal(400, "invalid_data", code, message, extra)

export const notFound = (code: string, message: string) => new Refusal(404, "not_found", code, message)

export const conflict = (code: string, message: string, extra?: Record<string, unknown>) =>
  new Refusal(409, "conflict", code, message, extra)

export const notAllowed = (code: string, message: string, extra?: Record<string, unknown>) =>
  new Refusal(400, "not_allowed", code, message, extra)

/**
 * Wraps a route handler: a thrown `Refusal` is answered as such; any other error goes to Medusa's
 * error handler as usual.
 */
export function withRefusals(handler: (req: MedusaRequest, res: MedusaResponse) => Promise<void>) {
  return async (req: MedusaRequest, res: MedusaResponse): Promise<void> => {
    try {
      await handler(req, res)
    } catch (error) {
      if (error instanceof Refusal) {
        res.status(error.status).json({ type: error.type, code: error.code, message: error.message, ...error.extra })
        return
      }
      throw error
    }
  }
}

/** The signed-in customer's id (the routes sit behind `authenticate("customer", ...)`). */
export function customerIdOf(req: MedusaRequest): string {
  const id = (req as MedusaRequest & { auth_context?: { actor_id?: string } }).auth_context?.actor_id
  if (!id) {
    throw new Refusal(401, "not_allowed", "unauthorized", "Unauthorized")
  }
  return id
}

/** The request body as an object (an absent or non-object body is an empty one). */
export function bodyOf(req: MedusaRequest): Record<string, unknown> {
  const body: unknown = req.body
  return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
}
