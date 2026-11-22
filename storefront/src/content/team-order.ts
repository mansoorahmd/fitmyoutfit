// DRAFT WORDING. Founders to confirm. Team orders in the store (task M3-1): the
// designer's "start a team order" step and its saving, and the organizer's pages
// in the account (the list of team orders and one order). There is no page
// specification for these pages; the sentences are built from the shared rules of
// docs/design/03-direction.md and 05-m1-pages.md (plain words, short sentences).
//
// Every entry carries its own "DRAFT WORDING." mark. Names, numbers and dates in
// braces come from the backend; none is written here. A sentence that touches a
// rule of sale, a deadline or a promise is marked P ("copy from founders").
// Promise nothing the backend does not compute: no delivery date, no price, no
// guarantee. The latest day to sign and the schedule's state are the backend's.
//
// A sentence for every problem code and every note code of the contract
// (docs/contracts/m2-team-orders.md, section 2) is in `problems` and `notes`; a
// test (src/__tests__/team-order-wording.test.ts) reads the rules package's lists
// of codes and fails when one has no sentence.

import type { NoteCode, ProblemCode } from "@fitmyoutfit/team-rules"

import type { ScheduleState, TeamOrderStatus } from "@lib/team-order/types"

export const teamOrderContent = {
  // ---- account navigation and page titles ---------------------------------
  nav: {
    // DRAFT WORDING. No id: the account menu's row.
    label: "Team orders",
  },
  pageTitles: {
    // DRAFT WORDING. No id: the browser tab's title on the list.
    list: "Team orders",
    // DRAFT WORDING. No id: the browser tab's title on one order. {team} is the team's name.
    order: "{team} · Team order",
  },

  // ---- plain words for the status -----------------------------------------
  status: {
    // DRAFT WORDING. No id: the status as a chip, and the sentence under it on the order's page.
    draft: { label: "Draft", text: "You can still change the design and the team list." },
    proof_sent: { label: "Proof sent", text: "The proof is out. The design and the team list are fixed until it is signed or withdrawn." },
    approved: { label: "Proof signed", text: "The proof is signed. The design and the team list are fixed." },
    deposit_paid: { label: "Deposit paid", text: "The deposit is paid. The design and the team list are fixed." },
    in_production: { label: "In production", text: "Your kit is being made. The design and the team list are fixed." },
    balance_due: { label: "Balance due", text: "The balance is due. The design and the team list are fixed." },
    shipped: { label: "Shipped", text: "Your order has shipped." },
  } satisfies Record<TeamOrderStatus, { label: string; text: string }>,

  // ---- the list of team orders --------------------------------------------
  list: {
    // DRAFT WORDING. No id: the page's heading.
    title: "Team orders",
    // DRAFT WORDING. No id: the empty state.
    empty: {
      title: "No team orders yet",
      text: "Design your kit in 3D, enter your players, and your team order starts here.",
      cta: "See the products",
    },
    // DRAFT WORDING. No id: the store did not answer.
    failed: {
      title: "We couldn't load your team orders",
      text: "Check your connection and try again.",
      retry: "Try again",
    },
    // DRAFT WORDING. No id: one card. {players} and {pieces} are counts; {date} is the need-by date.
    card: {
      players: "{players} players",
      playersOne: "1 player",
      pieces: "{pieces} pieces",
      piecesOne: "1 piece",
      needBy: "Needed by {date}",
      noNeedBy: "No need-by date",
      open: "Open",
    },
  },

  // ---- one team order -----------------------------------------------------
  order: {
    // DRAFT WORDING. No id: the link above the title.
    back: "Team orders",
    // DRAFT WORDING. No id: the product line. {product} is the product's name.
    product: "{product}",
    // DRAFT WORDING. No id: says which picture is shown.
    pictureNote: "The picture is the product's. Your design is in the designer.",
    // DRAFT WORDING. No id: the order's page could not be read.
    failed: {
      title: "We couldn't load this team order",
      text: "Check your connection and try again.",
      retry: "Try again",
    },
    // DRAFT WORDING. No id: the not-found page (also another customer's order).
    notFound: {
      title: "We couldn't find this team order",
      text: "It may have been deleted, or it is not one of yours.",
      back: "Back to your team orders",
    },
    rename: {
      // DRAFT WORDING. No id: the team name field.
      label: "Team name",
      edit: "Rename",
      save: "Save name",
      saving: "Saving…",
      cancel: "Cancel",
    },
    list: {
      // DRAFT WORDING. No id: the section for the team list.
      title: "Team list",
      // {ready} of {players}
      complete: "{ready} of {players} lines complete",
      completeAll: "All {players} lines complete",
      empty: "No players in the list yet.",
      emptyHint: "Add them in the designer, in the Players tab.",
      // {n} lines to fix
      toFix: "{n} lines to fix",
      toFixOne: "1 line to fix",
      // One line to fix: "Line 3 · Bilal" and its problems. {n} is the line's place from 1.
      line: "Line {n}",
      lineNamed: "Line {n} · {name}",
      noSizeTitle: "No size yet",
      noSize: "{lines} lines have no size ({pieces} pieces).",
      noSizeOne: "1 line has no size (1 piece).",
      noSizeOnePieces: "1 line has no size ({pieces} pieces).",
      bySizeTitle: "Pieces per size",
      otherSizes: "Other sizes",
      sizeColumn: "Size",
      piecesColumn: "Pieces",
      total: "Total",
      // DRAFT WORDING. P: a rule of sale, copy from founders. {required} and {missing} come from the backend.
      minimumMet: "This order meets the minimum of {required} pieces.",
      minimumMissing: "This order needs at least {required} pieces. {missing} more needed.",
      minimumMissingOne: "This order needs at least {required} pieces. 1 more needed.",
      // DRAFT WORDING. No id: the server's checks and the editor's disagree (reported by the page, not hidden).
      serverChecks: "These checks are the store's own. They are the ones that count.",
    },
    needBy: {
      // DRAFT WORDING. No id: the section for the need-by date.
      title: "Need-by date",
      label: "The day your team needs the kit",
      hint: "Optional. We use it to tell you the latest day to sign the proof.",
      set: "Set the date",
      change: "Change the date",
      clear: "Clear the date",
      saving: "Saving…",
      // DRAFT WORDING. P: states what the backend computed. {date} is a calendar day.
      none: "No need-by date set.",
      locked: "The need-by date is fixed from the moment the proof is signed.",
      currentDate: "Needed by {date}.",
      // The schedule's states, in the backend's own words turned into sentences. {latest} is the latest day to sign.
      ok: "The latest day to sign the proof is {latest}.",
      needsRush: "Standard delivery is now too late for this date. With rush delivery, the latest day to sign the proof is {latest}.",
      cannotBeMet: "We can't meet this date, even with rush delivery: the latest day to sign for rush was {latest}. Choose a later date.",
      cannotBeMetNoDay: "We can't meet this date, even with rush delivery. Choose a later date.",
      // Rush: a choice the backend stores; the charge belongs to payments, which are not open.
      rushChoose: "Choose rush delivery",
      rushKeep: "Keep standard delivery",
      rushChosen: "Rush delivery is chosen. It is a paid option; payment is not open yet.",
      rushNote: "Rush delivery is a paid option. Payment is not open yet.",
    },
    next: {
      // DRAFT WORDING. No id: what comes next, in one line, and no button for it.
      draft: "Next is the proof: a one-page list you check and sign. It is not open yet.",
      later: "",
    },
    actions: {
      // DRAFT WORDING. No id: the button into the designer.
      edit: "Edit design and team list",
      view: "See design and team list",
      delete: "Delete this team order",
    },
    delete: {
      // DRAFT WORDING. No id: the confirmation. {team} is the team's name.
      title: "Delete this team order?",
      text: "This deletes the team order and its team list. It can't be undone.",
      confirm: "Delete",
      cancel: "Keep it",
      deleting: "Deleting…",
    },
    // DRAFT WORDING. No id: a change that did not work, shown where the change was made.
    saved: "Saved.",
  },

  // ---- the designer: starting a team order ---------------------------------
  designer: {
    // DRAFT WORDING. No id: the Done panel's main button when the list is ready, and the text button under the editor's.
    continue: "Continue",
    // DRAFT WORDING. No id: the same for an order that exists already, and for one that can not change any more.
    saveAndOpen: "Save and open the team order",
    openOrder: "Open the team order",
    // DRAFT WORDING. No id: the signed-out step.
    signIn: {
      title: "Sign in to start your team order",
      text: "Your design and your team list stay on this device while you sign in. You will come back to this page.",
      action: "Sign in or create an account",
      cancel: "Keep designing",
    },
    // DRAFT WORDING. No id: the one short step before the order is made.
    start: {
      title: "Start your team order",
      text: "Give the team a name. You can change it later while the order is a draft.",
      teamName: "Team name",
      needBy: "Need-by date (optional)",
      needByHint: "The day your team needs the kit. We tell you the latest day to sign the proof.",
      submit: "Start the team order",
      working: "Saving your design and your team list…",
      cancel: "Keep designing",
    },
    // DRAFT WORDING. No id: what each step's failure says. Nothing is lost: the design and the list stay here.
    startFailed: {
      design: "We couldn't save your design, so no team order was made. Nothing is lost. Try again.",
      order: "Your design is saved, but the team order was not made. Nothing is lost. Try again.",
      list: "Your team order was made, but your team list was not saved to it yet. Nothing is lost. Try again.",
      retry: "Try again",
      openOrder: "Open the team order",
      signedOut: "Your sign-in has ended. Sign in again, and your design and list will still be here.",
      notFound: "We couldn't find what we needed. Please try again.",
    },
    // DRAFT WORDING. No id: the top bar's saving of the list, in the editor's own save-state words.
    saved: "Saved",
    savedOnDevice: "Saved on this device",
    // DRAFT WORDING. No id: the banner under the top bar when the list is not saved.
    saveFailed: {
      network: "Your team list is not saved yet. We couldn't reach the store. We keep trying.",
      refused: "Your team list is not saved. The store refused it. Check the lines marked in the list.",
      signedOut: "Your team list is not saved: your sign-in has ended.",
      locked: "Your team list is not saved: this team order can't be changed any more.",
      gone: "Your team list is not saved: this team order no longer exists.",
      retry: "Try again",
      signIn: "Sign in again",
      openOrders: "Your team orders",
    },
    // DRAFT WORDING. No id: the same order changed somewhere else (another tab or device).
    conflict: {
      title: "This team list was changed somewhere else",
      text: "Another tab or device saved a different list for this team order. Nothing you typed here has been thrown away. Choose which one to keep.",
      keepMine: "Keep what I typed here",
      useSaved: "Use the saved list",
      useSavedNote: "Using the saved list replaces what is in the list here.",
    },
    // DRAFT WORDING. No id: leaving the designer saves a new version of the design when it changed.
    leaving: {
      saving: "Saving your design…",
      failed: "We couldn't save your design. It is still on this device. Try again.",
      listFailed: "Your team list is not saved yet, so we kept you here. Try again, or leave: it stays on this device.",
      retry: "Try again",
      stay: "Keep designing",
      leaveAnyway: "Leave anyway",
    },
    // DRAFT WORDING. No id: this order is not a draft any more; the list is shown read-only.
    locked: {
      designNote: "This team order can't be changed any more. Changes you make to the design here are not saved.",
    },
    // DRAFT WORDING. No id: the unsent changes of an order found on this device.
    draftFound: "Your earlier changes to this design were found on this device and are shown here.",
    // DRAFT WORDING. No id: the designer for an order could not load it.
    loadFailed: {
      title: "We couldn't open this team order",
      text: "Check your connection and try again.",
      retry: "Try again",
      back: "Back to your team orders",
    },
  },

  // ---- what each refusal of the backend means for the customer ------------
  refusals: {
    // DRAFT WORDING. No id: by the backend's machine code; {today} is the store's day.
    team_name_invalid: "The team name must be 1 to 100 characters, with no line breaks.",
    need_by_date_invalid: "That is not a date. Use the date picker.",
    need_by_date_in_past: "That day has already passed. Today is {today}.",
    rush_requested_invalid: "We couldn't read the rush choice. Try again.",
    team_order_not_editable: "This team order can't be changed now: the proof is out or signed.",
    team_order_not_draft: "Only a draft team order can be deleted.",
    team_order_has_linked_orders: "This team order has add-on or reorder orders linked to it, so it can't be deleted.",
    design_name_invalid: "The design's name must be 1 to 100 characters.",
    design_too_large: "This design is too large to save. Remove some logos or text and try again.",
    design_too_deep: "This design could not be saved. Please try again.",
    product_not_designable: "This product can't be designed here.",
    schedule_empty: "Nothing to change.",
    fallback: "We couldn't do that. Please try again.",
    unavailable: "We couldn't reach the store just now. Nothing was lost. Try again.",
    signedOut: "Your sign-in has ended. Sign in again to continue.",
  } as Record<string, string>,

  // ---- the checks' sentences (every code of the contract) ------------------
  /** {others} is the other players' names, {characters} the letters that can't be printed. */
  problems: {
    "name-missing": "Needs a name.",
    "number-missing": "Needs a number.",
    "size-missing": "Needs a size.",
    "number-not-digits": "The number can only have digits.",
    "number-too-long": "The number can have two digits at most, up to 99.",
    "number-mixed-digits": "The number mixes two kinds of digits.",
    "number-duplicate": "Same number as {others}.",
    "number-duplicate-unnamed": "The same number is on another line.",
    "number-taken-first-order": "This number is already used in the first order.",
    "number-taken-add-on": "This number is already used in another add-on order.",
    "name-character": "The name has a letter or sign that can't be printed: {characters}.",
    "name-too-long": "The name is too long: {length} letters, {max} at most.",
    "size-unknown": "{size} is not a size of this product.",
    "quantity-range": "The number of shirts on a line must be a whole number from {min} to {max}.",
    "list-too-long": "The list has {lines} lines. {max} is the most.",
    fallback: "This line needs a look.",
  } as Record<ProblemCode | "number-duplicate-unnamed" | "fallback", string>,

  notes: {
    "name-mixed-scripts": "This name mixes Latin and Arabic-script letters. Check how it should print.",
    "mixed-digit-systems": "The numbers use more than one kind of digit.",
  } as Record<NoteCode, string>,
}

export type ScheduleWording = Record<ScheduleState, string>
