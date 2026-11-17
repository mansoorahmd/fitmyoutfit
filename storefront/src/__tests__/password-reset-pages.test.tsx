import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const calls = vi.hoisted(() => ({
  request: [] as unknown[][],
  requestAnswer: undefined as unknown,
  requestGate: null as null | Promise<void>,
  reset: [] as unknown[][],
  resetAnswer: undefined as unknown,
  resetGate: null as null | Promise<void>,
  forMe: 0,
  forMeAnswer: undefined as unknown,
  forMeGate: null as null | Promise<void>,
  loaded: [] as string[],
  pushed: [] as string[],
}))

vi.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: "pk" }),
  useRouter: () => ({ push: (href: string) => calls.pushed.push(href), refresh: () => {} }),
}))
vi.mock("@modules/account/load-page", () => ({
  loadPage: (href: string) => {
    calls.loaded.push(href)
  },
}))
vi.mock("@lib/data/customer", () => ({
  updateCustomerName: async () => ({ kind: "saved" }),
  updateCustomerPhone: async () => ({ kind: "saved" }),
}))
vi.mock("@lib/data/password-reset", () => ({
  requestPasswordReset: async (...args: unknown[]) => {
    calls.request.push(args)
    await calls.requestGate
    return calls.requestAnswer
  },
  resetPassword: async (...args: unknown[]) => {
    calls.reset.push(args)
    await calls.resetGate
    return calls.resetAnswer
  },
  requestPasswordResetForMe: async () => {
    calls.forMe += 1
    await calls.forMeGate
    return calls.forMeAnswer
  },
}))

import ForgotPasswordTemplate from "@modules/account/templates/forgot-password-template"
import ResetPasswordTemplate from "@modules/account/templates/reset-password-template"
import ProfileRows from "@modules/account/components/profile-rows"

const type = (label: RegExp | string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

const press = async (testId: string) => {
  await act(async () => {
    fireEvent.click(screen.getByTestId(testId))
  })
}

const gate = () => {
  let open!: () => void
  const promise = new Promise<void>((resolve) => {
    open = resolve
  })
  return { promise, open }
}

beforeEach(async () => {
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
  window.sessionStorage.clear()
  calls.request = []
  calls.requestAnswer = { kind: "requested" }
  calls.requestGate = null
  calls.reset = []
  calls.resetAnswer = undefined
  calls.resetGate = null
  calls.forMe = 0
  calls.forMeAnswer = { kind: "requested", email: "ali@example.com" }
  calls.forMeGate = null
  calls.loaded = []
  calls.pushed = []
})

describe("the forgot-password page", () => {
  it("has a heading, one email field and one button", () => {
    render(<ForgotPasswordTemplate />)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Forgot your password?")
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email")
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email")
    expect(screen.getByTestId("forgot-submit")).toHaveTextContent("Get a reset link")
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/pk/account")
    expect(screen.queryByTestId("forgot-requested")).toBeNull()
  })

  it("is prefilled with the email carried over from sign-in, once", async () => {
    window.sessionStorage.setItem("fmo.forgot-email", "ali@example.com")
    render(<ForgotPasswordTemplate />)
    expect(await screen.findByDisplayValue("ali@example.com")).toBe(screen.getByLabelText("Email"))
    expect(window.sessionStorage.getItem("fmo.forgot-email")).toBeNull()
  })

  it("checks the email first and sends nothing for a wrong one", async () => {
    render(<ForgotPasswordTemplate />)
    type("Email", "nope")
    await press("forgot-submit")
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByText("Enter your email address, like name@example.com")).toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByLabelText("Email"))
    expect(calls.request).toHaveLength(0)
  })

  it("after a request says a link is on its way, how long it lasts and what to do, announced; never that an email was sent", async () => {
    render(<ForgotPasswordTemplate />)
    type("Email", "Ali@Example.com")
    await press("forgot-submit")
    expect(calls.request).toEqual([[{ email: "Ali@Example.com" }]])
    const message = screen.getByRole("status")
    expect(message).toHaveTextContent("If that email belongs to an account, a reset link is on its way.")
    expect(message).toHaveTextContent("The link works for 15 minutes.")
    expect(message).toHaveTextContent("look in your spam folder")
    expect(message).toHaveTextContent("A new link cancels the earlier one.")
    expect(message.textContent).not.toMatch(/\b(sent|emailed)\b/i)
  })

  it("asks again from the same page, with the form still there", async () => {
    render(<ForgotPasswordTemplate />)
    type("Email", "ali@example.com")
    await press("forgot-submit")
    expect(screen.getByTestId("forgot-submit")).toHaveTextContent("Ask again")
    expect(screen.getByLabelText("Email")).toHaveValue("ali@example.com")
    await press("forgot-submit")
    expect(calls.request).toHaveLength(2)
    expect(screen.getByRole("status")).toBeInTheDocument()
  })

  it("gives the same text whatever the email, known or unknown (the backend's answers are the same)", async () => {
    const texts: string[] = []
    for (const email of ["known@example.com", "unknown@example.com"]) {
      const { unmount } = render(<ForgotPasswordTemplate />)
      type("Email", email)
      await press("forgot-submit")
      texts.push(screen.getByTestId("forgot-requested").textContent ?? "")
      unmount()
    }
    expect(texts[0]).toBe(texts[1])
    expect(texts[0]).not.toContain("example.com")
  })

  it("a failed request says it could not be asked for, takes focus, and offers to try again", async () => {
    calls.requestAnswer = { kind: "failed" }
    render(<ForgotPasswordTemplate />)
    type("Email", "ali@example.com")
    await press("forgot-submit")
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("We couldn't ask for the link. Check your connection and try again.")
    expect(document.activeElement).toBe(alert)
    expect(screen.queryByTestId("forgot-requested")).toBeNull()
    expect(screen.getByTestId("forgot-submit")).toHaveTextContent("Try again")
    // and the same press tries again
    calls.requestAnswer = { kind: "requested" }
    await press("forgot-submit")
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByTestId("forgot-requested")).toBeInTheDocument()
  })

  it("a thrown error is a failed request, not an error page", async () => {
    render(<ForgotPasswordTemplate />)
    type("Email", "ali@example.com")
    calls.requestGate = Promise.reject(new Error("network"))
    calls.requestGate.catch(() => {})
    await press("forgot-submit")
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't ask for the link.")
  })

  it("blocks a second submit while the first runs", async () => {
    const g = gate()
    calls.requestGate = g.promise
    render(<ForgotPasswordTemplate />)
    type("Email", "ali@example.com")
    await press("forgot-submit")
    await press("forgot-submit")
    expect(calls.request).toHaveLength(1)
    await act(async () => g.open())
    expect(screen.getByTestId("forgot-requested")).toBeInTheDocument()
  })
})

