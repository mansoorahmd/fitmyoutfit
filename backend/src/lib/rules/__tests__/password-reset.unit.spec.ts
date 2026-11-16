import { readFileSync } from "node:fs"
import { join } from "node:path"
import { generateJwtToken } from "@medusajs/framework/utils"
import {
  ADMIN_RESET_PAGE,
  CUSTOMER_RESET_PAGE,
  emailDomainForLog,
  PASSWORD_RESET_EVENT,
  PASSWORD_RESET_TEMPLATE,
  planPasswordReset,
  resetPasswordLink,
  tokenLifetimeMinutes,
} from "../password-reset"

const urls = { storefrontUrl: "https://shop.example.com", backendUrl: "https://api.example.com" }

/** An unsigned JWT-shaped token with these claims (the signature is not read). */
function tokenWith(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url")
  return `${part({ alg: "HS256", typ: "JWT" })}.${part(claims)}.c2ln`
}

/** A token the way Medusa 2.22.6 makes it (generate-reset-password-token.js). */
function medusaToken(entityId: string, seconds = 15 * 60): string {
  return generateJwtToken(
    { entity_id: entityId, provider: "emailpass", actor_type: "customer", purpose: "reset" },
    { secret: "test-secret", expiresIn: `${seconds}s`, jwtOptions: { jwtid: "jti-1" } }
  )
}

function queryOf(link: string): URLSearchParams {
  return new URL(link).searchParams
}

