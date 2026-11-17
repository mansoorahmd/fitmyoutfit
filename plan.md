# Custom Apparel Design Platform — Milestone Plan & Market Research

Nov 10, 2026 · Mansoor · Revised after the adversarial review. The review is in critiques/SYNTHESIS.md, and the decisions it led to are in critiques/DECISIONS.md.

## Summary

We are building our own store where teams and clubs design custom jerseys, T-shirts and jackets in 3D and order them. Orders are produced by our network of 20+ partner factories, which already make these garments. The store is self-hosted on Medusa, an open-source commerce engine, with our own design editor and team-ordering features built on top. We are not using Shopify.

Decisions:

- **First customers: teams and clubs.** We market only to them at launch. Individuals can buy single pieces in Pakistan. Companies, events and small brands come later.
- **Markets: Pakistan, the UK, the UAE and the US, all at launch.** Single pieces are sold in Pakistan only. Export orders have a minimum quantity, set from the M0 price quotes.
- **Company and payments.** Our existing UAE company takes card and PayPal payments for export markets, which still needs confirming. In Pakistan we accept JazzCash, Easypaisa and cards, with cash on delivery for small orders only.
- **Launch products: jersey, T-shirt and jacket.** Hoodies and polos follow later.
- **Production: a partner network.** Any partner factory with free capacity can take an order. Personalized team orders pass through our hub in Lahore for quality and color checks before shipping. Plain bulk orders are checked at the factory, with photos.
- **Promises:**
  - Delivery within 15 days of proof approval, or 10 days with paid rush.
  - Free replacement within 7 days if we got it wrong.
  - Free design help for teams.
  - Refundable fit kits.
- **Team orders:**
  - The organizer pays: 50% deposit at proof approval, 50% before shipping.
  - The organizer enters every player's name, number and size in the editor, in one team list. Players pay nothing. There is no player link at launch; it may come later (founder, 17 Nov 2026).
  - Export orders ship as one duty-paid box to the organizer, with each jersey bagged and labelled.
