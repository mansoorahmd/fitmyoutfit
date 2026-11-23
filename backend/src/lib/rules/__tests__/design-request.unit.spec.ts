import { products } from "../../../scripts/seed-data/products"
import {
  CUSTOMER_STATUS_LABELS,
  DESIGN_REQUEST_LIMITS,
  DESIGN_REQUEST_PRODUCTS,
  DESIGN_REQUEST_RATE_LIMITS,
  DESIGN_REQUEST_REGIONS,
  DESIGN_REQUEST_STATUSES,
  FIELD_CODES,
  FIELD_MESSAGES,
  isDesignRequestStatus,
  isReference,
  makeReference,
  mayChangeStatus,
  nextStatuses,
  readDesignRequest,
  readEmail,
  readLine,
  readParagraphs,
  readPhone,
  readReferenceLinks,
  readStaffNotes,
  STATUS_LABELS,
  toOwnDesignRequest,
  trapFilled,
  withinRateLimits,
  type DesignRequestStatus,
} from "../design-request"

const TODAY = "2026-12-01"
const valid = {
  team_name: "Lahore Lions",
  contact_name: "Ali Khan",
  email: "ali@example.com",
  region: "pk",
  message: "We want a green and white home jersey with a lion.",
}
const read = (extra: Record<string, unknown> = {}) => readDesignRequest({ ...valid, ...extra }, TODAY)
const code = (extra: Record<string, unknown>) => {
  const result = read(extra)
  return result.ok ? "ok" : result.code
}

describe("a valid request", () => {
  it("needs a team, a contact, an email, a region and what they want; the rest is optional", () => {
    const result = read()
    expect(result).toEqual({
      ok: true,
      value: {
        teamName: "Lahore Lions",
        contactName: "Ali Khan",
        email: "ali@example.com",
        phone: null,
        product: null,
        pieces: null,
        needByDate: null,
        region: "pk",
        message: "We want a green and white home jersey with a lion.",
        referenceLinks: [],
      },
    })
  })

  it("takes every optional field", () => {
    const result = read({
      phone: "+92 300 1234567",
      product: "jersey",
      pieces: 25,
      need_by_date: "2026-12-31",
      reference_links: ["https://example.com/a.png", "http://example.org/b"],
    })
    expect(result).toMatchObject({
      ok: true,
      value: { phone: "+92 300 1234567", product: "jersey", pieces: 25, needByDate: "2026-12-31", referenceLinks: ["https://example.com/a.png", "http://example.org/b"] },
    })
  })

  it("reads each missing or wrong required field with its code", () => {
    expect(code({ team_name: undefined })).toBe("team_name_invalid")
    expect(code({ team_name: "   " })).toBe("team_name_invalid")
    expect(code({ team_name: "x".repeat(101) })).toBe("team_name_invalid")
    expect(code({ team_name: 5 })).toBe("team_name_invalid")
    expect(code({ contact_name: "" })).toBe("contact_name_invalid")
    expect(code({ contact_name: "a\u0000b" })).toBe("contact_name_invalid")
    expect(code({ email: "nobody" })).toBe("email_invalid")
    expect(code({ region: "fr" })).toBe("region_invalid")
    expect(code({ region: undefined })).toBe("region_invalid")
    expect(code({ message: "short" })).toBe("message_invalid")
    expect(code({ message: "x".repeat(2001) })).toBe("message_invalid")
    expect(code({ message: undefined })).toBe("message_invalid")
  })

  it("has a sentence for every code", () => {
    for (const field of FIELD_CODES) expect(FIELD_MESSAGES[field].length).toBeGreaterThan(15)
    expect(read({ team_name: "" })).toMatchObject({ ok: false, field: "team_name", message: FIELD_MESSAGES.team_name_invalid })
  })

  it("ignores fields that are not the form's: a stranger never sets a status, a customer or a reference", () => {
    const result = read({ status: "done", customer_id: "cus_1", reference: "DR-AAAAAAAA", staff_notes: "x", assigned_to: "user_1" })
    expect(result.ok).toBe(true)
    expect(JSON.stringify(result)).not.toMatch(/done|cus_1|DR-AAAA|user_1/u)
  })
})

