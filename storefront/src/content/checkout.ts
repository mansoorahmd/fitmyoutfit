// DRAFT WORDING. Founders to confirm (docs/design/05-m1-pages.md, section
// 11). Only the delivery date line is here so far: the cart shows it. The
// rest of the checkout's wording arrives with the checkout task. Sentences
// marked P touch a promise; the date itself always comes from the backend
// (checkout-rules.delivery_promise), never from here.

export const checkoutContent = {
  delivery: {
    /** W-D1 (P): {date} is the backend's date, as "Thursday 26 November". */
    deliveredBy: "Delivered by {date}",
    /**
     * W-D2 (P). M1 only, while the backend counts the date from today
     * (contract section 5). The founders must choose these words.
     */
    note: "Counted from today. For team orders it counts from the day you approve your proof.",
  },
}
