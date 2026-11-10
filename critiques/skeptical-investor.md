## Top 5 reasons this fails (ranked)

### 1. Small US orders lose money on every order, even before you pay to acquire the customer
**Risk:** The plan calls single pieces "a core channel" and treats DDP as a checkout feature. A $30 T-shirt sent by air from Lahore to the US carries express freight, US duty plus the new Section 301 surcharge, a DDP or brokerage fee, payment fees for a high-risk country, and remakes that go back out by air. On 15-piece polyester team orders sent DDP to the consumer, margin is about zero.

**Evidence:**
- **The price you have to match.** Custom Ink sells one shirt for about $31–$38, with free shipping, artwork review included and delivery in about two weeks ([Custom Ink no-minimum tees](https://www.customink.com/products/t-shirts/no-minimum-t-shirts/198)). Printful's base cost for a Bella+Canvas 3001 is about $11.50–$12.95 ([ecommerceceo](https://ecommerceceo.com/printful-pricing/)). Sublimated jerseys sell at about $35–$38 each with no setup fee ([Inline Warehouse](https://www.inlinewarehouse.com/IW_Custom_Sublimated/descpage-IWICEJ.html)).
- **US duty.** General rates are 16.5% for cotton T-shirts ([ustariffrates 6109.10](https://ustariffrates.com/hts/6109.10.00)) and about 32% for man-made-fibre knit tops ([HTSHub 6109.90.10](https://www.htshub.com/us-hs/detail/61099010), [HTSHub 6110.30.30](https://www.htshub.com/us-hs/detail/61103030)). A Section 301 tariff of 10% on Pakistan took effect on 24 July 2026 and is stacked on top of the base rate ([Dorsey](https://www.dorsey.com/newsresources/publications/client-alerts/2026/7/announced-section-301-tariffs), [Polsinelli](https://www.polsinelli.com/publications/administration-imposes-forced-labor-section-301-tariffs-section-122-surcharge-expires)).
- **Carrier fees on small imports.** Carriers reportedly charge about $15 per DDP shipment ([Swap](https://www.swap-commerce.com/faq/duties-tariffs-customs/ddp-vs-dap-incoterms/what-fees-do-carriers-charge-for-ddp-brokerage-ddp-fee)). Entry and advancement fees can add $15–$40 or more ([ThePricer](https://www.thepricer.org/the-new-cost-of-small-parcels-after-de-minimis/)).
- **Payment fees.** On 2Checkout, Pakistan pays a 3% cross-border fee instead of the usual 2% ([Verifone docs](https://verifone.cloud/docs/2checkout/Documentation/01Product-catalog/05Pricing_and_charge_scenarios/Cross-border_fee_charges)). That sits on top of a base rate of about 3.5% + $0.35 ([transferfees.io](https://transferfees.io/2checkout-fee-calculator/)). Chargebacks cost $20–$45 each ([Merchant Maverick](https://www.merchantmaverick.com/reviews/2checkout-review/)).
- **Misprints.** The norm is 1–3% of pieces ([Screenprinting Mag](https://screenprintingmag.com/?p=3683), [Fulfill Engine](https://help.fulfillengine.com/en/policies/fulfill-engine-screen-print-policy)). The plan's own Trustpilot examples show that wrong sizes push the real remake rate higher.
- **Air freight.** The only figure I could find is from a low-quality source: about $18–$45 per kg for parcels under 2 kg ([risingsunartscentre](https://new.risingsunartscentre.org/news/shipping-from-pakistan-to-usa-cost-breakdown-and-pricing-2026.html)). Get a real DHL or UPS account quote.

**Estimate (my numbers, not sourced):**

| | Single cotton tee to US, priced $32 | 15 sublimated jerseys to US at $38 ($570), one box, DDP to buyer |
|---|---|---|
| Production | ~$5 | ~$150 (Sialkot FOB listings are [$9–$14 per kit](https://www.tradewheel.com/p/custom-sublimated-soccer-kit-jersey-3021710/)) |
| Air express | ~$15–25 | ~$70–120 |
| Duty, assuming customs value ≈ sale price | 26.5% ≈ $8.50 | 42% ≈ $240 |
| DDP / entry fee | ~$15 | ~$15–40 |
| Payment fees, ~6.5% + $0.35 | ~$2.40 | ~$37 |
| Remakes, ~3% plus re-shipping | ~$1–2 | ~$25 |
| **Contribution before CAC** | **about −$15 to −$26** | **about −$10 to +$25** |

The team order only reaches about 25–30% contribution if a US importer-of-record entity pays duty on the factory price (for example 15 × $12 → about $76 duty). That entity is still an "open decision" in the plan.

**Opinion:**
- The plan's fix for US landed cost ("test DDP pricing on 10 real quotes before the M6 launch") comes after the whole landed-cost engine has been built. It should be the first test.
- Single pieces to the US are a loss leader with no business to lead into.

**What would de-risk it:**
- Before writing code, price 10 real orders all-in: carrier account quotes, a customs broker's classification and a gateway contract.
- Set a minimum order quantity for export (for example 10 or more) and stop selling export singles.
- Either form a US entity for bulk import and domestic fulfilment, or start in a market where duty is zero (see segment and market section).

### 2. Five segments with no channel and no marketer means acquisition cost swamps order value
**Risk:**
- Each segment is a different business. Each has a different buyer (parent, coach, HR or procurement, event organiser, brand founder), a different channel, a different sales cycle and different features.
- The plan builds features for all five (AI assist, company accounts and purchase orders, design-for-me, group orders, brand reorders) but leaves "who do we market to" open.
- The 7-person team has no growth, sales or support hire. Marketing appears only in M6 as "marketing site, SEO pages".

**Evidence:**
- Fashion and apparel CAC benchmarks run from about $66 ([LoyaltyLion](https://loyaltylion.com/blog/blog-average-cac-ecommerce)) to $129 ([bestcolorfulsocks](https://bestcolorfulsocks.com/blogs/news/fashion-customer-acquisition-cost-statistics)), and sources report it rising 40–60% since 2023.
- One reported 2026 figure puts the average Google Ads CPC at about $5.26 ([WordStream/LocaliQ](https://www.wordstream.com/blog/google-ads-cost)).
- Custom Ink's conversion rate is estimated at 1.0–1.5%, with AOV around $375–$400 ([Grips estimate](https://d8q56x4xdbci2.cloudfront.net/insights/retailers/customink.com)). So even the category leader lives on group-sized orders, not singles.
- Fashion's first-order payback is weaker than other categories ([Decile](https://decile.com/?p=26959)).

**Estimate:** $5.26 CPC ÷ 1.25% conversion ≈ $420 paid-search cost per order for a store nobody knows. Even at the fashion-category CPC of about $2.72, it is about $220. Neither number works against a $32 single or a near-zero-margin team order.

**Opinion:**
- With five segments, each one gets about a fifth of the attention while you pay five learning curves.
- Pilot "with invited customers from each segment" (M5) gives sample sizes too small to read anything.
- Individuals are the most expensive buyers to acquire and the least profitable to serve from Pakistan. They should not be a launch segment.

**What would de-risk it:**
- Pick one segment now.
- Hire or assign one person whose only job is selling, starting in week 1, not week 21.
- Prove a channel that costs little per club, such as league and association partnerships, diaspora sports clubs or direct outreach to coaches. Show that CAC stays at or below 25% of first-order value on 30 paid customers.

### 3. Nothing a customer can see makes them pick an unknown Pakistan-based brand
**Risk:**
- The stated win, "taking any design from customer to cutting table without manual file prep", is an internal cost advantage. Customers judge price, speed, trust and reviews.
- Established players already offer no minimums, artwork review, fast US delivery and free shipping.
- Dozens of Sialkot factories already sell directly to US and UK teams at low MOQs, so "own factory in Pakistan" is not a moat.

**Evidence:**
- **Established players.** SquadLocker says its sublimated uniforms ship in 3–5 days ([SquadLocker](https://www.squadlocker.com/squadlocker-uniforms), [Fibre2Fashion](https://fibre2fashion.com/news/apparel-news/us-squadlocker-launches-on-demand-sublimated-uniforms-line-286035-newsdetails.htm?amp=true)). Custom Ink ships jerseys free in about two weeks and offers 1-week and 3-day rush ([Custom Ink blog](https://www.customink.com/blog/how-much-do-custom-jerseys-cost/)). Wooter has no minimums: $67.49 for one jersey, $16.99 at 1000+ ([Wooter](https://wooter.com/products/sleeved-crew-neck-basketball-jerseys-basketball)).
- **Sialkot factories already selling direct.** IK Apparel advertises 10–20 pieces per design ([IK Apparel](https://ikapparel.com/custom-team-jerseys-manufacturer.php)). MTH Sports starts at 15 pieces ([MTH Sports](https://mthsports.com/soccer-sublimation-jersey)). USA Teamwear sells Sialkot-made kit directly to US customers and cuts out the 50–100% dealer markup ([USA Teamwear](https://usateamwear.com/sialkot-masterclass-global-teamwear-hero/)).
- **Buyer distrust.** The plan's own evidence shows buyers associate overseas jersey sellers with wrong sizes and colours (its Fansidea, Jersey Loco and Jersey Teams World citations).

**Opinion:**
- A 3D editor is not a differentiator. JerseyEngine and Hapticmedia already sell one, and Custom Ink converts at scale with a 2D design lab.
- An unknown overseas seller with zero reviews, asking for a deposit before goods ship, starts at a trust deficit that features don't fix.
- Only three things fix it: reviews, guarantees and a local face.

**What would de-risk it:**
- Name one claim a buyer can check that beats the competitor set. Example: "kit for 15 at €X delivered in 10 days from proof, free remake if any size is wrong."
- Back the claim with a guarantee and early reviews from a seeded pilot.
- Test the claim with ads or landing pages before building the editor.

### 4. US tariffs keep changing and Pakistan payments add cost, but the plan treats both as engineering tasks
**Risk:**
- The DDP engine is priced against tariff rates that have changed four times in 15 months.
- The payment gateway, which the deposit-then-balance flow depends on, is still not chosen.
- Every rate change or held payout hits cash flow directly.

**Evidence:**
- **Tariff history.** Pakistan's US reciprocal rate was set at 19% from August 2025 ([Dawn](https://www.dawn.com/news/1928371/pakistan-loses-ground-to-rivals-with-new-19pc-us-tariff)). It was replaced by a 10% Section 122 surcharge in February 2026 ([UHY](https://uhy-us.com/insights/news/2026/february/voided-tariffs-replaced-with-section-122-tariffs-rates-broadly-applied-at-10)). That surcharge expired on 24 July 2026 ([Strix](https://strixsmart.com/section-122-surcharge)). A 10% Section 301 tariff replaced it the same day ([Thompson Coburn](https://www.thompsoncoburn.com/insights/83-july-27-2026-administration-implements-section-301-tariffs-on-60-economies/)).
- **Gateways.** Stripe isn't officially available in Pakistan ([Payoneer](https://www.payoneer.com/resources/business/guide-to-payment-gateways-in-pakistan/)). 2Checkout treats Pakistan as high-risk, with a 3% cross-border fee ([Verifone docs](https://verifone.cloud/docs/2checkout/Documentation/01Product-catalog/05Pricing_and_charge_scenarios/Cross-border_fee_charges)).
- **The plan's own text.** De minimis is suspended, and gateway approval is listed as top risk #4.

**Opinion:**
- Gateways for high-risk merchants often impose payout holds or rolling reserves (not verified for this merchant). Combined with paying for fabric before the balance arrives, that squeezes working capital hardest in the busiest season.
- The plan has no cash-flow model at all.

**What would de-risk it:**
- Get gateway approval in writing, with fees, reserve terms and support for split (deposit and balance) payments, before M1.
- Model a 13-week cash flow for a busy season.
- Price US quotes with a tariff buffer and an explicit "duties may change" clause, or avoid the US until a US entity exists.

### 5. The 24-week, 7-person plan is mostly build and validates too late
**Risk:**
- Real customers arrive in week 17. By then about 4 months of a 7-person payroll has gone into a 3D editor, Medusa customisation, group orders, multi-method routing, a DDP engine, roll nesting, DTF gang sheets, per-piece QC scanning, AI assist, company accounts and analytics.
- Milestones overlap so much (M1 to M4 run in parallel from week 9 to week 13) that any slip in M0 assets moves everything.
- Nobody on the team owns sales, customer support or production until M4.

**Evidence:**
- The plan's own timeline and team list: M5 pilot in weeks 17–20, production coordinator only from M4, no sales or marketing role.
- JerseyEngine already sells a 3D/AR editor with roster and nesting ([JerseyEngine](https://jerseyengine.com/app)). Hapticmedia sells 3D configurators ([Hapticmedia](https://hapticmedia.com/use-cases/jersey-design-maker/)).

**Opinion:**
- This is a build-first plan for a business whose risks are, in its own words, "commercial and legal, not technical".
- Every Must-for-launch row is sized for all segments and all methods at once.
- The likely result is a polished platform at week 24 with no proven channel and unknown unit economics.

**What would de-risk it:**
- Run a concierge pilot in weeks 1–8: real paid orders through a 2D mockup, a designer doing proofs, a simple invoice and pay link, and the factory working from manual files.
- Automate only the steps that measurably slow you down or cause errors.

## What I would cut from the first 24 weeks
- **The individuals segment and single-piece export orders.** Also cut the DTF/DTG gang-sheet batching built for them (M4) and the instant-price checkout for singles (M2).
- **The custom 3D editor (M1).** Launch with a 2D template configurator and a rendered proof from the graphic designer, or license an existing configurator. Revisit 3D once conversion data shows it matters. (Opinion.)
- **AI design assist (M5).** The designer-run "design it for me" queue already covers this need.
- **Company accounts, purchase orders, brand-locked templates and manager approval (M5).** Also brand-specific features such as own labels and colour consistency across reruns.
- **Jackets, screen print and embroidery routing.** Launch one product family (sublimated jerseys and shorts) with one method. Automatic method routing (M2) goes with it.
- **A multi-destination DDP engine.** Support one market with a fixed landed-cost table maintained by hand.
- **Ship-to-each-player export delivery (M3).** Bulk shipments to the club only.
- **Automated roll nesting.** Use the factory's existing RIP or nesting software. Also cut per-piece QC scanning beyond a simple roster checklist, and the auto-vectorise and upscale pipeline (the designer redraws by hand).
- **Analytics dashboards (M5).** A spreadsheet of orders, margin, remakes and on-time rate is enough at pilot volume.
- **Medusa customisation beyond the basics.** A quote → proof → deposit link → balance link flow can run on invoices plus a gateway's hosted payment page until there are about 100 orders per month. (Opinion.)

Keep:
- the print-tested palette and swatch card
- garment-measurement size charts and the fit kit
- roster validation
- signed proof storage
- deposit and balance payments
- a clear remake policy

Add:
- a salesperson or community builder from week 1
- a cash-flow model
- a written gateway contract

## The one segment and one market I'd start with, and why
**Segment: amateur and grassroots teams and clubs ordering sublimated kits. Market: the UK, starting with football and cricket clubs.**

Evidence:
- Pakistan is in the UK DCTS "Enhanced Preferences" tier, which gives zero duty on textiles and clothing ([Business Recorder](https://www.brecorder.com/news/40248827), [Dawn](https://www.dawn.com/news/1760935)).
- The UK's £135 low-value customs duty relief stays in place until March 2029 at the latest ([Menzies](https://www.menzies.co.uk/uk-to-remove-de-minimis-threshold-by-2029/), [Deloitte](https://taxscape.deloitte.com/measures-autumn-budget-2025/customs-duty-relief-for-low-value-imports.aspx)).
- By contrast, US synthetic-knit duty is about 32% plus the 10% Section 301 tariff (sources in finding #1).
- I found no 2026 confirmation of Pakistan's DCTS tier. Verify it on gov.uk.

Opinion:
- **Margin.** UK VAT is still due, but you can price it in. Removing a 32–42% duty line is the single biggest margin lever available.
- **Order value.** Team orders have the highest value per acquisition among the five segments (an estimated 15–25 pieces, typically £400–£900).
- **Repeat demand.** Kits are bought again every season and spread by word of mouth through leagues.
- **What you already have.** Teams use the strongest assets in the plan: sublimation, roster validation and the fit kit.
- **Fewer channels.** You reach leagues, county associations and the diaspora cricket networks instead of the open consumer internet.
- **Freight.** Bulk shipment to one address keeps it to one parcel per order.
- **Second market.** Add the US only after a US importer-of-record entity exists.

## Three metrics that would convince me it's working
1. **Contribution margin after duty, freight, DDP or brokerage, payment fees and remakes: at least 35%, across 30 consecutive paid team orders.** Measure from real invoices and carrier bills, not from the quote engine.
2. **Blended CAC at or below 25% of first-order value, and first-order contribution greater than CAC, on at least 30 clubs from one repeatable channel.** Exclude friends-and-family and founder-network orders.
3. **Remake rate at or below 2% of pieces with on-time delivery (against the date promised at proof) at or above 95%, followed by next-season reorders from at least 50% of pilot clubs.** This is the trust metric: it shows the product fixes the size, colour and delay failures the plan itself documents.

All dollar and percentage figures marked "estimate" are my own calculations from the cited inputs. Unlabelled claims about strategy are opinion.
