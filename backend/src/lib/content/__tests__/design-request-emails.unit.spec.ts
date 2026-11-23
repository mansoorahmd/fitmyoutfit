import { DESIGN_REQUEST_WORDING_IS_DRAFT, receivedEmail } from "../design-request-emails"

describe("the design request's confirmation email", () => {
  const email = receivedEmail({ contactName: "Ali", teamName: "Lahore Lions", reference: "DR-ABCDEFGH" })

  it("says it was received, with the reference, and is marked as draft wording", () => {
    expect(DESIGN_REQUEST_WORDING_IS_DRAFT).toBe(true)
    expect(email.subject).toBe("We received your design-help request")
    expect(email.text).toContain("We have received your design-help request")
    expect(email.text).toContain("DR-ABCDEFGH")
    expect(email.text).toContain("Lahore Lions")
  })

  it("promises nothing else: no time, no price, no date", () => {
    const all = `${email.subject} ${email.text} ${email.html}`
    expect(all).not.toMatch(/\b(hours?|days?|weeks?|within|soon|today|tomorrow|free|price|guarantee|deliver)\b/iu)
    expect(all).not.toMatch(/\d{4}-\d{2}-\d{2}/u)
  })

  it("escapes what the requester typed in the html and keeps it out of the subject", () => {
    const hostile = receivedEmail({ contactName: "<b>Eve</b>", teamName: '"><script>alert(1)</script>', reference: "DR-ABCDEFGH" })
    expect(hostile.html).not.toContain("<script>")
    expect(hostile.html).not.toContain("<b>Eve</b>")
    expect(hostile.html).toContain("&lt;script&gt;")
    expect(hostile.subject).not.toMatch(/script|Eve/u)
  })

  it("keeps Urdu names", () => {
    const urdu = receivedEmail({ contactName: "علی خان", teamName: "لاہور شیرز", reference: "DR-ABCDEFGH" })
    expect(urdu.text).toContain("علی خان")
    expect(urdu.html).toContain("لاہور شیرز")
  })
});
