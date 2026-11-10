# 007: Storefront design direction

10 Nov 2026. Decided by the coordinator. The founder saw the preview, called it childish-looking, asked for research into the most user-friendly designs among teamwear stores and Shopify themes, and then said the coordinator takes the decisions as co-founder.

## Context

The storefront is the stock Medusa starter with our name on it. The designer's research and review are in [docs/design/](../design/): [01-research.md](../design/01-research.md), [02-current-state-review.md](../design/02-current-state-review.md) and [03-direction.md](../design/03-direction.md). The direction document offers three looks on one shared layout.

## Decision

- **The look is direction A, "Matchday".** White pages, deep navy header, hero and footer, one red used for the main button only, condensed capital headings (Barlow Condensed), Inter for body text, Noto Sans Arabic for Arabic and Urdu. Tokens and values are in 03-direction.md.
- **The layout and behaviour** in 03-direction.md ("What holds for every direction") are the specification storefront-dev builds from, in the build order given there.
- **Name and mark:** "FitMyOutfit" as a typed wordmark with the tagline "Custom team kit". No logo is commissioned now.
- **No invented proof.** No club logos, reviews or team photos until real ones exist, used with permission.
- **Promise wording on the pages** restates what `critiques/DECISIONS.md` already promises, as draft text stored as data. It adds no new promise, number or minimum. Minimum order quantities are not shown until the founders set them.
- **WhatsApp help** is specified but stays hidden until there is a number and someone to answer it.
- **Colours are CSS variables,** so a change of look later is a change of values, not of components.

## Alternatives

- **B "Clubhouse"** (off-white, club green, calmer): the second choice. Rejected because it reads closer to a fashion store than to teamwear.
- **C "Kit Room"** (cream, burnt orange, rounded pills): rejected. It is the closest of the three to the look the founder already rejected.
- **Buy or adapt a ready-made theme:** the Shopify themes studied can't be used on Medusa, and the Medusa starter is the base we already have. Their patterns are taken into the specification instead.

## Consequences

- The redesign is tracked as tasks S0-14 onwards, one per step of the build order. It was not in plan.md or dev-plan.md.
- Every step ends with screenshots at a true 390 px phone width and at desktop width, looked at before the step is accepted.
- Red is reserved for the main button. Using it elsewhere is a defect.
- Arabic and Urdu headings fall back to a font that is not condensed. They must be tested with real names before the roster pages are built.
- Still open for the founder: a photo shoot of real kit from the partner factories before launch (the designer's recommendation), a WhatsApp number, and the final wording of each promise.
