## Corrections to plan.md (claim, what's actually true, URL)

Checked live on 2026-11-10. Custom Ink returns HTTP 403 to direct fetches, so the Custom Ink rows were checked against customink.com pages found through search. Hoopsbasket and the Omni Cheer product page returned HTTP 429, so those two claims could not be checked.

**1. Plan says (Competitive landscape intro and "Where we win"): "Competitors split into two camps, and most sit in only one" and "general print shops don't own a 3D editor."**
- Evidence:
  - Custom Ink, which the plan files as "General", sells sublimated team jerseys. Players' names and numbers go in through the Design Lab's Names & Numbers tool, and many sublimated styles have low minimums: https://www.customink.com/products/sublimated-team-jerseys/1063
  - Rush Order Tees, a general printer, sells sublimated team uniforms with "no minimums". A single personalized hockey jersey or a full kit is accepted: https://cdn.rushordertees.com/team-uniforms/football and https://www.rushordertees.com/team-uniforms/hockey/
  - owayo runs a 3D designer, makes "Made in Germany" products and will make "one or ten thousand": https://www.owayo.com/custom-volleyball-jerseys.htm
  - Spized runs a 3D configurator, produces in the EU and makes "starting from just one piece": https://www.spized.com/en/custom-table-tennis-jersey
  - Sublimation Kings has "Interactive 3D design builders" and "No minimums. Ever.": https://sublimationkings.com/faq
- Opinion: The "two camps" framing is wrong. Several competitors already offer a 3D editor, no minimums and their own or EU production. The plan's differentiator ("design to cutting table, 1 to 1,000") is not unique.

**2. JerseyEngine row (features, "they stop at the file").**
- Evidence: The 3D/AR preview, roster, roll-width nesting, SVG/PDF/PNG export and WooCommerce embed are all confirmed. Shopify integration "is in development". No fulfillment service is described. The pricing page shows no plans. https://jerseyengine.com/app and https://jerseyengine.com/pricing
- Evidence: The closest 3D-configurator rival does go past the file. Hapticmedia's Puma configurator "streamlines the entire workflow from online design to digital printing and production": https://hapticmedia.com/use-cases/jersey-design-maker/
- Opinion: Using JerseyEngine as the benchmark is too easy. Stopping at the file is a SaaS choice, not a gap in the market.

**3. Hapticmedia row.**
- Evidence: Mostly accurate. "Configure the base design once, then our system automatically generates all team uniforms". The page names Puma teamwear, not "Puma Teams". No pricing is published and Hapticmedia takes no commission. https://hapticmedia.com/use-cases/jersey-design-maker/

**4. Printful row (cites project-aeon.com).**
- Evidence: The cited source is published by Project Aeon, which ranks its own AI generator first. Its Printful claims are second-hand: https://project-aeon.com/blogs/ai-shirt-design-generator
- Evidence: Printful's own page confirms an AI upscaler that doubles DPI for files at 38–74 DPI. That page is dated 27 May 2020 (structured data says 2021), so the feature is old, not new: https://www.printful.com/news/printfuls-customer-orders-increase-with-the-new-ai-image-upscaler
- Evidence: Printful also has an AI Image Generator in its Design Maker: https://support.printful.com/hc/en-us/articles/41396543812625 (found via search; the support.printful.com domain did not resolve when fetched)
- Correction: Cite printful.com, not the third-party blog. AI generation is not unique to Printify.

**5. Printify row (cites ecommerce-platforms.com).**
- Evidence: The cited article, updated 2 Apr 2026, says nothing about AI image generation: https://ecommerce-platforms.com/articles/best-print-on-demand-companies?ep_lang=ja
- Evidence: The claim itself is true according to Printify. Its AI Image Generator lives in the Product Creator and makes one 1024×1024 image per prompt, then upscales it: https://help.printify.com/hc/en-us/articles/15493218417809-How-can-I-design-a-product-using-Printify-s-AI-Image-Generator. Printify's blog says it is free, with 15 generations per 24 hours: https://printify.com/blog/ai-image-generator/
- Correction: Replace the citation. The source does not support the claim.