describe("the page a reset link opens", () => {
  it("shows the email (not editable) and one new-password field with create account's hint", () => {
    render(<ResetPasswordTemplate email="ali@example.com" />)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Set a new password")
    expect(screen.getByTestId("reset-email")).toHaveTextContent("ali@example.com")
    const field = screen.getByLabelText("New password")
    expect(field).toHaveAttribute("type", "password")
    expect(field).toHaveAttribute("autocomplete", "new-password")
    expect(screen.getByText("At least 8 characters.")).toBeInTheDocument()
    // the only editable fields: the password (the email is text, plus a hidden username for password managers)
    expect(screen.getAllByRole("textbox", { hidden: true }).every((el) => el.hasAttribute("readonly"))).toBe(true)
    expect(screen.getByTestId("reset-submit")).toHaveTextContent("Save new password")
  })

  it("checks the password before sending: 7 characters and only spaces send nothing", async () => {
    render(<ResetPasswordTemplate email="ali@example.com" />)
    type("New password", "1234567")
    await press("reset-submit")
    expect(screen.getByText("Use at least 8 characters")).toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByLabelText("New password"))
    type("New password", "        ")
    await press("reset-submit")
    expect(screen.getByText("Use letters, numbers or symbols, not only spaces")).toBeInTheDocument()
    type("New password", "")
    await press("reset-submit")
    expect(calls.reset).toHaveLength(0)
  })

  it("sends the password only (no token, no email) with the country, and goes to sign-in on success", async () => {
    calls.resetAnswer = { kind: "changed", href: "/pk/account?view=signin&email=ali%40example.com&notice=password-changed" }
    render(<ResetPasswordTemplate email="ali@example.com" />)
    type("New password", "a-good-password")
    await press("reset-submit")
    expect(calls.reset).toEqual([[{ password: "a-good-password" }, "pk"]])
    expect(calls.loaded).toEqual(["/pk/account?view=signin&email=ali%40example.com&notice=password-changed"])
  })

  it("blocks a second submit while the first runs: a double press sends one update", async () => {
    const g = gate()
    calls.resetGate = g.promise
    calls.resetAnswer = { kind: "changed", href: "/pk/account" }
    render(<ResetPasswordTemplate email="ali@example.com" />)
    type("New password", "a-good-password")
    await press("reset-submit")
    await press("reset-submit")
    fireEvent.submit(screen.getByTestId("reset-form"))
    expect(calls.reset).toHaveLength(1)
    await act(async () => g.open())
    expect(calls.loaded).toHaveLength(1)
  })

  it("a link that turns out dead shows one plain message and a button to ask for a new link, email carried over", async () => {
    calls.resetAnswer = { kind: "gone" }
    render(<ResetPasswordTemplate email="ali@example.com" />)
    type("New password", "a-good-password")
    await press("reset-submit")
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("This link no longer works")
    expect(screen.getByTestId("reset-gone")).toHaveTextContent("A reset link works once, for 15 minutes.")
    expect(screen.queryByLabelText("New password")).toBeNull()
    const ask = screen.getByRole("link", { name: "Ask for a new link" })
    expect(ask).toHaveAttribute("href", "/pk/account/forgot-password")
    expect(ask.getAttribute("href")).not.toMatch(/ali|@/)
    ask.addEventListener("click", (event) => event.preventDefault())
    fireEvent.click(ask)
    expect(window.sessionStorage.getItem("fmo.forgot-email")).toBe("ali@example.com")
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }))
  })

  it("a page with no usable link (missing token or email, expired, used) shows the same message, not an error", () => {
    render(<ResetPasswordTemplate email={null} />)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("This link no longer works")
    expect(screen.getByRole("link", { name: "Ask for a new link" })).toHaveAttribute("href", "/pk/account/forgot-password")
    expect(screen.queryByTestId("reset-form")).toBeNull()
  })

  it("a failed save says so, keeps the form and the password, and lets the customer try again without a new link", async () => {
    calls.resetAnswer = { kind: "failed" }
    render(<ResetPasswordTemplate email="ali@example.com" />)
    type("New password", "a-good-password")
    await press("reset-submit")
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("We couldn't save your new password.")
    expect(document.activeElement).toBe(alert)
    expect(screen.getByLabelText("New password")).toHaveValue("a-good-password")
    expect(screen.queryByText("This link no longer works")).toBeNull()
    calls.resetAnswer = { kind: "changed", href: "/pk/account" }
    await press("reset-submit")
    expect(calls.reset).toHaveLength(2)
    expect(calls.loaded).toEqual(["/pk/account"])
  })

  it("a thrown error is a failed save, not an error page", async () => {
    calls.resetGate = Promise.reject(new Error("network"))
    calls.resetGate.catch(() => {})
    render(<ResetPasswordTemplate email="ali@example.com" />)
    type("New password", "a-good-password")
    await press("reset-submit")
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't save your new password.")
  })

  it("shows the server's own refusal of the password as the field's error", async () => {
    calls.resetAnswer = { kind: "invalid", errors: { password: "Use at least 8 characters" } }
    render(<ResetPasswordTemplate email="ali@example.com" />)
    type("New password", "a-good-password")
    await press("reset-submit")
    expect(screen.getByText("Use at least 8 characters")).toBeInTheDocument()
  })

  it("holds no token: the component is given the email and nothing else", () => {
    const { container } = render(<ResetPasswordTemplate email="ali@example.com" />)
    expect(container.innerHTML).not.toMatch(/token|eyJ/i)
  })
})

