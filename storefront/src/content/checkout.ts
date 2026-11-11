// DRAFT WORDING. Founders to confirm (docs/design/05-m1-pages.md, section
// 11). The ids (W-K1 and so on) are the specification's. Sentences marked P
// there touch a promise, a payment or a rule and need the founders first.
// Numbers, amounts and dates in braces come from the backend (the cart and
// GET /store/carts/:id/checkout-rules); none is written here. Lay these out
// in components; never write the words into a component.
//
// Every entry carries its own "DRAFT WORDING." mark and id. "No id" marks
// words the specification uses without a W- id (a field label from its
// table in 6.4, an accessible name) or that were needed to build what it
// describes (a bad phone number). They are drafts like the rest.

export const checkoutContent = {
  delivery: {
    // DRAFT WORDING. W-D1 (P): {date} is the backend's date, as "Thursday 26 November".
    deliveredBy: "Delivered by {date}",
    // DRAFT WORDING. W-D2 (P). M1 only, while the backend counts the date from today (contract section 5).
    note: "Counted from today. For team orders it counts from the day you approve your proof.",
  },

  // DRAFT WORDING. No id: the page title in the browser tab.
  pageTitle: "Checkout",

  header: {
    // DRAFT WORDING. W-K1: the header link.
    backToCart: "Back to cart",
    // DRAFT WORDING. W-K1: the same on narrow phones.
    backToCartShort: "Cart",
    // DRAFT WORDING. No id: the footer line (05, 6.2, "© FitMyOutfit").
    copyright: "© {store}",
  },

  // DRAFT WORDING. W-K2
  stepLabel: "Step {n} of 2 · {name}",
  steps: {
    address: {
      number: 1,
      // DRAFT WORDING. W-K2: the step's name in the label.
      name: "Contact and address",
      // DRAFT WORDING. W-K4
      title: "1. Contact and address",
    },
    payment: {
      number: 2,
      // DRAFT WORDING. W-K2: the step's name in the label.
      name: "Delivery and payment",
      // DRAFT WORDING. W-K20
      title: "2. Delivery and payment",
    },
  },

  summaryBar: {
    // DRAFT WORDING. W-K3
    show: "Show order summary ({pieces})",
    // DRAFT WORDING. W-K3
    hide: "Hide order summary",
    pieces: {
      // DRAFT WORDING. W-K3: the count, as in the cart (W-C1).
      one: "1 piece",
      // DRAFT WORDING. W-K3: the count, as in the cart (W-C1).
      other: "{n} pieces",
    },
  },
  // DRAFT WORDING. No id: the summary box's title from 1024 px (05, 6.3, "Your order").
  yourOrder: "Your order",

  address: {
    // DRAFT WORDING. W-K5
    useNew: "Use a new address",
    // DRAFT WORDING. No id: the saved addresses group's accessible name.
    savedLabel: "Saved addresses",
    fields: {
      // DRAFT WORDING. No id: 05, 6.4, field 1.
      email: "Email",
      // DRAFT WORDING. W-K6
      emailHint: "For your order confirmation.",
      // DRAFT WORDING. No id: 05, 6.4, field 2.
      phone: "Phone",
      // DRAFT WORDING. W-K7 (P)
      phoneHint: "The courier may call you.",
      // DRAFT WORDING. No id: 05, 6.4, field 3.
      firstName: "First name",
      // DRAFT WORDING. No id: 05, 6.4, field 4.
      lastName: "Last name (optional)",
      // DRAFT WORDING. No id: 05, 6.4, field 5.
      company: "Team or club name (optional)",
      // DRAFT WORDING. No id: 05, 6.4, field 6.
      country: "Country",
      // DRAFT WORDING. W-K8
      address1: "House and street",
      // DRAFT WORDING. No id: 05, 6.4, field 8.
      address2: "Area, block or apartment (optional)",
      // DRAFT WORDING. No id: 05, 6.4, field 9.
      city: "City",
      province: {
        // DRAFT WORDING. W-K9
        pk: "Province",
        // DRAFT WORDING. W-K9
        us: "State",
        // DRAFT WORDING. W-K9
        ae: "Emirate",
      } as Record<string, string>,
      postalCode: {
        // DRAFT WORDING. W-K9
        gb: "Postcode",
        // DRAFT WORDING. W-K9
        us: "ZIP code",
        // DRAFT WORDING. W-K9
        pk: "Postal code (optional)",
      } as Record<string, string>,
      // DRAFT WORDING. No id: the empty first choice of a province list.
      chooseProvince: "Choose",
    },
    // DRAFT WORDING. W-K10
    billingSame: "Billing address is the same",
    // DRAFT WORDING. No id: the heading over the second address group.
    billingTitle: "Billing address",
    // DRAFT WORDING. W-K11
    saveToAccount: "Save this address to my account",
    // DRAFT WORDING. W-K12
    submit: "Continue to delivery and payment",
    // DRAFT WORDING. W-K13
    saving: "Saving…",
    // DRAFT WORDING. No id: the error list's title when 3 or more fields are wrong (05, 2.3).
    errorListTitle: "Check these details",
    errors: {
      // DRAFT WORDING. W-K15 to W-K19 (05, 6.4, "Messages for field errors")
      email: "Enter your email address, like name@example.com",
      // DRAFT WORDING. W-K15 to W-K19
      phone: "Enter a phone number",
      // DRAFT WORDING. No id: a phone number that isn't one. {example} is a local format.
      phoneInvalid: "Enter a phone number, like {example}",
      // DRAFT WORDING. W-K15 to W-K19
      firstName: "Enter your first name",
      // DRAFT WORDING. W-K15 to W-K19
      address1: "Enter the house and street",
      // DRAFT WORDING. W-K15 to W-K19
      city: "Enter the city",
      // DRAFT WORDING. W-K15 to W-K19
      province: "Choose a province / state / emirate",
      // DRAFT WORDING. W-K15 to W-K19
      postalCode: "Enter a postcode / ZIP code",
      // DRAFT WORDING. No id: a country outside the region (only reachable by tampering).
      country: "Choose a country",
    },
    /** Example numbers for the bad-phone message, in each country's usual format (data, not wording). */
    phoneExamples: {
      pk: "0300 1234567",
      gb: "07700 900123",
      ae: "050 123 4567",
      us: "(201) 555-0123",
    } as Record<string, string>,
    // DRAFT WORDING. No id: the "Change" text button (05, 6.1).
    change: "Change",
    // DRAFT WORDING. No id: its accessible name, as 05, 6.1 gives it.
    changeLabel: "Change contact and address",
  },

  deliveryBlock: {
    // DRAFT WORDING. W-C12 (P): beside "Shipping & duties included".
    included: "Included",
    // DRAFT WORDING. W-K14
    failed: "We couldn't set up delivery to this address. Check the address, or try again.",
    // DRAFT WORDING. No id: the delivery block's accessible name.
    title: "Delivery",
    // DRAFT WORDING. No id: W-K14's action (05, 6.4).
    tryAgain: "Try again",
  },

  payment: {
    // DRAFT WORDING. W-K21
    title: "Payment",
    test: {
      // DRAFT WORDING. W-P1: development only, replaced by the real gateways before launch.
      title: "Test payment",
      // DRAFT WORDING. W-P2 (P): development only.
      text: "No money is taken. For testing the store.",
    },
    cod: {
      // DRAFT WORDING. W-P3
      title: "Cash on delivery",
      // DRAFT WORDING. W-P5 (P)
      text: "Pay the courier in cash when your order arrives.",
      // DRAFT WORDING. W-P4 (P): {limit} from the rules.
      overLimit: "Not available for orders over {limit}.",
      // DRAFT WORDING. W-P6
      lowerTotal: "Lower the total in your cart to use cash on delivery.",
      // DRAFT WORDING. W-M9: the link after W-P6.
      backToCart: "Back to cart",
      // DRAFT WORDING. W-P7
      failed: "Cash on delivery couldn't load. Refresh to try again.",
    },
    // DRAFT WORDING. W-P8
    selectFailed: "We couldn't select this payment method. Try again.",
    // DRAFT WORDING. W-P9 (P): {total} is the cart's total.
    codWillPay: "You'll pay {total} in cash when your order arrives.",
  },

  check: {
    // DRAFT WORDING. W-K22
    title: "Check your order",
    // DRAFT WORDING. W-K23
    showAll: "Show all {n}",
    // DRAFT WORDING. W-C4, as in the cart.
    size: "Size: {size}",
    // DRAFT WORDING. No id: "× 4", as in the cart.
    times: "× {quantity}",
    // DRAFT WORDING. No id: the delivery address's label in the summary.
    deliverTo: "Delivery address",
    // DRAFT WORDING. No id: the email and phone's label in the summary.
    contact: "Contact",
  },

  placeOrder: {
    // DRAFT WORDING. W-K24 (P): shown only once the Terms and Privacy pages exist.
    terms: "By placing your order you agree to our Terms and Privacy policy.",
    /** Until those pages exist the terms line is left out (05, 6.6). */
    showTerms: false,
    // DRAFT WORDING. W-K25
    button: "Place order",
    // DRAFT WORDING. W-K26
    placing: "Placing your order…",
    // DRAFT WORDING. W-K27
    choosePayment: "Choose how to pay.",
    // DRAFT WORDING. W-M4b: {missing} from the rules.
    minimum: "Add {missing} more garment pieces to place the order.",
    // DRAFT WORDING. W-K28
    checking: "Checking your order…",
  },

  /** The minimum at checkout (05, 5.4). */
  minimum: {
    // DRAFT WORDING. W-M7 (P)
    title: "Your order needs {required} garment pieces",
    // DRAFT WORDING. W-M8
    text: "You have {counted}. Add {missing} more in your cart to place the order.",
    // DRAFT WORDING. W-M9
    backToCart: "Back to cart",
  },

  errors: {
    // DRAFT WORDING. W-E1
    codTitle: "Cash on delivery isn't available for this order",
    // DRAFT WORDING. W-E2 (P): {limit} from the rules, {total} the cart's total.
    codOverLimit: "It's for orders up to {limit}. Your total is {total}. Choose another way to pay.",
    // DRAFT WORDING. W-E3 (P)
    codRegion: "Cash on delivery is for orders in Pakistan.",
    // DRAFT WORDING. W-E4
    refusedTitle: "We couldn't place your order",
    // DRAFT WORDING. W-E5
    refusedText: "Your order was not placed. Try again, or go back to your cart and check it.",
    // DRAFT WORDING. W-E7: for the real gateways (neither M1 method can fail here).
    paymentTitle: "The payment didn't go through",
    // DRAFT WORDING. W-E8
    paymentText: "Try again, or choose another way to pay.",
    // DRAFT WORDING. W-E9
    offline: "You're offline. Your details are kept on this page.",
    // DRAFT WORDING. W-E10
    offlineReason: "Reconnect to place your order.",
    // DRAFT WORDING. W-E11
    lostTitle: "We lost the connection",
    // DRAFT WORDING. W-E12
    lostText: "We don't know yet if your order went through. Check before you try again, so you don't order twice.",
    // DRAFT WORDING. W-E13
    checkOrder: "Check my order",
    // DRAFT WORDING. W-E14
    expiredTitle: "Your cart has expired",
    // DRAFT WORDING. W-E15
    expiredText: "Start again from your cart.",
    // DRAFT WORDING. No id: W-E14's action (05, 6.8 d, "Go to cart").
    goToCart: "Go to cart",
    // DRAFT WORDING. W-E16
    unreachable: "We couldn't reach the store. Check your connection and try again.",
    // DRAFT WORDING. No id: W-E4's and W-E7's action (05, 6.8, "Try again").
    tryAgain: "Try again",
    // DRAFT WORDING. W-M9: W-E4's link.
    backToCart: "Back to cart",
  },
}