**6. Zazzle/Spreadshirt row (cites printify.com).**
- Evidence: The cited page belongs to Printify, a competitor. It frames Zazzle around "personalized stationery, gifts, and party supplies" and never says "single personalized items". It does confirm Spreadshop as "Spreadshirt's customizable storefront": https://printify.com/blog/sites-like-redbubble
- Correction: The source partly supports the row. The "single personalized items" wording is the plan's own.

**7. Wooter row and bullets.**
- Evidence: The cited article (p=14699) does not mention team stores, and does not say sizing kits are paid. It gives inconsistent minimums (FAQ says 5 per style, listings show 1) and inconsistent turnaround (header "Ready in 2–3 Weeks", FAQ "3–4 weeks after you approve your final design"): https://wooter.com/articles/?p=14699
- Evidence: The sizing kit lists at 125.00 and is "returned for a full refund" if undamaged. So the kit is a refundable deposit, not a paid product: https://wooter.com/products/sizing-kits-soccer-jersey-crew-neck-soccer
- Evidence: Reorders are not among the four headline "Why Teams Use a Team Store" benefits. They appear only in the intro and FAQ (page dated 19 Feb 2026): https://wooter.com/articles/?p=17941
- Correction: "Paid sizing kits" should read "refundable sizing kits". "Main benefit" overstates the reorder point.

**8. SquadLocker row and bullet.**
- Evidence: The cited URL returns 404: https://squadlocker.com/squad-blog/ordering-options-to-improve-your-uniform-game
- Evidence: Current pages support "no minimum orders and stores never close", "ship it directly to the players home", free setup, and delivery "in two weeks or less": https://squadlocker.com/solutions/teams
- Evidence: Fundraising is set at 5%, 10% or 15%, with payouts once the store has raised more than $10 (blog dated 2022): https://squadlocker.com/squad-blog/fundraising-with-squadlocker
- Evidence: A third party reports shipping to the US and Canada only: https://www.comparably.com/companies/squadlocker/faqs
- Correction: The "bulk" shipping option is not shown on the pages I fetched. Replace the dead link.

**9. Champro / Cliff Keen row: wrong attribution, and the sources are stale.**
- Evidence: The Champro article is dated 8 June 2020. It describes an *upcoming* Champro Custom Builder. The per-dealer 3D builder in that article belongs to **FSG America**, not Champro: https://www.formula4media.com/articles/build-that-unform-and-cap-and-socks
- Evidence: The Cliff Keen article is dated 10 May 2019. It supports purchase orders via B2B, but says nothing about private-label or 3D builders: https://www.formula4media.com/articles/if-you-build-it-they-will-come
- Evidence: Champro does now give dealers an embed key for its Custom Builder: https://cb.champrosports.com
- Correction: "Private-label 3D builder per dealer" should not be credited to Champro or Cliff Keen. Cite current pages, not 6–7 year old trade articles.

**10. OneTeam row.**
- Evidence: "Ready in 10 business days from artwork approval" is confirmed. But the program covers only a few styles (tees, V-necks, reversible shorts). MSRP is $48–$75, and you order through a sales rep: https://oneteamsports.com/pages/oneteam-custom-express
- Opinion: This is a narrow express program sold through reps, not proof that the whole market works to a 10-day standard.

**11. Custom Ink rows.**
- Evidence: Confirmed, via customink.com pages found by search:
  - no-minimum styles and a Group Order Form where each person picks a size and pays: https://www.customink.com/services/t-shirt-maker
  - artist review of every order: https://www.customink.com/how-it-works
  - the design fee "will be deducted if the minimum order total for the waived fee is met" (threshold not found): https://www.customink.com/designservices
- Not verified: the blog post p=26229 (403).
- Evidence: Custom Ink also gives a free digital proof that an artist has reviewed. So the plan didn't need Hoopsbasket (unverified, 429) to show proof-before-print: https://www.customink.com/how-it-works

