# Contract: password reset (task S1-10)

17 Nov 2026 · coordinator. Agreed before the work; the backend part is built first, then the storefront part against it. Corrected to "as built" when each part is accepted.

A customer who forgets their password asks for a link by email, opens it and sets a new password. In development the link is written to the backend's log, because no email provider is connected until Sprint 2 ([decision 002](../decisions/002-email-provider.md)).

## 1. What Medusa already does (used as it is)

The developer checks each of these against the installed Medusa 2.22.6 and reports any difference before building on it.

- **Asking for a link:** `POST /auth/customer/emailpass/reset-password` with `{ "identifier": "<email>" }`. Medusa answers the same way whether or not an account exists, creates a short-lived token and emits the event `auth.password_reset` with the email, the actor type (`customer` or `user`) and the token. It sends nothing itself.
- **Setting the new password:** `POST /auth/customer/emailpass/update` with the token and `{ "password": "<new>" }`. An expired or wrong token is refused.
- The same pair exists for admin users (`/auth/user/emailpass/...`); Medusa's admin has its own "forgot password" and "reset password" pages.

## 2. Backend part

- **A subscriber on `auth.password_reset`** builds the link and asks Medusa's Notification Module to send it (channel `email`, template `password-reset`, data: the link, the email, how long the link lasts in minutes). The subscriber holds no rule of its own beyond choosing the link; building the link is a plain function with tests.
- **The link.**
  - Customer: `<STOREFRONT_URL>/account/reset-password?token=<token>&email=<email>` (both values URL-encoded). The storefront adds the country to the path itself.
  - Admin user: `<backend URL>/app/reset-password?token=<token>&email=<email>` (the page Medusa's admin already has).
  - `STOREFRONT_URL` is a backend setting in `.env` (`http://localhost:8000` in `.env.example`). In production it must be set, must be `https`, and the backend refuses to start without it, like the other production checks.
- **Development:** Medusa's local notification provider is configured for the `email` channel; it writes the notification to the backend's log, and the link can be copied from there. `npm run dev` prints nothing else.
- **Production:** a reset link is a credential and must never be written to a log. Until a real email provider is configured (Sprint 2), the subscriber in production sends nothing and logs one warning line without the token or the link. This is on the launch list: password reset does not work in production before Resend is connected.
- **Nothing reveals whether an account exists:** the subscriber does not answer the request, and an unknown email produces no event.
- **How long a link lasts** is Medusa's default unless the developer finds it is unsuitable; the figure is reported and passed to the template data so the page and the email can say it.

## 3. Storefront part

Pages follow the patterns of sign-in and create account in [05-m1-pages.md](../design/05-m1-pages.md), section 8 (one column, one red button, the `PasswordField` with Show / Hide in words, errors as in section 2). Wording goes into `storefront/src/content/account.ts`, marked as drafts.

- **"Forgot your password?"** on the sign-in form is switched on (`forgotPassword.show`).
- **`/[countryCode]/account/forgot-password`:** one email field (prefilled from the sign-in form if the customer typed it there). After submit the page always shows the same message, whether or not an account exists: a link was sent if the email belongs to an account, how long it lasts, and what to do if nothing arrives. A second request is possible from the same page.
- **`/account/reset-password?token=…&email=…`** (the link's address): the storefront's middleware adds the country and keeps the query. The page:
  - takes the token and email, then removes them from the address bar and never sends them to any other site (no third-party requests on this page; `Referrer-Policy: no-referrer`);
  - shows the email (not editable) and one new-password field with the same rules as create account (at least 8 characters, not only spaces);
  - on success goes to sign-in with the email filled in and a notice that the password was changed (the customer signs in with it; they are not signed in automatically);
  - an expired, used or wrong link shows a message that says so in plain words, with a button to ask for a new link;
  - a missing token or email shows the same message, not an error page.
- **Profile:** the "Password" row comes back (`PASSWORD_CHANGE_AVAILABLE`). It does not ask for the old password; its button sends the reset link to the account's email and says so.
- **Signed-in visitors** who open the forgot-password page are sent to their profile.

## 4. Not in this contract

- Real email sending and the email's design (Sprint 2, Resend and React Email templates).
- Slowing repeated requests for links or repeated wrong sign-ins, and ending other sessions after a password change (both on the launch list; Medusa's tokens stay valid until they expire).
- Changing the account's email address.