describe("the profile's Password row", () => {
  const rows = () => render(<ProfileRows initial={{ firstName: "Ali", lastName: "Raza", phone: "" }} email="ali@example.com" />)

  it("is back, masked, with a button that emails a link and no old-password field", () => {
    rows()
    expect(screen.getByTestId("profile-row-password")).toHaveTextContent("Password")
    expect(screen.getByTestId("profile-value-password")).toHaveTextContent("••••••••")
    expect(screen.getByRole("button", { name: "Email me a link to change my password" })).toHaveTextContent("Email me a link")
    expect(screen.queryByTestId("profile-edit-password")).toBeNull()
    expect(screen.queryByLabelText(/old|current|previous/i)).toBeNull()
  })

  it("asks for the link, then says where it is on its way and for how long, announced", async () => {
    rows()
    await press("profile-password-link")
    expect(calls.forMe).toBe(1)
    const message = screen.getByRole("status")
    expect(message).toHaveTextContent("A link to set a new password is on its way to ali@example.com.")
    expect(message).toHaveTextContent("The link works for 15 minutes.")
    expect(message.textContent).not.toMatch(/\b(sent|emailed)\b/i)
  })

  it("a double press sends one request", async () => {
    const g = gate()
    calls.forMeGate = g.promise
    rows()
    await press("profile-password-link")
    await press("profile-password-link")
    await press("profile-password-link")
    expect(calls.forMe).toBe(1)
    expect(screen.getByTestId("profile-password-link")).toHaveTextContent("Requesting…")
    await act(async () => g.open())
    expect(screen.getByTestId("profile-password-requested")).toBeInTheDocument()
  })

  it("a failed request says so, and the button can be pressed again", async () => {
    calls.forMeAnswer = { kind: "failed" }
    rows()
    await press("profile-password-link")
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't ask for the link. Try again.")
    calls.forMeAnswer = { kind: "requested", email: "ali@example.com" }
    await press("profile-password-link")
    expect(calls.forMe).toBe(2)
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByTestId("profile-password-requested")).toBeInTheDocument()
  })

  it("a signed-out answer goes to sign-in, returning to the profile", async () => {
    calls.forMeAnswer = { kind: "signed_out" }
    rows()
    await press("profile-password-link")
    expect(calls.pushed).toEqual(["/pk/account?view=signin&next=%2Faccount%2Fprofile"])
  })
})
