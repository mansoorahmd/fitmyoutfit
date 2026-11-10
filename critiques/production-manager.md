## Top 5 operational failures (ranked)

### 1. Singles and bulk share one floor, and the router ignores the sewing line, fabric and load

**What breaks on the floor.** The plan routes "by quantity and design" (plan.md lines 13, 76, 132). It sends singles to "DTF or DTG, ganged onto shared print sheets." That rule fails for the hero product. A sublimated all-over jersey cannot be made by DTF or DTG. It has to be printed on a roll, pressed through the calender, cut and sewn, even when the order is one piece. Printing is not the expensive part of a single, because panels can be nested on a shared roll. Sewing is. A line balanced for a 300-piece run of one style cannot take in 40 singles spread over 3 styles, 8 sizes and different trims without stopping to re-thread and re-sequence work. Every single sublimated jersey becomes a disruption to the bulk run.

There are three more problems:
- **DTG on polyester jerseys.** DTG is listed as a singles method, but polyester performance jerseys are a poor substrate for it.
- **DTF on dyed polyester.** Dye migrates up through the print unless blocker powder or blocker transfers are used.
- **Method mixing within one order.** A team order of 18 jerseys plus 3 late DTF "fan tees" now needs two methods, two queues and one ship date. Nothing in the plan joins them back together.

