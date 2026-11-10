# Adversarial review of plan.md — synthesis

Review date: 10 Nov 2026. Six critics reviewed plan.md independently, without seeing each other's output. Their raw findings are in this folder:

| Short name | File | Point of view |
| --- | --- | --- |
| BI | [buyer-individual.md](buyer-individual.md) | First-time gift buyer, 1–3 pieces, US |
| TO | [team-organizer.md](team-organizer.md) | Volunteer club manager, 15–40 jerseys |
| CB | [corporate-buyer.md](corporate-buyer.md) | Procurement or HR at a 200-person company |
| PM | [production-manager.md](production-manager.md) | Factory floor manager in Pakistan |
| SI | [skeptical-investor.md](skeptical-investor.md) | Investor focused on unit economics and focus |
| CR | [competitor-researcher.md](competitor-researcher.md) | Market researcher checking the competitive analysis |

How to read this document:

- **Evidence** means a sourced fact that a critic found by web search during this review. The key URLs are repeated here, and the full list is in each critic's file.
- **Opinion** means a critic's judgement, or an estimate a critic calculated from sourced inputs.
- Where critics disagree, or a source is weak, that is flagged.

---

## (a) Objections raised by 2 or more critics, ranked by severity

Severity measures how much damage an objection does if it holds:

- **Fatal:** the business doesn't work.
- **Severe:** it loses customers or reviews at scale.
- **Moderate:** it costs money or time, but can be fixed later.

| # | Objection | Raised by | Severity |
| --- | --- | --- | --- |
| 1 | Small orders shipped from Lahore to the US lose money once duty, fees and freight are paid. The plan tests this last. | BI, SI, CB, TO, CR | Fatal |
| 2 | Payment rails and the destination-market entity are unresolved. They are treated as back-office tasks when they decide whether customers convert. | BI, CB, TO, SI, CR | Fatal |
| 3 | The plan makes no dated delivery promise, sets no turnaround number, offers no rush tier and has no capacity model behind any promise. | BI, TO, CB, PM, CR | Severe |
| 4 | Claims and remakes are deferred to "soon after launch". There is no remake SLA and no remake lane on the floor. | TO, BI, PM, CB | Severe |
| 5 | Color and decoration method drift between first orders, reorders and late joiners. Reorders are deferred to M5. | CB, TO, PM, CR | Severe |
| 6 | Nothing a customer can see sets the store apart. The 3D editor and the own factory are not unique, and an unknown Pakistan-based brand starts with a trust deficit. | SI, CR, BI, CB | Severe |
| 7 | Five segments, no chosen focus, and nobody owns sales or marketing until M6. | SI, CB, BI | Severe |
| 8 | The plan builds first and validates late. Real customers arrive in week 17, and there is no peak-season test. | SI, PM, BI | Moderate–Severe |
| 9 | The team is understated: no factory crew, one designer doing four jobs, no sales or support role. | PM, BI, SI | Moderate |
| 10 | Deposit-then-balance payment doesn't fit player-pay group orders or corporate net-30 terms. | TO, CB | Moderate |
| 11 | The group order is close-dated only. There is no always-open link and no path for late joiners. | TO, CR | Moderate |
| 12 | The plan charges for things competitors give away: design help, fit kits, photo fixing. | CR, BI | Moderate |

### 1. US small-order economics are negative. Fatal. (BI, SI, CB, TO, CR)

