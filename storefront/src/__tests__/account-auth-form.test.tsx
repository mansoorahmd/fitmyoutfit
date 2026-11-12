import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { calls } = vi.hoisted(() => ({
  calls: {
    signIn: [] as unknown[][],
    signUp: [] as unknown[][],
    answer: undefined as unknown,
    loaded: [] as string[],
  },
}))

vi.mock("@modules/account/load-page", () => ({
  loadPage: (href: string) => {
    calls.loaded.push(href)
  },
}))

vi.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: "pk" }),
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}))
vi.mock("@lib/data/customer", () => ({
  signIn: async (...args: unknown[]) => {
    calls.signIn.push(args)
    return calls.answer
  },
  signUp: async (...args: unknown[]) => {
    calls.signUp.push(args)
    return calls.answer
  },
}))

import AuthTemplate from "@modules/account/templates/auth-template"

const type = (label: RegExp | string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

const submit = async () => {
  await act(async () => {
    fireEvent.click(screen.getByTestId("auth-submit"))
  })
}

beforeEach(async () => {
  // a focus move a test left in an animation frame lands before this test starts
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
  calls.signIn = []
  calls.signUp = []
  calls.answer = undefined
  calls.loaded = []
})

describe("sign-in view (05, 8.3)", () => {
  it("has the title, the two view links with next kept, the why line and the fields", () => {
    render(<AuthTemplate view="signin" next="/cart" email="" />)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Sign in")
    const nav = screen.getByRole("navigation", { name: "Sign in or create an account" })
    const current = within(nav).getByRole("link", { name: "Sign in" })
    expect(current).toHaveAttribute("aria-current", "page")
    expect(current).toHaveAttribute("href", "/pk/account?view=signin&next=%2Fcart")
    expect(within(nav).getByRole("link", { name: "Create account" })).toHaveAttribute(
      "href",
      "/pk/account?view=create&next=%2Fcart"
    )
    expect(screen.getByText("See your orders and use your saved addresses.")).toBeInTheDocument()
    expect(screen.getByLabelText("Email")).toHaveAttribute("dir", "ltr")
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password")
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password")
  })

  it("has no 'Forgot your password?' link while reset doesn't exist", () => {
    render(<AuthTemplate view="signin" next={null} email="" />)
    expect(screen.queryByText("Forgot your password?")).toBeNull()
  })

  it("shows and hides the password in words", () => {
    render(<AuthTemplate view="signin" next={null} email="" />)
    const toggle = screen.getByRole("button", { name: "Show password" })
    expect(toggle).toHaveTextContent("Show")
    fireEvent.click(toggle)
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text")
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveTextContent("Hide")
  })

  it("checks every field on submit, focuses the first error and sends nothing", async () => {
    render(<AuthTemplate view="signin" next={null} email="" />)
    await submit()
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByText("Enter your email address, like name@example.com")).toBeInTheDocument()
    expect(screen.getByText("Enter your password")).toBeInTheDocument()
    expect(calls.signIn).toHaveLength(0)
  })

  it("a wrong email or password: the message, focus on it, the password cleared, the email kept", async () => {
    calls.answer = { kind: "problem", problem: "wrong" }
    render(<AuthTemplate view="signin" next="/cart" email="" />)
    type("Email", "ali@example.com")
    type("Password", "nope-nope")
    await submit()
    expect(calls.signIn).toEqual([[{ email: "ali@example.com", password: "nope-nope" }, "pk", "/cart"]])
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("That email and password don't match an account.")
    expect(document.activeElement).toBe(alert)
    expect(screen.getByLabelText("Password")).toHaveValue("")
    expect(screen.getByLabelText("Email")).toHaveValue("ali@example.com")
  })

  it("no answer from the store: W-E16", async () => {
    calls.answer = { kind: "problem", problem: "unreachable" }
    render(<AuthTemplate view="signin" next={null} email="" />)
    type("Email", "ali@example.com")
    type("Password", "x")
    await submit()
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't reach the store. Check your connection and try again."
    )
  })
})

describe("create view (05, 8.3)", () => {
  it("has the create fields, the password hint and the email from ?email=", () => {
    render(<AuthTemplate view="create" next={null} email="ali@example.com" />)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Create an account")
    expect(screen.getByText("Save your addresses and see your orders in one place.")).toBeInTheDocument()
    expect(screen.getByLabelText("First name")).toHaveAttribute("dir", "auto")
    expect(screen.getByLabelText("Last name (optional)")).toHaveAttribute("dir", "auto")
    expect(screen.getByLabelText("Phone (optional)")).toHaveAttribute("dir", "ltr")
    expect(screen.getByLabelText("Email")).toHaveValue("ali@example.com")
    expect(screen.getByText("At least 8 characters.")).toBeInTheDocument()
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password")
    // no terms line until the pages exist
    expect(screen.queryByText(/Terms/)).toBeNull()
  })

  it("lists 3 or more errors at the top, with links to the fields", async () => {
    render(<AuthTemplate view="create" next={null} email="" />)
    await submit()
    const list = screen.getByTestId("error-list")
    expect(within(list).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual([
      "#auth-firstName",
      "#auth-email",
      "#auth-password",
    ])
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    expect(document.activeElement).toBe(screen.getByLabelText("First name"))
  })

  it("sends an Urdu first name as typed, then loads where the store says", async () => {
    calls.answer = { kind: "signed_in", href: "/pk/cart" }
    render(<AuthTemplate view="create" next="/cart" email="" />)
    type("First name", "محمد علی")
    type("Email", "ali@example.com")
    type("Password", "team-kit-2026")
    await submit()
    expect(calls.signUp).toEqual([
      [{ firstName: "محمد علی", lastName: "", email: "ali@example.com", phone: "", password: "team-kit-2026" }, "pk", "/cart"],
    ])
    // signed in: the next page loads afresh, the button stays busy meanwhile
    expect(calls.loaded).toEqual(["/pk/cart"])
    expect(screen.getByTestId("auth-submit")).toHaveAttribute("aria-busy", "true")
  })

  it("an email that already has an account: W-L11 with 'Sign in instead'", async () => {
    calls.answer = { kind: "problem", problem: "exists" }
    render(<AuthTemplate view="create" next="/cart" email="" />)
    type("First name", "Ali")
    type("Email", "ali@example.com")
    type("Password", "team-kit-2026")
    await submit()
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("There's already an account with this email.")
    expect(within(alert).getByRole("link", { name: "Sign in instead" })).toHaveAttribute(
      "href",
      "/pk/account?view=signin&next=%2Fcart&email=ali%40example.com"
    )
  })
})
