# 01 Research: what the best teamwear stores and apparel themes do

10 Nov 2026 · storefront-designer · Task S0-13

Every source below was opened on **10 Nov 2026**. Findings are split into **Evidence** (what a page says or a study found, with its URL) and **For us (opinion)**, which is my judgement.

**How I looked, and its limit.** I read each site with a web-fetch tool, which returns the page's text and structure, not a rendered picture. So I can report what a page says, in what order, and what its buttons are labelled. **I could not see any competitor site at phone width or check its visual design.** Everything below about phone behaviour comes from usability studies and theme documentation, not from looking at competitor phones. Custom Ink returned "403 Forbidden" for its home page and its how-it-works page, so it is left out.

---

## 1. Home page

**Evidence**
- Every teamwear home page I read opens with a design call to action:
  - Spized: "Designing your own jersey has never been this easy", then two buttons, "To the product overview" and "Design in the 3D configurator" ([spized.com/en](https://www.spized.com/en/)).
  - Serious Sport: "Design Your Sports Kit" and "Trial Our Team Store Platform" ([serioussport.co.uk](https://www.serioussport.co.uk/)).
  - Sublimation Kings: "Customize Now" on each hero slide ([sublimationkings.com](https://sublimationkings.com/)).
  - Wooter: "GET A FREE CUSTOM DESIGN" ([wooter.com](https://wooter.com/)).
  - owayo: "Choose your sport" ([owayo.com](https://www.owayo.com/)).
- Right under the hero, most list the three or four facts a buyer worries about:
  - Serious Sport: "Fastest Delivery Times in the UK", "British Manufacturer with No Minimum Orders" ([serioussport.co.uk](https://www.serioussport.co.uk/)).
  - Sublimation Kings: a benefits strip, "$7.95 flat rate. Free on orders $500+.", "Buy more, save more" ([sublimationkings.com](https://sublimationkings.com/)).
  - SWAZ puts its facts in the top bar: "No minimum order quantity > > No extra cost for added design elements > > Average delivery time for custom items is 4 weeks" ([swaz.co.uk](https://swaz.co.uk/)).
- Most explain the process in numbered steps: Spized "Your own sportswear in 4 steps" ([spized.com/en](https://www.spized.com/en/)); SquadLocker "How it works" in 7 steps ([squadlocker.com/solutions/teams](https://squadlocker.com/solutions/teams)).
- Social proof is club logos and named club testimonials, not star ratings: Spized "Top clubs wear spized"; Serious Sport "Trusted By" and partner quotes; owayo client logos and "more than 25,000 companies" ([owayo.com](https://www.owayo.com/)).
- NN/g: the home page must "communicate who you are and what you do", with "a tagline that explicitly conveys what your site or company does"; put the logo top-left and avoid centred logos; "keep animated content to a minimum" ([NN/g, 15 Mar 2024](https://www.nngroup.com/articles/homepage-design-principles/)).
- NN/g: auto-rotating carousels hide content. A tester missed a £100 offer because "it keeps flashing too quickly", and "carousels should show a new panel only when users ask for it" ([NN/g, 2013](https://www.nngroup.com/articles/auto-forwarding/)).
- Baymard: show a broad range of product types on the home page, and "be cautious if considering highly stylized, unconventional designs" ([Baymard, updated Jun 2026](https://baymard.com/blog/ecommerce-ux-best-practices)).

**What goes wrong (evidence)**
- Sublimation Kings leads with a rotating hero carousel of two sport slides ([sublimationkings.com](https://sublimationkings.com/)). That is the pattern NN/g warns against.
- USA Teamwear's first button is "Get a Quote", and its "Request a Free Quote & Mock-up" link opens WhatsApp. There is no design tool. Its statistics showed "0" in the fetched page, probably counters that animate in by script ([usateamwear.com](https://usateamwear.com/)).
- Wooter's home page never explains how a team order works ([wooter.com](https://wooter.com/)).

**For us (opinion):** Follow the shared pattern. One plain headline with one obvious button. Right under it, a strip of 3 or 4 facts. Then the garments, then "how team orders work" in 4 steps. The hero image should not move. Club logos and testimonials should appear only once we have real ones.

## 2. Navigation and region switch

**Evidence**
- Teamwear navigation is organised by sport (owayo has 17 sports; Sublimation Kings, Serious Sport and SWAZ also lead with sports) ([owayo.com](https://www.owayo.com/), [swaz.co.uk](https://swaz.co.uk/)).
- Phone and help contacts sit in the header: Serious Sport "Call us on 01256 398 633"; Wooter "Need help? Call us at +1 (347) 850-2720"; USA Teamwear has a WhatsApp link ([wooter.com](https://wooter.com/), [usateamwear.com](https://usateamwear.com/)).
- The Shopify Dawn demo shows the country and currency in the header and again in the footer, as "Canada | CAD $" ([Dawn demo](https://theme-dawn-demo.myshopify.com/)). owayo has a "Select country and language" list but no currency selector ([owayo.com](https://www.owayo.com/)).

**What goes wrong (evidence):** NN/g's negative example hides the navigation behind a small menu link with low-contrast links ([NN/g](https://www.nngroup.com/articles/homepage-design-principles/)).

**For us (opinion):** We sell three garments, not seventeen sports, so the menu should name the garments plus "How team orders work". The region and currency must show in the header on every page, as Dawn does, because a UK coach who sees PKR prices will leave. Show a help contact (WhatsApp if the founders staff it) in the header or menu.

## 3. Product listing and cards

**Evidence**
- Cards show the price at team quantities, not only for a single piece:
  - Spized: "Unit price for 1 pcs.: €59.90" and "Unit price for 20 pcs.: €40.90", with a "Customise now" button on each card ([spized.com table tennis](https://www.spized.com/en/custom-table-tennis-jersey)).
  - owayo: "1 units: $79.00 per unit", "10 units: $50.00", "50 units: $45.00" ([owayo soccer](https://www.owayo.com/custom-soccer-jerseys.htm)).
  - SWAZ product page: "1-3 shirts" £16, "4-8 shirts" £15, "9+ shirts" £14 ([SWAZ training shirts](https://swaz.co.uk/product/custom-training-shirts/)).
- Dawn's demo cards show a second image, the title, badges ("Sold out", "Sale") and a price, including "From" pricing ([Dawn demo](https://theme-dawn-demo.myshopify.com/)).

**What goes wrong (evidence)**
- SWAZ's cricket listing shows no price on any card, only "Adult Sizes" and "Youth Sizes" buttons ([SWAZ cricket](https://swaz.co.uk/sports/cricket/custom-cricket-teamwear/)).
- Sublimation Kings shows "$39.95 - $69.95" with a "Sale!" badge, but $39.95 applies only at "251+ qty". One piece costs $69.95 ([Sublimation Kings product](https://sublimationkings.com/?p=214425)).

**For us (opinion):** Each card shows one honest price line: "from [price] per piece", with the quantity it applies to once tier prices exist. Make the whole card one link. No "Sale" badges on made-to-order kit.

## 4. Product (design) page

**Evidence**
- Sublimation Kings puts player lines on the product page itself: an "Add Player Details" section with Name, #, size and "+ Add Player". It also says "Player names and numbers are included at no additional cost" and "Ships in 3-4 weeks, contact us about rush" ([Sublimation Kings product](https://sublimationkings.com/?p=214425)).
- SWAZ's main button is "Design your own shirt". Details sit in collapsible sections: DESCRIPTION, DETAILS, SIZE GUIDE, SHIPPING, RETURNS ([SWAZ training shirts](https://swaz.co.uk/product/custom-training-shirts/)).
- Dawn's demo product page has a media counter ("1 / of 8"), opens each image in a full-screen view ("Open media 1 in modal"), and has sections for "Materials", "Shipping & Returns", "Dimensions" and "Care Instructions" ([Dawn demo product](https://theme-dawn-demo.myshopify.com/products/studio-denim)).
- Baymard: 67% of sites show no total cost estimate near the buy section, and "the lowest full order cost should be displayed on the product page by default" ([Baymard product page 2026](https://baymard.com/research-articles/current-state-ecommerce-product-page-ux)).
- Baymard: give the main "Add to Cart" button a style used by no other button ([Baymard 35 best practices](https://baymard.com/blog/ecommerce-ux-best-practices)).

**What goes wrong (evidence)**
- The Sublimation Kings product page shows "Reviews (0)" and "There are no reviews yet" beside a "4.5 out of 5 | 115 Reviews" Trustpilot badge. It also says "All sales are final, no returns or exchanges" ([Sublimation Kings product](https://sublimationkings.com/?p=214425)).
- The owayo soccer page text, as fetched, reads "a production time of [[MIN_PRODUCTION_DAYS]] to [[MAX_PRODUCTION_DAYS]] days". It may be filled in by script in a real browser; I could not check ([owayo soccer](https://www.owayo.com/custom-soccer-jerseys.htm)).

**For us (opinion):** A team organizer needs one decision on this page: "design this garment for my team". Single-piece buying (Pakistan only) is the second path. Price, delivery date and region rules (minimum, duties) sit next to the button, not in a banner or a tab. A promise must be filled from data and never show a raw placeholder.

## 5. Gallery

**Evidence**
- Baymard's mobile testing found that testers swiped the gallery whatever the indicator type, so dots were not a barrier. But dots "can act as a source of slight friction", and some users read them as colour options. Thumbnails "communicate content". Only 34% of mobile sites use thumbnails. If thumbnails are cut off, show that more exist. Swipe should work on the main image and the thumbnail row ([Baymard, updated 10 Nov 2026](https://baymard.com/blog/always-use-thumbnails-additional-images)).
- NN/g on mobile carousels:
  - The last item should be reachable "in 3–4 steps".
  - "Make sure your carousel supports swipe."
  - Leave a page gutter so edge swipes don't trigger the browser's back gesture (J.Crew's full-width carousel did).
  - A partly visible next item is "a strong carousel cue". Dots are weak.

  Source: [NN/g, 2018](https://www.nngroup.com/articles/mobile-carousels/).
- Shopify's media guidelines say "you shouldn't rely solely on swipe gestures for navigation as video players and 3D model viewers can interfere". 3D models default to inactive on page load and must pan with the keyboard ([Shopify media UX](https://shopify.dev/docs/storefronts/themes/product-merchandising/media/media-ux)).
- Dawn has five desktop gallery layouts (Stacked, 2 columns, Thumbnails, Thumbnail carousel, Collage). A third-party guide says "Mobile always shows a horizontal swipe carousel" ([craftshift](https://craftshift.com/?p=20913); not an official Shopify source).
- A Horizon merchant wrote that the gallery "only displays a carousel" on mobile and asked for thumbnails. Other merchants disagreed about whether the setting exists ([Shopify Community, Dec 2025](https://community.shopify.com/t/horizon-theme-product-gallery-with-thumbnails-on-mobile/580105)).

**For us (opinion):** The founder's carousel decision is right. On phones it should have a thumbnail row (or a "1 / 5" counter plus a visible peek of the next image), side gutters, and arrow buttons as well as swipe. The 3D editor must not sit inside the swipe carousel, because dragging to rotate and swiping to change image fight each other.

## 6. Size selection

**Evidence**
- Baymard: in testing, users missed drop-down size selectors and were "prone to overlook the size selector entirely". Use buttons. Make unavailable sizes visibly different and the selected size obvious. Make tap targets big enough ([Baymard, Feb 2021](https://baymard.com/research-articles/use-buttons-for-size-selection)). 57% of sites still don't use size buttons ([Baymard 2026](https://baymard.com/research-articles/current-state-ecommerce-product-page-ux)).
- Baymard: 83% of desktop and 87% of mobile apparel sites give too little sizing information. Put the size-guide link next to the selector. Show inches and centimetres, use product-specific guides, and include a customer-service link inside the guide. The Back button should close the guide ([Baymard, Jul 2022](https://baymard.com/research-articles/apparel-size-information)).
- Sublimation Kings's size chart is garment-flat: "Measurements are in inches and taken with the garment laid flat, side-to-side" ([Sublimation Kings product](https://sublimationkings.com/?p=214425)).
- Spized and owayo send buyers who are unsure of size to free sample sets: "Unsure about size, fit or fabric?" ([spized.com table tennis](https://www.spized.com/en/custom-table-tennis-jersey), [owayo soccer](https://www.owayo.com/custom-soccer-jerseys.htm)).

**What goes wrong (evidence):** Sublimation Kings hides size in a "Choose an option" drop-down ([product](https://sublimationkings.com/?p=214425)). SWAZ's product page has no size picker and links to its guide with "click HERE" ([SWAZ](https://swaz.co.uk/product/custom-training-shirts/)).

**For us (opinion):** Use size buttons grouped Youth and Adult, each at least 44 px tall. Put "Size chart" next to the label and open it in a sheet that shows garment measurements in cm and inches. Put the fit-kit offer inside the size chart.

## 7. Price and delivery promise display

**Evidence**
- Baymard: show a delivery date, not a shipping speed. Testers "interpreted the delivery date provided by the site as a clear promise or guarantee of delivery by that date". Ranges wider than "5–7 days" made users hesitate ([Baymard, Jun 2023](https://baymard.com/blog/shipping-speed-vs-delivery-date)).
- Baymard: shipping facts that appear only in a site-wide banner were missed by up to 27% of testers. Place them "near the 'Buy' section", with their conditions spelled out ([Baymard, 2017](https://baymard.com/blog/avoid-banners-only-free-shipping)).
- Serious Sport: "Fully bespoke kits in just 3-4 weeks with top-up orders in just 5-7 days" ([serioussport.co.uk](https://www.serioussport.co.uk/)).

**What goes wrong (evidence)**
- SquadLocker promises "as fast as 5 days" in the hero and "two weeks or less" in its steps ([SquadLocker](https://squadlocker.com/solutions/teams)).
- owayo's home page says production takes "2 to 5 weeks, depending on the season" ([owayo.com](https://www.owayo.com/)).
- Spized's table tennis page says "2 to 3 weeks", while its home page gives no time at all ([spized.com table tennis](https://www.spized.com/en/custom-table-tennis-jersey), [spized.com/en](https://www.spized.com/en/)).

**For us (opinion):** Our dated promise is the clearest differentiator in this list, because nobody else shows a date. Show "Delivered by [date]" beside the button, worked out from today plus the founders' rule. Show the same rule in the same words everywhere, from one data source.

## 8. How team ordering is explained

**Evidence**
- Spized's team list can be shared, and "you can also send the link with a deadline to individuals who still need to provide the required information" ([Spized ordering process](https://www.spized.com/en/ordering-process)).
- SquadLocker lists 7 steps, ending "shipped directly to players in two weeks or less" ([SquadLocker](https://squadlocker.com/solutions/teams)).
- Serious Sport's team stores let "players, members and parents … purchase and personalise their kit" ([serioussport.co.uk](https://www.serioussport.co.uk/)).
- Spized's 4 steps are design, adjust details including names and numbers, get a sample, and check the design ([spized.com/en](https://www.spized.com/en/)).

**What goes wrong (evidence):** Sublimation Kings and Wooter don't explain team ordering on the home page at all ([sublimationkings.com](https://sublimationkings.com/), [wooter.com](https://wooter.com/)).

**For us (opinion):** Our flow (design → share one link → players add name, number and size → sign the roster proof) is simpler than a team store and easy to show in 4 steps. It is the home page's second most important section.

> **Note, 17 Nov 2026: the flow above is out of date.** The founder changed it on 17 Nov 2026 ([decision 012](../decisions/012-team-list-entered-by-the-organizer.md)): players no longer add their own details through a link. The new flow is **design → enter the team list in the editor (the organizer types or pastes each player's name, number and size) → sign the roster proof → pay the deposit**. It is still four steps and still the home page's second section. The research above stays as it was found; Spized's shared list link is now a pattern we do not use at launch (it may come back later as an addition). The team list itself is specified in [08-team-list.md](08-team-list.md).

## 9. Trust signals

**Evidence**
- Club logos and named testimonials (Spized, Serious Sport, SquadLocker, owayo).
- Certificates: USA Teamwear shows "CE, ISO 9001:2015, ISO 14001:2015" ([usateamwear.com](https://usateamwear.com/)).
- Free samples (owayo, Spized).
- "No setup fees, no art fees, no hidden fees" and payment logos (Sublimation Kings).
- A refund promise: USA Teamwear says "all replacements are given without any charge or 100% cash refund" ([usateamwear.com](https://usateamwear.com/)).
- Baymard: 89% of sites don't respond to negative reviews, which "leaves users doubtful" ([Baymard 2026](https://baymard.com/research-articles/current-state-ecommerce-product-page-ux)).

**What goes wrong (evidence)**
- Serious Sport says "used by over 2000 sports clubs" and "Trusted by 1000+ clubs" on the same page ([serioussport.co.uk](https://www.serioussport.co.uk/)).
- USA Teamwear shows a "5.0 out of 5" Google rating based on 5 reviews ([usateamwear.com](https://usateamwear.com/)).
- SquadLocker's footer reads "Copyright © 2023" ([SquadLocker](https://squadlocker.com/solutions/teams)).
- Wooter shows "(1,000+)" on product cards with no label ([wooter.com](https://wooter.com/)).
- A Sublimation Kings reviewer wrote "When I received my proof, it was for another person entirely" ([Trustpilot, 4 Oct 2026](https://ch.trustpilot.com/review/sublimationkings.com)).

**For us (opinion):** At launch we have no reviews and no club logos, and we must not fake them. Our honest trust signals are the signed roster proof, the dated delivery promise, the 7-day replacement, free design help, and the founders' Lahore company and contact details. Contradictory numbers do more harm than none, so every number shown must come from one data source.

## 10. Footer

**Evidence**
- owayo's Support column lists "Samples Program, Receive a Quote, … Design Support, … FAQ, Size Chart, … Production Time, Price List" ([owayo.com](https://www.owayo.com/)).
- Spized lists "Order process & delivery time" and payment options ([spized.com/en](https://www.spized.com/en/)).
- SWAZ shows its company registration and address ([swaz.co.uk](https://swaz.co.uk/)).
- Dawn repeats the country and currency selector in the footer and shows payment icons ([Dawn demo](https://theme-dawn-demo.myshopify.com/)).
- Baymard: "a subgroup of users will consistently look in the footer" for shipping and returns. Use standalone "Return Policy" and "Shipping Info" links in plain words ([Baymard, 2019, updated 2025](https://baymard.com/blog/footer-needs-return-shipping-links)).

**For us (opinion):** The footer should hold:
- plain links to "Shipping & duties", "Delivery times", "Replacements & returns", "Size charts" and "FAQ";
- the region switch;
- the payment methods for the visitor's region;
- the company's legal details.

## 11. Phone-specific behaviour

**Evidence**
- WCAG 2.2 sets a 24 × 24 px minimum target (SC 2.5.8). The 44 × 44 px measure in SC 2.5.5 is recommended for important controls ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)).
- Baymard: a sticky "Add to Cart" button should have "sufficient white space" around it, so don't make it full-width ([Baymard 35 best practices](https://baymard.com/blog/ecommerce-ux-best-practices)).
- On phones, Shopify's guidelines want all media inactive until the customer starts it ([Shopify media UX](https://shopify.dev/docs/storefronts/themes/product-merchandising/media/media-ux)).

**For us (opinion):**
- Every tap target is at least 44 px.
- A sticky buy bar appears on the product page once the main button scrolls away.
- The embedded 3D view starts inactive, so a thumb scrolling the page doesn't spin the jersey.

## Shopify themes: what they tell us

**Evidence**
- On the Theme Store, the free Shopify themes rate lowest with merchants:

  | Theme | Price | Rating |
  | --- | --- | --- |
  | Dawn | free | "36% positive" from 292 reviews ([listing](https://themes.shopify.com/themes/dawn/styles/default)) |
  | Horizon | free | "36% positive" from 212 reviews ([listing](https://themes.shopify.com/themes/horizon/styles/horizon)) |
  | Impulse (Archetype) | $500 | "94% positive" from 1305 reviews ([listing](https://themes.shopify.com/themes/impulse/styles/modern)) |
  | Prestige (Maestrooo) | $400 | "91% positive" from 875 reviews ([listing](https://themes.shopify.com/themes/prestige/styles/allure)) |
- Both paid themes list "Size chart", "Quick view", "Sticky header", "Color swatches" and "Mega menu" as features (same listings).
- The Horizon demo product page has numbered thumbnail buttons "1" to "8", sizes "XS" to "XXL" and an "Add to cart" button ([Horizon demo](https://theme-horizon-demo.myshopify.com/products/michael-shaggy-wool-cardigan-324-1)).

**For us (opinion):** The patterns worth taking from themes are structural: region and currency in the header and footer, a gallery with a counter and thumbnails, collapsible detail sections, a size chart next to the selector, and a sticky header. The look of these demos (fashion bags, knitwear) is not ours. I could not inspect the paid themes' demo stores: the listings show no demo URL.

---

## Sites and sources studied

| Site or source | What I opened | Depth |
| --- | --- | --- |
| owayo | [home](https://www.owayo.com/), [soccer page](https://www.owayo.com/custom-soccer-jerseys.htm), [club program](https://www.owayo.com/soccer/athletic_club_rebate_program-us.htm) | Close |
| Spized | [home](https://www.spized.com/en/), [table tennis page](https://www.spized.com/en/custom-table-tennis-jersey), [ordering process](https://www.spized.com/en/ordering-process) | Close |
| Sublimation Kings | [home](https://sublimationkings.com/), [product page](https://sublimationkings.com/?p=214425), [Trustpilot](https://ch.trustpilot.com/review/sublimationkings.com) | Close |
| SWAZ (UK) | [home](https://swaz.co.uk/), [cricket listing](https://swaz.co.uk/sports/cricket/custom-cricket-teamwear/), [product page](https://swaz.co.uk/product/custom-training-shirts/) | Close |
| Serious Sport (UK) | [home](https://www.serioussport.co.uk/), [bespoke page](https://www.serioussport.co.uk/bespoke-sportswear) | Close |
| USA Teamwear | [home](https://usateamwear.com/) | Glance |
| SquadLocker | [teams page](https://squadlocker.com/solutions/teams) | Glance |
| Wooter | [home](https://wooter.com/) | Glance |
| Custom Ink | home and how-it-works: **403 Forbidden** | Not reached |
| Shopify Dawn | [listing](https://themes.shopify.com/themes/dawn/styles/default), [demo home](https://theme-dawn-demo.myshopify.com/), [demo product](https://theme-dawn-demo.myshopify.com/products/studio-denim) | Close |
| Shopify Horizon | [listing](https://themes.shopify.com/themes/horizon/styles/horizon), [demo home](https://theme-horizon-demo.myshopify.com/), [demo product](https://theme-horizon-demo.myshopify.com/products/michael-shaggy-wool-cardigan-324-1), [community thread](https://community.shopify.com/t/horizon-theme-product-gallery-with-thumbnails-on-mobile/580105) | Close |
| Impulse, Prestige | Theme Store listings only (no demo URL shown) | Glance |
| Usability research | Baymard: [thumbnails](https://baymard.com/blog/always-use-thumbnails-additional-images), [size buttons](https://baymard.com/research-articles/use-buttons-for-size-selection), [sizing info](https://baymard.com/research-articles/apparel-size-information), [product page 2026](https://baymard.com/research-articles/current-state-ecommerce-product-page-ux), [delivery date](https://baymard.com/blog/shipping-speed-vs-delivery-date), [banner-only shipping](https://baymard.com/blog/avoid-banners-only-free-shipping), [footer links](https://baymard.com/blog/footer-needs-return-shipping-links), [35 best practices](https://baymard.com/blog/ecommerce-ux-best-practices). NN/g: [home page](https://www.nngroup.com/articles/homepage-design-principles/), [auto-forwarding](https://www.nngroup.com/articles/auto-forwarding/), [mobile carousels](https://www.nngroup.com/articles/mobile-carousels/). [Shopify media UX](https://shopify.dev/docs/storefronts/themes/product-merchandising/media/media-ux). [WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | Read |
| Fonts | [next/font docs](https://nextjs.org/docs/app/api-reference/components/font). Google Fonts metadata: [Noto Sans Arabic](https://raw.githubusercontent.com/google/fonts/main/ofl/notosansarabic/METADATA.pb), [Noto Nastaliq Urdu](https://raw.githubusercontent.com/google/fonts/main/ofl/notonastaliqurdu/METADATA.pb), [IBM Plex Sans Arabic](https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexsansarabic/METADATA.pb), [Cairo](https://raw.githubusercontent.com/google/fonts/main/ofl/cairo/METADATA.pb), [Inter](https://raw.githubusercontent.com/google/fonts/main/ofl/inter/METADATA.pb), [Barlow Condensed](https://raw.githubusercontent.com/google/fonts/main/ofl/barlowcondensed/METADATA.pb), [Archivo](https://raw.githubusercontent.com/google/fonts/main/ofl/archivo/METADATA.pb) | Read |
