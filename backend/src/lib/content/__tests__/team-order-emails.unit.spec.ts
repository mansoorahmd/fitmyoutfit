import {
  emailFor,
  escapeHtml,
  formatDay,
  orderPhrase,
  paymentDueEmail,
  proofReadyEmail,
  reminderEmail,
  WORDING_IS_DRAFT,
  type SignDeadline,
} from "../team-order-emails"

const deadline = (day: string | null, extra: Partial<SignDeadline> = {}): SignDeadline => ({
  day,
  rush: false,
  cannotBeMet: false,
  ...extra,
})

describe("the wording is marked as a draft", () => {
  it("until the founders confirm it", () => {
    expect(WORDING_IS_DRAFT).toBe(true)
  })
})

describe("formatDay and escapeHtml", () => {
  it("writes a calendar day in words, with no time zone arithmetic", () => {
    expect(formatDay("2026-12-03")).toBe("3 December 2026")
    expect(formatDay("2027-01-31")).toBe("31 January 2027")
    expect(formatDay("not a day")).toBe("not a day")
  })

  it("escapes what html reads", () => {
    expect(escapeHtml(`<b>"A" & 'B'</b>`)).toBe("&lt;b&gt;&quot;A&quot; &amp; &#39;B&#39;&lt;/b&gt;")
  })
})

describe("proofReadyEmail", () => {
  it("names the team, the proof number and the latest day to sign", () => {
    const mail = proofReadyEmail({
      firstName: "Ali",
      teamName: "Lahore Lions",
      orderKind: "order",
      proofNumber: 2,
      deadline: deadline("2026-12-16"),
    })
    expect(mail.subject).toBe("Proof 2 for Lahore Lions is ready to sign")
    expect(mail.text).toContain("Hello Ali,")
    expect(mail.text).toContain('Proof 2 for "Lahore Lions" is ready.')
    expect(mail.text).toContain("the latest day to sign the proof is 16 December 2026.")
    expect(mail.html).toContain("<p>Hello Ali,</p>")
    expect(mail.html).toContain("16 December 2026")
  })

  it("has no deadline sentence without a need-by date", () => {
    const mail = proofReadyEmail({ firstName: null, teamName: "T", orderKind: "order", proofNumber: 1, deadline: deadline(null) })
    expect(mail.text).toContain("Hello,")
    expect(mail.text).not.toMatch(/latest day/)
  })

  it("says so when only rush can still meet the date, and when nothing can", () => {
    const rush = proofReadyEmail({ firstName: null, teamName: "T", orderKind: "order", proofNumber: 1, deadline: deadline("2026-12-21", { rush: true }) })
    expect(rush.text).toMatch(/standard delivery is already too late\. With paid rush, the latest day to sign the proof is 21 December 2026/)
    const late = proofReadyEmail({
      firstName: null,
      teamName: "T",
      orderKind: "order",
      proofNumber: 1,
      deadline: deadline("2026-12-21", { rush: true, cannotBeMet: true }),
    })
    expect(late.text).toMatch(/cannot promise it/)
  })

  it("an add-on and a reorder say which order it is", () => {
    const base = { firstName: null, teamName: "Lions", proofNumber: 1, deadline: deadline(null) }
    expect(proofReadyEmail({ ...base, orderKind: "add_on" }).text).toContain('add-on order for late players of "Lions"')
    expect(proofReadyEmail({ ...base, orderKind: "reorder" }).text).toContain('reorder for "Lions"')
    expect(proofReadyEmail({ ...base, orderKind: "order" }).text).not.toMatch(/add-on|reorder/)
  })

  it("escapes the team name in the html but not in the text", () => {
    const mail = proofReadyEmail({ firstName: null, teamName: "A&B <Boys>", orderKind: "order", proofNumber: 1, deadline: deadline(null) })
    expect(mail.text).toContain('"A&B <Boys>"')
    expect(mail.html).toContain("A&amp;B &lt;Boys&gt;")
    expect(mail.html).not.toContain("<Boys>")
  })
})

