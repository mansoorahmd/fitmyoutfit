// DRAFT WORDING. Founders to confirm. The money side of a team order (task M3-4): the cost on the proof
// before signing, the payment page for the deposit and the balance, and the money's state on the order page
// and in the list. Built on docs/contracts/m3-team-order-payments.md and decision 016.
//
// Every entry is a draft. Amounts, dates, order numbers and the deposit's share are the backend's, in
// braces; none is written here. Promise nothing the backend does not compute: no price, no delivery date, no
// guarantee of ours, and no payment method named beyond what the backend returns (the test payment is shown
// only for the placeholder provider, by the id the backend sends). Sentences that touch a rule of sale or a
// payment are marked P: copy from founders.

import type { TeamOrderStatus } from "@lib/team-order/types"

export const paymentsContent = {
  // ---- the cost, on the proof page, before signing ----------------------------------
  cost: {
    // DRAFT WORDING. No id: the section between the proof and the signing form.
    title: "What it costs",
    // DRAFT WORDING. P: said under the title while the proof is out.
    intro: "This is the price for the proof above. A price changed later does not change it.",
    // DRAFT WORDING. No id: after signing, the same block reads as the order's.
    introOrdered: "This is the price of your order.",
    // {size} {pieces} {each}: one line per size
    line: "{size} · {pieces} × {each}",
    delivery: "Delivery",
    // DRAFT WORDING. W-C12 (P): the duty-paid line, as the cart and the checkout word it.
    deliveryIncluded: "Included",
    rush: "Rush delivery ({percentage}% of the garments)",
    subtotal: "Subtotal",
    tax: "Tax",
    // DRAFT WORDING. As the store shows it elsewhere ("Tax not final") while the region's tax is not final.
    taxNotFinal: "Tax not final",
    total: "Total",
    pieces: "{n} pieces",
    piecesOne: "1 piece",
    // DRAFT WORDING. P: the split, with the backend's share. {percentage} is the deposit's share.
    deposit: "Deposit after you sign",
    depositHint: "{percentage}% of the total, paid when your proof is approved.",
    balance: "Balance before shipping",
    balanceHint: "The rest, paid before your order ships.",
    // DRAFT WORDING. No id: the cost could not be read; signing is not offered until it can.
    failed: {
      title: "We couldn't load the price",
      text: "You can read the proof above, but you can't sign it until you have seen what it costs. Check your connection and try again.",
      retry: "Try again",
    },
  },

  // ---- the signing statement, with the money as data ----------------------------------
  // DRAFT WORDING. P: {total} and {deposit} are the backend's amounts for this proof.
  statementMoney: "I have checked every name, number and size on this proof. I agree that the kit is made as shown, and that the total is {total}: a deposit of {deposit} after I sign and the balance of {balance} before shipping.",

  // ---- after signing: what is next -------------------------------------------------
  signed: {
    // DRAFT WORDING. No id: the panel after the proof is signed, with the deposit as data.
    next: "Next is the deposit: {amount}.",
    nextNoAmount: "Next is the deposit.",
    pay: "Pay the deposit",
    // DRAFT WORDING. No id: the signed panel when the deposit is already in.
    depositPaid: "The deposit of {amount} is paid.",
    // DRAFT WORDING. No id: the money could not be read after signing; the order page says where things stand.
    unreadable: "Next is the deposit. We couldn't load the amount just now: open the team order to see it.",
    openOrder: "Open the team order",
  },

  // ---- the payment page ---------------------------------------------------------
  pay: {
    // DRAFT WORDING. No id: the page title (the browser tab) and the heading. {team} is the team's name.
    pageTitle: "{team} · Payment",
    back: "Back to the team order",
    titleDeposit: "Pay the deposit",
    titleBalance: "Pay the balance",
    titleDone: "Payment",
    // DRAFT WORDING. No id: the figures at the top of the page.
    dueNow: "Due now",
    total: "Order total",
    paid: "Already paid",
    outstanding: "Still to pay",
    order: "Order {number}",
    partDeposit: "Deposit",
    partBalance: "Balance",
    partDepositPaid: "Deposit paid on {date}",
    partBalancePaid: "Balance paid on {date}",
    byHand: "Recorded by us.",
    // DRAFT WORDING. No id: the buttons.
    payDeposit: "Pay deposit {amount}",
    payBalance: "Pay balance {amount}",
    starting: "Starting the payment…",
    confirmTest: "Confirm test payment {amount}",
    confirming: "Confirming…",
    // DRAFT WORDING. W-P1, W-P2 (P): shown only when the backend says the payment is the placeholder one.
    test: {
      title: "Test payment",
      text: "No money moves. This is a test of the store: confirming it marks the payment as paid, nothing is charged.",
    },
    // DRAFT WORDING. No id: a payment method the page does not know how to take yet. Never a crash.
    unknownNext: "This payment method is not available here yet. Nothing was taken.",
    unknownNextAction: "Go back",
    // DRAFT WORDING. No id: a payment that sends the organizer to another page and back (a gateway, later).
    redirecting: "Taking you on to finish the payment…",
    // DRAFT WORDING. No id: the states of the page.
    notPriced: {
      title: "There is nothing to pay yet",
      text: "A team order is priced from its proof. Make the proof first.",
      action: "Open the team order",
    },
    proofOut: {
      title: "There is nothing to pay yet",
      text: "The proof is out. You pay the deposit after you check it and sign.",
      action: "Open the proof",
    },
    balanceNotDue: {
      title: "The balance is not due yet",
      // P: the backend's rule is "before shipping"; no date is promised.
      text: "The balance of {amount} is due before your order ships. We will ask you for it then.",
    },
    // DRAFT WORDING. No id: nothing to pay and no other state fits.
    nothingDue: "Nothing is due on this order right now.",
    inProduction: "The deposit is paid. Your kit is being made.",
    depositPaidNext: "The deposit is paid. Next comes production.",
    paidInFull: {
      title: "Paid in full",
      text: "Everything on this order is paid: {total}.",
    },
    shipped: "Your order has shipped.",
    // DRAFT WORDING. No id: a payment is with the payment system; nothing to press.
    processing: {
      title: "A payment is being processed",
      text: "Your payment is with the payment system. Please check again in a moment. Do not pay again.",
      action: "Check again",
    },
    // DRAFT WORDING. No id: a part that was refunded, or an order the store canceled.
    refunded: "A payment on this order was refunded, so it counts as not paid. Please contact us.",
    canceled: "This order was canceled, so nothing can be paid on it. Please contact us.",
    // DRAFT WORDING. No id: the page after the payment.
    done: {
      deposit: {
        title: "Deposit paid",
        text: "We have your deposit of {amount} ({when}).",
      },
      balance: {
        title: "Balance paid",
        text: "We have your balance of {amount} ({when}).",
      },
      order: "Your order is now: {status}.",
      nextAfterDeposit: "Next: your kit goes into production. We will ask for the balance before it ships.",
      nextAfterBalance: "Everything is paid. Next: your order ships.",
      open: "Open the team order",
    },
    // DRAFT WORDING. No id: it could not be confirmed whether the payment went through.
    unsure: {
      title: "We don't know yet whether the payment went through",
      text: "We couldn't reach the store to confirm it. Please do not pay again. Check again in a moment: this page will show it when it knows.",
      action: "Check again",
      stillUnsure: "We still can't reach the store. Please check again later. Do not pay again.",
      notPaid: "We checked: the payment did not go through, and nothing was taken. You can try again.",
    },
    retryStart: "Try again",
  },

  // ---- the money on the order page ---------------------------------------------------
  order: {
    // DRAFT WORDING. No id: the section.
    title: "Money",
    figures: {
      total: "Total",
      deposit: "Deposit",
      balance: "Balance",
      paid: "Paid",
      outstanding: "Still to pay",
      order: "Order number",
    },
    // {amount} and {date} are the backend's.
    state: {
      draft: { title: "Not priced yet", text: "The price is worked out when you make the proof. You will read it before you sign." },
      proof_sent: { title: "Priced", text: "The proof is priced at {total}. You read every line of the price on the proof before you sign. Nothing is due until you sign." },
      approved: { title: "Deposit due", text: "The proof is signed. The deposit of {amount} is due." },
      deposit_paid: { title: "Deposit paid", text: "The deposit of {amount} is paid. Next comes production." },
      in_production: { title: "In production", text: "The deposit is paid. The balance of {amount} is due before shipping; we will ask for it." },
      balance_due: { title: "Balance due", text: "The balance of {amount} is due before your order ships." },
      balance_paid: { title: "Paid in full", text: "Everything is paid: {total}. Next: your order ships." },
      shipped: { title: "Paid in full and shipped", text: "Everything is paid: {total}. Your order has shipped." },
    },
    payDeposit: "Pay the deposit",
    payBalance: "Pay the balance",
    // DRAFT WORDING. No id: the money could not be read; nothing is claimed.
    failed: {
      text: "We couldn't load the money details just now. Check your connection and try again.",
      retry: "Try again",
    },
    // DRAFT WORDING. No id: the deposit's payment was started but not finished.
    started: "A payment for the deposit was started and not finished. Nothing was taken.",
    startedBalance: "A payment for the balance was started and not finished. Nothing was taken.",
    // DRAFT WORDING. No id: refunded or canceled, plainly.
    refunded: "A payment on this order was refunded, so it counts as not paid. Please contact us.",
    canceled: "This order was canceled. Please contact us.",
    // DRAFT WORDING. No id: why there is no "Change the list" here (the backend refuses it).
    listLocked: "The list is locked: a payment is under way or paid.",
  },

  // ---- the list of team orders: one short line for the money, by status -------------------
  card: {
    // DRAFT WORDING. No id: no amounts here, the list does not carry them.
    money: {
      draft: "Not priced yet",
      proof_sent: "Priced: see the proof",
      approved: "Deposit due",
      deposit_paid: "Deposit paid",
      in_production: "Deposit paid",
      balance_due: "Balance due",
      shipped: "Shipped",
    } satisfies Record<TeamOrderStatus, string>,
  },

  // ---- failures --------------------------------------------------------------------
  /** By step, then by the backend's machine code. */
  refusals: {
    load: {
      // 400 not_allowed
      team_order_not_priced: "This team order has no price yet. A team order is priced from its proof: make the proof first.",
      // 409
      payment_busy: "The store is busy with another step on this team order. Nothing was changed. Try again in a moment.",
    },
    start: {
      deposit_not_due: "The deposit is not due now. Open the team order to see where it is.",
      deposit_already_paid: "The deposit is already paid. Nothing more is due now.",
      balance_not_due: "The balance is not due yet. We will ask for it before your order ships.",
      balance_already_paid: "The balance is already paid. Nothing more is due.",
      payment_in_progress: "A payment is already with the payment system. Do not pay again: check this page again in a moment.",
      order_canceled: "This order was canceled, so nothing can be paid on it. Please contact us.",
      payment_part_invalid: "We couldn't tell which payment this is. Open the team order and try again.",
      payment_provider_invalid: "This payment method is not available here yet. Nothing was taken.",
      payment_busy: "The store is busy with another step on this team order. Nothing was taken. Try again in a moment.",
    },
    complete: {
      deposit_not_due: "The deposit is not due now, so nothing was taken. Open the team order to see where it is.",
      deposit_already_paid: "The deposit is already paid.",
      balance_not_due: "The balance is not due yet, so nothing was taken.",
      balance_already_paid: "The balance is already paid.",
      order_canceled: "This order was canceled, so nothing was taken. Please contact us.",
      payment_failed: "The payment did not go through. Nothing was taken. You can try again.",
      payment_requires_action: "The payment needs one more step from you before it can go through. Nothing was taken yet.",
      payment_part_invalid: "We couldn't tell which payment this is. Open the team order and try again.",
      payment_session_required: "We couldn't find the payment you started. Nothing was taken. Start it again.",
      payment_session_stale: "This payment was replaced by a newer one, or the team order changed. Nothing was taken. Start it again.",
      payment_busy: "The store is busy with another step on this team order. Nothing was taken yet. Try again in a moment.",
    },
  } as Record<"load" | "start" | "complete", Record<string, string>>,

  general: {
    signedOut: "Your sign-in has ended. Sign in again to continue.",
    notFound: "We couldn't find this team order.",
    // DRAFT WORDING. No id: nothing came back. The wording for each step says what is certain.
    unavailable: {
      load: "We couldn't load the money details just now. Nothing was changed. Try again.",
      start: "We couldn't start the payment just now. Nothing was taken. Try again.",
      complete: "We couldn't confirm the payment just now. Do not pay again: check again in a moment.",
    },
    fallback: {
      load: "We couldn't load the money details. Please try again.",
      start: "We couldn't start the payment. Nothing was taken. Please try again.",
      complete: "We couldn't complete the payment. Please check this page before you try again.",
    },
  },
}

export type PaymentStep = "load" | "start" | "complete"

/**
 * Every refusal code of docs/contracts/m3-team-order-payments.md, sections 4 and 5, for the step it comes
 * from. The wording test reads the contract and checks this list against `refusals`.
 */
export const PAYMENT_REFUSAL_CODES: Record<PaymentStep, readonly string[]> = {
  load: ["team_order_not_priced", "payment_busy"],
  start: [
    "deposit_not_due",
    "deposit_already_paid",
    "balance_not_due",
    "balance_already_paid",
    "payment_in_progress",
    "order_canceled",
    "payment_part_invalid",
    "payment_provider_invalid",
    "payment_busy",
  ],
  complete: [
    "deposit_not_due",
    "deposit_already_paid",
    "balance_not_due",
    "balance_already_paid",
    "order_canceled",
    "payment_failed",
    "payment_requires_action",
    "payment_part_invalid",
    "payment_session_required",
    "payment_session_stale",
    "payment_busy",
  ],
}
