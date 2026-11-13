import { describe, expect, it } from "vitest"

import {
  Call,
  MIN_PASSWORD_LENGTH,
  authHref,
  authProblemText,
  authView,
  cartAfterTransfer,
  normalEmail,
  queryValue,
  signInFlow,
  signUpFlow,
  toCustomerCreate,
  validateCreate,
  validateSignIn,
} from "@lib/util/account-auth"
import { FIELD_MAX } from "@lib/util/checkout-address"

const ok = <T>(body: T): Call<T> => ({ ok: true, body })
const fail = (status?: number): Call<never> => ({ ok: false, status })

describe("the view and its links (05, 8.1)", () => {
  it("is sign-in unless the URL asks for create", () => {
    expect(authView("create")).toBe("create")
    for (const v of [undefined, "", "signin", "CREATE", ["create"], "register"]) {
      expect(authView(v)).toBe("signin")
    }
  })

  it("links each view with next and the email kept", () => {
    expect(authHref("create")).toBe("/account?view=create")
    expect(authHref("signin", { next: "/cart", email: "ali@example.com" })).toBe(
      "/account?view=signin&next=%2Fcart&email=ali%40example.com"
    )
  })

  it("reads one value from a query that may repeat", () => {
    expect(queryValue(["a", "b"])).toBe("a")
    expect(queryValue(undefined)).toBe("")
    expect(queryValue("x")).toBe("x")
  })
})

describe("field checks (05, 2.3 and 8.3)", () => {
  it("sign-in needs an email and a password, and says nothing about the account", () => {
    expect(validateSignIn({ email: "", password: "" })).toEqual({
      email: "Enter your email address, like name@example.com",
      password: "Enter your password",
    })
    expect(validateSignIn({ email: "ali@example.com", password: "x" })).toEqual({})
  })

  it("create needs a first name, an email and a password of 8 or more", () => {
    const base = { firstName: "محمد علی", lastName: "", email: "ali@example.com", phone: "", password: "team-kit-2026" }
    expect(validateCreate(base, "pk")).toEqual({})
    expect(MIN_PASSWORD_LENGTH).toBe(8)
    expect(validateCreate({ ...base, password: "1234567" }, "pk")).toEqual({ password: "Use at least 8 characters" })
    expect(validateCreate({ ...base, password: "12345678" }, "pk")).toEqual({})
    expect(validateCreate({ ...base, firstName: "  " }, "pk")).toEqual({ firstName: "Enter your first name" })
  })

  it("accepts names in Arabic and Urdu script", () => {
    for (const firstName of ["محمد علی", "عبدالله الهاشمي", "Muhammad Abdul Rehman Qureshi"]) {
      expect(validateCreate({ firstName, lastName: "", email: "a@b.co", phone: "", password: "12345678" }, "pk")).toEqual({})
    }
  })

  it("checks an optional phone only when one is given, with the country's example", () => {
    const base = { firstName: "Ali", lastName: "", email: "a@b.co", phone: "", password: "12345678" }
    expect(validateCreate({ ...base, phone: "0300 1234567" }, "pk")).toEqual({})
    expect(validateCreate({ ...base, phone: "call me" }, "gb")).toEqual({
      phone: "Enter a phone number, like 07700 900123",
    })
  })

  it("names 100, email 254, phone 25: the checkout's limits, with a message that says the limit (QA S1-4c, S2)", () => {
    const base = { firstName: "Ali", lastName: "", email: "a@b.co", phone: "", password: "12345678" }
    expect(validateCreate({ ...base, firstName: "ع".repeat(100), lastName: "R".repeat(100) }, "pk")).toEqual({})
    expect(validateCreate({ ...base, firstName: "ع".repeat(101) }, "pk")).toEqual({
      firstName: "Use 100 characters or fewer",
    })
    expect(validateCreate({ ...base, firstName: "A".repeat(300_000) }, "pk")).toEqual({
      firstName: "Use 100 characters or fewer",
    })
    expect(validateCreate({ ...base, lastName: "R".repeat(101) }, "pk")).toEqual({ lastName: "Use 100 characters or fewer" })
    const longEmail = `${"a".repeat(64)}@${"b".repeat(186)}.com` // 255
    expect(validateCreate({ ...base, email: longEmail }, "pk")).toEqual({ email: "Use 254 characters or fewer" })
    expect(validateSignIn({ email: longEmail, password: "x" })).toEqual({ email: "Use 254 characters or fewer" })
    expect(validateCreate({ ...base, phone: `0300 ${"1".repeat(21)}` }, "pk")).toEqual({ phone: "Use 25 characters or fewer" })
    // one definition: the checkout's own table
    expect(FIELD_MAX).toMatchObject({ first_name: 100, last_name: 100, email: 254, phone: 25 })
  })

  it("a password made only of spaces is refused, with its own message (QA S1-4c, m4)", () => {
    const base = { firstName: "Ali", lastName: "", email: "a@b.co", phone: "", password: "12345678" }
    expect(validateCreate({ ...base, password: " ".repeat(8) }, "pk")).toEqual({
      password: "Use letters, numbers or symbols, not only spaces",
    })
    expect(validateCreate({ ...base, password: "\u00a0".repeat(4) + "\u3000".repeat(6) }, "pk")).toEqual({
      password: "Use letters, numbers or symbols, not only spaces",
    })
    // spaces inside a password are kept and allowed
    expect(validateCreate({ ...base, password: "  team kit  " }, "pk")).toEqual({})
  })

  it("a phone typed with Urdu digits is stored with ASCII digits (QA S1-4c, m3)", () => {
    const base = { firstName: "Ali", lastName: "", email: "a@b.co", phone: "۰۳۰۰ ۱۲۳۴۵۶۷", password: "12345678" }
    expect(validateCreate(base, "pk")).toEqual({})
    expect(toCustomerCreate(base).phone).toBe("0300 1234567")
  })

  it("keeps the email as the account does: trimmed, lower case", () => {
    expect(normalEmail("  Ali@Example.COM ")).toBe("ali@example.com")
    expect(
      toCustomerCreate({ firstName: " محمد علی ", lastName: "", email: "Ali@Example.com", phone: "", password: "x" })
    ).toEqual({ email: "ali@example.com", first_name: "محمد علی" })
    expect(
      toCustomerCreate({ firstName: "Ali", lastName: "Raza", email: "a@b.co", phone: " 0300 1234567 ", password: "x" })
    ).toEqual({ email: "a@b.co", first_name: "Ali", last_name: "Raza", phone: "0300 1234567" })
  })
})