describe("text is cleaned like the roster's", () => {
  it("makes it Unicode NFC, drops direction marks and makes white space one space", () => {
    expect(readLine("  Café   United‎ ", 50)).toBe("Café United")
  })
  it("keeps Urdu and Arabic text, with the zero-width non-joiner", () => {
    expect(readLine("لاہور شیرز", 50)).toBe("لاہور شیرز")
    expect(readLine("نادیہ‌خان", 50)).toBe("نادیہ‌خان")
    expect(read({ team_name: "پاکستان کلب", contact_name: "علی خان", message: "ہمیں سبز اور سفید جرسی چاہیے۔" }).ok).toBe(true)
  })
  it("refuses control characters in a one-line text, a tab and a line break included", () => {
    for (const bad of ["a\u0000b", "a\tb", "a\nb", "a\u0007b", "a\u0085b"]) expect(readLine(bad, 50)).toBeNull()
  })
  it("needs a letter or a digit", () => {
    expect(readLine("---", 50)).toBeNull()
    expect(readLine("7", 50)).toBe("7")
  })
  it("counts characters, not code units", () => {
    expect(readLine("😀".repeat(100), 100)).toBeNull() // no letter or digit
    expect(readLine("a".repeat(100), 100)).not.toBeNull()
    expect(readLine("a".repeat(100) + "😀", 100)).toBeNull()
  })
  it("keeps the line breaks of the message, one empty line at most, and refuses other control characters", () => {
    expect(readParagraphs("First line.\r\n\r\n\r\n\r\nSecond   line.\tOk\nThird line is fine", 10, 2000)).toBe("First line.\n\nSecond line. Ok\nThird line is fine")
    expect(readParagraphs("Line one is here\u0000 and more", 10, 2000)).toBeNull()
    expect(readParagraphs("Line one is here\u001b[31m and more", 10, 2000)).toBeNull()
  })
  it("keeps HTML as text, untouched", () => {
    const text = '<script>alert("x")</script> <b>bold</b> & more text'
    expect(readParagraphs(text, 10, 2000)).toBe(text)
    expect(readLine("<img src=x onerror=alert(1)>", 100)).toBe("<img src=x onerror=alert(1)>")
  })
})

describe("the email address", () => {
  it("accepts ordinary addresses and keeps their case", () => {
    for (const ok of ["ali@example.com", "A.Li+team@Sub.Example.co.uk", "o'brien@example.ie", "علی@example.pk"]) expect(readEmail(ok)).toBe(ok)
    expect(readEmail("  ali@example.com ")).toBe("ali@example.com")
  })
  it("refuses what is not name@host.tld", () => {
    const bad = ["", "ali", "ali@", "@example.com", "ali@example", "ali@@example.com", "a li@example.com", "ali@exa mple.com", "ali@example..com", ".ali@example.com", "ali.@example.com", "al..i@example.com", "ali@-example.com", "ali@example.c", "<ali>@example.com", "ali@example.com\n", "ali@example.com,bob@example.com", "ali@[127.0.0.1]"]
    for (const email of bad) expect(readEmail(email)).toBeNull()
    expect(readEmail(`${"a".repeat(65)}@example.com`)).toBeNull()
    expect(readEmail(`a@${"b".repeat(250)}.com`)).toBeNull()
    expect(readEmail(123)).toBeNull()
  })
})

describe("the phone number", () => {
  it("is optional", () => {
    expect(readPhone(undefined)).toBeNull()
    expect(readPhone(null)).toBeNull()
    expect(readPhone("  ")).toBeNull()
  })
  it("takes 7 to 15 digits with + - ( ) . and spaces", () => {
    expect(readPhone("+92 (300) 123-4567")).toBe("+92 (300) 123-4567")
    expect(readPhone("0300.1234567")).toBe("0300.1234567")
  })
  it("refuses letters, too few or too many digits and non-texts", () => {
    for (const bad of ["call me", "123456", "1".repeat(16), "+44 20 7946 0958 ext 5", 3001234567, "1234567\u0000"]) expect(readPhone(bad)).toBeUndefined()
  })
})