**Evidence:**
- **The price to match.** Custom Ink sells one tee for about $29–38, with free delivery and free artwork review ([Custom Ink](https://www.customink.com/products/t-shirts/no-minimum-t-shirts/198)).
- **Base duty.** US duty is 16.5% on cotton tees ([ustariffrates 6109.10](https://ustariffrates.com/hts/6109.10.00)) and about 32% on man-made-fibre knit tops, which covers polyester jerseys ([HTSHub 6109.90.10](https://www.htshub.com/us-hs/detail/61099010)).
- **Section 301 tariff.** A 10% tariff on Pakistan has been stacked on top of base duty since 24 July 2026 ([KPMG](https://kpmg.com/us/en/taxnewsflash/news/2026/07/tnf-united-states-imposes-section-301-tariffs-on-60-economies-failing-to-address-forced-labor.html), [Dorsey](https://www.dorsey.com/newsresources/publications/client-alerts/2026/7/announced-section-301-tariffs)).
- **Rate history.** The extra rate on Pakistan has changed several times since mid-2025:
  - 19% under IEEPA from August 2025.
  - The Supreme Court struck IEEPA tariffs down on 20 Feb 2026 ([Wipfli](https://www.wipfli.com/insights/articles/supreme-court-ieepa-tariff-ruling-released)).
  - A 10% Section 122 surcharge replaced it, then expired on 24 July 2026 ([UHY](https://uhy-us.com/insights/news/2026/july/tariff-reset-section-122-expires-as-section-301-duties-expand)).
- **De minimis.** The suspension still applies. The Court of International Trade upheld it on 13 Aug 2026, and the statutory end date is 1 July 2027 ([Avalara](https://www.avalara.com/gb/en-gb/blog/de-minimis-exemption-changes-coming.html), [A&M](https://www.alvarezandmarsal.com/thought-leadership/uscit-upholds-ieepa-suspension-of-de-minimis-treatment-in-axle-of-dearborn)).
- **Carrier fees.** DDP and brokerage fees are reportedly about $15 per parcel ([Swap](https://www.swap-commerce.com/faq/duties-tariffs-customs/ddp-vs-dap-incoterms/what-fees-do-carriers-charge-for-ddp-brokerage-ddp-fee)). UPS and FedEx have added inbound processing fees ([Value Added Resource](https://www.valueaddedresource.net/ups-fedex-increase-fees-us-imports-end-of-de-minimis/)).
- **Out-of-date quotes in Lahore.** A Lahore brand still tells US buyers the duty is "approximately 29%" and that duties are the recipient's responsibility ([Studio by TCS](https://www.studiobytcs.com/pages/u-s-customers-import-duties-customs-information)).

**Evidence gap:** No critic found a reliable 2026 express rate for a 0.5 kg parcel from Lahore to the US. Every freight figure in the reports comes from low-quality sources.

**Opinion and estimates:**
- SI's estimate puts the contribution of a single $32 tee to the US at about **−$15 to −$26** before acquisition cost.
- A 15-jersey team order sent DDP to the US comes out at about **−$10 to +$25**.
- The team order reaches about 25–30% contribution only if a US importer of record declares customs value at factory price.
- The plan's only mitigation is "10 real quotes before M6". It arrives after the landed-cost engine has been built.

### 2. Payment rails and entity are unresolved. Fatal. (BI, CB, TO, SI, CR)

**Evidence:**
- Stripe doesn't onboard Pakistan-registered merchants, and PayPal isn't directly usable ([WorldFirst](https://www.worldfirst.com/sasia/?p=52075), [Payoneer](https://www.payoneer.com/resources/business/guide-to-payment-gateways-in-pakistan/)).
- 2Checkout adds a 3% cross-border fee for Pakistan ([Verifone docs](https://verifone.cloud/docs/2checkout/Documentation/01Product-catalog/05Pricing_and_charge_scenarios/Cross-border_fee_charges)).
- US accounts-payable teams require a W-8BEN-E from foreign vendors ([KU procurement](https://procurement.ku.edu/vendor-irs-form-matrix)).
- USA Teamwear already solves this. It is a US LLC selling kit made in Sialkot, and it handles customs, duties and free US shipping, with PayPal accepted ([USA Teamwear](https://usateamwear.com/customization-sublimated-cricket-kits-usa-identity/)).

**Opinion:**
- No PayPal at an unknown overseas store is a reason to leave before designing anything (BI).
- A destination-market entity solves conversion, accounts-payable onboarding and duty valuation at the same time (CB, SI, CR).
- The plan lists it as an open question, which means the biggest commercial lever has not been pulled.

### 3. No dated delivery promise and no capacity model. Severe. (BI, TO, CB, PM, CR)

**Evidence:** Every named competitor publishes a number.

| Competitor | Published turnaround |
| --- | --- |
| Custom Ink | Free 2-week standard, 1-week rush at +15%, 3-day rush at +30%, refund if late ([delivery options](https://www.customink.com/help_center/delivery-options)) |
| owayo | Ships in 7–15 days ([owayo](https://www.owayo.com/custom-volleyball-jerseys.htm)) |
| Spized | Delivers in 12 working days ([Spized](https://www.spized.com/en/custom-table-tennis-jersey)) |
| Wooter | 20–25 business days, or a 10-day rush at +25% ([Wooter](https://wooter.com/articles/how-long-custom-uniforms-take-to-make/)) |
| USA Teamwear | 7–10 days production ([USA Teamwear](https://usateamwear.com/)) |

DHL quotes 3–5 business days of transit alone from Pakistan to the US ([DHL](https://www.dhl.com/discover/en-pk/logistics-advice/import-export-advice/pakistan-export-guide--ship-internationally-with-dhl-express)).

**Opinion:**
- The plan claims that "buyers forgive slow delivery far more readily than wrong colors". That holds for neither gift buyers nor teams with a first match (BI, TO).
- The plan never asks for a need-by date.
- PM adds that group orders arrive in clusters around season starts. Without a capacity calendar per work centre, every "firm date" slips at once.

### 4. Remakes deferred, with no SLA and no lane. Severe. (TO, BI, PM, CB)

**Evidence:**
- The plan contradicts itself. Its gaps table lists the claim flow as "Soon after launch", while M4's scope includes claims.
- Wooter advertises free redos for production errors and misspelled names, plus a sizing guarantee ([Wooter](https://wooter.com/articles/?p=17397)).
- Zazzle covers size and fit for 30 days ([Zazzle](https://www.zazzle.com.au/hc/article/how_to_return_an_item-220294868)).
- Every US replacement parcel is another entry that pays duty (source in #1).

**Opinion:**
- A remake is the most expensive single piece the factory makes. Without a priority lane it either waits for a batch or interrupts a bulk run (PM).
- TO's deal-breaker is the lack of a written promise that a confirmed remake is back in hand within 7 days, DDP, at no cost.

### 5. Color and method drift across reorders and late joiners. Severe. (CB, TO, PM, CR)

**Evidence:**
- Sublimation color depends on the fabric lot, paper, ink, press temperature and humidity. Generic ICC profiles don't hold ([Mutoh](https://support.mutoh.eu/support/solutions/articles/14000160513-dye-sublimation-generic-icc-profiles-), [Clemson thesis](https://open.clemson.edu/all_theses/4414)).
- Buyers write batch tolerances of about ΔE ≤1–2 into their specs ([Racklify](https://racklify.com/encyclopedia/what-is-color-shade-check-standards-measurements-and-acceptance/)). These are trade sources, so treat the figure as indicative.
- Competitors lock reorders. Spized matches the last order's price, and owayo takes "reorder anytime, in any amount" ([Spized](https://www.spized.com/en/custom-table-tennis-jersey), [owayo](https://www.owayo.com/custom-volleyball-jerseys.htm)).

**Opinion:**
- Routing by quantity sends player 26, or a company's 8 new-hire polos, to DTF or DTG. The original order was sublimated or embroidered, so the color and hand-feel no longer match (TO, CB, PM).
- Silent HEX snapping breaks brand guidelines (CB).
- "Test prints match the palette" is a one-time test, not a control system (PM).
- The swatch card ships with the first order, which is after the buyer has paid for bulk (CB, PM).

### 6. No visible differentiation and a trust deficit. Severe. (SI, CR, BI, CB)

**Evidence:**
- **The "two camps" framing is wrong.** These competitors already combine a 3D editor, no minimums and their own or EU production:
  - owayo: 3D editor, own factory in Germany, 1 to 10,000 pieces.
  - Spized: 3D editor, EU production, from one piece.
  - Sublimation Kings: 3D builders, no minimums ([CR corrections #1](competitor-researcher.md)).
- **A 3D configurator is cheap to rent.** Zakeke costs $59–$300 a month and Kickflip $59 a month, both with print-ready files ([Zakeke](https://admin.zakeke.com/en-US/pricing), [Kickflip](https://gokickflip.com/pricing)).
- **Sialkot factories already sell direct.** IK Apparel and MTH Sports sell to US and UK teams at 10–20 pieces ([IK Apparel](https://ikapparel.com/custom-team-jerseys-manufacturer.php), [MTH Sports](https://mthsports.com/soccer-sublimation-jersey)).
- **Shoppers punish hidden origin.** Texas Jackets reviews include "Based out of Pakistan not Texas" ([Trustpilot](https://nl-be.trustpilot.com/review/texasjackets.com)).

**Opinion:**
- "Design to cutting table without manual file prep" is an internal cost advantage that customers never see (SI).
- The 3D editor creates friction for gift buyers on a phone (BI), and is worth little to a corporate buyer who brings a finished logo (CB).
- CR sees one real opening: Pakistani rivals are quote-led and sell B2B over WhatsApp, so self-serve online ordering from Pakistan is genuinely open.

### 7. Five segments with no focus and no seller. Severe. (SI, CB, BI)

**Evidence:**
- Apparel CAC benchmarks run from about $66 to $129 ([LoyaltyLion](https://loyaltylion.com/blog/blog-average-cac-ecommerce)).
- One 2026 figure puts the average Google Ads CPC at $5.26 ([WordStream](https://www.wordstream.com/blog/google-ads-cost)).
- Custom Ink's AOV is estimated at about $375–$400 ([Grips estimate](https://d8q56x4xdbci2.cloudfront.net/insights/retailers/customink.com)), so even the category leader lives on group orders.

**Opinion and estimates:**
- SI's estimate is about $220–$420 of paid-search cost per order for an unknown store.
- CB says companies should not be targeted in year one: they need certifications, net terms, SSO and a stock program.
- BI says individuals need a different entry point (fill-in templates, AI, a free size remake), and those features compete for the same 7 people.

### 8. Built first, validated late. Moderate–Severe. (SI, PM, BI)

**Evidence:** The plan's own timeline puts the pilot in weeks 17–20 and the DDP quote test before M6. M1 to M4 overlap from week 9 to week 13.

**Opinion:**
- The plan itself says its risks are "commercial and legal, not technical", yet 16 weeks go to building before any paid customer arrives (SI).
- A pilot in weeks 17–20 won't include a peak season (PM).
- The DDP test belongs in M2 at the latest (BI), or before any code is written (SI).

### 9. The team is understated. Moderate. (PM, BI, SI)

**Evidence:** Punjab's minimum wage is Rs40,000 a month ([ProPakistani](https://propakistani.pk/2025/09/10/punjab-increases-minimum-wage-to-rs-40000/)).

**Opinion and estimates:**
- PM estimates the floor needs 30–45 people for one shift running all four methods. The plan counts about 8, all builders.
- The one graphic designer is assigned four jobs: the template library, the design-for-me queue, artwork review on every order, and IP and logo review (PM, BI).
- Nobody owns sales, support or community until M6 (SI).

### 10. Deposit-then-balance fits neither player-pay nor net 30. Moderate. (TO, CB)

**Evidence:**
- SquadLocker, Wooter and Custom Ink all take each player's payment at checkout, so the coach never collects money ([Wooter team store](https://wooter.com/articles/what-is-a-team-store-one-link-individual-payments-direct-shipping/), [Custom Ink](https://www.customink.com/how-it-works)).
- Custom Ink accepts a PO with payment due in 30 days ([Custom Ink PO](https://www.CustomInk.com/help_center/using-purchase-order)).

**Opinion:**
- With 30 parents, deposit-then-balance means 60 payment events and a volunteer chasing the second half (TO).
- Paying 100% before dispatch on recurring corporate reorders won't pass a company's approval process (CB).
- SI would keep deposit-then-balance, but only for single-payer bulk orders. The three critics agree on that.

### 11. Group orders are close-dated only. Moderate. (TO, CR)

**Evidence:**
- SquadLocker stores "never close", have no minimums, and offer 5/10/15% fundraising ([SquadLocker](https://squadlocker.com/solutions/teams)).
- Wooter recommends keeping the store open for new players ([Wooter](https://wooter.com/articles/what-is-a-team-store-one-link-individual-payments-direct-shipping/)).

**Opinion:**
- Every season brings three or four late joiners, so they are not an edge case.
- The M3 exit criterion never tests adding a player after the order closes.

### 12. Charging for what competitors give away. Moderate. (CR, BI)

**Evidence:**
- Wooter's sizing kit is fully refundable, not a paid product ([Wooter](https://wooter.com/products/sizing-kits-soccer-jersey-crew-neck-soccer)).
- Omni Cheer's fit kits are refundable and include a free swatch ([Omni Cheer FAQ](https://omnicheer.com/help/sublimation-faq)).
- USA Teamwear says 20 designers work for its customers "free of charge" ([USA Teamwear](https://usateamwear.com/)).

**Opinion:**
- In teamwear, free design help is the norm (CR).
- Photo upscaling should be free on single orders (BI).

### Where the critics disagree

| Topic | Position A | Position B | Who decides |
| --- | --- | --- | --- |
| Per-piece QC | SI: cut it back to a roster checklist. | PM wants more: panel and transfer IDs, plus 100% image-vs-proof checks on personalized pieces. TO calls per-piece QC one of the plan's best features. | 2 of 3 critics favor keeping it. Founders decide the scope. |
| Singles | SI: cut export singles and the DTF gang-sheet build. | BI: make singles work with a free size remake and an arrive-by date. PM: if you keep singles, give them a separate cell on the floor. | Depends on the segment chosen (open question 1). |
| Roll nesting | SI: use the factory's existing RIP. | PM lists detailed nesting requirements for M4. | No direct conflict: PM's list can be met by an off-the-shelf RIP. |

### Evidence quality caveats

These caveats matter for the rule in CLAUDE.md that every factual claim needs a source.

- **The plan's own customer evidence is weak.** CR could not reproduce 4 of the 6 Trustpilot anecdotes in plan.md's Purchaser POV table at the cited URLs: Sublimation Kings, Fansidea, Jersey Loco and KXKshop. Sublimation Kings and Fansidea both score 4.5 on Trustpilot.
- **One of those anecdotes is contested.** TO says it re-verified the Jersey Teams World "missing number" review via search, but CR found only "player name wrong!" on that page.
- **Several plan citations don't support their claims.** See CR corrections #4–#9 and #14:
  - The Printify row's source doesn't mention AI.
  - The SquadLocker link is dead (404).
  - The Champro builder described in the source belongs to FSG America.
  - Wooter's sizing kit is refundable, not paid.
  - Custom Made Better sells acrylic, not apparel.
- **Secondary tariff sources conflict.** CB found conflicting secondary sources on the 2026 Pakistan rates. BI, SI and CR converge on the KPMG, Dorsey, Polsinelli and UHY account used in #1.
- **SI's UK proposal is not yet verified.** It relies on Pakistan holding the UK DCTS "Enhanced Preferences" tier, which gives zero duty on clothing. SI found no 2026 confirmation. Verify on gov.uk before acting.

---

## (b) The single most dangerous assumption

> **That landed cost can be solved with a checkout feature.** The plan assumes a buyer anywhere will pay a competitive all-in price for custom apparel sent parcel by parcel from Lahore. So it treats DDP as a feature to build in M2 and test before M6. In fact, landed cost is the decision that determines which segment, market and legal entity the business can survive in.

Five of six critics reach this independently, from different directions:

- **BI:** the total price at checkout.
- **SI:** contribution margin.
- **CB:** reorder price stability.
- **TO:** duty billed at the door on bulk orders.
- **CR:** USA Teamwear has already solved it with a US entity.

The evidence in objection #1 shows US duty plus Section 301 runs to roughly 26–42% on top of freight and roughly $15 a parcel in carrier fees. SI's estimates put contribution before acquisition cost at negative for US singles and near zero for US team orders.

Everything downstream rests on this assumption: single-piece routing, DTF gang sheets, ship-to-each-player and the five-segment scope. If it is wrong, most of M2–M4 is built for orders that lose money.

The plan contradicts itself here. It says "our biggest risks are commercial and legal, not technical", then schedules the commercial test last.

**How to test it cheaply (opinion: SI and BI):**

1. Before writing code, price 10 real orders end to end: a carrier account quote, a customs broker's HTS classification and a gateway fee schedule.
2. Run the 10 orders across two or three market and entity options: US direct DDP, US importer of record, and UK.
3. Set a go/no-go contribution threshold before you see the numbers.

---

## (c) Concrete changes to plan.md, by milestone

Each change lists the critics behind it. Changes marked **[if segment X]** depend on open question 1.

### Plan text (fix before circulating plan.md further)
- **Rewrite the competitive landscape.** Drop the "two camps" framing. Add owayo, Spized, Sublimation Kings (as a competitor, not just a bad review), USA Teamwear, Zakeke/Kickflip, Bonfire, and UK kit builders if the UK is chosen. (CR)
- **Fix or remove broken citations:** the Printful, Printify, SquadLocker, Champro/Cliff Keen, Wooter "paid kits" and Custom Made Better rows. Archive Trustpilot quotes with the date seen, and drop the 4 that can't be reproduced. (CR)
- **Remove or qualify "buyers forgive slow delivery".** It is contradicted for gift buyers and teams. (BI, TO)
- **Update the de minimis row.** The CIT upheld the suspension on 13 Aug 2026, the statutory end is 1 July 2027, and the tariff stack is now MFN + Section 301 at 10%. (CR, BI, SI)
- **Fix the contradiction** between "Soon after launch" and M4 for claims and remakes, and between "Soon after launch" and M5 for company accounts. (TO, BI, CB)

### M0 Foundations and assets
- **Make three open questions M0 exit criteria:** the first market, the first segment and the destination-market entity. (SI, BI, CB, CR)
- **Replace "gateway approved" with a stronger exit criterion:** a written gateway contract covering fees, reserves and payout holds, with split deposit and balance supported, and tested with real US/UK cards. Settle PayPal availability. (SI, TO, BI)
- **Move the "10 real DDP quotes" test from pre-M6 into M0**, with a contribution go/no-go threshold. Store the tariff stack as data you can update in a day. (BI, SI)
- **Add a 13-week cash-flow model for a busy season.** (SI)
- **Decide the method-by-product matrix.** A sublimated jersey is sublimation-only at any quantity. Exclude DTG on polyester. DTF on polyester needs blocker powder or blocker transfers. (PM)
- **Run a shrinkage test per fabric**, warp and weft, at the production recipe. Build size charts from finished, pressed and sewn garments, with a tolerance for each point of measure. (PM)
- **Build a palette per method** (sublimation, DTF, screen ink, thread) and accept Pantone and thread codes. Version the ICC profiles and archive press recipes. (PM, CB)
- **Write a capacity sheet per work centre.** Sign an overflow partner for each method. Put UPS or generator backup on the calender and printers. (PM)
- **Restate the team.** Count the floor crew (PM estimates 30–45), add a sales or community owner from week 1, and split the designer's four jobs. (PM, SI, BI)
- **[if companies or brands]** Start a compliance workstream: WRAP or BSCI audit, OEKO-TEX Standard 100, product liability insurance, and a fiber-origin file. (CB)
- **Consider a concierge pilot in weeks 1–8:** real paid orders, a 2D mockup, proofs from the designer, invoice and pay links, and manual factory files. Use it to decide what to automate. (SI)

### M1 Design engine MVP
- **Decide whether to build or license the editor.** Compare a custom 3D editor with Zakeke or Kickflip, or a 2D configurator, and record why. (SI, CR, BI)
- **Replace silent HEX snapping** with snap-and-warn. If a color can't be matched within ΔE X, the buyer gets an "approve a physical strike-off" gate. (CB, PM)
- **Add a one-page roster proof** showing every name, number, size and garment measurement as it will print. The organizer signs it, edits lock at signature, and later changes become paid change orders. (TO)
- **Add roster render checks:** maximum characters at the chosen font size, plus previews of accents, apostrophes and non-Latin script. (TO)
- **[if individuals]** Make fill-in-field templates the default entry. Set a target number of templates per occasion. Strengthen the exit criterion to "median landing-to-cart under 5 minutes". Make photo upscaling free. (BI)

### M2 Commerce and proofs
- **Publish a turnaround table** by product, method and quantity, counted to delivery at the destination. Add an arrive-by date at checkout, paid rush tiers, and a dated guarantee with a remedy. (BI, TO, CB, CR, PM)
- **Widen the routing inputs.** Route on product and fabric compatibility, work-centre load and sewing changeover cost, not quantity alone. Reorders and brand accounts pin the original method. (PM, TO, CB)
- **Split the payment models:**
  - Player-pay group orders take full payment per player at checkout.
  - Deposit-then-balance applies only to single-payer bulk orders.
  - [if companies] Vetted accounts get net 30 after their first order. (TO, CB, SI)
- **Give DDP quotes a validity window and a tariff-change clause.** Guarantee in writing that the buyer never pays a courier bill. (BI, CB, SI)
- **Set an artwork-review SLA**, for example 4 business hours for singles. Skip review for template-only designs with no uploads. (BI)
- **Ship swatches or a strike-off before the bulk deposit**, not with the first order. (CB, PM)
- **Decide on paid or free extras:** "design it for me", refundable fit kits, free swatches. (CR, BI)
- **Decide export minimums.** Either set a minimum order for export or price single sublimated jerseys on their real cost: roll space plus cut-and-sew plus handling. (SI, PM)

### M3 Group orders
- **Require a "need-in-hand date"** when a group is created. Back-schedule the close and proof dates from it, and warn when the date can't be met. (TO)
- **Add a paid / unpaid / no-size board.** At close the organizer chooses "drop" or "I'll pay" for each unpaid seat. Write the refund rule for cancelled or under-minimum groups. (TO)
- **Add an always-open link or "add-a-player" option.** The new piece inherits the original method, lot, profile and pattern version, and the number is checked against numbers already produced. (TO, CR, PM)
- **Move reorders from M5 into M3.** (TO, CB, CR)
- **Default team shipping to bulk DDP** to one address, with each jersey bagged and labelled by player. (TO)
- **Add an exit test:** "a player added 3 weeks after close gets a matching jersey." (TO)

### M4 Production link
- **Make claims and remakes a Must for launch.** Publish an SLA (for example, decision in 24 hours and remake in 48 hours), run a priority remake lane that reuses the original files and lot, and assign reason codes tied to station, operator and lot. (TO, BI, PM, CB)
- **Record lot and recipe traceability per piece**, and add a control-strip ΔE gate before cutting. (PM, CB)
- **Print IDs on every panel and every DTF transfer.** Check 100% of personalized pieces with an image compared against the proof. Take a pack-station photo. (PM, TO)
- **Add the missing geometry rules:**
  - shrink compensation per fabric and recipe
  - per-size art anchoring
  - bleed for about 2 inches of image shift
  - DXF cut files with fiducial marks
  - an embroidery digitizing step (PM)
- **Fix the job-packet format:** a JSON manifest plus a printable barcode traveller, an offline mode, and exception events (machine down, fabric short, color fail). (PM)
- **Build a capacity calendar** that returns promise dates to checkout, and a separate singles cell. (PM)
- **Send proofs and status updates over WhatsApp and SMS** as well as the web page. (CR)
- **Strengthen the exit criterion** to a full mixed shift run by the floor crew: singles, roster team orders, a rerun and a remake, with size tolerance and ΔE measured. (PM)

### M5 Pilot with real customers
- **Focus the pilot on one segment** instead of "each segment", and start it earlier if possible. (SI)
- **Track go/no-go metrics** (SI, TO):
  - contribution margin of at least 35% across 30 paid orders, measured from real invoices and carrier bills
  - CAC at or below 25% of first-order value
  - remakes at or below 2% of pieces, and on-time delivery of at least 95%
  - days from claim to replacement in hand
  - share of pilot customers who reorder next season
- **Add a peak-season load test.** (PM)
- **Remove AI assist and company accounts from M5** unless their segment is chosen. If company accounts stay, start from the Medusa B2B starter ([github](https://github.com/medusajs/b2b-starter)). (SI, CB, BI)
- **Collect photo reviews**, so the store doesn't launch with zero. (BI)

### M6 Public launch
- **Build trust openly:** say "made in our own Lahore factory" with photos and staff, show a delivered-price example on the homepage, and publish a support response SLA. (BI, SI)
- **Keep company accounts and storefronts in year two.** Fundraising stays in M6 unless events or schools are chosen, in which case it moves to M3. (CB, SI, CR)

---

## (d) Open questions only the founders can answer

1. **Which single segment goes first, and will you formally drop the others at launch?** SI recommends grassroots teams and clubs. CB says not companies in year one. BI says individuals need a different product.
2. **Which market goes first?** SI proposes the UK, on the grounds of zero duty under DCTS, which still needs verifying. The US needs an entity to work.
3. **Will you set up a destination-market entity (US LLC or UK Ltd), and what is the budget and timeline?** This decides PayPal, accounts-payable onboarding, duty valuation and trust.
4. **Do you sell export single pieces at all?** If yes, at what minimum contribution, and will you absorb a free size remake?
5. **What is the go/no-go?** Set the contribution margin, CAC ceiling and runway at which you stop or pivot, and decide before the M0 quotes come back.
6. **Does the factory floor already exist and run these methods today?** How many people work there, and which methods go to partners? The plan's headcount depends on the answer.
7. **Is the custom 3D editor a strategic bet you won't cut**, or a means to an end you'd license or replace with 2D?
8. **What guarantees will you put in writing and pay for?** For example a dated delivery promise, a 7-day remake, free size remakes, and never a courier bill.
9. **Will design help, fit kits and swatches be free or refundable**, to match teamwear norms, or paid?
10. **What turnaround number will you publish**, counted to delivery, for your first market?
11. **[if companies or brands]** Will you pay for WRAP or BSCI and OEKO-TEX certification, and will you ever extend net terms?
12. **What deposit percentage applies, and to which order types?**
