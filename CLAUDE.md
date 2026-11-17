# Custom Apparel Design Platform — project context

## What we are building
Our own online store where teams and clubs design custom jerseys, T-shirts and jackets in 3D and order them. Orders are produced by our network of 20+ partner factories in Pakistan, which already make these garments. Modeled loosely on jerseyengine.com, but JerseyEngine stops at the export file; we go to the cutting table.

## Decisions (Nov 2026, after the adversarial review; details in critiques/DECISIONS.md)
- Business model: own store, production by partner factories. SaaS and private-label are later channels.
- Platform: self-hosted Medusa (open-source commerce, Node/TypeScript) with a Next.js storefront. We build our own 3D editor (React + Three.js; 2D SVG pattern pieces rendered as 3D textures). We are staying with Medusa. Keep the editor (`packages/editor`) and the team-order logic loosely coupled, so a later move to Shopify stays possible.
- First segment: teams and clubs. Individuals buy single pieces in Pakistan only. Companies, events and small brands come later.
- Markets: Pakistan, UK, UAE and US, all at launch. Export orders have a minimum quantity, to be set from real duty-paid quotes.
- Company and payments: we already have a UAE company, used for card and PayPal payments. Still to confirm: Stripe and PayPal eligibility, and whether it can act as importer of record. In Pakistan we take JazzCash, Easypaisa and cards, with cash on delivery below a set limit.
- Team orders: the organizer pays a 50% deposit at proof approval and the 50% balance before shipping. The organizer enters every player's name, number and size in the editor, in one team list; players don't pay, and there is no player link at launch (founder, 17 Nov 2026; it may come later). The organizer signs a one-page roster proof.
- Promises: delivery 15 days from proof approval, or 10 days with paid rush. A free replacement within 7 days for our errors. Free design help for teams. Fit kits as a refundable deposit.
- Shipping: export orders go as one duty-paid (DDP) box to the organizer, with each jersey bagged and labelled.
- Production: designs aren't locked to one factory. Personalized team orders get a quality and color check at our hub in Lahore. Plain bulk is checked at the factory, with photos.
- Launch products: jersey, T-shirt and jacket. Decoration methods: sublimation, DTF, screen print and embroidery, chosen per product and matched to partner factories.
- Company is based in Lahore, Pakistan. US de minimis is suspended, so US parcels pay duty: base rate plus a 10% Section 301 tariff since 24 Jul 2026. Landed-cost (DDP) pricing matters.

## Files
- plan.md — the current milestone plan and market research, revised after the review.
- dev-plan.md — sprint-by-sprint development tasks for the store, covering store code only.
- critiques/ — the adversarial review: one file per critic, SYNTHESIS.md and DECISIONS.md.

## Rules for research and reviews
- Critics must look for failures, not confirm the plan.
- Every factual claim about competitors, laws, prices or markets needs a source URL found via web search.
- Separate "evidence" from "opinion" in every finding.
