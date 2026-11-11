import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { checkoutContent } from "@content/checkout"
import { orderContent } from "@content/order"

const src = path.resolve(__dirname, "..")
const read = (file: string) => fs.readFileSync(path.join(src, file), "utf8")

/**
 * The string entries of a content file that have no "DRAFT WORDING." mark
 * in the comment lines straight above them. Paths and the data marked
 * "(data, not wording)" or "a path, not wording" are not entries.
 */
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
    if (/not wording/.test(lines.slice(Math.max(0, i - 8), i).join(" "))) return
    if (!comment.includes("DRAFT WORDING.")) out.push(`${file}:${i + 1} ${line.trim()}`)
  })
  return out
}

describe("checkout and order wording (AC 8)", () => {
  it("marks every entry as draft wording, with its id", () => {
    expect(unmarked("content/checkout.ts")).toEqual([])
    expect(unmarked("content/order.ts")).toEqual([])
  })

  it("uses the specification's sentences as written (section 11)", () => {
    const k = checkoutContent
    expect(k.stepLabel).toBe("Step {n} of 2 · {name}")
    expect(k.address.submit).toBe("Continue to delivery and payment")
    expect(k.deliveryBlock.failed).toBe(
      "We couldn't set up delivery to this address. Check the address, or try again."
    )
    expect(k.payment.cod.overLimit).toBe("Not available for orders over {limit}.")
    expect(k.payment.codWillPay).toBe("You'll pay {total} in cash when your order arrives.")
    expect(k.placeOrder.minimum).toBe("Add {missing} more garment pieces to place the order.")
    expect(k.minimum.title).toBe("Your order needs {required} garment pieces")
    expect(k.errors.codOverLimit).toBe(
      "It's for orders up to {limit}. Your total is {total}. Choose another way to pay."
    )
    expect(k.errors.lostText).toBe(
      "We don't know yet if your order went through. Check before you try again, so you don't order twice."
    )
    expect(orderContent.payment.codLine).toBe("Pay {total} in cash when your order arrives.")
    expect(orderContent.band.keepNumber).toBe("Your confirmation is on this page. Keep the order number.")
  })

  it("writes no limit, total, minimum or date into a sentence: they come from the backend", () => {
    const promises = [
      checkoutContent.payment.cod.overLimit,
      checkoutContent.payment.codWillPay,
      checkoutContent.placeOrder.minimum,
      checkoutContent.minimum.title,
      checkoutContent.minimum.text,
      checkoutContent.errors.codOverLimit,
      orderContent.payment.codLine,
      orderContent.next.deliveredBy,
    ]
    for (const text of promises) expect(text, text).not.toMatch(/\d/)
  })

  it("says nothing about an email sent, or the order joining an account", () => {
    const all = JSON.stringify(orderContent)
    expect(all).not.toMatch(/sent a confirmation/i)
    expect(all).not.toMatch(/will (appear|show) in your account/i)
  })
})
