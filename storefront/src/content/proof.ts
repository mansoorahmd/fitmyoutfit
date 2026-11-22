// DRAFT WORDING. Founders to confirm. The roster proof in the store (task M3-2): making the proof from the
// designer and from the team-order page, the proof page the organizer checks and signs, the signed and locked
// states, and going back to change the list. There is no page specification for the proof page; the sentences
// are built from the shared rules of docs/design/03-direction.md and 05-m1-pages.md (plain words, short
// sentences, the same words for the same thing).
//
// Every entry carries its own "DRAFT WORDING." mark. Names, numbers and dates in braces come from the backend;
// none is written here. A sentence that touches a rule of sale, a deadline or a promise is marked P ("copy from
// founders"). Promise nothing the backend does not compute: no delivery date of our own, no price, no
// guarantee. The only date the page shows is the one the backend recorded at signing.
//
// The proof's own markup (components/roster-proof.tsx) reads `proofContent.document`, so the server-made PDF
// that comes later says the same words (decision 005).
//
// A sentence for every refusal code of docs/contracts/m2-team-orders.md, section 3, for each of the three
// steps (make the proof, sign it, go back to draft) is in `refusals`; src/__tests__/proof-wording.test.ts lists
// the contract's codes and fails when one has no sentence.

export type ProofAction = "make" | "sign" | "reopen"

