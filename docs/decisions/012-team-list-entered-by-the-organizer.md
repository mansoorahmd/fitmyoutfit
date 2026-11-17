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

## Added 17 Nov, after the designer's specification ([08-team-list.md](../design/08-team-list.md))

The designer specified the step and marked ten decisions for the coordinator. All are taken as recommended:

1. **The Players tab is the team list.** The name and number style move one level down ("Style"). Not a separate step after Done, not a full-screen sheet.
2. **One undo history** for the design and the list.
3. **The list's columns follow what the design prints.** When only the number prints, the name stays as an optional field that is not printed. When neither prints, the list is one stepper per size.
4. **Spare shirts are in the first version:** "No name on this shirt" and "No number on this shirt" per line.
5. **Two shirts for one player are in the first version,** as a count per line (same size). Two sizes for one player waits.
6. **A goalkeeper or coach kit in another colour is not in the first version:** it is a second design and a second team order.
7. **Limits, all kept as data, not in code:** 100 lines per list; 1 to 10 of one shirt per line; a name may shrink to 75% of the style's size before it counts as too long; the server uses a fixed 18-character limit until it can measure fonts. The 75% figure is a placeholder until the factories say what prints well.
8. **The reader for pasted lists and CSV files lives in the shared roster-rules module,** so the server reads a list the same way as the editor.
9. **The M2 models get the fields this needs** (a count and the two flags on a roster entry; which fields the design prints on the team order). dev-plan.md is updated.
10. **"0" and "00" are the same number,** as the jersey number rule already says.

The designer's five questions for the founder are answered here as working placeholders by the coordinator, to be confirmed with the other parked business inputs when the whole project works:

- Every piece counts towards the export minimum, spares and second shirts included.
- Latin names print in capitals by default, with an "As typed" choice (a small engine addition in E4).
- Spare and second shirts cost the same per piece as any other.
- No goalkeeper or coach kit in another colour in the same order at launch.
- A name too long for the back: the organizer is asked to shorten it; no design-help offer at that point.

Still to follow: the storefront's home page and [03-direction.md](../design/03-direction.md) described the old link flow; the direction has a dated note, and the home page's wording changes in the storefront clean-up task.
