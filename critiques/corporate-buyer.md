# Critique: plan.md from the corporate uniform and merch buyer's view

Reviewer persona: I buy staff uniforms and branded merch for a 200-person company. Plan under review: `C:\Users\baapo\source\repos\FitMyOutfit\plan.md` (dated Nov 10, 2026).

## Top 5 failures (ranked)

### 1. Color is not specified, measured or held across batches, and quantity-based routing guarantees drift between reorders
**What breaks:** I approve navy Pantone 2768 on 150 polos, which get screen printed or embroidered. Three months later I order 8 for new hires. The plan's routing (plan.md lines 13 and 76) sends that small order to DTF or DTG. My logo is now made by a different process, with different inks, on possibly a different fabric lot. The plan's main color control makes this worse: "Uploaded HEX values are snapped to the nearest printable color" (line 40). For a brand buyer, snapping my brand color to some other color is a guideline violation the system builds in, not a safeguard. HEX is also a screen format. My brand book gives Pantone and thread codes. The plan has nowhere to enter Pantone or thread codes, no ΔE tolerance, no lab dip or strike-off before bulk, no record of fabric or dye lots, and no stored record of how the reference order was made. The swatch card comes "with every first order" (line 147), so I see the physical color only after I have paid for the bulk run.

**Evidence:**
- Batch-to-batch tolerances buyers write into specs are around ΔE ≤1.0 for main body fabric and ≤1.5–2 for solids. One worked example shows production lots at ΔE 1.2, 1.8 and 3.6, so a single lot can fall well outside spec ([Racklify color shade check](https://racklify.com/encyclopedia/what-is-color-shade-check-standards-measurements-and-acceptance/), [Fumao batch-to-batch ΔE](https://fumaofabric.com/?p=7607), [Datacolor](https://datacolor.com/?p=19031)). These are mostly supplier and trade pages, so treat the numbers as indicative.
- In sublimation, final color depends on the whole printer, paper, press and blank chain. A generic profile cannot predict it, and press temperature drift changes output on every job ([Mutoh](https://support.mutoh.eu/support/solutions/articles/14000160513-dye-sublimation-generic-icc-profiles-), [Printable Press](https://www.printablepress.com/how-to-fix-sublimation-color-problems/)).
- A uniform supplier reports that reorders "often come back looking different" even with unchanged artwork, and blames dye-lot variation and factory changes ([JL Athletics](https://jlathletics.com/blogs/the-launch/how-to-evaluate-sublimation-quality-in-rowing-uniforms)). This is a vendor source with a stake in the claim.
- Competing shops offer to save your color under your name for reorders, and to lock blank, thread and digitizing so "reorder #5 looks identical to reorder #1" ([T-Shirt Elephant reorder guide](https://www.tshirtelephant.com/resource-guide/reordering-custom-apparel-consistency-guide), [Logo Envy](https://logoenvy.com/services/uniforming)).
- Lab dips take about 7 days and strike-offs about 10–14 days ([Racklify lab dip vs strike-off](https://racklify.com/encyclopedia/lab-dip-versus-strike-off-when-to-use-each-sample-type/)).

**Opinion:** This is the main reason I would not sign. The plan's own Purchaser POV says buyers forgive delay more readily than wrong colors (line 36). Then it designs a system where the same logo takes different routes depending on order size.

**What the plan should change:**
- Add a per-account "brand spec": Pantone and thread codes, locked logo files, placement, garment style, fabric, and the decoration method used on the reference order.
- Allow a per-account override that pins the decoration method. The pin wins over quantity routing, even if a small reorder costs more.
- Replace silent HEX snapping with a "cannot match within ΔE X, approve physical strike-off?" gate.
- Store the fabric lot, ink lot, ICC profile and press settings on every order, and keep a retained reference sample.
- Ship the swatch or strike-off before the bulk deposit, not with the first order.

### 2. Company accounts are deferred, internally inconsistent, and far thinner than what B2B buyers already get
**What breaks:** The plan rates company accounts "Soon after launch" yet schedules them in M5 (line 104), and M5 is the pre-launch pilot (line 135). So it is unclear whether they exist at launch. Even the M5 scope covers only "brand-locked templates, manager approval, purchase orders, invoices". It leaves out:
- multiple users with roles (requester, approver, finance)
- per-employee or per-department allowances and budgets
- cost-center codes on invoices
- SSO with domain-restricted sign-up
- a saved roster of employees and sizes
- a reorder history I can export
- an employee self-order store

The plan's group order (M3) assumes "each person pays" (line 97). For uniforms the company pays and staff pick sizes, so that flow does not fit.

**Evidence:**
- Axomo lists budget management, store credit and gift cards, with SSO and HRIS hookups at onboarding ([Axomo pricing](https://axomo.com/pricing/), [rfp.wiki Printfection vs Axomo](https://www.rfp.wiki/marketing/promotional-product-management-software/printfection/axomo), [FitGap enterprise](https://us.fitgap.com/search/promotional-product-management-software/enterprise)).
- Uniform portals set allowances by role or department and send over-allowance orders to a team leader for approval ([Smart Red](https://www.big-red-digital.com/services/big-red-platform/uniform-management-platform), [Get WorkGear](https://www.getworkgear.com/?p=1992)).
- Merchology company stores require a custom work-email domain and carry up to three locked logo variations ([Merchology](https://merchology.com/pages/how-to-create-a-company-merchstore)).
- Custom Ink sells "Internal Apparel Programs", branded employee stores for on-demand purchase ([Custom Ink for Business](https://www.customink.com/audience/business/ci-for-business)).
- The platform the plan already chose, Medusa, has an official B2B starter with company accounts, per-employee spending limits, cart approvals and quotes ([medusajs/b2b-starter](https://github.com/medusajs/b2b-starter), [Medusa B2B update Mar 2025](https://medusajs.com/blog/b2b-starter-update-mar25/)).

**Opinion:** The Medusa B2B starter removes the engineering excuse for deferring this. Without approvals and budgets, my finance team will not let 200 people order. I do not need Ariba or Coupa punchout at 200 headcount. Larger buyers will want it, and one vendor quotes about EUR 26k for a first cXML connector ([Kolonell](https://kolonell.com/en/blog/punchout-catalog-eprocurement-integration-cost-2026)).

**What the plan should change:**
- Make company accounts a launch requirement if companies are a target segment, and fix the M5 vs "soon after launch" contradiction.
- Start from the Medusa b2b-starter.
- Add roles, budgets and allowances, approval chains, SSO or domain restriction, an employee size roster, CSV export of orders and invoices, and a company-paid group order mode.
- Put punchout explicitly on the backlog with a headcount trigger.

### 3. Payment terms are prepayment-only, and the payment rails into Pakistan are unresolved
**What breaks:** The plan's B2B terms are "a deposit at proof approval and the balance before dispatch" (line 75), with deposit percentage and timing still open (line 155). That is 100% prepayment before goods ship, to a new overseas supplier with no track record. My AP process expects a PO, an invoice and net 30. Card checkout is unresolved because "Shopify Payments, PayPal and Stripe aren't directly available" (line 78), and "bank transfer as fallback" (line 147) means an international SWIFT wire to Pakistan. My AP team also has to onboard a foreign vendor with tax documents. The plan never mentions any of this.

**Evidence:**
- Custom Ink takes a PO at checkout and payment is due within 30 days ([Custom Ink PO help](https://www.CustomInk.com/help_center/using-purchase-order), [Custom Ink payment options](https://www.customink.com/help_center/payment-methods)).
- Other print vendors give net 30 on POs, for example Binding101 for accounts with a $1,000 minimum ([Binding101](https://www.binding101.com/business-purchase-orders)).
- Stripe's supported countries do not include Pakistan, and PayPal is not directly usable there ([WorldFirst](https://www.worldfirst.com/sasia/?p=52075), [DHL Pakistan gateway guide](https://www.dhl.com/discover/en-pk/e-commerce-advice/e-commerce-best-practice/choosing-the-right-payment-gateway-in-pakistan-for-your-e-commerce-site), [Arab News, Nov 2025](https://www.arabnews.pk/node/2623262)).
- US AP departments routinely require a W-8BEN-E before paying a foreign entity, and some expire it after 12 months ([KU vendor IRS form matrix](https://procurement.ku.edu/vendor-irs-form-matrix), [Kimberly-Clark supplier W-8 guide](https://www.global.kimberly-clark.com/-/media/kimberly/pdf/coupa-training-pdf-file-for-en-us/stp_qrc_supplier-guide-on-bank-and-tax-w8-requirements.pdf?la=en-us), [Stampli](https://www.stampli.com/resources/w8-forms-foreign-vendors/)).

**Opinion:** A 50% deposit at proof might clear my approvals for a first order. Paying 100% before dispatch on every recurring reorder will not. Net 30 is table stakes. The open decision on a destination-market entity (line 154) is really the B2B payment decision: a US or UK entity with a local bank account fixes AP friction and wire fees together.

**What the plan should change:**
- Offer a vetted-account tier with net 30 after the first paid order, paired with credit insurance or a credit check.
- Issue proper invoices with PO number, cost center and tax ID.
- Publish a vendor onboarding pack: W-8BEN-E, bank letter, company registration, insurance certificate.
- Decide on the destination-market entity in M0, not as an open question.

### 4. No compliance documents or supply-chain traceability, plus unstable US landed cost on repeat orders
**What breaks:** The plan does not mention WRAP, amfori BSCI, SA8000, Sedex, OEKO-TEX, ISO 9001, product liability insurance, or cotton origin. As a buyer I need a social-compliance audit and a chemical-safety certificate before a new factory goes on my approved vendor list, especially an offshore one. For cotton tees and polos I also need a fiber-origin statement, because US forced-labor enforcement now reaches cotton traders. Separately, the plan's DDP quote (line 71) is a point-in-time price. US duty on Pakistani goods has changed several times in 15 months, so my "same reorder" can land at a different price.

**Evidence:**
- WRAP, amfori BSCI and OEKO-TEX Standard 100 are the commonly expected certifications. Corporate uniform sellers say they work only with non-EU factories holding SA8000, BSCI or similar ([Custom Planet certifications](https://www.customplanet.co.uk/pages/certifications), [Alibaba seller guide 2026](https://seller.alibaba.com/blogs/2026/southeast-asia/apparel/business-apparel-cotton-linen-certification-guide-alibaba-b2b), [TÜV WRAP](https://www.tuv.com/germany/de/wrap-zertifizierung.html)). Some of these are seller or marketing pages.
- OEKO-TEX certificates carry a validity date and can be checked through Label Check. Some Pakistani mill certificates found in this search have already lapsed ([OEKO-TEX Label Check](https://www.oeko-tex.com/v/SHHO%20081125), [Coats Pakistan certificate PDF](https://www.coats.com/wp-content/uploads/2025/04/Coats-Pakistan-Lahore-11-63584-20270616.pdf)).
- The UFLPA Entity List was expanded with 26 Chinese cotton traders and warehouses. Counsel warn that shipments can be detained just for passing through these firms ([Kelley Drye](https://s3.amazonaws.com/cdn.kelleydrye.com/content/uploads/pdf-snapshots/fletf-expands-uflpa-entity-list-with-chinese-cotton-traders-what-it-means-for-every-industry-20251022142639.pdf), [Mondaq on Huafu](https://www.mondaq.com/unitedstates/international-trade-investment/1580484/china-based-cotton-companies-added-to-uflpa-entity-list-what-it-means-for-apparel)). I found no Pakistan-specific detention data.
- The US tariff on Pakistan was a 19% reciprocal rate from Aug 2025 ([Dawn](https://www.dawn.com/news/1928371/pakistan-loses-ground-to-rivals-with-new-19pc-us-tariff)). It was reportedly replaced by a 150-day 10% Section 122 surcharge from Feb 24, 2026 ([PolicyRisk PK](https://policyrisk.com/countries/pk)), and possibly by a 10% Section 301 duty from July 2026 ([Dawn](https://www.dawn.com/news/amp/2019588)). These are secondary sources and they conflict.
- De minimis stays suspended for all modes, and a new postal entry process has applied since mid-2026 ([Federal Register 2026-12669](https://www.federalregister.gov/documents/2026/06/24/2026-12669/indefinite-suspension-of-the-de-minimis-exemption-for-mail-shipments-and-new-postal-informal-entry), [KPMG](https://kpmg.com/us/en/taxnewsflash/news/2026/06/cbp-suspends-de-minimis-exemption.html)).

**Opinion:** A supplier that cannot send me a current audit and certificate on day one fails vendor onboarding, no matter how good the 3D editor is. Tariff volatility means I need price-hold terms on reorders, or I cannot budget the program for the year.

**What the plan should change:**
- Add an M0 workstream for WRAP or BSCI audit, OEKO-TEX Standard 100 on the main fabrics, product liability insurance, and a fiber-origin and traceability file for each fabric.
- Expose these as downloadable documents in the company account.
- Quote DDP with an explicit validity window and a tariff-change clause.
- For recurring programs, offer price holds of 90 days or longer.

### 5. No committed lead time, no pre-production sample for bulk, and no stock program for new hires
**What breaks:** The plan promises "a turnaround counted from proof approval" (line 43) but never states a number. It cites OneTeam's 10 business days as the model (line 32). For my use case the clock includes proof rounds, a strike-off if I want color certainty (see #1), production, and air freight with customs from Lahore. The plan does not say whether a pre-production sample is offered for bulk. Fit kits and swatches only go on sale at M5 (line 135). Uniform programs also need small, fast top-ups for new hires and replacements. The plan's answer is a made-to-order unit run from Pakistan each time, with no replenishment stock held in the destination market.

**Evidence:**
- Custom Ink's standard delivery is free and guaranteed in about 2 weeks, with faster rush options ([Custom Ink delivery options](https://www.customink.com/help_center/delivery-options)).
- Supplier guides put bulk production at about 30–60 days after sample approval, plus lab dip and strike-off rounds of about 7–14 days each ([Fabrikn lead time guide](https://www.fabrikn.com/blog/how-long-is-apparel-production-lead-time-factory-guide/), [Racklify](https://racklify.com/encyclopedia/lab-dip-versus-strike-off-when-to-use-each-sample-type/)).
- Some corporate apparel buyers require a pre-production sample that matches the PO before bulk goes ahead ([Shanghai Garment](https://shanghaigarment.com/?p=53260), vendor source).
- Corporate merch platforms warehouse your stock and fulfill on demand, including same-day ship from inventory ([SwagUp storage and fulfillment](https://support.swagup.com/en/articles/9086558-how-does-storage-and-fulfillment-work-with-swagup)).
- An AU uniform supplier keeps your spec and fills reorders at short notice for new starters ([Melbourne Merch](https://melbournemerch.com.au/corporate-workwear)).

**Opinion:** I can plan a 4–6 week launch order. I cannot have a new hire wait 3–4 weeks for one polo, or get one that looks different (see #1). On-time rate is only an "analytics" metric (line 106). It needs to be a published SLA with a remedy.

**What the plan should change:**
- Publish a lead-time table by method and quantity, counted from proof approval through to delivered at the destination.
- Offer a paid pre-production sample step for orders above N units.
- Sell fit kits before the first B2B order, not at M5.
- Design an optional "stock program": the company pre-buys a size run made from the same lot, held at a 3PL in the destination market, and new hires draw from it.
- Attach a credit or remake remedy to missed delivery dates.

## Features I'd need before signing (max 5)

1. **Locked brand spec per account.** Pantone and thread codes, locked logo files, placement, pinned garment, fabric and decoration method, and a stored production recipe with lot IDs, all reused automatically on every reorder. It must never auto-snap or re-route without my approval.
2. **Physical approval before bulk.** A strike-off or pre-production sample, plus a swatch, approved before the deposit, with a written ΔE tolerance and a remake guarantee if bulk falls outside it.
3. **Company account with controls.** Multiple users with requester, approver and finance roles; per-employee or department allowances; an approval chain; SSO or domain-restricted sign-up; a saved employee size roster; CSV export of orders and invoices. The Medusa [b2b-starter](https://github.com/medusajs/b2b-starter) already covers spending limits and approvals.
4. **Net 30 invoicing on PO after the first order.** Invoices carrying PO number and cost center, payable by local bank transfer in my currency (needs a destination-market entity or collection account), and a ready vendor pack: W-8BEN-E, bank letter, insurance certificate.
5. **Compliance and lead-time documents on file.** A current WRAP or BSCI audit, valid OEKO-TEX certificates, a fiber-origin statement, a published lead-time SLA, and DDP quotes with a stated validity period and tariff clause.

## Is this segment worth targeting in year one? Yes/No and why

**No.** Take one or two friendly company accounts in the M5 pilot as design partners, but do not market to companies in year one.

**Evidence:**
- Corporate buyers compare you to vendors that already offer PO and net-30 payment ([Custom Ink](https://www.CustomInk.com/help_center/using-purchase-order)), employee stores ([Custom Ink for Business](https://www.customink.com/audience/business/ci-for-business)), budgets and SSO ([Axomo](https://axomo.com/pricing/)), and warehousing ([SwagUp](https://support.swagup.com/en/articles/9086558-how-does-storage-and-fulfillment-work-with-swagup)).
- They also expect certifications the plan never mentions ([Custom Planet](https://www.customplanet.co.uk/pages/certifications)).
- The payment rails from US and EU buyers into Pakistan are still unresolved ([WorldFirst](https://www.worldfirst.com/sasia/?p=52075)), and US duty on Pakistani goods keeps changing ([PolicyRisk PK](https://policyrisk.com/countries/pk)).

**Opinion:**
- **The plan's differentiator does not help this buyer.** The 3D editor and design-from-scratch flow (line 14) are low value to me. I bring a finished logo and want the same polo every time.
- **The plan's architecture hurts this buyer.** Routing by quantity and snapping colors (lines 13 and 40) work against the one thing I care about most, which is identical color across reorders.
- **Getting B2B-ready costs a year-one budget.** It needs certifications, net-terms credit risk, a destination-market entity, a stock program and approval workflows, on top of a 24-week build that already has no slack.
- **Other segments fit year one better.** Teams, clubs and small brands tolerate prepayment and use the editor. They would also build the color-consistency and reorder machinery that companies need later.
- **Revisit after it is proven.** Bring companies back in year two once reorder color drift has been measured below a published ΔE across real reorders, and net 30 is backed by a destination-market entity.