- **Where we win:**
  - Self-serve online ordering with a 3D editor.
  - A signed roster proof and a dated delivery promise.
  - Production from Pakistan at Pakistani cost.

  Competing factories in Pakistan sell through quotes, WhatsApp and wire transfers ([IK Apparel](https://ikapparel.com/custom-team-jerseys-manufacturer.php)). Competitors that do sell self-serve online produce in the EU or the US ([owayo](https://www.owayo.com/custom-volleyball-jerseys.htm), [Spized](https://www.spized.com/en/custom-table-tennis-jersey)).

## Competitive landscape

Competitors no longer fall into neat camps. Several already combine a 3D editor, no minimums and their own production. So the 3D editor is not a moat on its own: renting a configurator costs $59–$300 a month ([Zakeke](https://admin.zakeke.com/en-US/pricing), [Kickflip](https://gokickflip.com/pricing)). We have to win on price, a dated promise and trust.

Sources checked on 10 Nov 2026.

| Player | Model | What they do well | Lesson for us |
| --- | --- | --- | --- |
| [owayo](https://www.owayo.com/custom-volleyball-jerseys.htm) | 3D designer, own factory in Germany | Makes 1 to 10,000 pieces and ships in 7–15 days. Reorders in any amount, a samples program and a [club rebate program](https://www.owayo.com/soccer/athletic_club_rebate_program-us.htm). Single jerseys cost about $63–85 in the US ([owayo soccer](https://www.owayo.com/custom-soccer-jerseys.htm)). | The closest match to our model. We must beat it on price. |
| [Spized](https://www.spized.com/en/custom-table-tennis-jersey) | 3D configurator, EU production | Makes from 1 piece and delivers in 12 working days. Reorders at the last order's price. A team-list link with a deadline ([ordering process](https://www.spized.com/en/ordering-process)). Hummel teamwear since June 2026 ([SGI Europe](https://www.sgieurope.com/brands/hummel-partners-with-spized-for-custom-teamwear/121767.article)). | Price-locked reorders and a roster link with a deadline. |
| [Sublimation Kings](https://sublimationkings.com/faq) | 3D builder, US | No minimums, and names and numbers are free. Production takes 3–4 weeks, with rush in 10–15 days. Proofs go out by SMS link. US shipping is a flat $7.95, free over $500. | Proofs by phone, and clear shipping prices. |
| [USA Teamwear](https://usateamwear.com/) | US company, factory in Sialkot | Free design with 20 designers. Production takes 7–10 days. Accepts PayPal. Free US shipping with customs and duties handled ([details](https://usateamwear.com/customization-sublimated-cricket-kits-usa-identity/)). | Same sourcing base as us, and it has already solved duty-paid US delivery. |
| [Custom Ink](https://www.customink.com/services/t-shirt-maker) | General printer that also sells sublimated team jerseys | No-minimum styles, and a group order form where each person picks a size ([how it works](https://www.customink.com/how-it-works)). An artist reviews every order and sends a free proof. Free 2-week delivery, rush and a 3-day super rush ([delivery options](https://www.customink.com/help_center/delivery-options)). Sublimated jerseys with a names-and-numbers tool ([jerseys](https://www.customink.com/products/sublimated-team-jerseys/1063)). | Human review, a free proof, and guaranteed dates. |
| [SquadLocker](https://squadlocker.com/solutions/teams) | Team stores | No minimums, and stores never close. Ships to each player's home. Free setup. Fundraising at 5%, 10% or 15% ([fundraising](https://squadlocker.com/squad-blog/fundraising-with-squadlocker)). | Always-open reorders for late joiners. |
| [Wooter Apparel](https://wooter.com/articles/?p=14699) | Direct-to-team brand | Online builder or free mockups. Sizing kits are refundable ([sizing kit](https://wooter.com/products/sizing-kits-soccer-jersey-crew-neck-soccer)). Team stores ([team store](https://wooter.com/articles/?p=17941)). | Refundable fit kits and free design. |
| [JerseyEngine](https://jerseyengine.com/app) | Configurator software | 3D/AR editor, team roster, roll-width nesting, SVG/PDF/PNG export, WooCommerce embed. Shopify integration is in development. | Our baseline editor features. |
| [Hapticmedia](https://hapticmedia.com/use-cases/jersey-design-maker/) | 3D configurator for brands | Design once and every player's kit is generated. Its Puma teamwear configurator runs from design through to printing. | Design once; the roster generates the rest. |
| [Zakeke](https://admin.zakeke.com/en-US/pricing), [Kickflip](https://gokickflip.com/pricing) | Configurators sold as software | 3D/AR, names and numbers, bulk orders and print-ready files, from $59 a month. | Any factory can rent a 3D editor, so the editor alone is not our edge. |
| [IK Apparel](https://ikapparel.com/custom-team-jerseys-manufacturer.php), [MTH Sports](https://mthsports.com/soccer-sublimation-jersey) | Sialkot factories selling direct | Minimums of 10–20 pieces, production in 10–15 days, photo and video updates on WhatsApp. They sell through quotes and wire transfers. | Self-serve online ordering from Pakistan is still open. Send updates on WhatsApp. |
| [Printful](https://www.printful.com/news/printfuls-customer-orders-increase-with-the-new-ai-image-upscaler), [Printify](https://help.printify.com/hc/en-us/articles/15493218417809-How-can-I-design-a-product-using-Printify-s-AI-Image-Generator) | Print-on-demand | AI upscaling of weak uploads (Printful, since 2020). AI image generation (both). | Auto-repair uploads. AI design help is common, but not needed for teams at launch. |
| [OneTeam](https://oneteamsports.com/pages/oneteam-custom-express) | Express program, sold through reps | 10 business days from artwork approval, for a few styles only. | Publish a turnaround counted from proof approval. |
| [Champro](https://cb.champrosports.com) | Builder for dealers | Dealers embed Champro's Custom Builder on their own sites. | A future reseller channel. |
| UK kit builders: [SWAZ](https://swaz.co.uk/sports/cricket/custom-cricket-teamwear/), [Serious Sport](https://www.serioussport.co.uk/bespoke-sportswear), [My Club Group](https://myclubgroup.com/?p=3496) | Local kit suppliers | No minimums or low minimums. Serious Sport makes kit in the UK and has a 3D kit builder. | Our direct rivals in the UK. |

## Purchaser POV

Teams don't forgive late kits: a jersey that arrives after the first match is worthless. The failures they report are wrong sizes, wrong names, delays and disputes. Each review quote below was checked on 10 Nov 2026. Trustpilot pages change as new reviews arrive, so we archive each quote with the date it was seen.

| Buyer pain | Evidence | What we build against it |
| --- | --- | --- |
| Late delivery and no updates | Delay and tracking complaints at [Jersey Loco](https://ca.trustpilot.com/review/jerseyloco.com?page=6) and [Jersey Teams World](https://ca.trustpilot.com/review/jerseyteamsworld.com). Even Wooter rush orders have arrived after the event ([Wooter Trustpilot](https://at.trustpilot.com/review/wooterapparel.com)). | Ask for a need-by date when the team order is created. A 15-day promise from proof approval, plus paid rush. A status page and WhatsApp updates. |
| Wrong sizes | "Sizes fit slim" at [Jersey Loco](https://ca.trustpilot.com/review/jerseyloco.com?page=6). | Size charts measured on finished garments, refundable fit kits, and size checks at the hub. |
| Wrong names or numbers | "Player name wrong!" at [Jersey Teams World](https://ca.trustpilot.com/review/jerseyteamsworld.com). | Players enter their own lines. Roster checks, a signed roster proof, and a hub check against that proof. |
| Colors don't match the preview | Zazzle reviewers complain colors come out lighter than the preview ([Trustpilot](https://www.trustpilot.com/review/www.zazzle.com?page=9)). | A palette of print-tested colors. HEX values snap to the palette, with a warning. A hub color check against the original order. |
| "You're wrong" disputes | A seller told a buyer "that I was mistaken" ([fiitg](https://ca.trustpilot.com/review/fiitg.com?page=9)). | The signed proof is stored with the order. A photo claim flow, and a free 7-day replacement for our errors. |

Who we serve:

| Segment | Typical order (assumed) | Launch status |
| --- | --- | --- |
| Teams and clubs | 10–50 pieces with names and numbers | **Launch focus.** Marketing, features and pilot all aim here. |
| Individuals | 1–5 pieces | Pakistan only. We don't market abroad. |
| Companies | Staff uniforms, recurring | Later. Needs certifications, invoices, payment terms and approval workflows. |
| Events and groups | Weddings, charity runs, schools | Later. Needs fundraising and links where each person pays. |
| Small apparel brands | 50–500 per design, repeated | Later. Needs samples, own labels and color locked across reruns. |

## Seller POV

Our biggest risks are commercial: margin after US duty, color consistency across partner factories, and the cost of our guarantees.

| Seller risk | Why it matters | What we build or decide |
| --- | --- | --- |
| **US duty on every parcel** | The US suspended duty-free de minimis entry on 29 Aug 2025 and continued the suspension on 20 Feb 2026. The Court of International Trade upheld it on 13 Aug 2026, and the statutory end date is 1 July 2027 ([Avalara](https://www.avalara.com/gb/en-gb/blog/de-minimis-exemption-changes-coming.html), [A&M](https://www.alvarezandmarsal.com/thought-leadership/uscit-upholds-ieepa-suspension-of-de-minimis-treatment-in-axle-of-dearborn)). Base duty is 16.5% on cotton tees ([Wove](https://tariffs.wove.com/us/tariff/6109.10)) and about 32% on synthetic knit tops ([HTSHub](https://www.htshub.com/us-hs/detail/61099010)). A 10% Section 301 tariff on Pakistan comes on top, since 24 Jul 2026 ([KPMG](https://kpmg.com/us/en/taxnewsflash/news/2026/07/tnf-united-states-imposes-section-301-tariffs-on-60-economies-failing-to-address-forced-labor.html)). | Get real all-in quotes for 10 team orders per market in M0, and set the export minimum and prices from them. Store the tariff stack as data we can update in a day. DDP quotes carry a validity window. Ship one box per team. |
| **UK and UAE duty** | Not yet checked. Pakistan may pay zero UK duty on clothing under the UK's DCTS scheme ([Business Recorder](https://www.brecorder.com/news/40248827)), but there is no 2026 confirmation yet. | Check on gov.uk, and check UAE customs, during M0. |
| **Color across factories** | Any free factory can take an order, so a reorder or late joiner may come from a different factory than the original. Sublimation color shifts with fabric lot, paper, ink and press settings ([Mutoh](https://support.mutoh.eu/support/solutions/articles/14000160513-dye-sublimation-generic-icc-profiles-)). | One color standard for all factories: master swatches, approved fabric suppliers, and a color profile per factory. Each piece records which factory made it and from which fabric lot. The hub checks color against a sample kept from the original order. |
| **Remakes under the 7-day guarantee** | Each remake costs a production slot, express freight and, for the US, another duty-paid entry. | A remake priority lane at partner factories. Reason codes on every claim. Factory agreements state who pays when the factory is at fault. |
| **Trademarked logos** | Print-on-demand firms can be held liable for what they make, even when the customer uploaded it ([Eric Goldman on CafePress](https://blog.ericgoldman.org/?p=10643)). | Rights confirmation at upload, a logo check in the proof step, and an IP policy with a cancellation fee. One maker charges 15% for trademarked files ([Custom Made Better](https://www.custommadebetter.com/blogs/faqs/maker-tip-let-s-talk-about-trademarks)). |
| **No returns on custom goods** | Sublimated uniforms usually can't be returned ([Omni Cheer](https://omnicheer.com/help/sublimation-faq)). | Refundable fit kits before the order. A made-to-order policy accepted at checkout. A free remake for our errors. |
| **Cash flow** | We pay factories before the balance arrives. | A 50% deposit at proof approval, and 50% before shipping. |
| **Payments** | Stripe and PayPal aren't directly available to Pakistani merchants ([WorldFirst](https://www.worldfirst.com/sasia/?p=52075)). | Apply for gateways under the UAE company in week 1. In Pakistan use JazzCash, Easypaisa and cards, with cash on delivery below a set limit. |
| **Cash on delivery in Pakistan** | A refused custom order can't be resold. | Cash on delivery only below a limit we set in admin. |
| **Artwork quality** | Low-resolution logos print badly at jersey size. | Upload checks and auto-upscaling. Our designers redraw logos for free on team orders. |

## Launch scope

| Feature | Priority | Milestone |
| --- | --- | --- |
| Store in 4 regions (PKR, GBP, AED, USD), with a minimum quantity per region | Must for launch | M2 |
| Organizer-paid checkout: 50% deposit, then 50% balance | Must for launch | M2 |
| Pakistan payments: JazzCash, Easypaisa, cards, and cash on delivery below a limit | Must for launch | M2 |
| Duty-paid price per export market, with a validity window | Must for launch | M2 |
| "Delivered by" date at checkout: 15 days from proof approval, 10 with rush | Must for launch | M2 |
| Free design-help queue for teams | Must for launch | M2 |
| Refundable fit kits | Must for launch | M2 |
| Rights confirmation at upload, plus a logo check | Must for launch | M2 |
| Own 3D editor: jersey first, then T-shirt and jacket | Must for launch | M1 |
| Print-tested palette with HEX snapping and a warning | Must for launch | M1 |
| Template, clipart and font library for teams | Must for launch | M1 |
| Upload checks and auto-upscaling | Must for launch | M1 |
| Team list in the editor: the organizer enters each player's name, number and size | Must for launch | M3 |
| Need-by date, with the latest date to sign the proof worked out from it | Must for launch | M3 |
| Roster checks: duplicate numbers, blank fields, length and character limits | Must for launch | M3 |
| One-page roster proof signed by the organizer, with edits locked after signing | Must for launch | M3 |
| Late joiners and reorders from a past team order | Must for launch | M3 |
| Standard job file for partner factories | Must for launch | M4 |
| Routing orders to factories by method and load | Must for launch | M4 |
| Hub quality and color check for personalized team orders | Must for launch | M4 |
| Claims and remakes with the 7-day guarantee, with reason codes | Must for launch | M4 |
| One duty-paid box per team, jerseys bagged and labelled by player | Must for launch | M4 |
| Order status page and WhatsApp updates | Must for launch | M4 |
| Company accounts, purchase orders, invoices | Later | — |
| AI design assist | Later | — |
| Shipping to each player | Later | — |
| Player link: players add their own name, number and size | Later | — |
| Fundraising markup, storefronts, private-label builder | Later | — |

## Milestone plan

Public launch is in about 24 weeks. Store development runs from week 1. Week-by-week development tasks are in dev-plan.md.

| Milestone | Weeks |
| --- | --- |
| M0 Foundations | 1–4 |
| M1 Design engine (own 3D editor) | 3–12 |
| M2 Store, checkout and payments | 2–7, with real gateways and prices added in weeks 13–16 |
| M3 Team orders | 4–7 |
| M4 Factory network link | 9–18 |
| M5 Pilot with real teams | 17–20 |
| M6 Public launch | 21–24 |

| Milestone | Scope | Exit criteria |
| --- | --- | --- |
| M0 Foundations | **Payments:** apply for gateways under the UAE company in week 1. **Factories:** choose 3–5 of the 20+ partners for launch. Agree a method for each product, and one color standard across factories. **Size and color tests:** run a shrinkage test for each fabric, and build size charts from finished garments. **Assets:** patterns and 3D models for the jersey, T-shirt and jacket. **Pricing and duty:** real all-in quotes for 10 team orders in each of the 4 markets. Check UK and UAE duty. **Development:** project setup (Sprint 0). | Partner factories' test prints match the palette, and their sizes are within tolerance. Gateway status is known. Export minimum and prices are set from real quotes. The developers can run the store locally. |
| M1 Design engine | Own 3D editor: colors by zone, text, numbers, logos, templates, the palette with snapping, a preview for each player, and proof renders. Designs are saved as versioned data. | A coach builds a team design from a template and previews 3 players without help. The proof render matches the 3D view. |
| M2 Store, checkout and payments | Medusa backend and Next.js storefront. 4 regions, minimum quantity per region, and cash on delivery below a limit in Pakistan. "Delivered by" date and rush option. Duty-paid prices. Deposit and balance payments. Fit kits, design-help queue, IP check. | A Pakistan single-piece order and a UK team order each run from cart to payment. |
| M3 Team orders | Team list entered by the organizer in the editor, need-by date, roster checks, signed roster proof, edits locked after signing. Late joiners, reorders, the organizer's order page, and email reminders to the organizer. | A test team of 20 goes from create to a full team list to signed proof to deposit to balance on a phone, with no manual edits. A player added after signing gets a matching jersey. |
| M4 Factory network link | Standard job file. Routing by method and factory load. Factory and lot recorded on each piece. Hub quality and color check for team orders, and factory photo check for bulk. Remake lane with the 7-day guarantee. One duty-paid box per team. Status page and WhatsApp updates. | A shift of mixed orders (team orders, singles, a reorder and a remake) runs at partner factories from system files, and passes the hub check. |
| M5 Pilot with real teams | Invited teams in all 4 markets, with real orders and real payments. | Tracked weekly: contribution margin after duty, freight and fees; remake rate; on-time rate against the promised date; days from claim to replacement in hand. Top pilot issues fixed. |
| M6 Public launch | Marketing site, SEO pages for each sport and product, pilot reviews, and a support playbook. Open about Pakistan production: "made by our partner factories in Pakistan". | Store open to the public. |

## Team, risks and open decisions

**Core team:**

| People | Role |
| --- | --- |
| 1 | Product lead who owns scope |
| 2 | Full-stack developers (Medusa + Next.js, one leaning backend) |
| 1 | Frontend 3D developer (Three.js) |
| 1 | 3D garment artist |
| 1 | Pattern maker with CAD grading |
| 1 | Graphic designer for templates and free design help |

Two more roles join from M4: a factory network coordinator, and a hub quality and packing team in Lahore. Production is done by partner factories, so floor staff are not on our payroll.

**Top risks:**

1. **US margin.** US duty of about 26–42% plus freight may make US orders unprofitable. Mitigation: real quotes in M0, an export minimum, and prices set from the quotes.
2. **Color drift between factories.** Mitigation: one color standard, factory and lot recorded on each piece, and a hub color check against a sample kept from the original order.
3. **Scope.** Building our own 3D editor for 3 products in 4 markets within 24 weeks is a lot. Mitigation: the editor launches the jersey first, and the T-shirt and jacket follow from week 10.
4. **Gateway approval for the UAE company.** Mitigation: apply in week 1, and keep manual payment and bank transfer as the fallback.
5. **Cost of the 7-day guarantee.** Mitigation: a remake lane at partner factories, factory agreements on who pays for errors, and remake reason codes.
6. **Trust in an unknown brand.** Mitigation: photo reviews from the pilot, open communication about Pakistan production, and a published support response time.

**Open decisions:**

- [ ] Export minimum quantity for the UK, UAE and US, set after the M0 quotes.
- [ ] Which 3–5 partner factories we launch with, and their terms: price, payment, quality, and who pays for errors.
- [ ] Cash-on-delivery limit in Pakistan, and the price of the rush tier.
- [ ] Whether the UAE company qualifies for Stripe and PayPal, and whether it can act as importer of record.
- [ ] UK and UAE duty on our products (check DCTS on gov.uk), and tax rates per market (accountant).
- [ ] Who owns sales and marketing to teams from week 1.
- [ ] When to add a second segment, and which one.