describe("the product, the pieces and the date", () => {
  it("offers the launch garments and other", () => {
    for (const garment of products.data.filter((p) => p.kind === "garment")) {
      expect(DESIGN_REQUEST_PRODUCTS as readonly string[]).toContain(garment.handle)
    }
    expect(DESIGN_REQUEST_PRODUCTS).toContain("other")
    expect(code({ product: "hat" })).toBe("product_invalid")
    expect(code({ product: 3 })).toBe("product_invalid")
    expect(code({ product: "" })).toBe("ok")
    expect(code({ product: "jacket" })).toBe("ok")
  })
  it("takes pieces from 1 to 10000, as a number or a digit string", () => {
    expect(read({ pieces: "12" })).toMatchObject({ ok: true, value: { pieces: 12 } })
    for (const bad of [0, -3, 1.5, 10001, "abc", "1e3", {}, "0"]) expect(code({ pieces: bad })).toBe("pieces_invalid")
    expect(code({ pieces: 10000 })).toBe("ok")
    expect(code({ pieces: 1 })).toBe("ok")
  })
  it("takes a need-by date that exists and is today or later", () => {
    expect(code({ need_by_date: TODAY })).toBe("ok")
    expect(code({ need_by_date: "2027-02-28" })).toBe("ok")
    expect(code({ need_by_date: "2026-11-30" })).toBe("need_by_date_in_past")
    expect(code({ need_by_date: "2026-02-30" })).toBe("need_by_date_invalid")
    expect(code({ need_by_date: "1 Dec 2026" })).toBe("need_by_date_invalid")
    expect(code({ need_by_date: 20261201 })).toBe("need_by_date_invalid")
  })
})

describe("the reference links", () => {
  it("are up to three, http or https", () => {
    expect(readReferenceLinks(undefined)).toEqual([])
    expect(readReferenceLinks([])).toEqual([])
    expect(readReferenceLinks(["https://a.example/x.png", "http://b.example", "https://c.example/y?z=1#f"])).toHaveLength(3)
    expect(readReferenceLinks(["https://a.example"])).toEqual(["https://a.example/"])
  })
  it("refuses a fourth, other schemes, credentials, blanks, spaces and non-texts", () => {
    const four = ["https://a.example", "https://b.example", "https://c.example", "https://d.example"]
    expect(readReferenceLinks(four)).toBeNull()
    for (const bad of ["javascript:alert(1)", "data:text/html,<b>x</b>", "ftp://a.example", "file:///etc/passwd", "//a.example", "a.example", "https://user:pw@a.example", "https://user@a.example", "https://", "", "https://a.example/ x", "https://a.example/\n", "https://" + "a".repeat(500) + ".com", 5, null]) {
      expect(readReferenceLinks([bad])).toBeNull()
    }
    expect(readReferenceLinks("https://a.example")).toBeNull()
    expect(code({ reference_links: ["javascript:alert(1)"] })).toBe("reference_links_invalid")
  })
})

describe("the trap field", () => {
  it("is filled by anything but an empty text, null or nothing", () => {
    expect(trapFilled({})).toBe(false)
    expect(trapFilled({ website: "" })).toBe(false)
    expect(trapFilled({ website: "   " })).toBe(false)
    expect(trapFilled({ website: null })).toBe(false)
    expect(trapFilled({ website: "http://spam.example" })).toBe(true)
    expect(trapFilled({ website: "x" })).toBe(true)
    expect(trapFilled({ website: 0 })).toBe(true)
    expect(trapFilled({ website: false })).toBe(true)
    expect(trapFilled({ website: [] })).toBe(true)
  })
})

describe("the statuses", () => {
  const all = DESIGN_REQUEST_STATUSES
  const allowed: Record<string, true> = {
    "new>in_progress": true,
    "in_progress>proof_sent": true,
    "proof_sent>done": true,
    "in_progress>new": true,
    "proof_sent>in_progress": true,
    "done>proof_sent": true,
    "done>in_progress": true,
  }
  it("has the four, in order", () => {
    expect(all).toEqual(["new", "in_progress", "proof_sent", "done"])
    expect(isDesignRequestStatus("new")).toBe(true)
    expect(isDesignRequestStatus("closed")).toBe(false)
    expect(isDesignRequestStatus(undefined)).toBe(false)
  })
  it.each(all.flatMap((from) => all.map((to) => [from, to] as const)))("%s -> %s", (from, to) => {
    expect(mayChangeStatus(from, to)).toBe(allowed[`${from}>${to}`] === true)
  })
  it("offers forward first, then back, and reopening from done", () => {
    expect(nextStatuses("new")).toEqual(["in_progress"])
    expect(nextStatuses("in_progress")).toEqual(["proof_sent", "new"])
    expect(nextStatuses("proof_sent")).toEqual(["done", "in_progress"])
    expect(nextStatuses("done")).toEqual(["proof_sent", "in_progress"])
  })
  it("has a label for staff and a plain one for the customer, for each", () => {
    for (const status of all) {
      expect(STATUS_LABELS[status]).toBeTruthy()
      expect(CUSTOMER_STATUS_LABELS[status]).toBeTruthy()
    }
    // the customer's words promise nothing but where the request stands
    expect(Object.values(CUSTOMER_STATUS_LABELS).join(" ")).not.toMatch(/hour|day|week|within|guarantee/iu)
  })
})

