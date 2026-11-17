// DRAFT WORDING. Founders to confirm (docs/design/05-m1-pages.md, section
// 11, "Order confirmation"). The ids (W-O1 and so on) are the
// specification's; P marks a sentence that touches a promise or a payment.
// Names, numbers, amounts and dates in braces come from the order the
// backend returns; none is written here. Every entry carries its own mark.
//
// Decisions for M1 (decision 008, 6 and 9): no "Tax not final" here (the
// total is what the customer pays); no confirmation email exists, so W-O4
// is not used; guest orders are not linked to an account made later, so
// nothing here promises that.

export const orderContent = {
  // DRAFT WORDING. No id: the page title in the browser tab.
  pageTitle: "Order confirmed",

  band: {
    // DRAFT WORDING. W-O1: with the shipping address's first name.
    thankYouName: "Thank you, {name}",
    // DRAFT WORDING. W-O1: with no first name.
    thankYou: "Thank you",
    // DRAFT WORDING. W-O2
    placed: "Your order is placed.",
    // DRAFT WORDING. No id: the label above the number (05, 7.1).
    orderNumber: "Order number",
    // DRAFT WORDING. W-O3: {date} as "11 November 2026".
    placedOn: "Placed on {date}",
    // DRAFT WORDING. W-O5: until confirmation emails exist (gap G6).
    keepNumber: "Your confirmation is on this page. Keep the order number.",
  },

  payment: {
    // DRAFT WORDING. W-O6 (P): {total} is the order's total.
    codLine: "Pay {total} in cash when your order arrives.",
    // DRAFT WORDING. W-O7: development only.
    testLine: "Test payment. No money was taken.",
    // DRAFT WORDING. No id: the "Payment method" heading (05, 7.1, item 7).
    title: "Payment method",
    // DRAFT WORDING. W-P3
    codName: "Cash on delivery",
    // DRAFT WORDING. W-P1: development only.
    testName: "Test payment",
  },

  next: {
    // DRAFT WORDING. W-O8
    title: "What happens next",
    // DRAFT WORDING. W-O9 (P)
    make: "We make your order.",
    // DRAFT WORDING. W-O10 (P): founders to confirm where single pieces are checked.
    check: "We check it before it ships.",
    // DRAFT WORDING. W-O11 (P)
    deliveredBy: "It's delivered by {date}.",
    // DRAFT WORDING. W-O11b (P)
    deliverToAddress: "We deliver it to the address below.",
  },

  summary: {
    // DRAFT WORDING. No id: the heading over the lines and totals (05, 7.1, item 5).
    title: "Your order",
    // DRAFT WORDING. No id: "Items" (05, 7.1, item 5), with the piece count as in the cart.
    items: "Items ({n})",
    // DRAFT WORDING. No id: the rush row, between the items and the delivery (contract 9).
    rush: "Rush production",
    // DRAFT WORDING. No id: "Total" (05, 7.1, item 5).
    total: "Total",
    // DRAFT WORDING. W-C12 (P): beside "Shipping & duties included".
    deliveryIncluded: "Included",
    // DRAFT WORDING. W-C4, as in the cart.
    size: "Size: {size}",
    // DRAFT WORDING. No id: "× 4", as in the cart.
    times: "× {quantity}",
  },

  address: {
    // DRAFT WORDING. No id: the address block's heading (05, 7.1, item 6).
    title: "Delivery address",
  },

  account: {
    // DRAFT WORDING. W-O12: no promise that this order appears in the account (gap G7).
    saveTitle: "Save your details for next time",
    // DRAFT WORDING. W-O13
    create: "Create an account",
    /** Where W-O13 leads (05, 7.1, item 9); a path, not wording. */
    createHref: "/account?view=create&email={email}",
    // DRAFT WORDING. W-O14
    allOrders: "See all your orders",
    /** Where W-O14 leads; a path, not wording. */
    allOrdersHref: "/account/orders",
  },

  // DRAFT WORDING. W-O15
  backToStore: "Back to the store",

  notFound: {
    // DRAFT WORDING. W-O16
    title: "We can't find that order",
    // DRAFT WORDING. No id: the link home (05, 7.3).
    home: "Back to the store",
  },
}