**12. Purchaser POV Trustpilot evidence: most of the quoted reviews are no longer at the cited URLs.**
- Sublimation Kings: no HEX / "brick red" review on the cited page. Its TrustScore is 4.5 from 116 reviews, so it is a poor example of colour failure: https://ca.trustpilot.com/review/sublimationkings.com
- Fansidea: no "7 of 11" review. Its TrustScore is 4.5 from 2,721 reviews: https://ca.trustpilot.com/review/fansidea.com?page=8
- Jersey Teams World: no review about missing numbers (the closest is "player name wrong!"). Delay and tracking complaints are confirmed. TrustScore 2.0 from 463 reviews: https://ca.trustpilot.com/review/jerseyteamsworld.com
- Jersey Loco: no "two sizes small" (the closest is "Sizes fit slim"). Delays are confirmed. TrustScore 3.0 from 1,227 reviews: https://ca.trustpilot.com/review/jerseyloco.com?page=6
- KXKshop: no "seller insisted" review on page 4: https://es.trustpilot.com/review/kxkshop.com?page=4
- fiitg: confirmed ("tried to tell me ... that i was mistaken"): https://ca.trustpilot.com/review/fiitg.com?page=9
- Opinion: Trustpilot pages shift as new reviews arrive, so page-number citations go stale. Archive the quotes with dates. The pain themes may still hold, but 4 of the 6 specific anecdotes cannot be reproduced.

**13. Omni Cheer ("try before buying" and "no returns").**
- Evidence: Supported by the FAQ rather than the cited product page:
  - fit kits come with a free colour swatch and are refundable within 30 days
  - a swatch alone costs $10
  - minimum is 6 per style, with fill-in orders of 3+
  - production takes 4–6 weeks with no rush
  - "Sublimated uniforms cannot be returned"
  - Source: https://omnicheer.com/help/sublimation-faq

**14. Custom Made Better (IP policy example).**
- Evidence: It is an acrylic and maker-blanks company (CMB Acrylic), not an apparel company. Its post describes reviewing orders and a 15% cancellation fee for trademarked files. No takedown process was found: https://www.custommadebetter.com/blogs/faqs/maker-tip-let-s-talk-about-trademarks
- Correction: "Takedown process" is not supported by this source.

**15. De minimis (Seller POV).**
- Evidence: Accurate, but should be updated:
  - Avalara (updated 21 Jul 2026) confirms the 29 Aug 2025 suspension, its continuation on 20 Feb 2026, and a statutory end on 1 July 2027: https://www.avalara.com/gb/en-gb/blog/de-minimis-exemption-changes-coming.html
  - The continuation was EO 14388, signed the day of the Supreme Court IEEPA ruling: https://www.strtrade.com/trade-news-resources/str-trade-report/february/de-minimis-suspension-remains-in-place
  - The Court of International Trade upheld the suspension on 13 Aug 2026: https://www.alvarezandmarsal.com/thought-leadership/uscit-upholds-ieepa-suspension-of-de-minimis-treatment-in-axle-of-dearborn

## Missed competitors (name, URL, why they matter)

**Most relevant five (price, minimum, turnaround):**

**1. owayo (Germany): the closest match to the plan's own model.** https://www.owayo.com/custom-volleyball-jerseys.htm
- Evidence:
  - 3D designer with its own "Made in Germany" production, any quantity from 1 to 10,000.
  - "Shipped in 7 to 15 days".
  - "Reorder anytime, in any amount".
  - A Samples Program, an "AI Design Service", names and numbers included, and an owayo Shop.
  - Single-piece US list prices are about $63–$85 (soccer F3 $73, handball F3 $63, basketball B6 $75): https://www.owayo.com/custom-soccer-jerseys.htm, https://www.owayo.com/design-customized-handball-jerseys.htm
  - Club rebate program: https://www.owayo.com/soccer/athletic_club_rebate_program-us.htm
- Opinion: owayo already sells "3D editor plus own factory plus one piece or thousands". The plan has to beat it on price or speed, or say why it can't.

**2. Spized (EU).** https://www.spized.com/en/custom-table-tennis-jersey
- Evidence:
  - From one piece, "Current delivery time: 12 working days", printing included in the price, and reorders matched to the last order's price.
  - Team lists with a shareable link and deadline to collect player details: https://www.spized.com/en/ordering-process
  - Hummel teamwear sold through the Spized configurator from June 2026: https://www.sgieurope.com/brands/hummel-partners-with-spized-for-custom-teamwear/121767.article