describe("staff notes", () => {
  it("keep line breaks, empty clears, too long or not text is invalid", () => {
    expect(readStaffNotes("Called him.\nSend the proof Monday.")).toBe("Called him.\nSend the proof Monday.")
    expect(readStaffNotes("  ")).toBeNull()
    expect(readStaffNotes("")).toBeNull()
    expect(readStaffNotes("x".repeat(DESIGN_REQUEST_LIMITS.staffNotes.max + 1))).toBeUndefined()
    expect(readStaffNotes(5)).toBeUndefined()
    expect(readStaffNotes("bad\u0000note")).toBeUndefined()
  })
})

describe("the reference", () => {
  it("is DR- and eight easy characters", () => {
    let n = 0
    const reference = makeReference(() => (n++ * 7) % 32)
    expect(isReference(reference)).toBe(true)
    expect(reference).toMatch(/^DR-[A-HJ-NP-Z2-9]{8}$/u)
    expect(isReference("DR-AAAAAAA")).toBe(false)
    expect(isReference("DR-AAAAAAAO")).toBe(false)
    expect(isReference("dr-aaaaaaaa")).toBe(false)
    expect(isReference(5)).toBe(false)
  })
  it("uses the whole alphabet", () => {
    const seen = new Set<string>()
    for (let start = 0; start < 32; start++) {
      let n = start
      for (const char of makeReference(() => n++ % 32).slice(3)) seen.add(char)
    }
    expect(seen.size).toBe(32)
  })
})

describe("the limits", () => {
  const { perAddress, perEmail, overall } = DESIGN_REQUEST_RATE_LIMITS
  it("allow a request below each limit and refuse at it", () => {
    expect(withinRateLimits({ address: 0, email: 0, overall: 0 })).toBe(true)
    expect(withinRateLimits({ address: perAddress.max - 1, email: perEmail.max - 1, overall: overall.max - 1 })).toBe(true)
    expect(withinRateLimits({ address: perAddress.max, email: 0, overall: 0 })).toBe(false)
    expect(withinRateLimits({ address: 0, email: perEmail.max, overall: 0 })).toBe(false)
    expect(withinRateLimits({ address: 0, email: 0, overall: overall.max })).toBe(false)
  })
  it("leave the address out when it is unknown", () => {
    expect(withinRateLimits({ address: null, email: 0, overall: 0 })).toBe(true)
    expect(withinRateLimits({ address: null, email: perEmail.max, overall: 0 })).toBe(false)
  })
  it("are data: positive whole numbers", () => {
    for (const limit of [perAddress, perEmail, overall]) {
      expect(Number.isInteger(limit.max) && limit.max > 0).toBe(true)
      expect(Number.isInteger(limit.windowMinutes) && limit.windowMinutes > 0).toBe(true)
    }
    expect(DESIGN_REQUEST_REGIONS).toEqual(["pk", "gb", "ae", "us"])
  })
})

describe("what a customer is shown of their own request", () => {
  it("is the fields they sent and the plain status, never staff's notes or anything internal", () => {
    const shown = toOwnDesignRequest({
      reference: "DR-ABCDEFGH",
      team_name: "Lions",
      status: "in_progress",
      product: "jersey",
      pieces: 20,
      need_by_date: null,
      region: "pk",
      message: "A lion please",
      reference_links: null,
      created_at: "2026-12-01T00:00:00Z",
      updated_at: "2026-12-02T00:00:00Z",
      staff_notes: "secret",
      assigned_to: "user_1",
      customer_id: "cus_1",
      ip_hash: "abc",
      email: "x@example.com",
    } as never)
    expect(shown).toEqual({
      reference: "DR-ABCDEFGH",
      team_name: "Lions",
      status: "in_progress",
      status_label: "Our designer is working on it",
      product: "jersey",
      pieces: 20,
      need_by_date: null,
      region: "pk",
      message: "A lion please",
      reference_links: [],
      created_at: "2026-12-01T00:00:00Z",
      updated_at: "2026-12-02T00:00:00Z",
    })
    expect(JSON.stringify(shown)).not.toMatch(/secret|user_1|cus_1|abc|x@example/u)
    const statuses: DesignRequestStatus[] = [...DESIGN_REQUEST_STATUSES]
    expect(statuses).toHaveLength(4)
  })
})