describe("signInFlow (backend answers as the real backend gave them)", () => {
  it("signs in when the email and password give a token with a customer", async () => {
    expect(await signInFlow({ login: async () => ok("tok"), hasCustomer: async () => ok(true) })).toEqual({
      ok: true,
      token: "tok",
    })
  })

  it("a wrong password and an unknown email are the same answer: HTTP 401, 'wrong'", async () => {
    expect(await signInFlow({ login: async () => fail(401), hasCustomer: async () => ok(true) })).toEqual({
      ok: false,
      problem: "wrong",
    })
  })

  it("Medusa's HTTP 400 at sign-in is 'wrong email or password', never a server error (QA S1-4c, S3)", async () => {
    expect(await signInFlow({ login: async () => fail(400), hasCustomer: async () => ok(true) })).toEqual({
      ok: false,
      problem: "wrong",
    })
    expect(authProblemText("wrong", "Something went wrong on our side")).toBe(
      "That email and password don't match an account."
    )
  })

  it("a sign-in with no customer behind it is 'wrong' too, never 'no account'", async () => {
    expect(await signInFlow({ login: async () => ok("tok"), hasCustomer: async () => ok(false) })).toEqual({
      ok: false,
      problem: "wrong",
    })
  })

  it("no answer is 'unreachable'; a 5xx is the store's fault", async () => {
    expect((await signInFlow({ login: async () => fail(), hasCustomer: async () => ok(true) })) as unknown).toEqual({
      ok: false,
      problem: "unreachable",
    })
    expect((await signInFlow({ login: async () => fail(500), hasCustomer: async () => ok(true) })) as unknown).toEqual({
      ok: false,
      problem: "server",
    })
  })
})

describe("signUpFlow", () => {
  const calls = () => {
    const log: string[] = []
    return {
      log,
      make: (over: Partial<Parameters<typeof signUpFlow>[0]> = {}) => ({
        register: async () => (log.push("register"), ok("reg")),
        login: async () => (log.push("login"), ok("login")),
        hasCustomer: async () => (log.push("me"), ok(false)),
        createCustomer: async (token: string) => (log.push(`create:${token}`), ok({})),
        ...over,
      }),
    }
  }

  it("registers, creates the customer with the registration token, then signs in", async () => {
    const { log, make } = calls()
    expect(await signUpFlow(make())).toEqual({ ok: true, token: "login" })
    expect(log).toEqual(["register", "create:reg", "login"])
  })

  it("an email already registered with another password is 'exists' (W-L11)", async () => {
    const { log, make } = calls()
    const outcome = await signUpFlow(make({ register: async () => fail(401), login: async () => fail(401) }))
    expect(outcome).toEqual({ ok: false, problem: "exists" })
    expect(log).toEqual([])
  })

  it("finishes an earlier attempt that stopped half-way (registered, no customer)", async () => {
    const { log, make } = calls()
    const outcome = await signUpFlow(make({ register: async () => (log.push("register"), fail(401)) }))
    expect(outcome).toEqual({ ok: true, token: "login" })
    expect(log).toEqual(["register", "login", "me", "create:login", "login"])
  })

  it("signs in someone who already has an account and typed its password", async () => {
    const { log, make } = calls()
    const outcome = await signUpFlow(
      make({ register: async () => fail(401), hasCustomer: async () => (log.push("me"), ok(true)) })
    )
    expect(outcome).toEqual({ ok: true, token: "login" })
    expect(log).toEqual(["login", "me"])
  })

  it("no answer or a 5xx anywhere is not 'exists'", async () => {
    const { make } = calls()
    expect(await signUpFlow(make({ register: async () => fail() }))).toEqual({ ok: false, problem: "unreachable" })
    expect(await signUpFlow(make({ register: async () => fail(500) }))).toEqual({ ok: false, problem: "server" })
    expect(await signUpFlow(make({ createCustomer: async () => fail(500) }))).toEqual({ ok: false, problem: "server" })
  })
})

describe("the cart after sign-in", () => {
  it("is let go when the store refuses to move it (4xx), kept otherwise", () => {
    expect(cartAfterTransfer(ok({}))).toBe("kept")
    expect(cartAfterTransfer(fail(400))).toBe("dropped")
    expect(cartAfterTransfer(fail(404))).toBe("dropped")
    expect(cartAfterTransfer(fail(500))).toBe("kept")
    expect(cartAfterTransfer(fail())).toBe("kept")
  })
})

describe("the problem's words", () => {
  it("are the specification's", () => {
    expect(authProblemText("wrong", "S")).toBe("That email and password don't match an account.")
    expect(authProblemText("exists", "S")).toBe("There's already an account with this email.")
    expect(authProblemText("unreachable", "S")).toBe(
      "We couldn't reach the store. Check your connection and try again."
    )
    expect(authProblemText("server", "S")).toBe("S")
  })
})
