import { describe, expect, it } from "vitest"

import { failureFrom } from "./refusal"

const refusal = (code: string, extra: Record<string, unknown> = {}) => ({ type: "invalid_data", code, message: "for developers", ...extra })

describe("how an answer becomes a failure", () => {
  it("no answer, a 5xx and a status that is not an error are 'unavailable'", () => {
    expect(failureFrom(undefined, null)).toEqual({ kind: "unavailable" })
    expect(failureFrom(500, { type: "unexpected_state", message: "the key schedule_time_zone is missing" })).toEqual({ kind: "unavailable" })
    expect(failureFrom(503, null)).toEqual({ kind: "unavailable" })
    expect(failureFrom(302, null)).toEqual({ kind: "unavailable" })
  })

  it("401 is signed out, whatever the body (Medusa's own 401 has no code)", () => {
    expect(failureFrom(401, { message: "Unauthorized" })).toEqual({ kind: "signed_out" })
    expect(failureFrom(401, null)).toEqual({ kind: "signed_out" })
  })

  it("404 is not found, with any code (design_not_found, team_order_not_found, design_version_not_found)", () => {
    for (const code of ["team_order_not_found", "design_not_found", "design_version_not_found"]) {
      expect(failureFrom(404, refusal(code))).toEqual({ kind: "not_found" })
    }
    expect(failureFrom(404, null)).toEqual({ kind: "not_found" })
  })

  it("409 roster_version_stale carries the version to save from", () => {
    expect(failureFrom(409, { type: "conflict", code: "roster_version_stale", message: "m", current_version: 7 })).toEqual({
      kind: "stale",
      currentVersion: 7,
    })
  })

  it("a stale answer without a usable version is treated as unreadable, never guessed", () => {
    expect(failureFrom(409, { code: "roster_version_stale" })).toEqual({ kind: "unavailable" })
    expect(failureFrom(409, { code: "roster_version_stale", current_version: 0 })).toEqual({ kind: "unavailable" })
    expect(failureFrom(409, { code: "roster_version_stale", current_version: "7" })).toEqual({ kind: "unavailable" })
  })

  it("every other refusal keeps its code and extras, and drops the message", () => {
    const codes = [
      "team_name_invalid",
      "need_by_date_invalid",
      "need_by_date_in_past",
      "rush_requested_invalid",
      "design_version_id_required",
      "product_mismatch",
      "product_not_found",
      "product_not_designable",
      "region_id_required",
      "region_not_found",
      "team_order_not_editable",
      "team_order_not_draft",
      "team_order_has_linked_orders",
      "design_mismatch",
      "roster_malformed",
      "roster_too_many_lines",
      "roster_version_required",
      "schedule_empty",
      "design_not_an_object",
      "design_schema_version",
      "design_too_deep",
      "design_contains_null_character",
      "design_too_large",
      "design_name_invalid",
      "product_id_required",
      "text_contains_null_character",
    ]
    for (const code of codes) {
      const failure = failureFrom(400, refusal(code))
      expect(failure).toEqual({ kind: "refused", status: 400, code })
      expect(JSON.stringify(failure)).not.toContain("developers")
    }
    expect(failureFrom(400, refusal("need_by_date_in_past", { today: "2026-11-22" }))).toEqual({
      kind: "refused",
      status: 400,
      code: "need_by_date_in_past",
      extra: { today: "2026-11-22" },
    })
    expect(failureFrom(400, { type: "not_allowed", code: "team_order_not_editable", message: "m", status: "proof_sent" })).toEqual({
      kind: "refused",
      status: 400,
      code: "team_order_not_editable",
      extra: { status: "proof_sent" },
    })
  })

  it("a 400 from Medusa itself (no code) and a 413 are refused with the code 'unknown'", () => {
    expect(failureFrom(400, { type: "not_allowed", message: "Publishable API key required" })).toEqual({
      kind: "refused",
      status: 400,
      code: "unknown",
    })
    expect(failureFrom(413, null)).toEqual({ kind: "refused", status: 413, code: "unknown" })
  })

  it("another 409 is a refusal, not a stale list", () => {
    expect(failureFrom(409, { code: "team_order_changed", type: "conflict", message: "m" })).toEqual({
      kind: "refused",
      status: 409,
      code: "team_order_changed",
    })
  })
})