- Opinion: Spized has the roster-collection link and branded blanks that the plan pushes to M3 or leaves out.

**3. Sublimation Kings (US): the plan quotes it as a bad review, but it is a direct competitor.** https://sublimationkings.com/faq
- Evidence:
  - 3D builders, "No minimums. Ever.", and names and numbers free.
  - Production in 3–4 weeks from artwork approval, with rush of 10–15 days on some products.
  - Proofs sent by email or SMS link.
  - US shipping is a flat $7.95, free over $500.
  - In-house design team.
  - TrustScore 4.5 from 116 reviews: https://ca.trustpilot.com/review/sublimationkings.com

**4. USA Teamwear (US LLC, Sialkot factory): the Pakistan-to-US direct model the plan should have studied.** https://usateamwear.com/
- Evidence:
  - Production unit is HASH International, Sialkot.
  - "All Sportswear designs are made by our 20 professional designers free of charge".
  - "7-10 days production time & courier delivery".
  - Some listed prices, e.g. a soccer uniform at $25.00. PayPal accepted.
  - Serves brands, teams, schools and fundraising.
  - Handles "freight from Pakistan, customs clearance, duties, and final delivery" with "FREE Shipping" to the USA: https://usateamwear.com/customization-sublimated-cricket-kits-usa-identity/
- Opinion: It already solves the plan's "US landed cost" risk with a US entity, duty-inclusive free shipping and free design, from the same sourcing base.