**Evidence:**
- DTG on polyester gives lower brightness and has dye-migration problems with no "silver bullet" ([Graphics Pro, "The difference a pretreat makes"](https://graphics-pro.com/feature/the-difference-a-pretreat-makes/); [Impressions, "Beyond the DTG printer"](https://impressionsmagazine.com/process-technique/beyond-the-dtg-printer/22379/)).
- Vendors sell dedicated anti-migration DTF powders and blocker transfers for sportswear polyester ([Supacolor Blocker](https://supacolor.com/blogs/supablog/supacolor-blocker-the-best-heat-transfer-for-sportswear); [Hanrun anti-sublimation powder, Texintel](https://texintel.com/press-room/hanrun-06-26-p-hanrun-paper-introduces-anti-sublimation-dtf-powder-to-eliminate-dye-migration-in-sportswear-printing)).
- Fixed setup costs per method are real:
  - Screen print: about $15–25 per screen per colour, with typical minimums of 24–48 pieces ([Printable Press pricing guide](https://www.printablepress.com/how-to-price-screen-printing-jobs/); [Fabrikn minimums](https://www.fabrikn.com/blog/custom-screen-printing-order-minimums-usa/)).
  - Embroidery digitizing: $10–75 per design, plus extra labour per colour change ([Magnetic Hoop pricing guide](https://www.magnetichoop.com/blogs/news/how-much-does-embroidery-cost-a-complete-pricing-guide)).
  - These are US vendor figures. Lahore costs will be lower, but the structure is the same.
- Vendor figures put the DTF versus screen-print crossover anywhere from about 24 to 100 pieces ([Gelato, DTF vs DTG vs screen](https://www.gelato.com/connect/article/dtf-vs-dtg-vs-screen-printing); [YoPrint, DTG vs DTF](https://www.yoprint.com/blog/dtg-vs-dtf-printing-which-should-you-consider)). One fixed "break-even quantity" will be wrong for many designs.

**Experience-based opinion.** If singles and bulk share one line, either bulk on-time delivery or singles turnaround fails within the first busy month.

**What the plan should change:**
- Route by four inputs, not just quantity:
  - product type and fabric
  - method compatibility (sublimated jersey means sublimation only, whatever the quantity)
  - current load at each work centre
  - the cost of a sewing changeover
- Set up a separate modular "singles cell" of 3–5 multi-skilled operators who make whole garments from start to finish, so singles never enter the bulk lines.
- Make the method-by-product matrix a decision in M0, and record DTG-on-polyester as excluded.
- Add blocker powder or blocker transfers as a required material for any DTF on polyester.
- In M2, price single sublimated jerseys on their real cost: roll space plus cut-and-sew labour plus one-off handling.

### 2. Colour drifts between batches, fabric lots, methods and reruns. "Print-tested palette" is a one-time test, not a control system

**What breaks on the floor.** M0's exit criterion is "Test prints match the palette" (plan.md line 130). That is true on the day of the test only. Sublimation colour changes with:
- fabric lot and coating
- paper lot
- ink batch
- calender temperature, dwell time and pressure
- humidity

Four situations will produce complaints:
- **Group-order stragglers.** A team's late add-on players, printed three weeks later on a new fabric lot, come out a visibly different red from the first batch. Group-order stragglers are built into M3.
- **Brand reruns.** Small brands are promised "consistent color across reruns" (plan.md line 54). Nothing records which profile, recipe or lot made the first run.
- **Cross-method matching.** The same brick-red logo produced in sublimation, DTF, screen ink and embroidery thread gives four different reds. The plan has one palette with HEX snapping.
- **Swatch cards.** The risk mitigation is a swatch card in every first order (plan.md line 145). That card was printed on some other lot, so it becomes evidence in a "you're wrong" dispute instead of preventing one.

**Evidence:**
- Generic ICC profiles fail for dye-sub. Only custom profiles built for each media and recipe are repeatable, and the press recipe should be archived with each profile ([Mutoh technical note](https://support.mutoh.eu/support/solutions/articles/14000160513-dye-sublimation-generic-icc-profiles-)).
- The start of a batch can print a different colour from later batches. The result depends on paper, substrate, press, temperature and time ([BCH Technologies, "About ICC Profile"](https://bchtechnologies.com/blogs/blog/about-icc-profile)).
- Any change in paper characteristics needs a new profile, and stretch fabric makes colour readings unreliable ([Printing United Journal](https://digitaleditions.napco.com/article/Achieving+Color+Consistency+in+Textiles/4112949/721183/article.html)).
- Temperature and dwell time measurably change ΔE across synthetic fabrics ([Clemson thesis](https://open.clemson.edu/all_theses/4414)).
- DTF film lots also vary in coating and gamut ([EazyDTF](https://eazydtf.com/blogs/blog/how-to-maintain-print-quality-across-dtf-media-batches)).

**What the plan should change:**
- Keep a palette per method: sublimation, DTF, ink spec and thread chart. Each customer colour maps to a value for each method, and the proof shows the method-specific swatch.
- Put a version on every profile. Each production job stores the profile ID, press recipe and fabric, paper and ink lot.
- Print a control strip on every roll and measure it with a spectrophotometer against a ΔE tolerance before cutting starts.
- Reserve fabric from one lot for each brand customer's reruns, or re-qualify the new lot against the stored first-run reference.
- Send straggler and remake pieces to the same lot and profile where possible, and flag them when that isn't possible.

### 3. Sublimation geometry is wrong: shrinkage, image shift, cutting registration and graded art placement are missing from M4

**What breaks on the floor.** M4 lists "graded panels per size" and "mirrored sublimation files with bleed and color profile" (plan.md line 134). It leaves out four things:
- **Shrinkage.** Polyester shrinks in the calender, and not equally in warp and weft. Panels printed at pattern size come out undersized, so a "garment-measurement" size chart (plan.md line 41) is wrong from the first order. This is the same "runs two sizes small" failure the plan cites against competitors.
- **Image shift.** Printed graphics move during transfer. Cutting a printed roll by hand misaligns panel graphics at the seams, and stripes break across the side seams.
- **Cutting registration.** Nothing says how a printed roll is cut. That means a vision or laser cutter that needs fiducial marks and a cut file that matches the nest, or hand-cutting along printed lines.
- **Graded art placement.** Numbers and names often have fixed heights, while logos may scale. Nothing defines per size which art scales, which stays fixed and where it anchors. An XS jersey with an adult-size number wraps the number into the side seam.

**Evidence:**
- Sublimation graphics "may shift up to 2 inches when printed," so bleed and safe areas are required, and front-to-back alignment cannot be perfect ([Wooter, pattern making for sublimated sportswear](https://wooter.com/articles/?p=19180)).
- Heat transfer shrinks fabric "in a non-proportional manner," and one patent applies an adjustment factor to the graphic and the registration marks ([US9121120B2](https://patents.google.com/patent/US9121120)).
- Shrinkage has to be measured warp and weft on your own fabric, and the pattern allowance set from that test ([US6947807B2, pattern pre-shrink compensation](https://patents.google.com/patent/US6947807)).
- The tolerance rule of thumb is about ±2 cm, and about ±1 cm for knit tops ([NIMI Sewing Technology manual](https://nimi.co.in/cits_ebooks/Sewing_Technology/Sewing_Technology_Trade_Practical_Volume_2/files/basic-html/page150.html); [Alibaba seller tolerance guide](https://seller.alibaba.com/blogs/2026/southeast-asia/apparel/standard-tolerance-garment-manufacturing-guide-alibaba-b2b)). Shrinkage error plus sewing tolerance can easily take a garment past half a size.
- I found no published shrinkage percentage for jersey fabric. That supports the case for testing in-house.

**What the plan should change:**
- In M0, add a shrinkage test for each fabric: measure warp and weft at the production recipe.
- In M4, store a scale factor per fabric and per recipe and apply it to the panels automatically.
- Add rules for art anchoring and scaling per size, checked against league number-height rules where they apply.
- Output cut files with fiducial marks for the actual cutter.
- Make the size chart "measured on finished, pressed and sewn garments," with a tolerance for each point of measure.
- Add a re-measure step when the fabric lot changes.

### 4. Per-piece tracking, QC and remakes are thin, and remakes are pushed to "soon after launch"

**What breaks on the floor.** "Per-piece tag and QC scan against the order" (plan.md line 134) hides several problems:
- **Panels have no ID.** A sublimated jersey is 6–10 panels that separate when cut. If each panel's ID is not printed in its seam allowance or bleed, a bundle gets mixed up and a #7 front gets sewn to a #12 back.
- **Transfers have no ID.** DTF gang sheets produce dozens of loose transfers. Someone has to match each one to the right blank in the right size and colour. With no ID on each transfer, sorting is where singles go wrong.
- **A barcode scan doesn't check the print.** It confirms that the piece ID matches the order, not that "SMITH 7" is spelled correctly or that the number is present. That is the exact failure the plan cites at Jersey Teams World. Checking the print needs a camera image compared with the proof, or a human check against the proof image at the pack station.
- **"Status fed by factory stages" depends on scanning.** It needs a scan at every station, every time, by people paid around the Rs40,000 monthly minimum. Those scans happen only if a station design, devices and supervision make them happen.
- **Remakes have no lane.** The claim flow is deferred to "soon after launch" (plan.md line 102). The pilot will generate remakes from week one. A remake is the most expensive kind of single: one piece that has to match the original lot and colour and catch up to a ship date. With no remake lane it either waits for a batch or interrupts a bulk run.
- **The exit criterion is too weak.** M4's exit is "first real order printed, cut, sewn and packed from system files alone." One order proves nothing about mixed-order tracking.

**Evidence:**
- Punjab's unskilled minimum wage is Rs40,000 per month for 26 working days ([ProPakistani](https://propakistani.pk/2025/09/10/punjab-increases-minimum-wage-to-rs-40000/); [Dawn](https://www.dawn.com/news/1940817)).
- Reporting finds weak compliance, which points to a lean-staffing culture where extra steps get skipped ([Express Tribune](https://tribune.com.pk/story/2583083/workers-remain-deprived-of-minimum-wage-1)).
- The rest is experience-based opinion.

**What the plan should change:**
- Move remakes and claims with reason codes to "Must for launch."
- Create a remake priority lane that reuses the original files, profile and lot, linked to the original piece ID.
- Print machine-readable IDs on every panel and every DTF transfer.
- Do 100% QC on personalised pieces with an image compared against the proof. Use AQL sampling on non-personalised bulk.
- Rewrite M4's exit criterion: one full shift of mixed work (for example 40 singles, 3 roster team orders, 1 brand rerun and 1 remake) runs with zero manual file edits, and every piece reaches the pack scan with stage timestamps.

### 5. There is no capacity model, no peak-season plan and no plan for power or internet loss

**What breaks on the floor.** Customers are promised "a turnaround counted from proof approval" and "a firm delivery date" (plan.md lines 32, 43, 51). Nothing calculates that date from queue load, and work centres have no capacity limits. Group orders close on organiser deadlines, so they arrive in clusters: season starts, school terms, tournaments and holiday gifts all land together. Five teams closing in the same week overload sublimation and sewing, and every "firm date" slips together. Those slipped dates are the "delays with no updates" pain the plan says it fixes.

Power is a second risk. Lahore's power and gas supply can drop out:
- A calender stopping mid-roll ruins the roll.
- An idle DTF printer clogs its white-ink channel.
- A cloud-only production system with no internet stops every scan station.

**Evidence:**
- Teamwear sellers advise ordering 6–8 weeks before the first game and warn that production backlogs stretch turnaround in busy seasons ([USA Teamwear checklist](https://usateamwear.com/team-gear-ordering-checklist-on-time-delivery/); [Wooter ordering guide](https://wooter.com/articles/team-uniform-ordering-guide-deadlines-sizes-and-quantities/)).
- Pakistani textile units have a long record of gas cuts to captive power plants and load-shedding, and Punjab holds about 70% of the industry ([Profit / Pakistan Today](https://profit.pakistantoday.com.pk/?p=175091); [Dawn](https://www.dawn.com/news/1099300/no-gas-punjab-textile-units-on-verge-of-closure)). I could not confirm the current 2026 outage level, so treat this as a known risk, not a measured one.
- White DTF ink settles and clogs the head if the printer sits idle for a day ([BCH Technologies](https://bchtechnologies.com/blogs/news/how-to-prevent-white-ink-damper-bursts-and-maintain-your-dtf-printer)).

**What the plan should change:**
- Build a capacity calendar per work centre (sublimation print, calender, cutting, sewing by style, DTF, embroidery heads, screen, QC and pack).
- Calculate the promise date from that calendar at checkout and at proof approval.
- Cap or surcharge rush orders and close a week's intake once capacity is sold.
- Sign an overflow partner for each method before peak season.
- Put UPS and generator power on the calender and printers.
- Make the floor software work offline, with printed barcode travellers as the fallback.
- Add a peak-season test to M5. A pilot in weeks 17–20 will not include a peak.

## Hidden costs the plan doesn't mention

**People. The plan budgets about 8, and the floor needs about 30–45.** The plan counts about 7 builders plus one production coordinator from M4 (plan.md line 140). It assumes production people already exist without counting them.

The graphic designer is expected to do four jobs: the template library, the design-for-me queue, human artwork review of every order, and logo/IP review. Custom Ink reviews every design with artists, plural.

The pattern maker is expected to cover:
- grading 3 products
- shrink compensation
- art anchoring rules
- hoodies and polos next

Experience-based estimate for one shift running all four methods in-house:

| Role | People |
| --- | --- |
| Prepress / RIP and colour technician | 1–2 |
| Sublimation print and calender | 2 |
| Cutting | 2 |
| DTF print, powder and press, plus transfer sorting | 2–3 |
| Embroidery digitizer | 1 (or outsourced) |
| Embroidery machine operators | 1–2 |
| Screen room (if in-house) | 3–4 |
| Sewing (bulk lines plus singles cell) | 12–25 |
| QC and measurement | 2–3 |
| Packing, dispatch and customs paperwork | 2–3 |
| Floor supervisor or planner | 1 |
| Claims and remakes customer support | 1 |

That is about 30–45 people before peak season, each paid at least about Rs40,000 a month ([ProPakistani](https://propakistani.pk/2025/09/10/punjab-increases-minimum-wage-to-rs-40000/)).

**Other costs not in the plan:**
- **Colour control.** A spectrophotometer, profiling software, test charts printed for each fabric, paper or ink lot, a control strip on every roll, and humidity control. Mutoh recommends 40–60% RH ([Mutoh](https://support.mutoh.eu/support/solutions/articles/14000160513-dye-sublimation-generic-icc-profiles-)).
- **DTF upkeep.** White-ink circulation and daily nozzle purges even on slow days. Printheads cost $900 or more to replace ([BCH Technologies](https://bchtechnologies.com/blogs/questions-and-answers/how-to-prevent-and-fix-clogged-printheads-in-dtf-printers-maintenance-tips-that-work)).
- **Blocker powder or transfers** for DTF on polyester ([Supacolor](https://supacolor.com/blogs/supablog/supacolor-blocker-the-best-heat-transfer-for-sportswear)).
- **Nesting waste.** Waste on gang sheets and rolls is never zero. Vendor figures are about 71% sheet usage for manual nesting, 78–82% for bounding-box RIP nesters, and 85–95% for shape-aware nesting ([DTFGSA, reduce film waste](https://dtfgangsheetapp.pages.dev/blog/reduce-dtf-film-waste)). Small batches of singles nest worst.
- **Waiting to fill a sheet.** Ganging needs enough orders to fill a sheet or roll. Holding singles to fill one works against the "fast delivery" promise, and running half-empty sheets raises cost per piece.
- **Calender losses.** Roll start-up and leader waste, warm-up energy, and paper that matches the fabric type. Stretch jersey needs tacky or adhesive paper, which costs more than universal paper ([Epson DS Transfer](https://epson.com.au/products/ink-and-paper/13923)).
- **Setup and changeover.** Embroidery digitizing for each logo ([Magnetic Hoop](https://www.magnetichoop.com/blogs/news/how-much-does-embroidery-cost-a-complete-pricing-guide)), screens, film positives and press-up for each colour ([Printable Press](https://www.printablepress.com/how-to-price-screen-printing-jobs/)), and sewing changeovers between styles and trims. None of these appear as a cost line in the plan.
- **Fabric commitments (experience-based opinion).** Mills set minimum orders per fabric and colour, which ties up cash before any deposit arrives. Reserving fabric for each brand's reruns adds more.
- **Blank stock for DTF singles (experience-based opinion).** It needs every size in every colour on the shelf, and dead stock builds up.
- **Overs and spoilage (experience-based opinion).** Bulk runs need a few percent extra for misprints and defects, and personalised pieces cannot be resold.
- **Remakes on export orders.** These are a second production slot, air freight, and, under the plan's own de minimis claim (line 71), another duty-paid entry for the replacement parcel.
- **Tracking hardware.** Label and tag printers, handheld scanners or tablets at each station, a pack-station camera, and network and UPS at each station.
- **Power backup.** Generator diesel and UPS for the calender and printers ([Dawn on outages](https://www.dawn.com/news/1099300/no-gas-punjab-textile-units-on-verge-of-closure)).
- **Ship-to-each costs.** Individual polybags, packing slips and a customs invoice and HS line for each parcel.
- **Physical product overhead.** Fit kits and swatch cards are physical products. They need their own production run, stock and refresh whenever the fabric lot changes.

## What M4 (Production link) must include that it currently doesn't

1. **A job packet per work order in a fixed format.**
   - A machine-readable manifest (JSON) plus a printable PDF traveller with barcodes for each bundle and piece.
   - The manifest holds: order and piece IDs, product, fabric, size, roster line, method, due date, priority, and proof version or hash.
   - The traveller has to work with no screen and no internet.
2. **Print-ready output for each method, in the format each machine actually takes:**
   - **Sublimation:** nested roll files at the RIP's native resolution and roll width. Each file carries the profile ID and press recipe, a control strip, fiducial or registration marks, and a cut file that matches the nest in the cutter's format (DXF/AAMA, not raw SVG).
   - **DTF:** gang sheets at the printer's film width with a transparent background, white-underbase settings and a small ID on each transfer.
   - **Embroidery:** a digitizing step that produces DST/EMB files, a thread chart mapped from the palette, and hoop size and placement. The plan has no digitizing step at all.
   - **Screen print:** separations, film positives and ink specifications.
   - **Outsourced methods:** the same packet, ready for a partner factory. Which methods go to partners is still an open decision.
3. **Geometry rules.** Shrink compensation per fabric and recipe, per-size art anchoring and scaling, safe areas and bleed for about 2 inches of image shift ([Wooter](https://wooter.com/articles/?p=19180)), and a panel ID printed in the seam allowance of every panel.
4. **Lot and recipe traceability per piece.** Fabric lot, paper, film and ink lots, profile version, press recipe, machine, operator and time, stored so that reruns, stragglers and remakes can match the original.
5. **Scheduling and capacity.** Queues per work centre, batching windows for gang sheets and rolls, nesting by fabric type and profile, sewing grouped by style and trim, a separate singles cell, a remake priority lane, hold and release controls, overflow routing to partners, and a promise date calculated from load and returned to checkout.
6. **Change control.** Freeze the order at proof approval. Version every file. Define what happens when a roster line changes or an order is cancelled after printing but before sewing, and make sure an old file version cannot reach the floor.
7. **A QC specification per size.** A measurement table per point of measure with tolerances (about ±1–2 cm; [NIMI](https://nimi.co.in/cits_ebooks/Sewing_Technology/Sewing_Technology_Trade_Practical_Volume_2/files/basic-html/page150.html)), checked on finished garments and re-checked when the lot changes. 100% QC on personalised pieces with an image compared against the proof, and AQL sampling for plain bulk. A photo at the pack station is stored with the order for disputes.
8. **Colour QC gate.** The roll's control strip is measured and its ΔE recorded before the roll is released to cutting.
9. **Bundle tickets, cut lists by size and lot, a trim and label list** (size labels, brand labels, hangtags), and packing lists per recipient for ship-to-each, including the per-parcel customs data.
10. **Remakes and claims, moved from "soon after" to M4 scope.** Reason codes tied to a station, operator and lot, a remake that reuses the original files and lot, and links back to the original piece.
11. **Exception events.** Machine down, fabric short, colour fail, or a piece lost at a station. Each event needs automatic rerouting or an alert, and an honest customer-facing status, not a frozen "In production."
12. **Offline and resilience mode.** Local print servers and queues, printed travellers, and scans synced later.
13. **A stronger exit criterion.** One full shift of mixed work (singles, roster team orders, a brand rerun and a remake) produced from system files with zero manual edits. Measured size tolerance and ΔE must be within spec, every piece must scan at every stage, and the shift must be run by the real floor crew rather than the developers.