describe("resetPasswordLink", () => {
  it("sends customers to the storefront's page and admin users to the admin's page", () => {
    expect(resetPasswordLink({ actorType: "customer", email: "a@b.co", token: "t.k.n" }, urls)).toBe(
      "https://shop.example.com/account/reset-password?token=t.k.n&email=a%40b.co"
    )
    expect(resetPasswordLink({ actorType: "user", email: "a@b.co", token: "t.k.n" }, urls)).toBe(
      "https://api.example.com/app/reset-password?token=t.k.n&email=a%40b.co"
    )
    expect(CUSTOMER_RESET_PAGE).toBe("/account/reset-password")
    expect(ADMIN_RESET_PAGE).toBe("/app/reset-password")
  })

  it.each(["vendor", "Customer", "USER", "", "__proto__", "constructor", "toString", undefined, null, 1])(
    "gives no link for the actor type %j",
    (actorType) => {
      expect(resetPasswordLink({ actorType, email: "a@b.co", token: "t" }, urls)).toBeUndefined()
    }
  )

  it.each([
    "first+tag@example.com",
    "with space@example.com",
    " padded@example.com ",
    "o'brien@example.com",
    "a&b=c?d#e/f%20g@example.com",
    "علی@مثال.پاکستان",
    "zoë.ñandú@exämple.de",
    "用户@例子.广告",
    "emoji😀@example.com",
    "line\nbreak@example.com",
  ])("keeps the email %j intact through the link", (email) => {
    const token = medusaToken(email)
    for (const actorType of ["customer", "user"]) {
      const link = resetPasswordLink({ actorType, email, token }, urls)!
      const query = queryOf(link)
      expect(query.get("email")).toBe(email)
      expect(query.get("token")).toBe(token)
      expect([...query.keys()]).toEqual(["token", "email"])
      // Also for a reader that decodes with decodeURIComponent (no `+` as space)
      const raw = link.split("&email=")[1]
      expect(decodeURIComponent(raw)).toBe(email)
      expect(link).not.toMatch(/[\s"<>`{}|\\^]/)
      expect(new URL(link).pathname).toBe(actorType === "customer" ? CUSTOMER_RESET_PAGE : ADMIN_RESET_PAGE)
    }
  })

  it("writes a + as %2B and a space as %20, never as a raw + or space", () => {
    const link = resetPasswordLink(
      { actorType: "customer", email: "a+b c@example.com", token: "t" },
      urls
    )
    expect(link).toBe("https://shop.example.com/account/reset-password?token=t&email=a%2Bb%20c%40example.com")
  })

  it("encodes the token too", () => {
    const link = resetPasswordLink({ actorType: "customer", email: "a@b.co", token: "a+b/c=&d" }, urls)!
    expect(link).toContain("token=a%2Bb%2Fc%3D%26d&")
    expect(queryOf(link).get("token")).toBe("a+b/c=&d")
  })

  it("gives no link when the email cannot be written as UTF-8 (a lone surrogate)", () => {
    expect(
      resetPasswordLink({ actorType: "customer", email: "a\uD800@b.co", token: "t" }, urls)
    ).toBeUndefined()
  })
})

describe("tokenLifetimeMinutes", () => {
  it("reads 15 minutes from a token made the way Medusa makes reset tokens", () => {
    expect(tokenLifetimeMinutes(medusaToken("a@b.co"))).toBe(15)
    expect(tokenLifetimeMinutes(medusaToken("a@b.co", 3600))).toBe(60)
  })

  it("rounds down, so it never promises more than the token gives", () => {
    expect(tokenLifetimeMinutes(tokenWith({ iat: 1000, exp: 1000 + 899 }))).toBe(14)
    expect(tokenLifetimeMinutes(tokenWith({ iat: 1000, exp: 1000 + 59 }))).toBe(0)
  })

  it.each([
    ["not a jwt", "abc"],
    ["two parts", "a.b"],
    ["payload not JSON", "a.%%%.c"],
    ["no exp", tokenWith({ iat: 1 })],
    ["no iat", tokenWith({ exp: 1 })],
    ["exp as text", tokenWith({ iat: 1, exp: "901" })],
    ["exp before iat", tokenWith({ iat: 1000, exp: 100 })],
    ["payload null", `${Buffer.from("{}").toString("base64url")}.${Buffer.from("null").toString("base64url")}.x`],
  ])("is undefined for %s", (_name, token) => {
    expect(tokenLifetimeMinutes(token)).toBeUndefined()
  })

  it("matches Medusa's fixed lifetime in the installed workflow (15 * 60 seconds)", () => {
    const source = readFileSync(
      join(
        __dirname,
        "..", "..", "..", "..",
        "node_modules/@medusajs/core-flows/dist/auth/workflows/generate-reset-password-token.js"
      ),
      "utf8"
    )
    expect(source).toContain("const RESET_PASSWORD_TOKEN_TTL_SECONDS = 15 * 60;")
    expect(source).toContain("expiresIn: `${RESET_PASSWORD_TOKEN_TTL_SECONDS}s`")
  })
})

describe("the admin's reset page in the installed Medusa", () => {
  it("is /reset-password under the admin path /app, and reads `token` from the query", () => {
    const modules = join(__dirname, "..", "..", "..", "..", "node_modules/@medusajs")
    const defineConfig = readFileSync(join(modules, "utils/dist/common/define-config.js"), "utf8")
    expect(defineConfig).toMatch(/path: "\/app",/)
    const routes = readFileSync(join(modules, "dashboard/src/dashboard-app/routes/get-route.map.tsx"), "utf8")
    expect(routes).toContain('path: "/reset-password"')
    const page = readFileSync(join(modules, "dashboard/src/routes/reset-password/reset-password.tsx"), "utf8")
    expect(page).toContain('searchParams.get("token")')
  })
})

describe("emailDomainForLog", () => {
  it.each([
    ["alice@Example.COM", "example.com"],
    ["a@b@sub.example.org", "sub.example.org"],
    ["no-at-sign", "(no domain)"],
    ["trailing@", "(no domain)"],
    ["x@exa\nmple.com", "exa?mple.com"],
    ["x@مثال.پاکستان", "????.???????"],
  ])("%j gives %j and never the local part", (email, domain) => {
    expect(emailDomainForLog(email)).toBe(domain)
    expect(emailDomainForLog(email)).not.toContain("alice")
  })

  it("is at most 253 characters", () => {
    expect(emailDomainForLog(`a@${"x".repeat(500)}`)).toHaveLength(253)
  })
})

describe("planPasswordReset", () => {
  const token = medusaToken("Zoë+Team@Example.com")
  const event = { entity_id: "Zoë+Team@Example.com", actor_type: "customer", token, metadata: { x: 1 } }

  it("in development sends one email notification with the link, email, actor type and minutes", () => {
    const plan = planPasswordReset(event, { urls, mayLog: true, channel: "email" })
    expect(plan).toEqual({
      action: "send",
      notification: {
        to: "Zoë+Team@Example.com",
        channel: "email",
        template: "password-reset",
        trigger_type: "auth.password_reset",
        data: {
          link: `https://shop.example.com/account/reset-password?token=${token}&email=Zo%C3%AB%2BTeam%40Example.com`,
          email: "Zoë+Team@Example.com",
          actor_type: "customer",
          expires_in_minutes: 15,
        },
      },
    })
    expect(PASSWORD_RESET_TEMPLATE).toBe("password-reset")
    expect(PASSWORD_RESET_EVENT).toBe("auth.password_reset")
  })

  it("sends admin users the admin's link", () => {
    const plan = planPasswordReset({ ...event, actor_type: "user" }, { urls, mayLog: true, channel: "email" })
    expect(plan.action === "send" && plan.notification.data.link).toBe(
      `https://api.example.com/app/reset-password?token=${token}&email=Zo%C3%AB%2BTeam%40Example.com`
    )
    expect(plan.action === "send" && plan.notification.data.actor_type).toBe("user")
  })

  it("in production sends nothing and warns with the domain at most: no token, link or local part", () => {
    for (const actor_type of ["customer", "user"]) {
      const plan = planPasswordReset({ ...event, actor_type }, { urls, mayLog: false, channel: "email" })
      expect(plan.action).toBe("withhold")
      const warning = plan.action === "withhold" ? plan.warning : ""
      expect(warning).toContain(`a ${actor_type} account at example.com was not sent`)
      expect(warning).not.toContain(token)
      expect(warning).not.toContain(token.split(".")[1])
      expect(warning).not.toMatch(/zo|team|reset-password\?|https?:/i)
    }
  })

  it.each(["vendor", "", undefined, 7, "__proto__"])(
    "skips the actor type %j without naming the email, in development and production",
    (actor_type) => {
      for (const mayLog of [true, false]) {
        const plan = planPasswordReset({ ...event, actor_type }, { urls, mayLog, channel: "email" })
        expect(plan.action).toBe("skip")
        const reason = plan.action === "skip" ? plan.reason : ""
        expect(reason).toContain("no link sent")
        expect(reason).not.toMatch(/zo|team|example/i)
        expect(reason).not.toContain(token)
      }
    }
  )

  it.each([
    ["no email", { entity_id: undefined }],
    ["a blank email", { entity_id: "  " }],
    ["an email that is not text", { entity_id: 5 }],
    ["no token", { token: undefined }],
    ["an empty token", { token: "" }],
  ])("skips an event with %s", (_name, change) => {
    const plan = planPasswordReset({ ...event, ...change }, { urls, mayLog: true, channel: "email" })
    expect(plan.action).toBe("skip")
  })

  it("skips a token without a lifetime, or an email it cannot encode, naming neither", () => {
    for (const change of [{ token: "abc" }, { entity_id: "a\uD800@example.com" }]) {
      const plan = planPasswordReset({ ...event, ...change }, { urls, mayLog: true, channel: "email" })
      expect(plan.action).toBe("skip")
      expect(plan.action === "skip" && plan.reason).toContain("could not be written into a link")
      expect(plan.action === "skip" && plan.reason).not.toContain("abc")
    }
  })

  it("never uses the request's metadata", () => {
    const plan = planPasswordReset(
      { ...event, metadata: { link: "https://evil.example", redirect: "https://evil.example" } } as never,
      { urls, mayLog: true, channel: "email" }
    )
    expect(JSON.stringify(plan)).not.toContain("evil")
  })
})