describe("reminderEmail", () => {
  it("3 days and 1 day, with the latest day", () => {
    const three = reminderEmail({ firstName: "Ali", teamName: "Lions", orderKind: "order", daysLeft: 3, deadline: deadline("2026-12-16") })
    expect(three.subject).toBe("3 days left to sign the proof for Lions")
    expect(three.text).toContain("is 16 December 2026, 3 days from now.")
    const one = reminderEmail({ firstName: "Ali", teamName: "Lions", orderKind: "order", daysLeft: 1, deadline: deadline("2026-12-16") })
    expect(one.subject).toBe("1 day left to sign the proof for Lions")
    expect(one.text).toContain("1 day from now.")
  })

  it("the rush reminder says it is the rush day", () => {
    const mail = reminderEmail({
      firstName: null,
      teamName: "Lions",
      orderKind: "order",
      daysLeft: 3,
      deadline: deadline("2026-12-21", { rush: true }),
    })
    expect(mail.text).toMatch(/Standard delivery can no longer meet your need-by date, but paid rush still can/)
    expect(mail.text).toContain("with rush is 21 December 2026")
  })
})

describe("paymentDueEmail", () => {
  it("the deposit and the balance say what is due in words, with no amount, and that details follow", () => {
    const deposit = paymentDueEmail({ firstName: null, teamName: "Lions", orderKind: "order", which: "deposit" })
    const balance = paymentDueEmail({ firstName: null, teamName: "Lions", orderKind: "order", which: "balance" })
    expect(deposit.subject).toBe("Deposit due for Lions")
    expect(deposit.text).toContain("The deposit for the team order is now due.")
    expect(balance.subject).toBe("Balance due for Lions")
    expect(balance.text).toContain("The balance for the team order")
    for (const mail of [deposit, balance]) {
      expect(mail.text).toContain("We will send you the payment details separately.")
      expect(mail.text).not.toMatch(/\d[\d,.]*\s?(PKR|GBP|AED|USD|Rs|£|\$|%)|[£$]\s?\d|50\s?%/)
    }
  })

  it("an add-on and a reorder name their own order", () => {
    expect(paymentDueEmail({ firstName: null, teamName: "L", orderKind: "add_on", which: "deposit" }).text).toContain("The deposit for the add-on order")
    expect(paymentDueEmail({ firstName: null, teamName: "L", orderKind: "reorder", which: "balance" }).text).toContain("The balance for the reorder")
    expect(orderPhrase("order")).toBe("the team order")
  })
})

describe("no email promises what the plan does not", () => {
  it("no price, no delivery promise, and no date but the latest day to sign", () => {
    const mails = [
      proofReadyEmail({ firstName: "A", teamName: "T", orderKind: "order", proofNumber: 1, deadline: deadline("2026-12-16") }),
      reminderEmail({ firstName: "A", teamName: "T", orderKind: "order", daysLeft: 1, deadline: deadline("2026-12-16") }),
      paymentDueEmail({ firstName: "A", teamName: "T", orderKind: "order", which: "deposit" }),
      paymentDueEmail({ firstName: "A", teamName: "T", orderKind: "order", which: "balance" }),
    ]
    for (const mail of mails) {
      expect(mail.text).not.toMatch(/15 days|10 days|free replacement|refund|guarantee/i)
      const years = mail.text.match(/\b20\d\d\b/gu) ?? []
      expect(years.length).toBeLessThanOrEqual(1)
    }
  })
})

describe("emailFor: the email of a kind from its stored payload", () => {
  const payload = { teamName: "Lions", orderKind: "order" as const, proofNumber: 3, deadline: deadline("2026-12-16"), daysLeft: 3 }

  it("picks the text by the kind", () => {
    expect(emailFor("proof_ready", payload, "Ali").subject).toBe("Proof 3 for Lions is ready to sign")
    expect(emailFor("reminder_3d", payload, "Ali").subject).toBe("3 days left to sign the proof for Lions")
    expect(emailFor("reminder_1d", payload, "Ali").subject).toBe("1 day left to sign the proof for Lions")
    expect(emailFor("deposit_due", payload, "Ali").subject).toBe("Deposit due for Lions")
    expect(emailFor("balance_due", payload, "Ali").subject).toBe("Balance due for Lions")
  })

  it("a payload with no deadline or proof number still makes an email", () => {
    expect(emailFor("proof_ready", { teamName: "T", orderKind: "order" }, null).text).toContain('Proof 1 for "T"')
  })
})
