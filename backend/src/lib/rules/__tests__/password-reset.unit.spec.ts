import { readFileSync } from "node:fs"
import { join } from "node:path"
import { generateJwtToken } from "@medusajs/framework/utils"
import {
  ACCOUNT_ID_KEYS,
  accountToLookUp,
  ADMIN_RESET_PAGE,
  CUSTOMER_RESET_PAGE,
  emailDomainForLog,
  errorNameForLog,
  hasAccountOfType,
  PASSWORD_RESET_EVENT,
  PASSWORD_RESET_TEMPLATE,
  planPasswordReset,
  RESET_PROVIDER,
  resetPasswordLink,
  sendFailureLine,
  tokenLifetimeMinutes,
  type AccountCheck,
} from "../password-reset"

const urls = { storefrontUrl: "https://shop.example.com", backendUrl: "https://api.example.com" }
const HAS: AccountCheck = { kind: "has_account" }
const NONE: AccountCheck = { kind: "no_account" }

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

/** The parameters the reset page reads: the query (customer) or the fragment (admin, moved into the query by the page). */
function queryOf(link: string): URLSearchParams {
  const url = new URL(link)
  return url.hash ? new URLSearchParams(url.hash.slice(1)) : url.searchParams
}

describe("resetPasswordLink", () => {
  it("sends customers to the storefront's page and admin users to the admin's page", () => {
    expect(resetPasswordLink({ actorType: "customer", email: "a@b.co", token: "t.k.n" }, urls)).toBe(
      "https://shop.example.com/account/reset-password?token=t.k.n&email=a%40b.co"
    )
    expect(resetPasswordLink({ actorType: "user", email: "a@b.co", token: "t.k.n" }, urls)).toBe(
      "https://api.example.com/app/reset-password#token=t.k.n&email=a%40b.co"
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
      // The admin's token never goes to the server: no query, everything in the fragment.
      expect(new URL(link).search === "").toBe(actorType === "user")
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
    const plan = planPasswordReset(event, { urls, mayLog: true, channel: "email", account: HAS })
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
    const plan = planPasswordReset({ ...event, actor_type: "user" }, { urls, mayLog: true, channel: "email", account: HAS })
    expect(plan.action === "send" && plan.notification.data.link).toBe(
      `https://api.example.com/app/reset-password#token=${token}&email=Zo%C3%AB%2BTeam%40Example.com`
    )
    expect(plan.action === "send" && plan.notification.data.actor_type).toBe("user")
  })

  it("in production sends nothing and warns with the domain at most: no token, link or local part", () => {
    for (const actor_type of ["customer", "user"]) {
      const plan = planPasswordReset({ ...event, actor_type }, { urls, mayLog: false, channel: "email", account: HAS })
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
        const plan = planPasswordReset({ ...event, actor_type }, { urls, mayLog, channel: "email", account: HAS })
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
    const plan = planPasswordReset({ ...event, ...change }, { urls, mayLog: true, channel: "email", account: HAS })
    expect(plan.action).toBe("skip")
  })

  it("skips a token without a lifetime, or an email it cannot encode, naming neither", () => {
    for (const change of [{ token: "abc" }, { entity_id: "a\uD800@example.com" }]) {
      const plan = planPasswordReset({ ...event, ...change }, { urls, mayLog: true, channel: "email", account: HAS })
      expect(plan.action).toBe("skip")
      expect(plan.action === "skip" && plan.reason).toContain("could not be written into a link")
      expect(plan.action === "skip" && plan.reason).not.toContain("abc")
    }
  })

  it("never uses the request's metadata", () => {
    const plan = planPasswordReset(
      { ...event, metadata: { link: "https://evil.example", redirect: "https://evil.example" } } as never,
      { urls, mayLog: true, channel: "email", account: HAS }
    )
    expect(JSON.stringify(plan)).not.toContain("evil")
  })

  it("clips the actor type in the skip line to 40 characters", () => {
    const plan = planPasswordReset(
      { ...event, actor_type: "x".repeat(60) },
      { urls, mayLog: true, channel: "email", account: HAS }
    )
    const reason = plan.action === "skip" ? plan.reason : ""
    expect(reason).toContain(`"${"x".repeat(40)}"`)
    expect(reason).not.toContain("x".repeat(41))
  })

  describe("only for an account of the asked kind (QA's fifteenth review, B1)", () => {
    it.each(["customer", "user"])(
      "sends no %s link when the email has no account of that kind, in development and production",
      (actor_type) => {
        for (const mayLog of [true, false]) {
          const plan = planPasswordReset({ ...event, actor_type }, { urls, mayLog, channel: "email", account: NONE })
          expect(plan).toEqual({
            action: "skip",
            reason: `Password reset asked for actor type "${actor_type}" by an email that has no ${actor_type} account: no link sent.`,
          })
          const reason = plan.action === "skip" ? plan.reason : ""
          expect(reason).not.toMatch(/zo|team|example/i)
          expect(reason).not.toContain(token)
        }
      }
    )

    it("sends nothing when the lookup failed, and logs the error's name and the domain only", () => {
      for (const mayLog of [true, false]) {
        const plan = planPasswordReset(
          event,
          { urls, mayLog, channel: "email", account: { kind: "lookup_failed", errorName: "KnexTimeoutError" } }
        )
        expect(plan).toEqual({
          action: "fail",
          error:
            "Password reset for a customer account at example.com: the account could not be looked up " +
            "(KnexTimeoutError); no link sent.",
        })
      }
      const odd = planPasswordReset(event, {
        urls,
        mayLog: true,
        channel: "email",
        account: { kind: "lookup_failed", errorName: "zoë+team@example.com" },
      })
      expect(odd.action === "fail" && odd.error).toContain("(error)")
      expect(JSON.stringify(odd)).not.toMatch(/zo|team/i)
    })
  })
})

describe("hasAccountOfType", () => {
  it("reads Medusa's keys: customer_id for customers, user_id for admin users", () => {
    expect(ACCOUNT_ID_KEYS).toEqual({ customer: "customer_id", user: "user_id" })
    expect(RESET_PROVIDER).toBe("emailpass")
    expect(hasAccountOfType({ customer_id: "cus_1" }, "customer")).toBe(true)
    expect(hasAccountOfType({ customer_id: "cus_1" }, "user")).toBe(false)
    expect(hasAccountOfType({ user_id: "user_1" }, "user")).toBe(true)
    expect(hasAccountOfType({ user_id: "user_1" }, "customer")).toBe(false)
  })

  it("gives both kinds to an email that is both", () => {
    const both = { user_id: "user_1", customer_id: "cus_1" }
    expect(hasAccountOfType(both, "customer")).toBe(true)
    expect(hasAccountOfType(both, "user")).toBe(true)
  })

  it.each([
    ["no metadata", undefined],
    ["null", null],
    ["text", "customer_id"],
    ["an array", ["cus_1"]],
    ["an empty object", {}],
    ["a null id", { customer_id: null }],
    ["a blank id", { customer_id: "  " }],
    ["a number id", { customer_id: 5 }],
    ["an inherited key", Object.create({ customer_id: "cus_1" })],
    ["another actor's key", { vendor_id: "v_1" }],
  ])("is no for %s", (_name, appMetadata) => {
    expect(hasAccountOfType(appMetadata, "customer")).toBe(false)
  })

  it("matches Medusa's key in the installed sign-in route (`${actor_type}_id`)", () => {
    const route = readFileSync(
      join(__dirname, "..", "..", "..", "..", "node_modules/@medusajs/medusa/dist/api/auth/[actor_type]/[auth_provider]/route.js"),
      "utf8"
    )
    expect(route).toContain("authIdentity.app_metadata?.[`${actor_type}_id`]")
  })
})

describe("accountToLookUp", () => {
  it("looks up the email for an actor type with a reset page", () => {
    expect(accountToLookUp({ entity_id: "a@b.co", actor_type: "user" })).toEqual({ email: "a@b.co", actorType: "user" })
    expect(accountToLookUp({ entity_id: "a@b.co", actor_type: "customer" })).toEqual({
      email: "a@b.co",
      actorType: "customer",
    })
  })

  it.each([
    ["an unknown actor type", { entity_id: "a@b.co", actor_type: "vendor" }],
    ["no actor type", { entity_id: "a@b.co" }],
    ["no email", { actor_type: "customer" }],
    ["a blank email", { entity_id: " ", actor_type: "customer" }],
    ["an email that is not text", { entity_id: 3, actor_type: "customer" }],
  ])("looks nothing up for %s", (_name, data) => {
    expect(accountToLookUp(data)).toBeUndefined()
  })
})

describe("errorNameForLog and sendFailureLine", () => {
  it("gives a plain name, and `error` for anything else", () => {
    expect(errorNameForLog(new TypeError("x"))).toBe("TypeError")
    expect(errorNameForLog({ name: "KnexTimeoutError" })).toBe("KnexTimeoutError")
    for (const odd of [undefined, null, "text", { name: 5 }, { name: "" }, { name: "a b" }, { name: "x".repeat(61) }]) {
      expect(errorNameForLog(odd)).toBe("error")
    }
  })

  it("gives the message only where a link may be logged, otherwise only the name", () => {
    const error = new Error("data: https://shop.example.com/account/reset-password?token=abc.def.ghi")
    expect(sendFailureLine(error, true)).toBe(
      `Could not send a password reset link (${error.message}). A new link can be asked for.`
    )
    const line = sendFailureLine(error, false)
    expect(line).toBe("Could not send a password reset link (Error). A new link can be asked for.")
    expect(line).not.toMatch(/token|https?:|abc/)
  })
})
