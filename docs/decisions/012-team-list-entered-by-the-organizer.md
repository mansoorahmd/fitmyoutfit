# 012 The organizer enters the team list in the editor; no player link at launch

17 Nov 2026. A founder decision (recorded in [critiques/DECISIONS.md](../../critiques/DECISIONS.md)) and the technical choices that follow from it.

## Context
Until today the plan was: the organizer shares a link, and each player adds their own name, number and size on a public page without logging in. The founder changed this on 17 Nov 2026: the person placing the order gives every player's name, number and size themselves, in one place, in the editor. Players adding their own line is left out for now and may come later.

Nothing of the team-order flow was built yet (M2 and M3 have not started), so no code is thrown away.

## Decision
1. **The team list is a step inside the editor.** The organizer adds one line per player (name, number, size), by typing or by pasting a list. Choosing a line shows that player's name and number on the 3D model. This joins what editor step E4 (roster preview) was already going to build.
2. **The editor does not save the list.** `packages/editor` holds the list's interface and passes the list to its host through its props and callbacks, as it does with the design. The storefront saves it to the team order. The editor still imports nothing from the storefront or Medusa.
3. **The roster rules stay in one plain TypeScript module** (no duplicate numbers, no blank required fields, allowed characters, maximum length from the font metrics, the jersey number rule), used by the editor to show a failed check beside its line and by the backend to refuse a bad list. The server's check is the one that counts.
4. **Only the signed-in organizer can read or change a team list.** There is no public link, no share token and no player page.
5. **The status flow loses `open` and `closed`:** `draft → proof_sent → approved → deposit_paid → in_production → balance_due → shipped`. The list is edited in `draft`. The close date goes; the need-by date now gives one date, the latest day to sign the proof.
6. **Emails go to the organizer only:** reminders before the latest signing date, proof ready, payment due. The invite, the players' reminders and "roster closed" are dropped.

Unchanged: the organizer pays (50% deposit at proof approval, 50% before shipping), the signed one-page roster proof, edits locked at signing, late joiners, reorders, the delivery promise, and the read-only share link for a design.

## Alternatives
- **Both ways** (the organizer's list plus a player link): offered to the founder and not chosen. It keeps all the planned work and adds the list in the editor.
- **A separate team-list page outside the editor:** not chosen. The founder asked for a single editor, and the per-player preview is only useful beside the list.

## Consequences
- Less to build in M2 and M3: no public page, no token, no rate limiting for it, no close step, fewer emails. The public surface left is the read-only design link.
- The organizer must collect sizes from the players themselves. The size chart therefore has to be easy to send on: a later task, to be raised when the size chart is done.
- A player link, if it comes back, is an addition: a token on the team order and a page that edits one line. Nothing in this decision blocks it.
- The specification [docs/design/06-editor.md](../design/06-editor.md) says the roster entry is outside the editor (its section on what the editor does not do) and the research note [docs/design/01-research.md](../design/01-research.md) describes the link flow. The designer corrects both and specifies the team list step before E4 is built.
- [dev-plan.md](../../dev-plan.md) M2, M3 and E4 and [plan.md](../../plan.md) were updated on the same day with the founder's go-ahead.
