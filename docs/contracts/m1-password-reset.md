# Contract: password reset (task S1-10)

17 Nov 2026 · coordinator. Agreed before the work; the backend part is built first, then the storefront part against it. Corrected to "as built" when each part is accepted. **Sections 1 and 2 are as built** (backend part and its fix round S1-10b, 17 Nov; facts marked "QA" were verified by QA's fifteenth review on a running backend).

A customer who forgets their password asks for a link by email, opens it and sets a new password. In development the link is written to the backend's log, because no email provider is connected until Sprint 2 ([decision 002](../decisions/002-email-provider.md)).

## 1. What Medusa already does (used as it is)

Checked against the installed Medusa 2.22.6.

- **Asking for a link:** `POST /auth/customer/emailpass/reset-password` with `{ "identifier": "<email>" }`. Medusa answers the same way whether or not an account exists, creates a token and emits the event `auth.password_reset` with the email, the actor type (`customer` or `user`) and the token. It sends nothing itself.
  - QA: the identifier must be the email **trimmed and in lower case**, and it must be the **only field** in the body.
  - Medusa keeps one sign-in identity per email, shared by customers and admin users, and takes the actor type from the path. A new request for an email, through either path, cancels that email's earlier pending link.
- **Setting the new password:** `POST /auth/customer/emailpass/update`. QA:
  - the token goes in an **`Authorization: Bearer <token>` header**, not in the body;
  - the body holds **only** `{ "password": "<new>" }`;
  - a missing, empty or non-text password **uses the token up**, and Medusa **accepts any password**, so the caller checks the password before sending;
  - an expired, used or wrong token is refused with 401.
- **A link lasts 15 minutes** from the request, fixed, and works once (see section 2 for two updates at the same moment).
- The link still works after the customer has signed in; sessions that were open before a reset stay valid; a link asked for an email that is later changed in the admin still works for the old email.
- The same pair exists for admin users (`/auth/user/emailpass/...`); Medusa's admin has its own "forgot password" and "reset password" pages.

## 2. Backend part

- **A subscriber on `auth.password_reset`** builds the link and asks Medusa's Notification Module to send it (channel `email`, template `password-reset`, data: the link, the email, how long the link lasts in minutes). The subscriber holds no rule of its own beyond choosing the link; building the link is a plain function with tests.
- **The link.**
  - Customer: `<STOREFRONT_URL>/account/reset-password?token=<token>&email=<email>` (both values URL-encoded). The storefront adds the country to the path itself.
  - Admin user: `<backend URL>/app/reset-password#token=<token>&email=<email>` (the page Medusa's admin already has). Both values are in the fragment, which a browser never sends to a server; a script added to the admin's page through Medusa's `admin.vite` option moves them into the query before the page reads `token`, and the admin's pages send only the origin as `Referer`.
  - `STOREFRONT_URL` and `BACKEND_URL` are backend settings in `.env`. In production both must be set, must be `https`, and must name a public host (not `localhost`, an IP address or a name without a dot); the backend refuses to start otherwise.
- **A link is sent only when the email's identity has an account of the asked kind** (`app_metadata.customer_id` for `customer`, `app_metadata.user_id` for `user`); otherwise nothing is sent and one info line without the email or the token is logged. An email that is both gets the kind asked for. If the lookup fails, nothing is sent. The token Medusa made for a withheld link exists only as a hash in the database and lapses after 15 minutes.
- **Development:** Medusa's local notification provider is configured for the `email` channel; it writes the notification to the backend's log, and the link can be copied from there. "Development" means `NODE_ENV`, trimmed, is exactly `development` or `test`; unset, blank, `Development` and anything else count as production.
- **Production:** our own code never writes a link or token to a log outside development and test. Until a real email provider is configured (Sprint 2), the subscriber creates no notification and logs one warning line without the token or the link. Medusa's request log records every request's address and `Referer`; the admin link keeps its token out of both, and a middleware replaces any `token` value in the logged address and `Referer` of requests to our own routes. The storefront's hosting logs will record the customer link's address. This is on the launch list: password reset does not work in production before Resend is connected.
- **A link works once, also when two updates arrive at the same moment:** a lock per token on the update route (the second request gets 401; 409 if the lock is not free within 10 seconds).
- **Nothing reveals whether an account exists:** the subscriber does not answer the request, and an unknown email produces no event. (The time the request takes does differ, and creating an account reveals it outright: Medusa's behaviour, not changed.)
- **How long a link lasts:** 15 minutes, passed to the template data so the page and the email can say it.
- **Known limits (launch list):** an old-style admin link with `?token=`, a reload of the admin reset page before the form is sent, and Medusa's own invite page `/app/invite?token=` are still written to Medusa's request log when opened; with Redis as the event bus the event's payload, token included, passes through Redis (not verified).

## 3. Storefront part

Pages follow the patterns of sign-in and create account in [05-m1-pages.md](../design/05-m1-pages.md), section 8 (one column, one red button, the `PasswordField` with Show / Hide in words, errors as in section 2). Wording goes into `storefront/src/content/account.ts`, marked as drafts.

- **"Forgot your password?"** on the sign-in form is switched on (`forgotPassword.show`).
- **`/[countryCode]/account/forgot-password`:** one email field (prefilled from the sign-in form if the customer typed it there). The email is sent trimmed and in lower case, as the only field. After submit the page always shows the same message, whether or not an account exists: a link was sent if the email belongs to an account, how long it lasts, and what to do if nothing arrives. A second request is possible from the same page.
- **`/account/reset-password?token=…&email=…`** (the link's address): the storefront's middleware adds the country and keeps the query. The page:
  - takes the token and email, then removes them from the address bar and never sends them to any other site (no third-party requests on this page; `Referrer-Policy: no-referrer`);
  - shows the email (not editable) and one new-password field with the same rules as create account (at least 8 characters, not only spaces). The page checks the password **before** it sends anything, because a refused or empty password would use the link up, and it blocks a second submit while the first is running;
  - sends the token only in the `Authorization: Bearer` header of the update request, made on the server, with a body of only `{ "password" }`;
  - on success goes to sign-in with the email filled in and a notice that the password was changed (the customer signs in with it; they are not signed in automatically);
  - an expired, used or wrong link shows a message that says so in plain words, with a button to ask for a new link;
  - a missing token or email shows the same message, not an error page.
- **Profile:** the "Password" row comes back (`PASSWORD_CHANGE_AVAILABLE`). It does not ask for the old password; its button sends the reset link to the account's email and says so.
- **Signed-in visitors** who open the forgot-password page are sent to their profile.

## 4. Not in this contract

- Real email sending and the email's design (Sprint 2, Resend and React Email templates).
- Slowing repeated requests for links or repeated wrong sign-ins, and ending other sessions after a password change (both on the launch list; Medusa's tokens stay valid until they expire).
- Changing the account's email address.