export const proofContent = {
  // ---- page titles ----------------------------------------------------------
  pageTitles: {
    // DRAFT WORDING. No id: the browser tab's title. {team} is the team's name, {number} the proof's number.
    proof: "{team} · Roster proof {number}",
  },

  // ---- the proof itself (also the server PDF's words) ------------------------
  document: {
    // DRAFT WORDING. No id: the small heading above the team name.
    heading: "Roster proof",
    // DRAFT WORDING. No id: under the team name. {number} is the proof's number, {date} the day it was made.
    madeOn: "Proof {number} · made on {date}",
    // DRAFT WORDING. No id: the proof's code is the start of its hash: the same code is on the signed copy.
    code: "Proof code {code}",
    // DRAFT WORDING. No id: the line under the product's name when the order has a need-by date.
    needBy: "Needed by {date}",
    // DRAFT WORDING. No id: the pictures. They are drawn from the design saved with this proof.
    pictures: {
      title: "The kit",
      front: "Front",
      back: "Back",
      frontAlt: "The front of the kit",
      backAlt: "The back of the kit",
      drawing: "Drawing the front and back…",
      // The pictures could not be drawn here: the product's picture stands in and the page says so.
      fallbackNote: "These are not pictures of your design. The product's picture is shown. Your design is in the designer.",
      failedNote: "We could not draw pictures of your design here. The product's picture is shown. Your design is in the designer.",
      earlierNote: "This design was made for an earlier model of the jersey, so it is not drawn here. The product's picture is shown.",
    },
    table: {
      // DRAFT WORDING. No id: the team list's caption and its column heads.
      caption: "Every player, as the name will be printed",
      position: "No.",
      positionLong: "Line",
      name: "Name as printed",
      number: "Number",
      size: "Size",
      count: "How many",
      // The measurement heading: {labels} are the chart's column names ("Chest width × Body length"), {unit} cm or in.
      measurement: "{labels} ({unit})",
      // DRAFT WORDING. No id: a line with no value on purpose, shown plainly.
      noName: "No name",
      noNumber: "No number",
      spare: "Spare shirt",
      noMeasurement: "–",
      // A name the design does not print: the column says so.
      notPrinted: "Not printed",
      // DRAFT WORDING. No id: the shirts of one line, as "×2".
      times: "×{count}",
    },
    measurementNote: {
      // DRAFT WORDING. P: a rule of sale. The measurements are the product's size chart, which is a draft.
      draft: "Garment measurements are from the product's size chart: {labels}, in {unit}. The size chart is a draft and may change.",
      final: "Garment measurements are from the product's size chart: {labels}, in {unit}.",
      none: "This product has no size chart yet, so no measurements are shown.",
    },
    totals: {
      // DRAFT WORDING. No id: the counts. {players} lines, {pieces} shirts.
      title: "Totals",
      players: "{players} players",
      playersOne: "1 player",
      pieces: "{pieces} pieces",
      piecesOne: "1 piece",
      bySize: "Pieces per size",
      sizeColumn: "Size",
      piecesColumn: "Pieces",
      total: "Total",
      otherSizes: "Other sizes",
    },
    signature: {
      // DRAFT WORDING. No id: the foot of the page, in print too.
      signed: "Signed by {name} on {date}.",
      notSigned: "Not signed yet.",
      withdrawn: "Withdrawn on {date}. This proof is not valid.",
      replaced: "Replaced on {date}. This proof is not valid. It was signed by {name} on {signedDate}.",
      replacedUnsigned: "Replaced on {date}. This proof is not valid.",
    },
  },

  // ---- the page around the proof --------------------------------------------
  page: {
    // DRAFT WORDING. No id: the link above the title.
    back: "Back to the team order",
    // DRAFT WORDING. No id: the print button (the browser's own print, which can save as PDF).
    print: "Print or save as PDF",
    // DRAFT WORDING. No id: the proof could not be read, or its code does not match its list.
    failed: {
      title: "We couldn't load this proof",
      text: "Check your connection and try again.",
      retry: "Try again",
    },
    unverified: {
      title: "We can't show this proof safely",
      text: "The list on this page does not match the proof's code, so nothing here can be signed. Please try again, and tell us if it keeps happening.",
    },
    // DRAFT WORDING. No id: the not-found page (also another customer's proof).
    notFound: {
      title: "We couldn't find this proof",
      text: "It may not exist, or it is not one of yours.",
      back: "Back to your team orders",
    },
    // DRAFT WORDING. No id: an earlier proof, read-only.
    earlier: {
      withdrawn: "This is an earlier proof. It was withdrawn, so it can't be signed. You can read it here.",
      replaced: "This is an earlier proof. It was replaced by a new one, so it can't be signed. You can read it here.",
      current: "A newer proof is the one that counts.",
      openCurrent: "Open the current proof",
    },
    // DRAFT WORDING. No id: the page showed an older state than the store has; it now shows the current one.
    updated: "This page was out of date. It now shows the current proof. Check it again before you sign.",
  },

  // ---- signing --------------------------------------------------------------
  sign: {
    // DRAFT WORDING. P: what the organizer agrees to. Founders to confirm.
    title: "Sign this proof",
    intro: "Read every line above. When you sign, you say the names, numbers and sizes are right.",
    statement: "I have checked every name, number and size on this proof. I agree that the kit is made as shown.",
    nameLabel: "Your full name",
    nameHint: "Type your name as your signature.",
    tickLabel: "I agree with the statement above.",
    submit: "Sign the proof",
    signing: "Signing…",
    // DRAFT WORDING. No id: what is missing, said at the field.
    needName: "Type your full name to sign.",
    nameTooLong: "The name can have 100 letters at most.",
    needTick: "Tick the box to sign.",
    // DRAFT WORDING. No id: after signing, what the page now says. {name} and {date} are the backend's.
    done: {
      title: "Proof signed",
      by: "Signed by {name} on {date}.",
      locked: "The team list and the design are now locked.",
      // DRAFT WORDING. No id: what comes next, in one line, without a button: payment is not open.
      next: "Next is the deposit. Payment is not open yet: we will tell you when it is.",
      promised: "Delivery date recorded when you signed: {date}.",
      changeHint: "If a name, number or size is wrong, you can change the list. That withdraws this signed proof and you will sign a new one.",
    },
    // DRAFT WORDING. No id: the schedule at signing: the backend's state, said before the organizer signs.
    schedule: {
      needsRush: "Standard delivery is now too late for your need-by date. With rush delivery, the latest day to sign is {latest}.",
      needsRushNotChosen: "You have not chosen rush delivery. If you sign without it, the date will be missed. You can choose rush on the team order page before you sign.",
      needsRushChosen: "You have chosen rush delivery, a paid option. Payment is not open yet.",
      cannotBeMet: "We can't meet your need-by date, even with rush delivery. If you sign now, the date will not be met. You can still sign, or choose a later date on the team order page first.",
      cannotBeMetNoDay: "We can't meet your need-by date, even with rush delivery. If you sign now, the date will not be met.",
      chooseDate: "Open the team order page",
    },
  },

  // ---- making the proof -------------------------------------------------------
  make: {
    // DRAFT WORDING. No id: the button on the team-order page, the designer's Done panel, and while it works.
    button: "Make the proof",
    designerButton: "Continue to the proof",
    making: "Making the proof…",
    // DRAFT WORDING. No id: the section on the team-order page.
    title: "Proof",
    // DRAFT WORDING. No id: why there is no button, in one sentence each (the backend's own numbers fill the braces).
    blocked: {
      empty: "Add your players in the designer first. The proof is made from the team list.",
      fix: "Fix {n} lines in the team list first. The proof can only be made when every line is complete.",
      fixOne: "Fix 1 line in the team list first. The proof can only be made when every line is complete.",
      minimum: "This order needs at least {required} pieces for the proof. {missing} more needed.",
      minimumOne: "This order needs at least {required} pieces for the proof. 1 more needed.",
      other: "The team list is not ready for a proof yet. Open the designer to see what is missing.",
    },
    // DRAFT WORDING. No id: what the page says about a proof that exists.
    ready: "Your list is complete. The next step is the proof: one page you check line by line and sign.",
    out: "The proof is made. Open it to check it and sign.",
    signed: "The proof is signed on {date}. The team list and the design are locked.",
    open: "Open the proof",
    openSigned: "Open the signed proof",
    // After signing, one line for what is next (no button: payment is not open).
    next: "Next is the deposit. Payment is not open yet: we will tell you when it is.",
  },

  // ---- going back to change the list ---------------------------------------
  reopen: {
    // DRAFT WORDING. No id: the button, and its confirmation.
    button: "Change the list",
    title: "Change the list?",
    // withdraws the proof that is out, or the signed one
    textSent: "Changing the list withdraws this proof. You will make a new proof and check it again.",
    textSigned: "Changing the list withdraws your signed proof. A new proof must be made and signed. Nothing is paid yet.",
    confirm: "Withdraw the proof and change the list",
    cancel: "Keep the proof",
    working: "Going back to the list…",
  },

  // ---- earlier proofs on the team-order page ---------------------------------
  history: {
    // DRAFT WORDING. No id: the list of every proof of the order. {number} is the proof's number.
    title: "Proofs",
    label: "Proof {number}",
    // {date} is the day it was made.
    made: "Made on {date}",
    status: {
      sent: "Waiting for your signature",
      signed: "Signed",
      withdrawn: "Withdrawn",
      replaced: "Replaced",
    },
    signedBy: "Signed by {name} on {date}",
    closed: "Closed on {date}",
    open: "Open",
    current: "Current",
  },

  // ---- the designer ---------------------------------------------------------
  designer: {
    // DRAFT WORDING. No id: the Done panel's main button with a proof out or signed, and the notice while the proof is made.
    openProof: "Open the proof",
    makingProof: "Making the proof…",
    // The proof could not be made from the designer: the sentence is the refusal's; these are the choices under it.
    openOrder: "Open the team order",
    tryAgain: "Try again",
    keepDesigning: "Keep designing",
    // DRAFT WORDING. No id: the list is locked in the designer and the way back.
    lockedSent: "The proof is out, so the list is fixed. Changing the list withdraws the proof.",
    designFixed: "The design is fixed while the proof is out or signed. Changes you make to the design here are not saved.",
    lockedSigned: "Signed on {date}. Changing the list makes a new proof.",
    changingList: "Going back to the list…",
  },

  // ---- what a refusal of the backend means for the customer ----------------
  /** By step, then by the backend's machine code; {today} is the store's day, {n}/{required}/{missing} the backend's numbers. */
  refusals: {
    make: {
      // 400 not_allowed
      team_order_not_draft: "A proof has already been made for this team order, or it has moved on. Open the team order to see where it is.",
      roster_empty: "The team list is empty. Add your players first.",
      roster_has_problems: "Some lines in the team list still need fixing. Open the designer and fix them first.",
      roster_below_minimum: "This order needs at least {required} pieces and has {missing} too few. Add players first.",
      // 409
      team_order_changed: "The team order changed while we made the proof. Nothing was made. Open it and try again.",
    },
    sign: {
      // 400
      proof_hash_required: "We couldn't read which proof you are signing. Reload the page and try again.",
      signed_name_required: "Type your full name to sign (100 letters at most, no line breaks).",
      confirmation_required: "Tick the box to sign.",
      schedule_state_required: "We couldn't read your need-by date's state. Reload the page and try again.",
      // 409
      proof_hash_mismatch: "The list changed since you opened this page. Nothing was signed. The page now shows the current proof: check it again.",
      proof_not_current: "This proof is not the current one any more: the list was changed or the proof was withdrawn. Nothing was signed. The page now shows the current proof.",
      schedule_changed: "Your need-by date's situation changed while you were reading. Nothing was signed. The page now shows the current state.",
    },
    reopen: {
      // 400 not_allowed
      team_order_already_draft: "The team order is already open for changes.",
      team_order_not_reopenable: "The deposit is paid, so the list can't be changed here any more. Please contact us.",
      team_order_has_add_ons: "This order has add-on orders for late players, so it can't go back to a draft. Delete the draft add-ons first.",
      // 409
      team_order_changed: "The team order changed while we were going back. Nothing was changed. Open it and try again.",
    },
  } as Record<ProofAction, Record<string, string>>,

  // ---- every step's general failures --------------------------------------
  general: {
    // DRAFT WORDING. No id: nothing came back, or the answer could not be read. Nothing was lost.
    unavailable: {
      make: "We couldn't make the proof just now. Nothing was lost. Try again.",
      sign: "We couldn't sign the proof just now. Nothing was signed and nothing is lost. Try again.",
      reopen: "We couldn't go back to the list just now. Nothing was changed. Try again.",
    },
    signedOut: "Your sign-in has ended. Sign in again to continue.",
    notFound: "We couldn't find this team order or proof.",
    fallback: {
      make: "We couldn't make the proof. Please try again.",
      sign: "We couldn't sign the proof. Nothing was signed. Please try again.",
      reopen: "We couldn't change the team order. Please try again.",
    },
  },
}

/**
 * Every refusal code of docs/contracts/m2-team-orders.md, section 3, for each step: the codes a sentence is
 * needed for. The wording test checks this list against `refusals`.
 */
export const PROOF_REFUSAL_CODES: Record<ProofAction, readonly string[]> = {
  make: ["team_order_not_draft", "roster_empty", "roster_has_problems", "roster_below_minimum", "team_order_changed"],
  sign: [
    "proof_hash_required",
    "signed_name_required",
    "confirmation_required",
    "schedule_state_required",
    "proof_hash_mismatch",
    "proof_not_current",
    "schedule_changed",
  ],
  reopen: ["team_order_already_draft", "team_order_not_reopenable", "team_order_has_add_ons", "team_order_changed"],
}
