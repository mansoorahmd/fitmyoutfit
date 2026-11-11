import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { accountContent } from "@content/account"
import { MIN_PASSWORD_LENGTH } from "@lib/util/account-auth"
import { fill } from "@lib/util/wording"
import { ACCOUNT_FILES } from "./account-files"

const src = path.resolve(__dirname, "..")
const read = (file: string) => fs.readFileSync(path.join(src, file), "utf8")


/** The source without comments, which may quote the wording they explain. */
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")

/** The string entries of a content file without a "DRAFT WORDING." mark in the comments straight above. */
const unmarked = (file: string): string[] => {
  const lines = read(file).split("\n")
  const out: string[] = []
  lines.forEach((line, i) => {
    if (!/^\s+\w+: "/.test(line) || /: "\//.test(line)) return
    let j = i - 1
    let comment = ""
    while (j >= 0 && /^\s*(\/\/|\/\*\*|\*)/.test(lines[j])) {
      comment = lines[j] + comment
      j -= 1
    }
    if (/not wording/.test(lines.slice(Math.max(0, i - 3), i).join(" "))) return
    if (!comment.includes("DRAFT WORDING.")) out.push(`${file}:${i + 1} ${line.trim()}`)
  })
  return out
}

const strings = (value: unknown): string[] =>
  typeof value === "string"
    ? [value]
    : value && typeof value === "object"
      ? Object.values(value).flatMap(strings)
      : []

describe("account wording is data (AC 8)", () => {
  it("is marked as draft wording, every entry, each with an id or 'No id'", () => {
    expect(read("content/account.ts").startsWith("// DRAFT WORDING.")).toBe(true)
    expect(unmarked("content/account.ts")).toEqual([])
    const marks = read("content/account.ts").match(/\/\/ DRAFT WORDING\. (W-[A-Z]+\d+|No id)/g) ?? []
    expect(marks.length).toBe((read("content/account.ts").match(/\/\/ DRAFT WORDING\./g) ?? []).length - 1)
  })

  it("uses the specification's sentences as written (section 11, Sign-in and Account)", () => {
    const a = accountContent
    expect([a.auth.signInTitle, a.auth.createTitle]).toEqual(["Sign in", "Create an account"])
    expect([a.auth.tabs.signIn, a.auth.tabs.create]).toEqual(["Sign in", "Create account"])
    expect(a.auth.signInWhy).toBe("See your orders and use your saved addresses.")
    expect(a.auth.createWhy).toBe("Save your addresses and see your orders in one place.")
    expect(fill(a.auth.fields.passwordHint, { min: MIN_PASSWORD_LENGTH })).toBe("At least 8 characters.")
    expect(a.auth.creating).toBe("Creating your account…")
    expect(a.auth.forgotPassword.label).toBe("Forgot your password?")
    expect(a.auth.errors.wrong).toBe("That email and password don't match an account.")
    expect(a.auth.errors.exists).toBe("There's already an account with this email.")
    expect(a.auth.errors.signInInstead).toBe("Sign in instead")
    expect(a.frame.title).toBe("Your account")
    expect(a.frame.hello).toBe("Hello, {name}")
    expect(a.frame.menu.signingOut).toBe("Signing out…")
    expect([a.overview.recentOrders, a.overview.seeAllOrders]).toEqual(["Recent orders", "See all orders"])
    expect(a.overview.noAddress).toBe("No saved address yet.")
    expect(a.orders.title).toBe("Your orders")
    expect(a.orders.status).toEqual({ cancelled: "Cancelled", placed: "Order placed", onItsWay: "On its way", delivered: "Delivered" })
    expect(a.orders.showMore).toBe("Show more orders")
    expect(a.orders.failed).toBe("We couldn't load your orders.")
    expect(a.addresses.empty).toBe("No saved addresses yet. Add one to check out faster.")
    expect(a.addresses.makeDefault).toBe("Make this my default address")
    expect([a.addresses.removeTitle, a.addresses.keep]).toEqual(["Remove this address?", "Keep it"])
    expect([a.addresses.saveFailed, a.addresses.removeFailed]).toEqual([
      "We couldn't save the address. Try again.",
      "We couldn't remove the address.",
    ])
    expect([a.profile.saved, a.profile.saveFailed]).toEqual(["Saved", "We couldn't save this. Try again."])
  })

  it("keeps the password reset link off until reset exists", () => {
    expect(accountContent.auth.forgotPassword.show).toBe(false)
  })

  it("promises no email and no linking of earlier guest orders", () => {
    const all = strings(accountContent).join(" | ")
    expect(all).not.toMatch(/\b(sent|send|emailed|we'll email|check your (inbox|email))\b/i)
    expect(all).not.toMatch(/earlier orders|past orders|guest orders|will (appear|show) in your account/i)
  })

  it("writes no number into a sentence: limits and dates come from the backend", () => {
    for (const text of strings(accountContent)) {
      // "1 piece" is the singular form of a count, not a promise
      if (text.startsWith("/") || text === accountContent.orders.card.pieces.one) continue
      expect(text, text).not.toMatch(/\d/)
    }
  })

  it("no sentence of the account is written into a component", () => {
    const sentences = strings(accountContent).filter((s) => s.length > 4 && !s.startsWith("/"))
    for (const file of ACCOUNT_FILES) {
      const source = code(file)
      for (const sentence of sentences) {
        expect(source.includes(`"${sentence}"`) || source.includes(`>${sentence}<`), `${file}: ${sentence}`).toBe(false)
      }
    }
  })

  it("no component holds words of its own between tags", () => {
    for (const file of ACCOUNT_FILES) {
      const source = code(file)
      // text between a closing ">" and the next "<" or "{", with a letter in it
      const loose = Array.from(source.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g))
        .map((m) => m[1].trim())
        // type arguments ("Promise<Record<…>>") and code are not text
        .filter((t) => t && !/^[\w.]+\s*=>/.test(t) && !/[=;():]/.test(t))
      expect(loose, file).toEqual([])
    }
  })
})
