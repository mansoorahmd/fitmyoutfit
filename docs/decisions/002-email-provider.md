# 002: Email provider

10 Nov 2026. Decided by the coordinator in Sprint 0. One of the three choices dev-plan.md asks Sprint 0 to settle.

## Context

From Sprint 2 the store sends transactional email: team-link invites, reminders 3 days and 1 day before the roster closes, roster closed, proof ready, and payment due. Volumes are low at launch (a few emails per player per team order). Recipients are in Pakistan, the UK, the UAE and the US. The provider must not be wired into the team-order logic, because that logic has to stay portable.

## Decision

- **Resend** is the production email provider.
- Email goes through **Medusa's Notification Module**. Resend is plugged in as a notification provider, so the team-order code asks for "send the invite email" and never calls Resend directly.
- **Templates are React Email components** kept beside the notification provider, one per email type.
- **Local development and CI use Medusa's local notification provider**, which logs the email instead of sending it. No API key is needed to develop or to run tests.
- Nothing is built in Sprint 0. The provider is added in Sprint 2 with the first emails.

## Alternatives

- **SendGrid.** Medusa ships a ready-made SendGrid notification provider, so there is less code to write. Templates live in SendGrid's dashboard rather than in the repo, which makes them harder to review and version.
- **Amazon SES.** Cheapest at volume, but needs AWS account setup, a sandbox-exit request and more configuration. Worth revisiting if email volume grows.
- **Postmark.** Strong deliverability for transactional mail, at a higher price and with no free tier to speak of.

## Consequences

- The founders need to create a Resend account and verify the sending domain (DNS records for SPF and DKIM) before Sprint 2 emails can be tested with real inboxes. Pricing and free-tier limits should be checked on Resend's site at that point; they were not verified for this decision.
- Swapping provider later means writing one new notification provider. Templates and the team-order code don't change.
- WhatsApp updates are outside the store plan and are not covered here.