**5. Custom Ink sublimated jerseys (re-classify, don't omit).** https://www.customink.com/products/sublimated-team-jerseys/1063
- Evidence:
  - Free standard delivery in about two weeks, rush options, and a 3-day Super Rush: https://www.customink.com/help_center/delivery-options
  - Low-minimum sublimated styles with a roster tool.

**Other missed players:**

**ZALI (Sialkot).** https://zaliind.pages.dev/how-it-works (found via search; it did not resolve when fetched)
- Evidence: 25-piece minimum; 12–25 working days; digital mockup rounds; DDP air to US/UK in 5–8 days with duties handled; own-label.

**IK Apparel (Sialkot).** https://ikapparel.com/custom-team-jerseys-manufacturer.php
- Evidence: Minimum of 10–20 pieces per design (a popup says 30); 10–15 business days; pre-production samples; quotes and photo/video production updates over WhatsApp; payment by T/T, Western Union or L/C.
- Opinion: It is typical of Pakistani rivals, who are quote-led and B2B. That leaves self-serve online ordering open, which is a real opening for the plan.

**Zakeke and Kickflip (3D configurator SaaS).**
- Evidence:
  - Zakeke costs $59–$299.90 a month plus 1.5–1.9% per sale. Grow and above include Names & Numbers, bulk orders and an advanced print-ready file builder, and 3D/AR preview is on all plans: https://admin.zakeke.com/en-US/pricing
  - Kickflip costs $59 a month plus up to 1.95%, with print-ready files and bulk ordering: https://gokickflip.com/pricing
- Opinion: Any Sialkot factory can add a configurator with print files for about $100 a month. A 3D editor is not a moat.

**Rush Order Tees team uniforms.** https://www.rushordertees.com/team-uniforms/hockey/
- Evidence: General printer selling sublimated uniforms with no minimums. Some uniform lines are excluded from rush: https://cdn.rushordertees.com/team-uniforms/softball

**Bonfire (events and fundraising).** https://www.bonfire.com/fundraising
- Evidence: Campaign-based fundraising apparel with "no upfront costs or inventory". Items ship to each buyer.
- Opinion: This is the reference product for the plan's "events and groups" segment.

**UK kit builders: SWAZ, Serious Sport, My Club Group.**
- Evidence:
  - SWAZ: no minimums: https://swaz.co.uk/sports/cricket/custom-cricket-teamwear/
  - Serious Sport: UK manufacturing, 3D Kit Builder, no MOQ: https://www.serioussport.co.uk/bespoke-sportswear
  - My Club Group: minimum of 5 on the first order, none after: https://myclubgroup.com/?p=3496
- Opinion: These matter if the UK is chosen as a first market, which is an open decision in the plan.

**Printful and Printify US production (singles channel).**
- Evidence:
  - Printful says orders shipped from outside the US may incur customs charges: https://help.printful.com/hc/en-us/articles/18964831121180-How-will-the-tariffs-affect-Printful-prices
  - All-over synthetic fulfillment takes 2–5 business days in-house: https://help.printful.com/hc/en-us/articles/360014007980-how-long-does-fulfillment-take-
- Opinion: For single US pieces, US-produced print-on-demand avoids the duty the plan's Lahore parcels will pay.

## Features competitors have that the plan lacks (ranked by importance)

**1. A published turnaround number.** The plan says to "publish a turnaround" but never sets one.
- Evidence: owayo ships in 7–15 days, Spized delivers in 12 working days, OneTeam in 10 business days, USA Teamwear quotes 7–10 days production, SquadLocker says "as fast as 5 days", and Custom Ink has a free 2-week standard (URLs above).
- Opinion: Without a target the plan can't be checked against the market. Lahore-to-US air freight has to fit inside it.

**2. Duty-inclusive free shipping through a destination-market entity.**
- Evidence: USA Teamwear (US LLC) handles customs, duties and free US delivery. ZALI quotes DDP air in 5–8 days.
- Opinion: The plan has DDP quotes in M2, but "set up a destination entity" is still an open question. Competitors from the same city have already answered it.

**3. Free design help in teamwear.** The plan charges for design help.
- Evidence: USA Teamwear has 20 free designers, Wooter gives free mockups, and Sublimation Kings has an in-house design team. Custom Ink waives its fee only above an order total.
- Opinion: The plan's paid "design it for me" copies the general-print model. In teamwear, free design is the norm.

**4. Refundable fit kits and free swatches.** The plan sells them as products.
- Evidence: Wooter's $125 kit is fully refundable. Omni Cheer kits are refundable within 30 days and include a free swatch. owayo runs a Samples Program.

**5. Reorder guarantees and price matching, plus fill-in orders below the minimum.**
- Evidence: Spized matches the last order's price, owayo allows reorders "anytime, in any amount", and Omni Cheer takes 3+ piece fill-ins after a 6-piece first order.
- Opinion: Reorders sit in M5 in the plan, with no price lock and no fill-in policy.

**6. Rush tiers with published prices.**
- Evidence: Custom Ink offers rush and a 3-day Super Rush. Sublimation Kings offers rush of 10–15 days.
- Opinion: The plan has no rush tier, which matters for teams on a season deadline.

**7. Always-open team stores with each order decorated and shipped individually, plus fundraising at launch.**
- Evidence: SquadLocker stores "never close", with 5/10/15% fundraising. Bonfire runs campaign fundraising.
- Opinion: The plan has only close-dated group orders, and fundraising waits until M6. That leaves the events and schools segment underserved.

**8. Licensed brand blanks** (Hummel via Spized; Nike, Under Armour and Adidas via SquadLocker).
- Evidence: https://www.sgieurope.com/brands/hummel-partners-with-spized-for-custom-teamwear/121767.article and https://squadlocker.com/solutions/teams

**9. WhatsApp and SMS proof and production updates with photos and videos.**
- Evidence: IK Apparel sends photo and video updates over WhatsApp. Sublimation Kings sends proofs by SMS link.
- Opinion: The plan's status page is web-only. WhatsApp is expected in Pakistan, the Gulf and South Asia.

**10. Club loyalty and rebate programs.**
- Evidence: owayo athletic club rebate program: https://www.owayo.com/soccer/athletic_club_rebate_program-us.htm

**11. A free or low-cost shipping threshold.**
- Evidence: Sublimation Kings charges $7.95 flat, free over $500. Custom Ink includes free standard shipping.
- Opinion: An "all-in price" from Lahore with duty included needs to be compared with these.
