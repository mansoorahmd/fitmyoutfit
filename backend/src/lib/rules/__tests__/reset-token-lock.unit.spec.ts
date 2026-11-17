import { generateJwtToken } from "@medusajs/framework/utils"
import { MAX_JTI_LENGTH, RESET_TOKEN_BUSY_MESSAGE, resetTokenLockKey } from "../reset-token-lock"

const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url")
const jwtWith = (claims: unknown) => `${part({ alg: "HS256" })}.${part(claims)}.c2ln`

describe("resetTokenLockKey", () => {
  it("is keyed by the jti of a token made the way Medusa makes reset tokens", () => {
    const token = generateJwtToken(
      { entity_id: "a@b.co", provider: "emailpass", actor_type: "customer", purpose: "reset" },
      { secret: "s", expiresIn: "900s", jwtOptions: { jwtid: "6f1c9a52-0d7e-4c55-9a1e-2b1e7d0c3f44" } }
    )
    expect(resetTokenLockKey(`Bearer ${token}`)).toBe("fitmyoutfit:reset-token:6f1c9a52-0d7e-4c55-9a1e-2b1e7d0c3f44")
  })

  it("accepts the scheme in any case and surrounding spaces, as Medusa does", () => {
    const token = jwtWith({ jti: "abc" })
    for (const header of [`bearer ${token}`, `BEARER ${token}`, `  Bearer   ${token} `]) {
      expect(resetTokenLockKey(header)).toBe("fitmyoutfit:reset-token:abc")
    }
  })

  it("gives one key per token: two tokens, two keys", () => {
    expect(resetTokenLockKey(`Bearer ${jwtWith({ jti: "one" })}`)).not.toBe(
      resetTokenLockKey(`Bearer ${jwtWith({ jti: "two" })}`)
    )
  })

  it.each([
    ["no header", undefined],
    ["a list", ["Bearer x.y.z"]],
    ["Basic", "Basic dXNlcjpwYXNz"],
    ["no scheme", jwtWith({ jti: "abc" })],
    ["two parts", "Bearer a.b"],
    ["payload not JSON", "Bearer a.%%%.c"],
    ["payload null", `Bearer a.${Buffer.from("null").toString("base64url")}.c`],
    ["no jti", `Bearer ${jwtWith({ sub: "x" })}`],
    ["jti a number", `Bearer ${jwtWith({ jti: 5 })}`],
    ["jti empty", `Bearer ${jwtWith({ jti: "" })}`],
    ["jti with a colon", `Bearer ${jwtWith({ jti: "a:b" })}`],
    ["jti too long", `Bearer ${jwtWith({ jti: "x".repeat(MAX_JTI_LENGTH + 1) })}`],
  ])("is undefined for %s", (_name, header) => {
    expect(resetTokenLockKey(header)).toBeUndefined()
  })

  it("takes a jti of the longest length", () => {
    expect(resetTokenLockKey(`Bearer ${jwtWith({ jti: "x".repeat(MAX_JTI_LENGTH) })}`)).toBe(
      `fitmyoutfit:reset-token:${"x".repeat(MAX_JTI_LENGTH)}`
    )
  })

  it("tells the second request what to do", () => {
    expect(RESET_TOKEN_BUSY_MESSAGE).toContain("ask for a new link")
  })
})
