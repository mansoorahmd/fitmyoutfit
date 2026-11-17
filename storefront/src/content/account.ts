// DRAFT WORDING. Founders to confirm (docs/design/05-m1-pages.md, section
// 11, "Sign-in" and "Account"). The ids (W-L1, W-U1 and so on) are the
// specification's; P marks a sentence that touches a promise, a payment or
// a rule. Names, numbers, amounts and dates in braces come from the
// backend; none is written here. Lay these out in components; never write
// the words into a component.
//
// Every entry carries its own "DRAFT WORDING." mark and id. "No id" marks
// words the specification uses without a W- id (a field label, an
// accessible name) or that were needed to build what it describes.
//
// Decisions for M1 (decision 008 and task S1-5): no email is sent, so
// nothing here says one was or will be; a guest's earlier orders are not
// linked to a new account, so nothing here promises that; password reset
// (task S1-10c) says a link "is on its way", never that an email was sent:
// until Resend is connected (Sprint 2) production sends nothing. How long a
// link lasts comes from the backend's settings (RESET_LINK_MINUTES), so
// the sentences take it as {minutes}.

export const accountContent = {
  pageTitles: {
    // DRAFT WORDING. No id: the browser tab's title on the sign-in view.
    signIn: "Sign in",
    // DRAFT WORDING. No id: the browser tab's title on the create view.
    create: "Create an account",
    // DRAFT WORDING. No id: the browser tab's title on the overview.
    overview: "Your account",
    // DRAFT WORDING. No id: the browser tab's title on the order history.
    orders: "Your orders",
    // DRAFT WORDING. No id: the browser tab's title on one order. {number} is the order number with its "#" sign.
    order: "Order {number}",
    // DRAFT WORDING. No id: the browser tab's title on the addresses page.
    addresses: "Addresses",
    // DRAFT WORDING. No id: the browser tab's title on the profile page.
    profile: "Profile",
    // DRAFT WORDING. No id: the browser tab's title on the forgot-password page.
    forgotPassword: "Forgot your password?",
    // DRAFT WORDING. No id: the browser tab's title on the page a reset link opens.
    resetPassword: "Set a new password",
  },

  /** Sign-in and create account (05, section 8). */
  auth: {
    // DRAFT WORDING. W-L1
    signInTitle: "Sign in",
    // DRAFT WORDING. W-L2
    createTitle: "Create an account",
    tabs: {
      // DRAFT WORDING. W-L3
      signIn: "Sign in",
      // DRAFT WORDING. W-L3
      create: "Create account",
      // DRAFT WORDING. No id: the two links' accessible group name.
      label: "Sign in or create an account",
    },
    // DRAFT WORDING. W-L4
    signInWhy: "See your orders and use your saved addresses.",
    // DRAFT WORDING. W-L5
    createWhy: "Save your addresses and see your orders in one place.",
    fields: {
      // DRAFT WORDING. No id: 05, 8.3, field "Email".
      email: "Email",
      // DRAFT WORDING. No id: 05, 8.3, field "Password".
      password: "Password",
      // DRAFT WORDING. No id: 05, 8.3, field "First name".
      firstName: "First name",
      // DRAFT WORDING. No id: 05, 8.3, field "Last name (optional)".
      lastName: "Last name (optional)",
      // DRAFT WORDING. No id: 05, 8.3, field "Phone (optional)".
      phone: "Phone (optional)",
      // DRAFT WORDING. W-L6: the storefront checks it (Medusa has no rule of its own). {min} is MIN_PASSWORD_LENGTH.
      passwordHint: "At least {min} characters.",
    },
    password: {
      // DRAFT WORDING. No id: 05, 2.3, the password field's button.
      show: "Show",
      // DRAFT WORDING. No id: 05, 2.3, the password field's button.
      hide: "Hide",
      // DRAFT WORDING. No id: the button's accessible name while the password is hidden.
      showLabel: "Show password",
      // DRAFT WORDING. No id: the button's accessible name while the password shows.
      hideLabel: "Hide password",
    },
    // DRAFT WORDING. W-L7
    signInButton: "Sign in",
    // DRAFT WORDING. W-L7
    createButton: "Create account",
    // DRAFT WORDING. No id: the starter's loading label, kept (05, 8.3, item 6).
    signingIn: "Signing in…",
    // DRAFT WORDING. W-L8
    creating: "Creating your account…",
    forgotPassword: {
      /** On since task S1-10c: password reset exists. */
      show: true,
      // DRAFT WORDING. W-L9 (gap G8 closed by S1-10c).
      label: "Forgot your password?",
      /** Where W-L9 leads (a path, not wording). The email is carried over in the browser, never in the address. */
      href: "/account/forgot-password",
    },
    notices: {
      // DRAFT WORDING. No id: shown on sign-in after a new password was saved; the customer is not signed in yet.
      passwordChanged: "Your password was changed. Sign in with your new password.",
    },
    errors: {
      // DRAFT WORDING. W-L10: never says which of the two was wrong.
      wrong: "That email and password don't match an account.",
      // DRAFT WORDING. W-L11: only on create, where it can't be avoided.
      exists: "There's already an account with this email.",
      // DRAFT WORDING. W-L12
      signInInstead: "Sign in instead",
      // DRAFT WORDING. W-E16
      unreachable: "We couldn't reach the store. Check your connection and try again.",
      // DRAFT WORDING. No id: an empty password on sign-in.
      password: "Enter your password",
      // DRAFT WORDING. No id: a new password shorter than W-L6 asks. {min} is the rule's number.
      passwordShort: "Use at least {min} characters",
      // DRAFT WORDING. No id: a new password made only of spaces (QA S1-4c, m4).
      passwordSpaces: "Use letters, numbers or symbols, not only spaces",
    },
  },

  /** "Forgot your password?" (contract m1-password-reset, section 3). */
  forgot: {
    // DRAFT WORDING. No id: the page's heading.
    title: "Forgot your password?",
    // DRAFT WORDING. No id: the line under the heading.
    intro: "Enter the email address of your account and we'll look for it.",
    // DRAFT WORDING. No id: the button before the first request.
    button: "Get a reset link",
    // DRAFT WORDING. No id: the button after a request, to ask once more.
    buttonAgain: "Ask again",
    // DRAFT WORDING. No id: the button after a request that failed.
    buttonRetry: "Try again",
    // DRAFT WORDING. No id: the loading label.
    requesting: "Requesting…",
    // DRAFT WORDING. No id: the link back to sign-in.
    backToSignIn: "Back to sign in",
    // DRAFT WORDING. No id (P): the same answer whether or not the email has an account; promises no email.
    requestedTitle: "If that email belongs to an account, a reset link is on its way.",
    // DRAFT WORDING. No id (P): {minutes} is RESET_LINK_MINUTES.
    requestedBody:
      "The link works for {minutes} minutes. If nothing arrives, check that the address is right and look in your spam folder, then ask again below. A new link cancels the earlier one.",
    // DRAFT WORDING. No id: the request itself failed (the store didn't answer).
    failed: "We couldn't ask for the link. Check your connection and try again.",
  },

  /** The page a reset link opens (contract m1-password-reset, section 3). */
  reset: {
    // DRAFT WORDING. No id: the page's heading.
    title: "Set a new password",
    // DRAFT WORDING. No id: the label above the account's email.
    emailLabel: "Email",
    // DRAFT WORDING. No id: the label of the new-password field.
    passwordLabel: "New password",
    // DRAFT WORDING. No id: the main button.
    button: "Save new password",
    // DRAFT WORDING. No id: the loading label.
    saving: "Saving…",
    // DRAFT WORDING. No id: the store refused or didn't answer; the link may still be good.
    failed: "We couldn't save your new password. Your link may still work, so try again.",
    // DRAFT WORDING. No id: the heading when the link is expired, used, wrong or incomplete.
    goneTitle: "This link no longer works",
    // DRAFT WORDING. No id: {minutes} is RESET_LINK_MINUTES.
    goneBody: "A reset link works once, for {minutes} minutes. Ask for a new one to set your password.",
    // DRAFT WORDING. No id: the button that leads to the forgot-password page.
    goneButton: "Ask for a new link",
  },

  /** The account's frame (05, 9.1). */
  frame: {
    // DRAFT WORDING. W-U1: the "‹" is drawn as an icon, so screen readers don't read it.
    back: "Your account",
    // DRAFT WORDING. W-U2
    title: "Your account",
    // DRAFT WORDING. W-U3: {name} is the customer's first name.
    hello: "Hello, {name}",
    // DRAFT WORDING. No id: W-U3 with no first name.
    helloNoName: "Hello",
    menu: {
      // DRAFT WORDING. No id: the menu's accessible name.
      label: "Account menu",
      // DRAFT WORDING. W-U4
      orders: "Orders",
      // DRAFT WORDING. W-U5
      addresses: "Addresses",
      // DRAFT WORDING. W-U6
      profile: "Profile",
      // DRAFT WORDING. W-U7
      signOut: "Sign out",
      // DRAFT WORDING. W-U8
      signingOut: "Signing out…",
    },
  },

  /** The overview (05, 9.2). */
  overview: {
    // DRAFT WORDING. W-U9
    recentOrders: "Recent orders",
    // DRAFT WORDING. W-U10
    seeAllOrders: "See all orders",
    // DRAFT WORDING. W-U11
    defaultAddress: "Default address",
    // DRAFT WORDING. W-U12
    manageAddresses: "Manage addresses",
    // DRAFT WORDING. W-U13
    noAddress: "No saved address yet.",
  },

  /** The order history and the order card (05, 9.3). */
  orders: {
    // DRAFT WORDING. W-U14
    title: "Your orders",
    // DRAFT WORDING. No id: the empty state's heading (03-direction, "Account orders").
    empty: "No orders yet",
    // DRAFT WORDING. W-U19
    showMore: "Show more orders",
    // DRAFT WORDING. W-U20
    failed: "We couldn't load your orders.",
    // DRAFT WORDING. No id: W-U20's action.
    tryAgain: "Try again",
    card: {
      // DRAFT WORDING. No id: the card's heading. {number} is the order number with its "#" sign.
      number: "Order {number}",
      // DRAFT WORDING. No id: the card link's accessible name (05, 9.3).
      linkLabel: "Order {number}, placed {date}",
      // DRAFT WORDING. W-O3, as on the confirmation: {date} as "11 November 2026".
      placedOn: "Placed on {date}",
      pieces: {
        // DRAFT WORDING. No id: the piece count, as in the cart (W-C1).
        one: "1 piece",
        // DRAFT WORDING. No id: the piece count, as in the cart (W-C1).
        other: "{n} pieces",
      },
      // DRAFT WORDING. No id: thumbnails not shown, after the first three (05, 9.3, row 3).
      more: "+{n}",
    },
    status: {
      // DRAFT WORDING. W-U15 (P)
      cancelled: "Cancelled",
      // DRAFT WORDING. W-U16 (P)
      placed: "Order placed",
      // DRAFT WORDING. W-U17 (P)
      onItsWay: "On its way",
      // DRAFT WORDING. W-U18 (P)
      delivered: "Delivered",
    },
  },

  /** One order (05, 9.4). Its blocks reuse the confirmation's words (content/order.ts). */
  order: {
    // DRAFT WORDING. W-U21: the "‹" is drawn as an icon.
    back: "Your orders",
    // DRAFT WORDING. No id: the heading. {number} is the order number with its "#" sign.
    title: "Order {number}",
    // DRAFT WORDING. No id (P): cash on delivery once staff recorded the cash as collected (payment captured).
    codPaid: "Paid in cash on delivery.",
  },

  /** Addresses (05, 9.5). The fields' labels and messages are the checkout's (content/checkout.ts). */
  addresses: {
    // DRAFT WORDING. W-U22
    title: "Addresses",
    // DRAFT WORDING. W-U23
    default: "Default",
    // DRAFT WORDING. W-U24
    edit: "Edit",
    // DRAFT WORDING. W-U24
    remove: "Remove",
    // DRAFT WORDING. No id: "Edit address, 12 Mall Road" (05, 9.5).
    editLabel: "Edit address, {line}",
    // DRAFT WORDING. No id: "Remove address, 12 Mall Road" (05, 9.5).
    removeLabel: "Remove address, {line}",
    // DRAFT WORDING. W-U25
    add: "Add an address",
    // DRAFT WORDING. No id: the form's title when editing.
    editTitle: "Edit address",
    // DRAFT WORDING. No id: the form's close button's accessible name.
    close: "Close",
    // DRAFT WORDING. W-U26
    makeDefault: "Make this my default address",
    // DRAFT WORDING. W-U27
    save: "Save address",
    // DRAFT WORDING. No id: the loading label (05, 9.5, "Saving").
    saving: "Saving…",
    // DRAFT WORDING. No id: the text button beside W-U27.
    cancel: "Cancel",
    // DRAFT WORDING. W-U28
    removeTitle: "Remove this address?",
    // DRAFT WORDING. No id: the confirm button (05, 9.5).
    removeConfirm: "Remove",
    // DRAFT WORDING. No id: the confirm button while it works.
    removing: "Removing…",
    // DRAFT WORDING. W-U29
    keep: "Keep it",
    // DRAFT WORDING. W-U30
    empty: "No saved addresses yet. Add one to check out faster.",
    // DRAFT WORDING. W-U31
    saveFailed: "We couldn't save the address. Try again.",
    // DRAFT WORDING. W-U32
    removeFailed: "We couldn't remove the address.",
  },

  /** Profile (05, 9.6). */
  profile: {
    // DRAFT WORDING. W-U33
    title: "Profile",
    rows: {
      // DRAFT WORDING. No id: the row's label (05, 9.6).
      name: "Name",
      // DRAFT WORDING. No id: the row's label (05, 9.6).
      email: "Email",
      // DRAFT WORDING. No id: the row's label (05, 9.6).
      phone: "Phone",
      // DRAFT WORDING. No id: the row's label.
      password: "Password",
    },
    password: {
      // DRAFT WORDING. No id: the row's value; the password is never shown.
      mask: "••••••••",
      // DRAFT WORDING. No id (P): the row's button. It doesn't ask for the old password.
      button: "Email me a link",
      // DRAFT WORDING. No id: the button's accessible name.
      buttonLabel: "Email me a link to change my password",
      // DRAFT WORDING. No id: the loading label.
      requesting: "Requesting…",
      // DRAFT WORDING. No id (P): {email} is the account's email; promises no email.
      requestedTitle: "A link to set a new password is on its way to {email}.",
      // DRAFT WORDING. No id (P): {minutes} is RESET_LINK_MINUTES.
      requestedBody:
        "The link works for {minutes} minutes. A new link cancels the earlier one. If nothing arrives, look in your spam folder or ask again.",
      // DRAFT WORDING. No id: the request failed.
      failed: "We couldn't ask for the link. Try again.",
    },
    fields: {
      // DRAFT WORDING. No id: 05, 9.6, the name row's first field.
      firstName: "First name",
      // DRAFT WORDING. No id: 05, 9.6, the name row's second field.
      lastName: "Last name (optional)",
      // DRAFT WORDING. No id: 05, 9.6, the phone row's field.
      phone: "Phone",
    },
    // DRAFT WORDING. No id: a row with no value yet.
    notGiven: "Not given",
    // DRAFT WORDING. No id: the row's text button (05, 9.6).
    edit: "Edit",
    // DRAFT WORDING. No id: "Edit name" and so on, the button's accessible name.
    editLabel: "Edit {row}",
    // DRAFT WORDING. No id: the row's main button while editing (05, 9.6).
    save: "Save",
    // DRAFT WORDING. No id: the loading label.
    saving: "Saving…",
    // DRAFT WORDING. No id: the row's text button while editing (05, 9.6).
    cancel: "Cancel",
    // DRAFT WORDING. W-U34
    saved: "Saved",
    // DRAFT WORDING. W-U35
    saveFailed: "We couldn't save this. Try again.",
  },
}
