# 06 Design editor: interface specification

12 Nov 2026 · storefront-designer · Task E-UX.

This file specifies the interface of the 3D design editor (`packages/editor`), for phone and desktop. It follows direction A, "Matchday" ([03-direction.md](03-direction.md)) and the shared parts in [05-m1-pages.md](05-m1-pages.md) sections 2 and 10, so the editor feels like the same store. E3 is built to it. Nothing here adds a price, a time, a guarantee or a minimum: places that need one say **copy from founders**, and every new sentence is a draft, collected in [section 14](#14-draft-wording-founders-to-confirm).

**How to read this file.** Section 0 says what "easier, more dynamic, more modern" mean, as checks. Section 1 is the research. Section 2 is the editor today. Sections 3 to 11 are the design, from the layout down to the states. Sections 12 and 13 are the look and the components. Section 14 is the wording, section 15 the build order with the E3 checklist and what the engine must add, section 16 the open questions, section 17 the sources.

Contents:
0. [The founder's three words, made checkable](#0-the-founders-three-words-made-checkable)
1. [Research](#1-research)
2. [The editor today](#2-the-editor-today)
3. [Layout and navigation](#3-layout-and-navigation)
4. [The tools, in the order a coach uses them](#4-the-tools-in-the-order-a-coach-uses-them)
5. [Direct manipulation on the model](#5-direct-manipulation-on-the-model)
6. [View controls and the camera](#6-view-controls-and-the-camera)
7. [First run and guidance](#7-first-run-and-guidance)
8. [Roster preview (E4) and proof (E5)](#8-roster-preview-e4-and-proof-e5)
9. [Saving, sharing, price and "Add to team order"](#9-saving-sharing-price-and-add-to-team-order)
10. [States and errors](#10-states-and-errors)
11. [Right-to-left text, accessibility and performance](#11-right-to-left-text-accessibility-and-performance)
12. [Visual design and tokens](#12-visual-design-and-tokens)
13. [Components](#13-components)
14. [Draft wording, founders to confirm](#14-draft-wording-founders-to-confirm)
15. [Build order, the E3 checklist, and what the engine must add](#15-build-order-the-e3-checklist-and-what-the-engine-must-add)
16. [Open questions](#16-open-questions)
17. [Sources](#17-sources)

---

## Summary for the founder

**What I found.** Spized's configurator is rich: over 700 templates, standard print positions, outlines behind names, guide lines while placing, a mirror for sleeves, a per-player preview, sharing by WhatsApp, a designer check. But it is built for a desk. On a phone its own page says "It's more fun on the desktop!" with a "Switch to desktop" button, and its help centre recommends "a laptop or PC rather than a smartphone". Our coaches are mostly on phones. That is where we can be clearly better.

**What I recommend.**
- **Phone first.** On a phone the garment fills the screen. Six tools sit in a bar at the bottom: Design, Colours, Team, Players, Logos, Text. A tool opens as a short panel from the bottom, and the garment moves up so it is never hidden. On a computer the same six tools sit in a column on the left, with their panel beside it.
- **Start from the team, not from a blank shirt.** The first screen asks for two things: the team's colours and the team name. Every design in the gallery then shows in those colours with that name, and trying one is a single tap on the 3D model. The name, logo and colours stay when you switch designs.
- **Names and numbers are not text boxes.** The coach chooses a style (font, colour, outline) and where they go (back, front, sleeve). The values come from each player. Until the roster preview exists (E4), the coach previews with one sample player.
- **Work on the model.** Tap something to select it, drag to move it, use corner handles to resize and turn it, and it snaps to the centre line and the usual print positions. The camera turns by itself to the part you are editing: to the back for numbers, to the sleeve for a sleeve logo.
- **Light grey stage, navy frame.** The store's navy header carries over, the stage behind the shirt is a light studio grey that darkens slightly for white kits, and there is one red button: "Done".

**Your choices** (details in section 16):
1. Split E3 into two steps (layout, templates and colours first; then handles and logos), as I recommend, or build it as one.
2. Patterns and gradients: not in E3. Templates can carry simple stripes, hoops and sashes in E3. A pattern library and gradients come later, and only for printed (sublimated) products. Or bring them forward.
3. Logo background removal: not in E3. Offer the free design help instead (wording from you), and test a "remove plain background" tool later.
4. What the editor shows before team orders and accounts exist: a design saved on the phone itself, and a "Done" button that returns to the product page. No share link yet.

---

## 0. The founder's three words, made checkable

The founder asked for an editor that is "more easy and dynamic and modern" than Spized's. These are the tests, and every one can be checked in a screenshot, a timer or a user test. Each is tied to evidence from section 1, or marked as opinion.

### Easier

| # | Check | How it is checked | Basis |
| --- | --- | --- | --- |
| EZ1 | Every tool works on a 360 × 640 phone. Nothing tells the customer to switch to a computer | Screenshots at 360 and 390 px, every tool open | Spized shows "It's more fun on the desktop!" on phones and its help recommends a PC (1.1) |
| EZ2 | A first-time coach gets from opening the editor to a kit with team colours, team name, a logo and a sample player's name and number in **under 2 minutes**, without help | Timed user test, 5 coaches, median | Plan's success line; NN/g: users skip tutorials (1.6) |
| EZ3 | No control asks for millimetres, degrees, "layer", "piece", "zone", "direction" or a HEX code by default | Read every label in section 14 | Today's demo does (section 2) |
| EZ4 | Any main task is at most 3 taps from the editor's resting state (change a colour: Colours, zone, swatch) | Count taps per task in section 4 | Opinion |
| EZ5 | Names and numbers are set once as a style, never typed per shirt in the editor | Section 4.5 | Spized prints the "Text" field "unchanged on every jersey" and keeps players in a separate list (1.1) |

### More dynamic

| # | Check | How it is checked | Basis |
| --- | --- | --- | --- |
| DY1 | A tap on a swatch, a template or a toggle shows on the 3D model within **100 ms** (p75 on a mid-range Android phone) | Performance trace (E5 measures it; E3 logs it) | web.dev: up to 200 ms is "good" responsiveness (1.6); 100 ms is our stricter target (opinion) |
| DY2 | Templates are tried **on the 3D model, in the team's colours and with the team name**, not shown as generic pictures | Screenshot of the gallery after the start card | Opinion. I could not see how Spized's gallery shows its templates (1.1) |
| DY3 | The camera turns by itself to what is being edited (back for numbers, side for sleeves), in 300 to 400 ms, and never while the customer is touching the model | Screen recording | NN/g durations (1.6) |
| DY4 | Opening a tool never covers the garment: the garment moves into the space left above the panel | Screenshots with each tool open | NN/g: bottom sheets "obscure some of the screen" (1.6) |
| DY5 | Feedback is live while dragging, resizing and typing; there is no "Apply" button anywhere | Read section 4 | Opinion |

### More modern

| # | Check | How it is checked | Basis |
| --- | --- | --- | --- |
| MO1 | Direct manipulation on the model: select, move, resize and turn with handles; snapping to the centre line and print positions with a visible guide | Screen recording at 390 and 1366 px | Spized shows guide lines while placing (1.1); NN/g on direct manipulation (1.6) |
| MO2 | Contextual tools: only the tool in use is open; options belong to the selected thing | Screenshots | Opinion |
| MO3 | Motion is 150 to 300 ms, never decorative, and turned off with reduced motion | CSS review, `prefers-reduced-motion` test | NN/g, MDN (1.6) |
| MO4 | The garment keeps at least **45% of the screen height** on a phone in portrait whenever a tool is at its normal height | Screenshot measurement at 360 × 640 | Opinion |
| MO5 | It looks like our store: navy frame, Barlow Condensed headings, Inter controls, one red button | Side-by-side screenshot with the product page | 03-direction |

---

## 1. Research

All sources were opened on **12 Nov 2026** with a web-fetch tool, which returns a page's text and structure, not a picture.

**The limit, stated plainly.** I did not open any competitor's configurator in a browser. The brief forbids imitating a browser against other sites, and the configurators are JavaScript applications, so a fetch returns their text strings but not their layout. **I have not seen how Spized's or owayo's configurator looks on a phone or a desktop.** What follows is what their pages, help centres and product texts say. The founder has seen Spized's configurator; where this file says "not seen", his eye is better evidence than mine. Screenshots of other companies' sites are not in this repository (brief rule); only links.

### 1.1 Spized (the founder's reference)

**Evidence: what the configurator's own text contains.** Fetched from the Rio men's football jersey configurator page ([configurator URL](https://www.spized.com/en/configurator?apiLikeCfgId=4e887d7fd399dbef91bcf27e38d3aef6ee61b30cb98e64be05ec5af40c0f48ba800ea68682e76efe09253a9ac19e18c7d87eadcaca744059d25495ca8a53aca4&apiArticle=781001-V2&productNumber=781001-V2.SPIZED0026)). Read as text, not seen:
- Top-level actions: "Add product", "Add women jersey", "Add men jersey", "Infos", "Share design", "Duplicate", "Save", "Switch to desktop", "View", "Edit", "Preview names & numbers", "Tutorial"; then "Finish configuration", "Save", "Continue"; "Add from draft".
- Drafts: a "Name of your draft" field (0/50); a guest prompt "Don't lose your work" with "Sign in" and "Create free account"; errors "Failed to save configuration" and "Oops, something went wrong there" with "Reload".
- Price inside the configurator: "Unit price for 10 pcs.: €41.90 €38.10", "Unit price for 1 pc.: €57.90", a "-28 %" quantity badge, a "-9 %" promotion, and a countdown "Discount guaranteed until 15 Nov 2026, 23:55 (Europe/Berlin)"; a quantity selector "Adjust quantity".
- Team list: a table with "Row", "Size" ("Which one fits?"), "Player Name", "Number", "Initials", "Quantity", "Edit", and "Add line".
- "Start voting" ("Can't you decide?"), "Design-Check: Our graphic designers review every design!", and a share dialog with "Copy link", "Facebook", "WhatsApp", "E-Mail".
- **On phones:** "It's more fun on the desktop!" with "More speed, creativity and easy access to all functions of our configurator." and a "Switch to desktop" button.

**Evidence: how Spized describes the design process** ([design process](https://www.spized.com/en/design-process)):
- Eight steps: design selection, base colour, pattern, colour gradient, number and name, text, logo, preview.
- Patterns are applied to several areas; "a click on the front transfers it to the other areas" (paraphrase of the page).
- Names and numbers: font, placement, colour and outline; a default position "in the left column or a click on the jersey", with a "center" option; an outline is recommended when the text colour is close to the jersey colour.
- "The text you enter here will be printed unchanged on every jersey."
- Logos: several "at no extra cost". Preview: "Enter size, name, and number to see how the jersey will look."
- Tips: no trademarked sports-brand logos; no graphics over seams; neon colours can't be reproduced by sublimation.

**Evidence: Spized's help centre** ([category index](https://spized.zendesk.com/hc/de/categories/18196091786397-Hilfe-im-Designprozess)):
- "We recommend using the 3D configurator on a laptop or PC rather than a smartphone"; try another browser ("We highly recommend Google Chrome"); clear the cache ([configurator isn't working](https://spized.zendesk.com/hc/en-gb/articles/37608008379421-The-3D-configurator-isn-t-working-what-can-I-do)).
- Default positions are offered the first time an element is placed, can be chosen later in "the left-hand window", and are not binding: the element can be moved anywhere ([default positions](https://spized.zendesk.com/hc/de/articles/22284464981661-Was-sind-Standardpositionen-und-wie-funktionieren-sie)).
- Names, numbers and initials can get an outline (adjustable thickness) or a rectangular background, under "Farbe & Hintergrund" ("Colour & background") in the left panel ([stand out from the background](https://spized.zendesk.com/hc/de/articles/22284620533789-Was-kann-ich-tun-damit-sich-Namen-Nummern-und-Textfelder-besser-vom-Hintergrund-abheben)).
- While placing, "guide lines and spacing indicators" appear; a mirror function puts the same logo on both sleeves or side panels ([placing logos and lettering](https://spized.zendesk.com/hc/de/articles/18257690058397-Wie-platziere-ich-meine-Logos-und-Schriftz%C3%BCge-damit-sie-richtig-auf-dem-Trikot-sitzen)).
- The per-player preview: enter size, names and numbers via the "Bearbeiten" ("Edit") button in the navigation bar at the bottom; the preview opens after saving; "Ansehen" ("View") reopens it. The article doesn't say how to move between players ([where to check names](https://spized.zendesk.com/hc/de/articles/22284273994013-Wo-kann-ich-pr%C3%BCfen-wie-die-Namen-Nummern-und-Initialen-die-ich-hinterlegt-habe-auf-meinem-Trikot-aussehen)).
- Logo files: "almost all graphic files" (EPS, PDF, AI, SVG, PNG, JPG, GIF, BMP, TIFF), under 10 MB ([file formats](https://spized.zendesk.com/hc/de/articles/18257124369693-Welche-Dateiformate-kann-ich-f%C3%BCr-Logos-verwenden)).
- Colours are Pantone C; "web colour codes such as RGB or HEX aren't sufficient"; a missing colour is requested by reply to the order email ([missing colours](https://spized.zendesk.com/hc/de/articles/18257794172317-Meine-Wunschfarben-sind-nicht-im-Konfigurator-was-soll-ich-tun)).
- Own patterns need "a little trick": combine shapes from the logo database, or upload a graphic as a logo and stretch it ([own pattern](https://spized.zendesk.com/hc/en-gb/articles/37253902873245-I-can-t-find-a-suitable-pattern-in-the-configurator-can-I-use-my-own-pattern)).
- Templates: "Best Customer Designs" inside the configurator, and a separate "Speed Designer" for "a great layout in just a few steps" ([templates](https://spized.zendesk.com/hc/en-gb/articles/36942964681373-Do-you-have-design-templates)). I couldn't find a public description of the Speed Designer.
- Home page: "Choose from over 700 templates or start from scratch", "The configurator guides you step by step", "Design several versions and share the link with others" ([spized.com/en](https://www.spized.com/en)). The coordinator saw "75 designs / 48 colors" under a product image on 10 Nov ([04-reference-spized.md](04-reference-spized.md)).

**What Spized does well (opinion, from the evidence above):**
- Standard print positions first, free placement second. Keep.
- Outlines for names and numbers, because a navy number on a dark kit can't be read. Keep (section 4.5).
- Guide lines while placing, and a mirror for the second sleeve. Keep (section 5).
- A per-player preview, sharing by WhatsApp, and a designer check. Keep the idea; our roster flow is different (players fill in their own details).
- Many templates. We will have about 10 at launch (dev-plan input), so ours must work harder: shown in the team's colours.

**What is clumsy, or a failure to avoid:**
- **Phones are second-class (evidence).** The page sends phone users to the desktop, and the help recommends a PC, Chrome and clearing the cache. Our coaches are mostly on phones. This is our clearest opening.
- **Too many top-level actions (opinion).** Twelve actions before "Finish configuration" (Add product, Add women jersey, Add men jersey, Infos, Share, Duplicate, Save, Switch to desktop, View, Edit, Preview names & numbers, Tutorial).
- **The player preview is hidden (evidence of the steps; the judgement is opinion).** It sits behind "Edit" in a bottom bar and opens only after saving.
- **Custom colours by email (evidence).** HEX is refused; a missing colour is sent by reply to the order email. We do better: HEX in, nearest print-tested colour out, both shown (section 4.3).
- **Custom patterns by "a trick" (evidence).** We don't offer patterns in E3, so we must not need tricks: templates carry stripes and hoops as recolourable shapes (section 4.4).
- **Sales pressure inside the tool (evidence).** A promotion badge and a countdown sit in the configurator. Direction A already rejects countdowns ([04](04-reference-spized.md)). The editor shows a plain price only.

### 1.2 owayo

**Evidence:**
- The soccer page links to **two configurators**: `konfigurator_html` and `konfigurator_m` (the second appears to be a separate phone version; the page doesn't say) ([owayo soccer](https://www.owayo.com/custom-soccer-jerseys.htm)). The phone version's page returned only its title to the fetch tool, so I could not see it ([konfigurator_m](https://www.owayo.com/konfigurator_m/?lang=en&land=us&sport=football&product=shirts_f3&design=Tackle&color=RDY52043963)).
- "Customize everything - design, colors, logos, numbers and texts"; "numerous designs and over 50 colors"; "create the roster list for your order in our 3D Designer" (same page).
- Colours: "152 radiant shades"; zips and non-printable materials use a smaller palette; a special Pantone, HKS or RAL colour is emailed in and loaded into the account ([owayo colours](https://www.owayo.com/cycling/mydesign-colors-us.htm)).
- Lettering: 35 fonts; "We take care of the placement on the jerseys for you" for team orders; custom fonts on request ([owayo lettering](https://www.owayo.com/cycling/mydesign-lettering-us.htm)).
- Logos: "upload your logo as a pixel graphic (.jpg, .png, .gif)"; place, scale, rotate; a logo pool ("OLOG") whose colours can be changed; an AI logo generator "available to all registered users free of charge" ([owayo logos](https://www.owayo.com/cycling/mydesign-logos-us.htm)).

**For us (opinion):**
- A separate phone configurator suggests owayo also found one layout can't serve both. We build one editor with three layouts (section 3), not two products.
- A smaller palette for some materials is the same idea as our per-product capabilities (section 4.9): the interface must show only what the product and its decoration method can make.
- "We take care of the placement" is a good promise for coaches. Our placement presets do the same in the interface.

### 1.3 Other teamwear builders

**Evidence:**
- **Kukri** (UK): six steps: "Choose your product" (200+), "Choose your design" (200+), "Choose your colours", "Personalise" (logo, name, number), "Kitbag" (edit or add teamwear), "Size and players"; "4 week delivery" ([Kukri kit designer](https://www.kukrisports.co.uk/kit-designer)). The page doesn't say whether it is 3D.
- **Admiral** (UK): design, preview, save in the "Locker Room", share "for internal review" so coaches, players or sponsors can approve, then submit; every design is checked by Admiral's team, which "may change some elements to meet production specifications" ([Admiral Kitbuilder](https://admiralsports.com/pages/kit-builder-design-your-own-admiral-football-kit)).
- **Kitlocker:** the home page returned only its title to the fetch tool. **Not reached** ([kitlocker.com](https://www.kitlocker.com/)).
- **Nike By You:** the public page describes picking a style and adding a "personal ID", with no description of the configurator itself ([Nike By You](https://www.nike.com/nike-by-you)). **Not usable as evidence about the interface.**

**For us (opinion):** the teamwear builders share one order: product, design, colours, personalise, team list. Ours follows it, with one change: the team's colours and name come first, so every design is seen as the team's own (section 7). Admiral's "share for internal review" is the right later step for our share link (section 9).

### 1.4 Creative tools on phones (what "easy" looks like)

**Evidence:**
- **Canva:** its help pages answered "403 Forbidden" to the fetch tool. **Not reached.** I don't cite Canva's behaviour.
- **Adobe Express:** the help page answered 403. A community bug report (16 Dec 2024) says that on mobile "the replace/delete bar blocks the bottom crop handle", so images can't be cropped from the bottom edge; another user said it stopped them finishing projects ([Adobe Community](https://community.adobe.com/bug-reports-328/adobe-express-replace-bar-blocking-the-handle-to-crop-images-1468875)).

**For us (opinion):** a toolbar that appears for a selection must never sit over the selection's handles. Our contextual bar sits at the top of the stage on phones and the camera keeps the selected item in the free area (section 5.2).

### 1.5 Patterns and libraries

**Evidence:**
- The best-known in-browser background remover, `@imgly/background-removal`, is licensed AGPL-3.0: "The software is free for use under the AGPL License" ([GitHub](https://github.com/imgly/background-removal-js)).
- Plain RGB distance does not match perceived colour difference; CIEDE2000 (2001) corrects it; in the older CIE76 formula a difference of about 2.3 is the "just noticeable difference" ([Wikipedia: Color difference](https://en.wikipedia.org/wiki/Color_difference)).
- WebGL 2.0: 97.29% of global usage; Safari on iOS from 15 ([caniuse](https://caniuse.com/webgl2)).

**For us (opinion):** don't add the AGPL remover to a closed store (licence risk; the founders decide, but I wouldn't build on it). Use CIEDE2000 for snapping a HEX to the palette. Plan a non-3D fallback for the roughly 3% without WebGL 2 (section 10.3).

### 1.6 Usability research and standards

**Evidence:**
- **Bottom sheets** (NN/g, 11 Jun 2023): they "intentionally obscure some of the screen"; nonmodal sheets let users keep working with the background; include a visible close button "rather than relying exclusively on the grab handle"; support Back to dismiss; problems found: no clear way to dismiss, stacked sheets, hiding relevant content ([NN/g](https://www.nngroup.com/articles/bottom-sheet/)).
- **Tutorials** (NN/g, 12 Feb 2023): tutorials are "push revelations" shown "out of context", often skipped, and "don't result in better task performance"; use "pull revelations": help triggered when it is needed ([NN/g](https://www.nngroup.com/articles/onboarding-tutorials/)).
- **Direct manipulation** (NN/g, 2016, reviewed Oct 2024): users "act on displayed objects of interest"; drawbacks are accessibility for motor and visual impairments, accidental activation on touchscreens, and discoverability ([NN/g](https://www.nngroup.com/articles/direct-manipulation/)).
- **Defaults** (NN/g, 2005): users rarely change defaults; choose helpful defaults, not arbitrary ones ([NN/g](https://www.nngroup.com/articles/the-power-of-defaults/)).
- **Animation** (NN/g, 9 Feb 2020): most UI animation 100 to 500 ms; simple feedback about 100 ms; a modal entering 200 to 300 ms; "At 500ms, animations start to feel like a real drag" ([NN/g](https://www.nngroup.com/articles/animation-duration/)).
- **Responsiveness:** INP up to 200 ms is "good", above 500 ms "poor" ([web.dev](https://web.dev/articles/inp)).
- **WCAG 2.2:** 2.5.1 Pointer Gestures (A): multipoint gestures such as pinch need a single-pointer alternative, for example zoom buttons ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html)); 2.5.7 Dragging Movements (AA): everything done by dragging must be possible without dragging ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)); 2.5.8 Target Size (AA) 24 × 24 px, with 44 × 44 recommended for important controls ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)).
- **Shopify, 3D media:** models start inactive; must pan with the keyboard; don't rely only on swipe because 3D viewers interfere; labelled buttons for positioning ([Shopify](https://shopify.dev/docs/storefronts/themes/product-merchandising/media/media-ux)).
- **Reduced motion** ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)) and the viewport's `interactive-widget=resizes-content`, which makes the layout shrink when the phone keyboard opens ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport)).

### 1.7 What makes ours easier, more dynamic and more modern than Spized's

| # | We do | Basis |
| --- | --- | --- |
| 1 | The full editor on a phone, designed phone first | **Evidence:** Spized sends phones to the desktop (1.1) |
| 2 | The team's colours and name first; every template shown in them, tried on the model with one tap | **Opinion.** Spized's order is design, then colours (1.1) |
| 3 | Names and numbers as a style plus positions; players fill in the values | **Evidence** that Spized separates fixed text from the team list (1.1); the toggles are opinion |
| 4 | A HEX code is accepted and snapped to the nearest print-tested colour, with both colours shown | **Evidence:** Spized refuses HEX and takes Pantone by email (1.1) |
| 5 | The player switcher on the stage, always one tap away (E4) | **Evidence** that Spized's preview sits behind "Edit" and opens after saving (1.1) |
| 6 | The camera turns to what you edit | **Opinion** |
| 7 | One red button, "Done"; no countdowns or promotions inside the editor | **Evidence** of Spized's countdown (1.1); direction A |
| 8 | A warning when a name or number is hard to read on its background, with a one-tap "Add outline" | **Evidence** that Spized documents outlines for this (1.1); the automatic check is opinion |
| 9 | A flat 2D editor when 3D can't run, not a dead end | **Evidence** that Spized's help says try another browser or device (1.1) |

---

## 2. The editor today

**Method.** On 12 Nov 2026 I opened the demo at `http://localhost:5183` in headless Chrome (puppeteer-core), with device emulation: **390 × 844** (`isMobile`, touch, scale 2, Android user agent; the page reported `innerWidth` 390 and one touch point), **844 × 390** landscape, and **1366 × 900** desktop. I pressed "Add text" and "Add number". The garment is the placeholder being replaced in E2b; I judge the interface only. Screenshots (our own editor):

- [img/06-today-390-top.png](img/06-today-390-top.png): phone, first screen.
- [img/06-today-390-full.png](img/06-today-390-full.png): phone, the whole page (2,338 px tall).
- [img/06-today-390-controls.png](img/06-today-390-controls.png): phone, the selected item's controls under the stuck 3D view.
- [img/06-today-844-landscape.png](img/06-today-844-landscape.png): phone in landscape.
- [img/06-today-1366.png](img/06-today-1366.png): desktop.

**Evidence (what the screenshots show):**

| # | What is wrong | Where |
| --- | --- | --- |
| T1 | Developer information is the interface: the title "Placeholder jersey (sample data, replace with the real product)", "Design is valid", "Checks: No problems", the design JSON, font licences, "Texture 2048 x 2048 px … redrawn in 1.0 ms" | all |
| T2 | On the phone the page is 2,338 px tall: the 3D view sticks to the top and takes 439 of 844 px; everything else scrolls under it in a strip about 300 px tall. The selected item's controls start about 1,650 px down | 390 full, controls |
| T3 | Everything is shown at once: add text, add number, upload, layers, the selected item's controls, six colour zones with eight swatches each (48 swatches). No grouping, no order, no main action | 390 full, 1366 |
| T4 | Words a coach doesn't use: "Piece", "Layers (top first)", "Up / Down", "Direction: Auto (from the text)", "Centre 280, 350 mm on the front (560 x 700 mm). Box 448 x 98 mm", "Rotation 0 degrees", "Turn -15" | 390 controls, 1366 |
| T5 | A new number lands in the middle of the front, on top of the team name ("10" over "TIGERS") | 1366, landscape |
| T6 | Size and rotation are sliders and buttons in the panel; on the model the selection is a thin light-blue box with no handles | 390 top, 1366 |
| T7 | Upload is the browser's own "Choose File / No file chosen" control | 1366 |
| T8 | The view buttons on the desktop are about 30 px tall, in the top-left corner | 1366 |
| T9 | Undo and redo show counts ("Undo (2)"); there is no save, share, price or "done" | all |
| T10 | Landscape phone: the 3D view is 424 × 339 px with a scrolling panel beside it; the header takes 51 px for a long title | landscape |

**What is right and stays (opinion):** live repaint of the model; drag on the model to move; undo and redo with keyboard shortcuts; Arabic and Urdu shaping; logo checks that never block for a warning; the camera that can't lose the garment.

---

## 3. Layout and navigation

### 3.1 Decision: one editor, three layouts

The editor picks its layout from the visible area (`visualViewport`), not the device:

| Layout | When | Tools | Tool options |
| --- | --- | --- | --- |
| **Compact** | width < 1024 px, and height ≥ 500 px | Dock: six tabs at the bottom | Bottom panel (sheet) above the dock |
| **Short** | height < 500 px and width > height (phone in landscape) | Rail: six tabs down the right edge | Side panel, 320 px, sliding in left of the rail |
| **Wide** | width ≥ 1024 px and height ≥ 500 px | Rail: six tabs down the left edge | Panel, 360 px, beside the rail, always open |

**Why tools at the bottom on phones:** a coach holds the phone in one hand; the bottom is where the thumb is (opinion). **Why one panel at a time:** NN/g found stacked sheets confuse people (1.6). **Why the panel is non-modal:** the garment stays live under it; every change is seen at once (DY4, DY5).

**On the store's routes.** On phones the editor opens full screen on its own route, as 03-direction already says. The store header and footer are not shown inside the editor; the editor's top bar replaces them. On desktop the same full-window route is used (the product page's "Design in 3D" opens it), because the editor needs the width.

### 3.2 The six tools

In the order a coach uses them. One icon and one word each. They are tabs (`role="tablist"`), not a menu.

| Tab | Word | What it holds | Section |
| --- | --- | --- | --- |
| 1 | **Design** | Templates | 4.1 |
| 2 | **Colours** | Colour zones, team colours, palette, colour code | 4.3 |
| 3 | **Team** | The team name: where and in what style | 4.5 |
| 4 | **Players** | Player name and number: style, positions, sample player; the roster preview in E4 | 4.5 |
| 5 | **Logos** | Crest and sponsor logos | 4.6 |
| 6 | **Text** | Other text: a motto, a sponsor name, a hashtag | 4.7 |

"Layers" is not a tab. The list of what is on the kit ("On this kit", 4.8) opens from the stage. Patterns, when they come, live inside **Colours** (4.4), so the tab count never grows past six (opinion: six fit a 360 px phone at 60 px each).

### 3.3 Compact layout (phone portrait, 360 to 1023 px wide)

Sizes are CSS px on a **360 × 640** visible area, the smallest we design for. Real phones show less than their screen height because of the browser's bars.

```
COMPACT, resting (no tool open)                         360 x 640
+------------------------------------------------------------+
| [X]  [<-] [->]         (v) Saved          [   DONE   ]     |  56  top bar, navy
+------------------------------------------------------------+
|                                                    [=3]    |  stage starts
|                                                            |
|                      .----.  .----.                        |
|                     /      \/      \                       |
|                    |    TIGERS      |                      |
|                    |   (crest)      |      the garment     |
|                    |                |      centred in the  |
|                    |                |      free stage      |
|                     \______________/                       |
|                                                     [ + ] |
|                                                     [ - ] |
| [Front] [Back] [Left] [Right]                        [ o ] |  view controls
+------------------------------------------------------------+
| Design | Colours |  Team  | Players | Logos  |  Text      |  64  dock + safe area
+------------------------------------------------------------+
  stage = 640 - 56 - 64 = 520 px (81%). [=3] = "On this kit", 3 items. [<-] [->] = undo, redo.
  [+] [-] = zoom, [o] = reset view. (v) = save state.
```

```
COMPACT, a tool open at its normal height (Colours)      360 x 640
+------------------------------------------------------------+
| [X]  [<-] [->]         (v) Saved          [   DONE   ]     |  56
+------------------------------------------------------------+
|                                                    [=3]    |
|                      .----.  .----.                        |  the garment moved
|                     /  TIGERS      \                       |  up and shrank a
|                    |    (crest)     |                      |  little to fit the
|                     \______________/                [ o ] |  space left
| [Front] [Back] [Left] [Right]                              |  stage 348 px (54%)
+--------------------------- ==== ---------------------------+  grab handle
| Colours                                     [Show all] [v] |  48  panel header
| (Body*) (Shoulders) (Side panels) (Sleeves) (Cuffs) (Co>   |  48  zone chips, scroll
| Team  [##][##][##]  Recent [##][##][##][##]  All >         |  52  swatch row, scroll
+------------------------------------------------------------+
| Design | Colours*|  Team  | Players | Logos  |  Text      |  64
+------------------------------------------------------------+
  Colours panel = 48 header + 48 chips + 52 swatches + 24 padding = 172; stage 640-56-64-172 = 348.
  Rule: the normal height of any panel is at most 232 px, so the stage keeps >= 288 px (45%).
```

```
COMPACT, panel expanded (dragged up, or "Show all")     360 x 640
+------------------------------------------------------------+
| [X]  [<-] [->]         (v) Saved          [   DONE   ]     |  56
+------------------------------------------------------------+
|                 .--.  .--.                                 |  stage >= 160 px:
|                |  TIGERS  |                       [ o ]    |  the garment stays
|                 \________/                                 |  visible, smaller
+--------------------------- ==== ---------------------------+
| Colours                                    [Show less] [v] |
| Body: Navy                                                 |
| Team colours   [##][##][##]  [+ Add]                       |
| Recently used  [##][##][##][##][##]                        |
| Whites & greys [##][##][##][##][##][##]                    |
| Blues          [##][##][##][##][##][##]                    |  scrolls inside
| Reds           [##][##][##][##][##][##]                    |
| ...                                                        |
| [ Match a colour code ]                                    |
+------------------------------------------------------------+
| Design | Colours*|  Team  | Players | Logos  |  Text      |  64
+------------------------------------------------------------+
```

**Panel heights (detents):**
- **Closed:** no panel. Tapping the open tab again, the panel's close button [v], Back, or Esc closes it.
- **Normal:** each tool's own height, **at most 232 px** including its 48 px header. This is where every tool opens.
- **Expanded:** up to 60% of the visible height, always leaving the stage at least 160 px. Reached by dragging the handle up, or "Show all" / "Show more" in the header (dragging is never the only way: WCAG 2.5.7).
- Changing tools keeps the current detent if the new tool has content for it, otherwise it goes back to normal.
- **One panel at a time.** Anything that needs a further choice (a font list, a colour code) opens **inside** the same panel, with a "‹ Back" row at the top, never as a second sheet.

**The garment is never hidden (DY4).** The 3D canvas always fills the area between the top bar and the dock. When the panel opens, the editor tells the camera how much is covered (`viewInsets.bottom`) and the camera frames the garment in the free area above it, over 200 ms ease-out (instant with reduced motion). The canvas is not resized while the panel moves (resizing every frame would reallocate the drawing buffer); it is re-framed once the panel settles.

**Typing (the phone keyboard).** The viewport uses `interactive-widget=resizes-content`, so the layout shrinks when the keyboard opens. While a text field has focus:
- the dock hides (it would sit behind the keyboard anyway);
- the panel shrinks to its field row and stays on top of the keyboard;
- the camera frames the item being typed (the back name, the chest team name) in the space above, so the coach sees each letter land on the shirt;
- the keyboard's "Done" or Enter closes the keyboard and keeps the panel at normal height.

```
COMPACT, typing the team name, keyboard open            360 x ~380 visible
+------------------------------------------------------------+
| [X]  [<-] [->]         (v) Saved          [   DONE   ]     |  56
+------------------------------------------------------------+
|               zoomed to the chest:                         |
|              |      T I G E R S _       |                  |  stage ~250 px
|              |         (crest)          |                  |
+------------------------------------------------------------+
| Team name  [ TIGERS                           ] [Done]     |  72
+------------------------------------------------------------+
|                   phone keyboard                           |
```

**768 px (tablet, portrait).** The same compact layout. The dock's tabs are 96 px wide, centred in a 600 px group; the panel is full width with its content limited to 560 px and centred; the stage is about 70% of the height with a tool open. In landscape, a tablet (1024 × 768) uses the wide layout.

### 3.4 Short layout (phone in landscape)

```
SHORT, Logos open                                        844 x 390
+--------------------------------------------------------------------------------+
| [X] [<-] [->]  (v) Saved                                          [  DONE  ]   | 48
+---------------------------------------------+------------------------+---------+
|                                             | Logos              [>] | Design  |
|            .----.  .----.                   | [  + Add a logo      ] | Colours |
|           /   (crest)    \                  | Crest  · Left chest    | Team    |
|          |    TIGERS      |                 | Where:                 | Players |
|           \______________/                  | (L chest*)(R chest)    | Logos*  |
|                                    [+][-][o]| (Centre)(Back)(Sleeve) | Text    |
| [Front][Back][Left][Right]                  |                        |         |
+---------------------------------------------+------------------------+---------+
  stage 844 - 320 - 64 = 460 px wide when the panel is open (55%); full width when closed.
```

- The top bar is 48 px. The rail is 64 px wide on the right edge, six tabs 54 px tall each (icon only, 44 px target, label underneath at 12 px is not allowed by 03-direction, so the label is the accessible name and shows as a tooltip on long-press). This is the one place labels are hidden, because 342 px of height can't hold six labelled tabs (opinion).
- The panel is 320 px wide, slides in from the right, and the camera frames the garment in the space to its left (`viewInsets.right`).
- The keyboard in landscape covers most of the screen: the editor shows only the field row and a strip of the stage; this is acceptable for a short text (opinion).

### 3.5 Wide layout (desktop, 1024 px and up; drawn at 1366)

```
WIDE, Players open, an item selected                                       1366 x 768 visible
+------------------------------------------------------------------------------------------------------------+
| FitMyOutfit · Jersey     [<- Undo] [Redo ->]   (v) Saved on this device   [Share]  [price slot]  [ DONE ] | 64 navy
+---------+---------------------------------+----------------------------------------------------------------+
|  [::]   | Players                     [?] |                  ( 10 · ALI RAZA  < > )   (E4)                 |
| Design  | Names and numbers come from     |                                              [=] On this kit (4)|
|         | each player.                    |                    .------.   .------.                         |
|  [##]   | Preview as                      |                   /                  \                        |
| Colours | [ ALI RAZA            ] [ 10 ]  |                  |      A L I  R A Z A  |                       |
|         | On the shirt                    |                  |    +-----------+     |   back view           |
|  [T]    | [x] Name on back                |                  |    |    1 0    |o    |   (camera turned      |
| Team    | [x] Number on back              |                  |    +-----------+     |    when Players       |
|         | [ ] Number on front             |                  |                      |    opened)            |
|  [10]   | Style                           |                   \__________________/                         |
| Players*| Font  [ Varsity      v]         |                                                        [ + ]   |
|         | Colour [##] Navy                |                                                        [ - ]   |
|  [img]  | Outline (None)(Thin*)(Thick)    |       [ Front ] [ Back* ] [ Left ] [ Right ]           [ o ]   |
| Logos   | Digits (0-9*) (٠-٩)             |                                                                |
|  [Aa]   |                                 |                                                                |
| Text    |                                 |                                                                |
+---------+---------------------------------+----------------------------------------------------------------+
  88 px rail · 360 px panel · stage 918 px
```

- **Top bar, 64 px, `inverse` (navy):** wordmark and garment name on the left (the wordmark links nowhere inside the editor; leaving is the close action, 3.6); undo and redo with their words; the save state; then, on the right, Share (secondary, on navy: white outline), the price (host slot, section 9), and **Done** (the one red button).
- **Rail, 88 px:** six tabs, 72 px tall, a 24 px icon over a 14 px label. The active tab: `surface-alt` fill, 3 px `ink` bar on its start edge, label semibold, `aria-selected`.
- **Panel, 360 px:** always open in the wide layout (there is room). Its title in Barlow Condensed (`h3`); content scrolls inside it; the stage never scrolls.
- **Stage:** the rest. The player chip (E4) at the top centre; "On this kit" at the top right; view buttons at the bottom centre; zoom at the bottom right.
- **1280 × 720** (the smallest desktop we design for): the same; the stage is 832 × 656.

### 3.6 Top bar contents and leaving

**Compact (56 px):** [Close 44] [Undo 44] [Redo 44] · save state (flexible, `small`, ellipsis) · [Done, 88 px min]. At 360 px: 16 + 44 + 4 + 44 + 4 + 44 + 8 + state (at least 88 px) + 8 + 88 + 16 = 364, four pixels too many. So **at 360 px the save state shows its icon only** (its words stay the accessible name); from 375 px the words show.

**Close (X):** leaves the editor to the page it came from. Work is already saved (section 9), so there is no question; only if the last save failed does a dialog ask (section 10.6).

**Undo and redo** are always visible, never in a menu: they are the safety net that makes trying things cheap (opinion).

---

## 4. The tools, in the order a coach uses them

Rules for every tool:
- **No Apply buttons.** Every choice shows on the model at once and is one undo step.
- **Units:** sizes are words or relative (Small, Medium, Large; Bigger, Smaller). Millimetres appear only in the fine-tune panel, on desktop, as secondary text.
- **Each tool's panel header:** title (Barlow Condensed 20/26 uppercase), a "?" button that opens one short tip for that tool inside the panel (a pull revelation, 1.6), and the close or collapse button.
- **The camera** turns to the side the tool works on when the tool opens (6.3).

### 4.1 Design (templates)

**Content:** cards, one per template for this product. In E3: 4 to 5 placeholder templates we draw ourselves from generic sports shapes (plain, hoops, sash, side stripes, chevron) until the graphic designer's 10 arrive (dev-plan input for E3). Never copied from another store.

**Each card:**
- A thumbnail of the **front**, drawn from the template in **the team's colours, with the team name and the crest**, by the same function that paints the model (`drawPatternTexture`, flat mode, cropped to the front piece, as the demo's close-up already does). 120 × 150 px on phones, 4:5, on `surface-alt`.
- The template's name under it (`small`, semibold).
- The current design's card has a 2 px `ink` outline, a check icon and "Current" in its accessible name.

**Behaviour, "tap to try":**
- Tapping a card applies it to the model at once (DY2). It is one undo step. A status line "Design changed · Undo" appears for 4 s (W-ED34).
- **What is kept** when the design changes: the team colours (mapped to the template's colour roles), the team name and its text, every logo and its position preset, the player style choices that the template doesn't set, and the sample player. **What changes:** the layout, the shapes (stripes, hoops), the default positions and fonts the template sets.
- No confirmation, because undo is one tap away (opinion).

**Layout:**
- Compact, normal height (184 px): one row of cards, sideways scroll with the next card cut off (Baymard's cue for "more", see 01-research §5).
- Compact, expanded: a 2-column grid (3 at 768 px). Tapping a card in the grid applies it **and collapses the panel to normal**, so the coach sees the result.
- Wide: a 2-column grid in the panel.

**Empty:** a product with no templates hides the Design tab (five tabs), and the editor starts from the plain product.

**Engine needs:** a template format with colour roles and named slots (N2, N3).

### 4.2 Team colours (the start, and a row in Colours)

The coach chooses **2 or 3 team colours** at the start (7.2). They are kept with the design as `teamColors` (a format addition, N2), shown first in every colour picker, and used to colour every template card.

- Order matters: 1 "Main", 2 "Second", 3 "Accent" (W-ED42). The template maps its zones to these roles.
- Editing them later: Colours › Team colours › "Edit". Changing a team colour recolours every zone and item that uses that role (one undo step), so "make it maroon instead of red" is one tap (DY5).
- **Swap** (`⇄`): swaps Main and Second across the whole kit, one tap, one undo step. The quickest way to an away kit (opinion; Spized has a help article on making an away kit with little effort, 1.1).

### 4.3 Colours

**Zones.** Chips in a row, named from the product data ("Body", "Shoulders", "Side panels", "Sleeves", "Cuffs", "Collar"), each with a 20 px dot of its current colour. Plus the template's shapes ("Stripes", "Sash") as extra chips when a template has them (4.4).
- **Choosing a zone:** tap its chip, or **tap the garment** while the Colours tool is open (the zone under the finger; `zoneAtUv` exists, the tap needs a raycast, N8).
- The chosen zone **flashes once** on the model: a 2 px white-then-`ink` outline drawn into the editor-only overlay, 600 ms, fading (static outline with reduced motion). This is how a coach learns which part "yoke" is without reading the word (DY5).
- The header line says "Body: Navy" (`body` semibold), so the choice is said in words, never by colour alone.

**Swatches:**
- 44 × 44 px, 8 px apart, radius 8: a rounded square, which reads as a fabric sample (opinion). A 1 px `border-strong` inner ring makes white and very light colours show on the white panel.
- **Selected:** a 2 px `ink` ring outside a 2 px white gap, and a check icon in the centre in white or `ink`, whichever has more contrast on that swatch. `aria-pressed="true"`; accessible name "Navy, selected".
- **Hover (pointer devices):** the model previews that colour on the zone (one repaint per hovered swatch, not continuous; reverted on leave). Touch has no hover.
- **Groups, in order:** Team colours (2 or 3, with "Edit"), Recently used (up to 8, this design and this device), then the palette by family (Whites & greys, Blacks & navies, Blues, Greens, Yellows & oranges, Reds & maroons, Purples & pinks). Families come from the palette data (N14).
- Normal height: one sideways-scrolling row: Team, a divider, Recent, a divider, "All ›". Expanded: all groups as rows that wrap.

**Match a colour code (custom HEX), at the end of the palette:**
1. A field with a `#` prefix, `dir="ltr"`, 16 px text, `autocapitalize="characters"`, accepting 3 or 6 hex digits (with or without `#`).
2. As soon as the code is valid, the panel shows **both colours side by side**:

```
+----------------------------------------------------------+
| You entered        We'll print                           |
| [########]   ->    [########]                            |
| #1A5FB4            Royal blue  #1F4E9C                   |
| Close match                                    (i)       |
| [ Use Royal blue ]                                       |
+----------------------------------------------------------+
```

   - Each chip is 64 × 64 px with its code under it in `small`.
   - The match line comes from the CIEDE2000 difference (1.5): **ΔE ≤ 2 "Very close match"**, **2 to 6 "Close match"**, **above 6 "Clearly different: check before you order"** with the `alert` icon in the warning colour (thresholds are my proposal, to be tuned with the print-tested palette; opinion).
   - "Use Royal blue" applies the palette colour (one undo step). Nothing else can be applied: the document only ever holds print-tested colours.
3. After applying, the zone chip shows a small "matched" mark; the zone's header line reads "Body: Royal blue (matched from #1A5FB4)". This needs the requested code kept with the colour (N14, a format question, Q-D6).
4. **Errors:** a code that isn't valid shows W-ED51 under the field (the field's error state from 05 §2.3); nothing is applied.

**A note under the palette:** W-ED54 (**P**: it says something about printing; founders to confirm).

**Normal height for Colours:** header 48 + zone chips 48 + swatch row 52 + padding 24 = 172 px.

### 4.4 Patterns and gradients: recommendation

**Recommendation: not as tools in E3. Simple graphic shapes in templates in E3. A pattern library and two-colour gradients later, for sublimated products only. Photo textures and free drawing: never.**

| Option | What the customer gets | Engine work | When |
| --- | --- | --- | --- |
| **A. Shapes in templates** (E3) | Templates with stripes, hoops, a sash, a chevron; each shape recolourable as a Colours chip ("Stripes"); not movable | A `shape` item: a vector path in piece millimetres with a fill colour, drawn and clipped like other items, locked by default (N3) | **E3** |
| **B. Pattern library** (later) | A Patterns row in Colours: choose a pattern (camo, halftone dots, pinstripes, geometric), its two colours, its scale (S, M, L), on a chosen zone | A pattern fill type for zones: a tiled vector tile, two colour refs, scale, angle; drawn into the texture; and production files that tile consistently across seams | After launch, or E6 |
| **C. Two-colour gradient** (later) | A fade between two colours on a zone, direction up/down/diagonal | A gradient fill type for zones; proofs and production files must reproduce it | With B |
| **D. Photo textures, free drawing** | | | **Never**: they can't be checked for print, and break "a design is data" |

**Why not B and C in E3:**
- **Print method (evidence from the plan):** our decoration methods are sublimation, DTF, screen print and embroidery, "chosen per product". Patterns and gradients across a whole panel are only possible with sublimation. On a T-shirt printed by DTF or screen print on a coloured blank they can't be made. The interface must offer them per product, so they need the product capabilities (4.9) first.
- **Production:** a pattern must line up across the seam between front and side panel in the cutting file; that is factory work we haven't specified.
- **Reach:** with 4 to 10 templates, shapes in templates give most of the "designed" look a coach wants (opinion), at a fraction of the work.

**Where they will live:** inside Colours, as a "Fill" choice on a zone: "Plain · Pattern · Fade" (a segmented control), so the tab count stays six.

### 4.5 Team name, player name, number

To a coach these are three different things, not three text boxes. The interface treats them as **roles**:

| Role | Same on every shirt? | Where its value comes from | Tool |
| --- | --- | --- | --- |
| **Team name** | Yes | Typed once by the coach | Team |
| **Player name** | No | Each player (the roster, E4); a sample in E3 | Players |
| **Number** | No | Each player (the roster, E4); a sample in E3 | Players |

Each item on the kit carries its role (N1). Templates place the role slots; the coach never "adds a text box" for a name or number.

**Team tool:**
- **Team name** field (`dir="auto"`, 16 px, the `TextField` look from 05 §2.3), prefilled from the start card. Typing updates the model on every key (a text repaint is cheap; it is not a drag).
- **Where** (position presets, chips with a 24 px mini diagram of the shirt and a dot): "Chest" (default), "Above the number" (upper back), "Off" (removes it from the kit, keeps the text for later).
- **Style:** font (a list showing the team name in each font, 4.5.1), colour (team colours first), outline (None / Thin / Thick), size (Small / Medium / Large).
- The camera turns to the front (or the back for "Above the number").

**Players tool:**
- A line: "Each player's name and number come from your team list." (W-ED71, **P**: it describes the team-order flow; founders to confirm).
- **Preview as:** a sample player: name field (`dir="auto"`) and number field (`inputmode="numeric"`, 2 characters wide). Prefilled with a sample (W-ED72b). This sample is editor data, not part of the order.
- **On the shirt** (switches, 44 px rows): "Name on back" (on), "Number on back" (on), "Number on front" (off), "Number on sleeve" (off, only if the product has sleeve placements). Each switch adds or removes the role slot at its preset position.
- **Style:** font for the name, font for the number (or one "lettering set" that pairs them, when the font catalogue has sets; opinion: offer sets first, "Change fonts separately" second), colour, outline, size.
- **Digits:** "0–9" or "٠–٩" (the founder's two systems; the number rule also accepts Urdu-form digits, which the sample field accepts as typed).
- The camera turns to the back.

**Readability check (DY5, evidence 1.1):** when a name, number or team name sits on a zone whose colour gives less than **3:1** contrast with the text colour (the WCAG non-text ratio as a stand-in for "readable from the stands"; opinion), the style section shows an inline warning with the alert icon: "Hard to read on Navy." and a button "Add outline" that adds a Thin outline in the team colour with the highest contrast. Not blocking. (N15.)

**Long names:** when the sample name is wider than its box, the engine already shrinks it evenly. The panel says "Long names get smaller to fit." under the field, only while that is happening (N12). The real maximum per font is E4.

**Number errors** (from `checkJerseyNumber`, reworded for coaches): 3 digits or more: "Use 1 or 2 digits, from 0 to 99." Mixed digits: "Use one kind of digits, not both." Empty: the field keeps the last valid number on the model and says "Enter a number to preview." No error stays on the model.

#### 4.5.1 Font list

A list inside the panel ("‹ Back" row at the top), each row 56 px: the font's name in `small` `ink-muted`, and **the coach's own team name (or sample player) set in that font** at 24 px, plus "علی 10" in its Arabic fallback when the text has Arabic script. The current font has the check icon. Fonts come from the catalogue (`uses: text | number`).

#### 4.5.2 Outline

Three choices (None, Thin, Thick), a segmented control, and an outline colour (team colours first). Text outlines are not in the engine yet (README, "left for later"); they are needed for this tool (N4). If the engine owner can't fit them in E3, the readability check's button becomes "Choose a darker colour" until E4.

### 4.6 Logos

**Empty state** (no logo yet):

```
+----------------------------------------------------------+
| Logos                                          [?] [v]   |
| +------------------------------------------------------+ |
| |   [img]  Add your team logo                          | |
| |          PNG, JPG or WebP, up to 10 MB.              | |
| |          A transparent background prints best.       | |
| +------------------------------------------------------+ |
| No logo? Our designers can help.  (copy from founders)   |
+----------------------------------------------------------+
```

- The whole box is one button (dashed `border-strong` outline, 96 px tall, `radius-card`). On desktop it is also a drop target ("or drop it here"); while a file is dragged over, the outline turns solid `ink` and the fill `surface-alt`.
- On phones it opens the system picker, which offers photos, camera and files. `accept="image/png,image/jpeg,image/webp"`.

**Upload flow:**
1. **Checking:** the box shows a 24 px spinner and "Checking your logo…" (W-ED92); the rest of the editor stays usable. It is announced (`role="status"`).
2. **Refused (an error from the checks):** the box returns, with an error `Alert` (05 §2.5) above it: the coach's file name, and the reason in plain words (W-ED94a to e). Focus moves to the alert. The file is not added.
3. **Accepted:** the logo is placed at once, at the **default position for the first logo: "Left chest"**, at the size the engine already picks (sharp at the minimum DPI, at most 100 mm). The camera turns to the front and the item is selected. The panel then shows the logo's card:

```
+----------------------------------------------------------+
| Logos                                          [?] [v]   |
| [thumb] crest.png                    [Replace] [Remove]  |
| Where                                                    |
| (Left chest*) (Right chest) (Centre chest) (Upper back)  |
| (Left sleeve) (Right sleeve)                             |
| Size   [ - ]  Medium  [ + ]                              |
| (!) No transparent background: it prints as a box.  [i]  |
| [ + Add another logo ]                                   |
+----------------------------------------------------------+
```

- **Where:** position presets from the product data (N5), each a chip with a mini diagram. **"Left chest" means the wearer's left**, which is on the right of the screen in the front view; the mini diagram shows the dot there, and the label's tooltip and accessible name say "Left chest (wearer's left)". A preset moves the logo and turns the camera.
- A second logo defaults to "Centre chest" (sponsor), a third to "Upper back" (opinion: the usual order on club kits).
- **Size:** a stepper (− Medium +) through Small, Medium, Large and the sizes between, as the 05 `QuantityStepper` pattern; handles on the model do the same (section 5).

**Warnings (never block, from the checks):**
- **No transparent background:** "No transparent background: it will print as a box with its background colour." The model shows exactly that. Two actions: "Keep it" (dismisses the warning for this logo) and the design-help link (**copy from founders**). No automatic background removal in E3 (1.5 and Q-B2).
- **Low resolution at this size:** recomputed live while resizing (the check needs the design data only). "May print blurry at this size. Sharp up to {size}." plus **"Make it sharp"**, which shrinks it to the largest sharp size (one undo step). The item on the model and its row in "On this kit" get a warning badge.
- Warnings use the warning colour (12.2), the alert icon and words; never colour alone.

**SVG:** refused with W-ED94f, which says what to do instead.

**Upload failure (network):** "Your logo didn't upload. Check your connection and try again." with "Try again" (keeps the chosen file; no new picker).

**Remove:** removes the item (undo brings it back, with its file).

**Later (not E3):** a mirror action ("Same on the other sleeve", evidence 1.1); "Remove plain background" (a flood fill from the edges for one flat colour, with a before/after preview, tested on real club crests first); clipart.

### 4.7 Text (free text)

For a motto, a sponsor's name, a hashtag, a year. Fixed on every shirt.
- "Add text" opens a field (`dir="auto"`); the first text goes to "Lower back" (the usual place for a motto; opinion), the next to "Upper back".
- Under the field: "Printed the same on every shirt." (W-ED101), so nobody types a player name here.
- Where, style, outline: as the team name. Several text items are allowed; each has a row in "On this kit".

### 4.8 On this kit (the list of items, and selection)

Coaches don't think in layers (T4). The list says what is on the shirt.

- **Opens from** the "On this kit (n)" button at the top right of the stage (44 px tall, `surface` chip with `border-strong`). Below 480 px wide it is icon-only (44 × 44, the layers icon with the count as a number badge; "On this kit, 3 items" as its accessible name), so the E4 player chip fits in the middle of the same row (at most 224 px wide at 360 px; a long name is cut with an ellipsis on the chip, never on the shirt). On phones it opens in the panel area as its own content, with a "‹ Back" row to the tool that was open; on desktop as a 320 px popover anchored to the button.
- **Each row (56 px):** a 24 px icon for the role (shield for team name, shirt-number for number, image for logo, Aa for text, stripes for shapes), the label ("Team name: TIGERS", "Number", "Logo: crest.png"), where it is ("Chest", "Back") in `small` `ink-muted`, a warning badge if any, and a "⋯" menu button (44 px).
- **The menu:** Edit (opens its tool), Duplicate (logos and text only), Bring forward, Send back, Delete. Moving forward and back replaces "Up / Down".
- **Tapping a row** selects the item, turns the camera to it and opens its tool.
- **Shapes** from the template are listed under "From the design" and show "Locked" with a lock icon; their menu offers only colour.
- **Empty:** "Nothing added yet. Add your team name, players or a logo." (W-ED131).

**Selection:**
- Selecting happens by tapping the item on the model, its row here, or its slot in a tool.
- The selected item shows its handles (section 5) and its tool opens.
- **Esc**, tapping empty stage, or "Done" in the contextual bar deselects.
- Selection is not part of undo history (as today).

### 4.9 Room for decoration methods

The product decides what is possible (owayo's smaller palette for some materials is the same idea, 1.2). The interface reads a **capabilities** block from the product data (N5) and never shows what can't be made:
- **Panel header line** under each tool title: "Printed (sublimation)" or "Embroidered" (`small`, `ink-muted`), from the product. Wording **copy from founders**.
- **Colours:** whole-garment colours only where the product allows it; on a stock blank the Colours tab shows the blank's available colours only.
- **Logos:** a maximum number of logo colours for screen print and embroidery (shown as "Up to 4 colours"); a minimum text height for embroidery (the size stepper stops there).
- **Patterns and fades:** only for sublimated products (4.4).
- A position preset can carry its own method (an embroidered left-chest crest on a printed shirt).

None of this is in E3 beyond the header line; the data shape is (N5).

---

## 5. Direct manipulation on the model

### 5.1 Gestures

| Action | Touch | Mouse | Keyboard |
| --- | --- | --- | --- |
| Turn the garment | One finger on the garment or stage, where there is **no selected item** | Drag on the garment or stage | Arrows when the stage has focus and nothing is selected; or the view buttons |
| Zoom | Pinch; or the + and − buttons | Wheel; or + and − | `+` / `-` |
| Select an item | Tap it | Click it | Tab to "On this kit", Enter on a row |
| Move the selected item | Drag it with one finger | Drag it | Arrows: 1 mm; Shift+arrows: 10 mm |
| Move an item that is not selected | Not possible: a drag that starts on an unselected item turns the garment | Press and drag it: it is selected and moved in one go | — |
| Resize | Drag a corner handle | Drag a corner handle | `]` bigger, `[` smaller (10%) |
| Turn (rotate) | Drag the turn handle | Drag the turn handle | `Shift+]` / `Shift+[`: 15° |
| Deselect | Tap empty stage | Click empty stage | Esc |
| Delete | Contextual bar | Contextual bar, or Delete / Backspace | Delete / Backspace |

**Decision: on touch, select first, then drag.** Today a press on any item drags it. On a phone, a coach turning the shirt with a thumb on the chest would drag the team name off by accident. NN/g names accidental activation on touchscreens as a drawback of direct manipulation (1.6). With the mouse, press-and-drag stays direct, because a pointer is precise and turning uses empty space. (Engine: N10.)

**Two fingers always zoom the camera, never resize the item.** Pinching an item would fight with pinching the view; handles and the stepper resize (opinion).

### 5.2 Handles and the contextual bar

```
                 (o)          <- turn handle: 12 px circle on a 24 px stem, 44 px hit area
                  |
      [#]---------+---------[#]   <- corner handles: 14 px white squares, 2 px ink border,
       |                     |       44 x 44 px hit areas (they may overlap the box)
       |      T I G E R S    |
       |                     |    <- box: 1.5 px ink line over a 3 px white line (shows on
      [#]-------------------[#]      any kit colour)
```

- **Drawn as an overlay above the canvas** (SVG), not into the texture, so dragging a handle doesn't need a repaint to show the handle. The engine projects the item's four corners from the pattern piece to the screen (N9) after every camera move and every change.
- **Corner handles scale evenly** (text and logos keep their proportions). There are no side handles: names and numbers never stretch.
- **When the item faces away** from the camera (more than about 75° from the view direction), the handles hide and a chip at the top of the stage says "Turn to edit" (W-ED112), which turns the camera to it.
- **Snapping during move** (shown as a 1 px `focus`-blue dashed guide drawn editor-only into the texture, like today's selection outline, so it follows the curve):
  - the vertical centre line of the piece;
  - the centre of each position preset (left chest, centre chest, back number…);
  - the horizontal centre line of another item on the same piece (name above number).
  - Snap distance: 6 mm on the garment or 8 screen px, whichever is larger; snapping is released by moving past it. Holding Alt (mouse) disables it.
  - Turning snaps at 0°, ±15°, ±45°, ±90°.
- **Limits:** each piece has a print area (N6). The item's box stops at its edge; while dragging, the print area shows as a dashed outline on the piece. Today's rule keeps only the item's **centre** in the piece's box, so part of an item can disappear past a seam; with print areas the whole box stays in.
- **Clipped at a seam:** if an item is still cut by the piece's outline (a large logo near a curved edge), the item gets a warning badge and "Part of this is cut off at the seam." (W-ED111) with "Move it in" (moves it to the nearest position where it fits). Spized advises against graphics over seams (1.1).

**Contextual bar** (for the selected item):
- **Compact:** a 48 px row at the **top of the stage**, under the top bar: the item's name ("Logo: crest.png"), then icon buttons with labels: Delete, Duplicate (logos and text), More (opens the item's "⋯" menu), Done (deselect). Never over the item or its handles (1.4); the camera keeps the selected item in the free area under the bar. While it shows, it **replaces** the stage's top row (the "On this kit" button and, in E4, the player chip); they come back on deselect.
- **Wide:** the same actions at the top of the panel, under its title.

**Fine-tune (the non-dragging way, WCAG 2.5.7):** in the selected item's tool, a "Fine-tune" disclosure (closed by default) holds: Size − / + (10%), Turn ↺ / ↻ (15°), Straighten, Move ← → ↑ ↓ (2 mm; long-press repeats), "Centre on the shirt". On desktop each value also shows in millimetres or degrees as secondary text, for organisers who know what they want (opinion).

### 5.3 Keeping it fast while dragging

Today every move repaints and re-uploads a 2048 px texture; on a mid-range phone this is unmeasured (E2 notes). The design depends on these rules, which the engine owner can implement in whichever way measures best:
1. **Handles and guides never wait for a repaint** (the overlay).
2. **During a drag, the texture repaint is capped** at the display rate and dropped when the previous upload hasn't finished (no queue).
3. **Draft quality during gestures:** if a drag frame takes more than 33 ms (below 30 fps), the engine paints at half size (1024) until the gesture ends, then once at full size. The coach sees a slightly softer shirt while moving, sharp on release.
4. **Only the changed piece:** re-uploading only the piece's part of the texture (a partial upload) is the better fix if measurement says so (N11).
5. **Nothing animates when nothing changes:** the canvas renders on demand (already true); no idle turntable.

---

## 6. View controls and the camera

### 6.1 Controls

- **Side buttons:** "Front", "Back", "Left", "Right": a segmented control with words, 44 px tall, at the bottom left of the stage on compact (each about 64 px wide; at 360 px the group is 4 × 64 = 256 px), bottom centre on wide. The current side is pressed (`aria-pressed`, `ink` fill, white label). When the coach has turned the garment freely, none is pressed.
- **Zoom:** + and − (44 × 44, a vertical pair at the bottom right of the stage, on every layout: WCAG 2.5.1 needs a single-pointer way to zoom, 1.6). Steps of 1.25×, within the engine's limits; at a limit the button is inactive with `aria-disabled`.
- **Reset view** (`o`, 44 × 44, under the zoom pair): back to the front at the fitting distance.
- **Style:** `surface` at 92% opacity with a 1 px `border` line and `radius-control`, so they read as buttons on any stage tone; icons and labels `ink`.

### 6.2 Free rotation and its limits

As today: no panning; the camera always looks at the garment's centre; zoom between 0.45 and 1.6 of the fitting distance; between 50° above and 22° below. The garment can't be lost (keep).

### 6.3 When the camera moves by itself

The camera moves only **in answer to the coach's own action**, never on a timer:

| The coach… | The camera |
| --- | --- |
| opens Players, or selects a name or number, or a back preset | turns to the back |
| opens Team (chest), Logos (front presets), or chooses a front preset | turns to the front |
| chooses a sleeve preset | turns to that side |
| selects an item from "On this kit" that faces away | turns to it |
| types in a field | zooms to the item being typed (compact layout, 3.3), returns when the keyboard closes |
| opens or resizes the panel | re-frames the garment in the free area |

- **Duration:** 350 ms ease-in-out for a turn (a "big movement", 1.6); 200 ms for re-framing. **Reduced motion:** cuts, no animation.
- **Never** while a finger or the mouse is down on the stage, and not within 1.5 s after the coach turned the garment by hand (they are looking at something; opinion).
- **Tapping an item on the model never moves the camera** (the coach is already looking at it).
- **No idle spin**, no auto-rotate after loading. 03-direction: nothing auto-plays.

---

## 7. First run and guidance

### 7.1 The goal

From opening the editor to a kit with the team's colours, name, a logo and a sample player in **under 2 minutes**, with no video and no step-by-step tour (EZ2). NN/g: tutorials are skipped and don't improve performance; help belongs at the moment it is needed (1.6).

### 7.2 The start card (first open of a new design only)

The editor opens with the product's **first template already applied** (a helpful default, 1.6) and, over the lower half of the stage, the start card. It is a panel, not a modal: the garment above it is live and changes as the coach chooses.

```
COMPACT, first open                                     360 x 640
+------------------------------------------------------------+
| [X]  [<-] [->]                                [   DONE   ] |
+------------------------------------------------------------+
|                      .----.  .----.                        |
|                     /  TIGERS      \     the garment       |
|                    |                |    recolours as      |
|                     \______________/     each colour is    |
|                                          picked            |
+------------------------------------------------------------+
| LET'S MAKE YOUR TEAM'S KIT                                 |
| 1  Team colours  (pick 2 or 3)                             |
|    [##][##][##][##][##][##][##] >          Main  Second    |
|                                            [##]  [##] [+]  |
| 2  Team name                                               |
|    [ e.g. Lahore Lions                             ]       |
| [      SEE DESIGNS IN YOUR COLOURS      ]  (secondary)     |
|                Skip: start from this design                |
+------------------------------------------------------------+
```

- **Height:** the start card is the one panel that opens taller than 232 px: about 330 px on a 360 × 640 phone (the expanded rule: the stage keeps at least 160 px). It is shown once, and the garment above it is still live.
- **Team colours:** a sideways row of the palette's most-used colours (palette data, N14) plus "All colours ›". Tapping fills Main, then Second, then Accent; tapping a filled slot clears it. The garment recolours as each is picked.
- **Team name:** the `TextField`, `dir="auto"`. The name appears on the chest as it is typed. A placeholder, not a prefilled value (opinion: a fake team name on a real kit looks like ours, not theirs).
- **"See designs in your colours"** (secondary button style: the red button stays "Done"): closes the card and opens Design at expanded height, with every card in the team's colours and name.
- **"Skip: start from this design"** (text link) closes the card. So does Close or Esc. Nothing is lost: colours picked so far are kept.
- The card is shown once per new design. Reopening a design never shows it.
- **Wide layout:** the same content in the panel, with the Design tab's rail item highlighted.

### 7.3 The path a first-time coach takes (target times, opinion)

1. Start card: 2 colours, team name (30 s).
2. Design: tap 2 or 3 cards, keep one (30 s).
3. Logos: add a crest, it lands on the left chest (25 s).
4. Players: type a sample name and number; the camera is already on the back (20 s).
5. Done (5 s).

That is 2 minutes with some slack. The user test (EZ2) checks it.

### 7.4 Guidance without a tutorial

- **Empty states that say what to do next,** in the tool where it matters: the Logos box (4.6), "On this kit" (4.8), the Players switches (4.5).
- **One hint, once, on the stage,** the first time the model is shown on a touch device: "Drag to turn. Tap something to change it." (W-ED116) as a chip at the top of the stage, dismissed by any touch on the stage. On pointer devices: "Drag to turn. Click something to change it."
- **The "?" in each tool's header** opens two or three lines of help for that tool, inside the panel (pull, not push, 1.6).
- **No coach marks pointing at buttons,** no "Next tip" sequences.

### 7.5 What "dynamic" looks like, and its limits

| Moment | Feedback | Duration |
| --- | --- | --- |
| Swatch pressed | Swatch scales to 0.92 and back; model changes; header line updates | 100 ms |
| Zone chosen | Zone flashes once on the model | 600 ms fade (static with reduced motion) |
| Template tapped | Model changes at once; status line "Design changed · Undo" | 4 s status |
| Tool opened | Panel slides up (or in); garment re-frames | 200 ms |
| Camera turn | Turns to the side being edited | 350 ms |
| Snapping | Guide appears; a 10 ms vibration on Android if `navigator.vibrate` exists (not on reduced motion) | while dragging |
| Undo / redo | Status line "Undone: Body colour" | 3 s |

**Limits (opinion):** no confetti, no bouncing, no sound, no idle animation, no animated gradients on the stage. Every animation answers an action. Everything above 100 ms can be skipped by acting again (a new tap cancels the camera turn).

---

## 8. Roster preview (E4) and proof (E5)

### 8.1 Roster preview (E4): where it lives

- **The player chip** on the stage, top centre, 44 px tall: "‹  10 · ALI RAZA  ›" with previous and next buttons (44 × 44 each) and the middle part opening the list. Names are inside `<bdi>`; an Urdu name reads "‹ 7 · محمد علی ›" with the number on the start side.
- **The list** (inside the Players tool, below the style controls in E4): one row per player: number, name, size, and a warning badge where the name is too long for the font or the number is a duplicate (the engine's `findDuplicateJerseyNumbers`). Tapping a row shows that player on the model and turns the camera to the back.
- **Before players exist** (no roster yet): the chip shows the sample player from the Players tool and says "Sample" (W-ED72c), so nobody thinks it is a real entry.
- **Three players without help** (the plan's success line): previous and next on the chip are the fastest way, always visible on the stage.
- **Real maximum lengths (E4):** when a player's name can't fit at the minimum size, the row says "Too long for this font" and the model shows it shrunk; the roster check uses the same rule.
- The roster entry itself (players adding their details through the shared link) is the team-order flow, not the editor.

```
COMPACT, E4: previewing players                          360 x 640
+------------------------------------------------------------+
| [X]  [<-] [->]         (v) Saved          [   DONE   ]     |
+------------------------------------------------------------+
|            [<]  10 · ALI RAZA  v  [>]                      |  player chip
|                    .----.  .----.                          |
|                   /   A L I        \                       |
|                  |     R A Z A      |   back view          |
|                  |       10         |                      |
|                   \________________/                       |
| [Front] [Back*] [Left] [Right]                       [ o ] |
+------------------------------------------------------------+
| Design | Colours |  Team  | Players*| Logos  |  Text      |
+------------------------------------------------------------+
```

### 8.2 Proof (E5): where it lives

- **In the "Done" panel** (9.2), a "Check your proof" section: three thumbnails (front, back, side), 4:5, on white, rendered from the design by the proof renderer (never with the selection or guides). Tapping one opens it full screen with pinch-zoom and a 44 px close; Back closes it.
- While the renders are made: three `surface-alt` boxes of the same size and "Making your proof images…".
- Signing the proof belongs to the team order (the organiser signs the roster proof), not to the editor.

---

## 9. Saving, sharing, price and "Add to team order"

### 9.1 Where they live

| Thing | Compact | Wide |
| --- | --- | --- |
| Save state | Top bar, middle | Top bar, after undo/redo |
| Share | Done panel | Top bar (secondary) and Done panel |
| Price | Done panel | Top bar, before Done |
| Add to team order | Done panel (the red button there) | Done panel |
| Done | Top bar (red) | Top bar (red) |

**One red button per view:** "Done" in the top bar. When the Done panel is open, its main button ("Add to team order") is the red one, and "Done" in the top bar becomes inactive and reads "Done" with a check (it is the panel's opener, now open).

### 9.2 The Done panel

Opens over the tools (compact: the panel area at expanded height; wide: a 400 px panel from the right over the stage's right side, the garment re-framed to the left).

```
+----------------------------------------------------------+
| YOUR KIT                                           [v]   |
| [front] [back] [side]          (E5: proof images)        |
| Jersey · Lahore Lions                                    |
| (!) 1 thing to check: logo may print blurry.  [Show]     |
| Price           copy from founders (host slot)           |
| [          ADD TO TEAM ORDER          ]   (red, host)    |
| [ Share for feedback ]  (secondary, later)               |
| Keep designing                                           |
+----------------------------------------------------------+
```

- **Things to check:** the open warnings (low resolution, no transparency, clipped at a seam, hard to read), each with "Show", which closes the panel, selects the item and turns the camera to it. Warnings never block "Add to team order" (opinion; the designer check catches the rest, if the founders offer one).
- **Price, the team order button and Share are host slots:** the editor package draws the panel; the storefront fills the slots with its own components and data (price from the product in the visitor's region, using `convertToLocale`; the team order action). The editor package stays free of the store (the plan's coupling rule).

### 9.3 Before the backend exists (E3, E4)

- **Saving:** the design (JSON) and its logo files are saved **in the browser on this device** after every change (debounced 1 s; IndexedDB, because logo files don't fit localStorage). The save state reads "Saved on this device" (W-ED4). Reopening the same product's editor on the same device offers: "Continue your last design?" with "Continue" (red is not used: secondary) and "Start again" (W-ED142).
- **Share:** hidden. Not shown inactive: a button that never works teaches people to ignore it (opinion).
- **Price:** the storefront shows the product's regional price in the slot ("from … per piece", the existing product-page price line). In the standalone demo the slot is empty.
- **Add to team order:** team orders don't exist yet. The Done panel's red button reads "Save and go back" (W-ED163), which returns to the product page, and a line under it says when team orders open (**copy from founders**, W-ED164 **P**).
- **Later (with the backend):** "Saved" means saved to the account with a version; signed-out coaches see "Saved on this device · Sign in to keep it" (Spized's "Don't lose your work" prompt is the same need, 1.1, but ours never blocks); Share opens a sheet with "Copy link" and "WhatsApp" first (the coaches' channel in our markets; opinion), producing a read-only link; Admiral's "share for internal review" is the model (1.3).

---

## 10. States and errors

### 10.1 Loading

- **Shell first:** the top bar, the dock or rail, and the stage background render at once (no layout shift later).
- **The garment:** a flat silhouette of the product (an SVG outline from the product data, `surface-alt` fill on the stage) in the exact place the model will appear, with a 4 px progress bar under it and "Loading your kit… 40%" (`small`, from the model loader's progress, N17).
- **Tools:** visible but inactive (`aria-disabled`) until the model and the design's fonts are ready; tapping one says "Almost ready…" in the status line.
- **Fonts** arriving after the model: the text is drawn when they arrive (as today); while a font is missing, the panel of the item says "Fonts are still loading. Names may change shape slightly." (W-ED145).

### 10.2 Slow connection

- After **8 s**: under the progress bar, "Still loading. Your connection seems slow." (W-ED141).
- After **30 s** with no progress: "We couldn't load the 3D kit." with "Try again" and, if WebGL works, nothing else; the flat view (10.3) as a second action "Use the flat view".
- Budgets that keep this rare: section 11.3.

### 10.3 No WebGL, or the 3D view fails: the flat view

If WebGL 2 isn't available (about 3% of usage, 1.5), or the context can't be created, the editor does not stop. It shows **the flat view**: the front and back pieces side by side (sleeves under them), drawn by the same `drawPatternTexture` in flat mode (the demo's "Flat pattern pieces" already does this).
- Every tool works: colours, templates, names, numbers, logos, text.
- Selection: by tapping a piece item in the flat view (2D hit test, `layerAtPoint`, exists) or from "On this kit". Moving: the fine-tune controls and presets only in E3 (drag in the flat view later).
- A banner at the top of the stage: "The 3D view can't run on this device. You can still design your kit here." (W-ED143).
- **If the 3D context is lost** while working (a phone under memory pressure): the stage shows "Restarting the 3D view…" and the engine restores it; the design is untouched. After two failures in a session, switch to the flat view with the banner.

```
FLAT VIEW (no WebGL)                                     360 x 640
+------------------------------------------------------------+
| [X]  [<-] [->]         (v) Saved          [   DONE   ]     |
+------------------------------------------------------------+
| (i) The 3D view can't run on this device. You can still    |
|     design your kit here.                                  |
|   +-----------+   +-----------+                            |
|   |  FRONT    |   |  BACK     |                            |
|   |  TIGERS   |   |  ALI RAZA |                            |
|   |   (o)     |   |    10     |                            |
|   +-----------+   +-----------+                            |
|   [ sleeve ]      [ sleeve ]                               |
+------------------------------------------------------------+
| Design | Colours |  Team  | Players | Logos  |  Text      |
+------------------------------------------------------------+
```

### 10.4 Upload failures

| Case | Where it shows | Wording |
| --- | --- | --- |
| Wrong type (by content) | Error alert in Logos | W-ED94a |
| SVG | Error alert | W-ED94f |
| Too large (over 10 MB) | Error alert | W-ED94c |
| Damaged | Error alert | W-ED94b |
| Too small or too large in pixels | Error alert | W-ED94d |
| Animated | Error alert | W-ED94e |
| Network failure | Error alert with "Try again" | W-ED97 |
| No transparency | Warning on the logo card | W-ED95 |
| Low resolution at this size | Warning on the logo card and badge on the item | W-ED96 |

The engine's own messages are developer-grade (they name codes and limits); the editor maps each `code` to a coach-grade sentence from the wording data. Never show the engine's text.

### 10.5 Undo and redo

- Buttons in the top bar (always visible), Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y (as today). No counts.
- After each undo or redo, the status line (a polite live region at the top of the stage) says what changed: "Undone: Body colour" (W-ED150). Every edit therefore carries a short label (N-list: a label with each history step).
- Undo of an action on a side the camera isn't facing turns the camera to it (it is the coach's own action).
- Inactive at the ends (`aria-disabled`, `ink-muted` icons on navy: `on-inverse-muted`).

### 10.6 Losing work

- **Autosave** (9.3) makes this rare.
- **If the last save failed** (storage full, private browsing): the save state reads "Not saved" with the alert icon (W-ED6); tapping it explains: "This browser didn't let us save your design. Keep this page open, or free some space." (W-ED6b). Leaving then triggers the browser's own "leave page?" prompt (`beforeunload`), and the Close button asks first in a `ConfirmDialog`: "Leave without saving?" / "Stay" / "Leave" (W-ED7x).
- **Two tabs** with the same design: the later save wins; the other tab shows "This design changed in another tab." with "Reload" (W-ED148).

### 10.7 Errors from an edit

The design functions throw readable errors for impossible edits. The interface prevents them (inactive controls, limits); if one still happens, the change is not applied and the status line says "That change couldn't be made." (W-ED149). The engine's message goes to the console, not the screen.

---

## 11. Right-to-left text, accessibility and performance

### 11.1 Right-to-left text

- **Every text field** for names, team name and free text has `dir="auto"`; the number field `dir="ltr"`.
- **On the model,** the engine already resolves the direction from the first strong letter and aligns by reading direction. The interface has **no "Direction" control** (T4): "auto" is always right for one line; the engine's override stays for the design team.
- **Alignment** buttons, where shown (free text only), are labelled Start / Centre / End, with icons that flip when the text is right-to-left.
- **Lists and chips** that show names wrap them in `<bdi>` (05 §2.4). The player chip keeps "number · name" in the page's direction.
- **Fonts:** the font list shows Arabic-script samples in the fallback font, and marks fonts with no Arabic letters "Latin only: Arabic and Urdu use {fallback}" (W-ED87).
- **Test names** in every screenshot review: `Ali Raza`, `محمد علی`, `عبدالله الهاشمي`, `Muhammad Abdul Rehman Qureshi` (05 §2.4), numbers `10`, `٧`, `07`.
- **The interface itself in Arabic or Urdu** is not planned, but the editor uses CSS logical properties (`margin-inline-start`, `inset-inline-end`) throughout, so a right-to-left interface later is a translation, not a rebuild. The rail then sits on the right in the wide layout.

### 11.2 Accessibility

- **Keyboard:** every action is possible without the canvas. Tab order: top bar, the tool tabs (one tab stop; arrows move between tabs; `role="tablist"`), the open panel, the stage (one stop; arrows turn when nothing is selected), view controls, "On this kit". Shortcuts as in 5.1 and 10.5, listed in the "?" help of the stage.
- **Focus:** the 2 px `focus` ring with 2 px offset (03). On navy, the ring is white with the `focus` ring outside it (white on navy 18:1; focus blue on navy is only 3.5:1).
- **Touch targets:** 44 × 44 at least; handles have 44 px hit areas around smaller visible marks; 8 px between targets.
- **Contrast:** text 4.5:1 or more (pairs in 12.2); controls and handles 3:1 or more against what is under them; the handles are two-tone so they hold on any kit colour.
- **Not by colour alone:** swatches have names and a check; warnings have an icon and words; the current side is pressed and filled.
- **Reduced motion:** camera cuts instead of turns; no zone flash animation (a static outline for 1.5 s); no panel slide (instant); no vibration.
- **Pointer alternatives:** zoom buttons (2.5.1), fine-tune and presets (2.5.7).
- **The non-3D description:** the stage has `role="img"` and an accessible name that describes the kit in words, updated after each change (debounced 1 s, not announced): "Jersey, back view. Body navy, shoulders white, side panels red. Team name TIGERS on the chest. Logo on the left chest. Name ALI RAZA and number 10 on the back." The "On this kit" list is the full, navigable version. Screen-reader users can do everything through the panels and the list; the flat view (10.3) is available from the stage's "?" as "Show the flat view".
- **Announcements:** the status line is `role="status"`; upload errors are `role="alert"` and take focus.
- **Panels:** compact panels are non-modal regions (`role="region"`, labelled by the tool name), so focus is not trapped; Back and Esc close them; a visible close button always (1.6). The Done panel and dialogs are modal (`<dialog>` with `showModal()`, which traps focus natively).

### 11.3 Performance budgets (the developer must hold these)

| Budget | Value | How measured | Basis |
| --- | --- | --- | --- |
| Editor route JavaScript (gzip), including three.js | ≤ 450 KB | Build report | Opinion; three.js alone is a large share |
| Model file | ≤ 2 MB | File size | E2b acceptance |
| Fonts loaded at start | Only the fonts the design uses, plus the UI fonts | Network panel | Opinion |
| Model visible on a mid-range Android phone over a 4G-like profile (Chrome DevTools "Fast 4G", 4× CPU slowdown as a stand-in until E5) | ≤ 4 s | Trace | Opinion |
| Tap to change on the model (swatch, template, toggle) | ≤ 100 ms p75; never above 200 ms | Performance marks around each edit | web.dev INP "good" ≤ 200 ms (1.6) |
| Frame rate while dragging an item or turning | ≥ 30 fps; else draft quality (5.3) | Trace | Opinion |
| Template thumbnails | ≤ 5 ms each to draw at 160 px; drawn lazily as cards scroll in | Performance marks | Opinion |
| Texture memory | ≤ 64 MB GPU (one 2048 texture with mipmaps is about 21 MB, README) | Estimate from sizes | README |
| Idle | 0 frames rendered | Trace | Already true (`frameloop="demand"`) |

E3 logs the timings to the console in development; E5 measures them on a real mid-range Android phone, as dev-plan says.

---

## 12. Visual design and tokens

### 12.1 How direction A applies inside the editor

- **Frame:** the top bar is `inverse` navy, like the store header, so the editor is visibly part of the store. Everything else in the frame is white (`surface`) with `border` dividers.
- **The kit is the colour:** the frame has no colour except navy, the one red button, and the `focus` blue. No accent lime in the editor (it would compete with kit colours; 03 allows it only on navy, and the editor doesn't need it).
- **Type:** Barlow Condensed 700 uppercase for panel titles (`h3`, 20/26 on compact, 22/28 on wide) and the Done button label; Inter for everything else; Noto Sans Arabic for Arabic-script text in fields and lists. Rail and dock labels: Inter 14/20, semibold when active.
- **Buttons:** the store's Button look: 4 px radius, 48 px tall for main buttons, 44 px for tool buttons; primary red with white label; secondary `ink` outline (on navy: white outline, white label).
- **Panels:** `surface`, 16 px top corners on compact (`radius-sheet`), a 1 px `border` line on the top edge and a soft shadow `0 -4px 16px rgb(11 21 48 / 0.08)`; the grab handle 36 × 4 px `border-strong`, centred, in a 24 px tall strip (the strip, not the bar, is the drag target).
- **Icons:** 24 px line icons, 1.75 px stroke, round caps, `currentColor`, the same drawing rules as the store's `LineIcon`. Drawn in the editor package (no icon library). New icons: template grid, palette drop, team shield, shirt number, image, Aa, undo, redo, share, eye, rotate, layers stack, more (⋯), close, zoom in, zoom out, reset view, lock, swap (⇄), check, alert.

### 12.2 Tokens

Existing store tokens, used as they are (CSS variables `--c-*`): `surface`, `surface-alt`, `ink`, `ink-muted`, `inverse`, `on-inverse`, `on-inverse-muted`, `primary`, `primary-hover`, `border`, `border-strong`, `success`, `error`, `error-surface`, `success-surface`, `focus`.

**New tokens for the editor** (contrast computed on 12 Nov 2026, WCAG 2.x):

| Token | Value | Use | Contrast |
| --- | --- | --- | --- |
| `stage-top` | #F6F8FB | Stage gradient, top | `ink` on it 17.0:1; `ink-muted` 7.1:1 |
| `stage-bottom` | #E3E8EF | Stage gradient, bottom | `ink` 14.7:1; `ink-muted` 6.1:1; `border-strong` 3.7:1; `focus` 4.2:1 |
| `stage-deep-top` | #C9D1DE | Stage for very light kits, top | `ink` 11.7:1; a white garment 1.5:1 |
| `stage-deep-bottom` | #AEB8C8 | Stage for very light kits, bottom | `ink` 9.0:1; a white garment 2.0:1 |
| `stage-shadow` | `rgb(11 21 48 / 0.18)` | The soft contact shadow under the garment (an ellipse, blurred) | decorative |
| `warning` | #8A5A00 | Warning icon and text | 5.9:1 on white; 5.6:1 on `warning-surface` |
| `warning-surface` | #FFF7E6 | Warning alert background | `ink` on it 16.9:1 |
| `handle` | #FFFFFF fill, `ink` 2 px border | Selection handles | two-tone: visible on light and dark kits |
| `guide` | `focus` #2563EB, 1 px dashed | Snapping guides | 4.2:1 on the light stage; drawn on the garment with a 1 px white halo |
| `overlay-control` | `surface` at 92% opacity | View controls on the stage | |

**Decision: a light stage that deepens for light kits.**
- **Why light:** our default and most common kit colours (navy, black, red, green; the placeholder palette) stand out on light grey: navy 11.1:1, black 15.3:1 against `stage-bottom`. A dark stage would swallow navy and black kits, and our product photos sit on light grey too (03). Opinion, backed by the ratios.
- **The problem:** a white kit on a light stage has almost no edge (white on `stage-bottom` is 1.2:1).
- **The fix:** when the body zone's relative luminance is above 0.6, the stage cross-fades over 250 ms to the deep pair (`stage-deep-*`), giving a white kit 1.5 to 2.0:1 plus the model's own shading and the contact shadow. It switches back below 0.5 (a gap, so it doesn't flicker). Reduced motion: no fade.
- **Rejected:** a dark stage (premium-looking in renders, but our navy-heavy kits disappear: opinion); a user toggle for the stage (one more control nobody needs; opinion).

**Spacing, radii, motion:** the store's (03): 4 px base, `radius-control` 4, `radius-card` 8, `radius-sheet` 16; motion 150 to 250 ms ease-out for the interface, 350 ms ease-in-out for camera turns only.

---

## 13. Components

**Where they live.** The editor's interface is built **in `packages/editor`** (a new `src/ui/` folder), as React components with plain CSS that reads the store's `--c-*` variables, with fallback values so the standalone demo looks right. It must not import the storefront, Next.js, Tailwind or Medusa (the plan's coupling rule). The storefront embeds `EditorShell` and fills its slots (price, team order, share, sign-in) with its own components. **No new libraries:** dialogs use the native `<dialog>`, panels are plain elements, icons are drawn in the package.

Size key as in 05: **S** about half a day, **M** about 1 day, **L** 2 days or more (opinion, for planning only).

### 13.1 New, in `packages/editor`

| Component | Size | Notes |
| --- | --- | --- |
| `EditorShell` | L | Chooses compact, short or wide (3.1); holds the top bar, tools, panel, stage; host slots (`price`, `primaryAction`, `share`, `account`); viewport meta behaviour for the keyboard |
| `TopBar` | M | Close, undo, redo, save state, Done; compact and wide versions |
| `ToolTabs` | M | Dock (compact), rail (short, wide); `tablist` with arrow keys |
| `ToolPanel` | L | Compact: bottom panel with normal and expanded heights, grab strip, header, "‹ Back" sub-views, Back and Esc close; short: side panel; wide: fixed panel. Reports its covered size for `viewInsets` |
| `Stage` | M | Wraps `DesignCanvas`; stage tones; contact shadow; hint chip; status line; "On this kit" button; player chip slot |
| `ViewControls` | S | Front / Back / Left / Right, zoom, reset |
| `SelectionOverlay` | L | Handles, turn handle, box, "Turn to edit"; drives scale and rotate gestures through the history's begin/preview/end |
| `ContextBar` | S | The selected item's actions |
| `StartCard` | M | First run (7.2) |
| `TemplateCard`, `TemplateGallery` | M | Flat front thumbnails in team colours; tap to try |
| `ZoneChips` | S | With tap-to-zone link and the zone flash |
| `Swatch`, `SwatchGroups` | M | States in 4.3; groups and families |
| `TeamColours` | S | Main / Second / Accent slots; swap |
| `ColourCodeMatch` | M | HEX field, both chips, match level, "Use" |
| `TextRoleControls` | M | Shared by Team, Players and Text: value field, where (presets), style, outline, size, readability warning |
| `FontList` | S | Rows set in the coach's own text |
| `PositionPresets` | S | Chips with mini diagrams; "wearer's left" |
| `PlayerControls` | M | Sample player, switches, digits |
| `LogoDropzone`, `LogoCard` | M | Upload flow, checks mapped to wording, Make it sharp, Replace, Remove |
| `FineTune` | S | Steppers for size, turn, nudge, centre |
| `OnThisKit` | M | List, row menu, locked shapes, empty state |
| `DonePanel` | M | Things to check, proof slot (E5), host slots |
| `FlatView` | M | No-WebGL editor surface (10.3) |
| `StatusLine` | S | Polite live region; undo labels; timed messages |
| `ConfirmDialog` | S | Native `<dialog>` |
| `EditorIcon` | S | The icon set (12.1) |
| `editorWording` (data) | S | All wording from section 14, as data with ids, marked `// DRAFT WORDING.` |
| `PlayerChip` (E4) | S | Previous, next, list |

### 13.2 Reused (the look and the rules, re-created in the package from the store's specification)

The package can't import storefront code, so these are matched, not imported. The storefront's components remain the reference for look and behaviour:
- `Button` (primary, secondary, text; loading and inactive states) from 03 and the store.
- `TextField` look and its states (05 §2.3), including the error state and `dir` rules.
- `Alert` (info, error, success; plus the new warning variant) (05 §2.5).
- `QuantityStepper` pattern for the size stepper (05 §2.7).
- `Sheet` behaviour: Back closes it (history entry), visible close button, focus returns to the opener (05 §10.1).
- `LineIcon` drawing rules (stroke 1.75, 24 px).

### 13.3 Used from the storefront, in the host slots

- The product's regional price line and `convertToLocale` (05 §2.4).
- The store's `Button` for "Add to team order" when team orders exist.
- The store's `Sheet` for sign-in and share sheets opened from the slots.

### 13.4 Removed from today's demo (the demo page keeps them only behind a developer switch)

The "Design is valid" status, the "Checks" box, the design JSON, the font licences, the texture statistics, the flat pattern and close-up panels, the test-file buttons, the Latin / Urdu / Arabic preset buttons, the direction select, the undo counts. The developer switch (`?dev=1` on the demo page only) keeps them for the engine owner.

---

## 14. Draft wording, founders to confirm

All of this is **DRAFT WORDING, founders to confirm**. It goes into the editor package as data (`editorWording`), marked `// DRAFT WORDING.`, never into components. **P** marks a sentence that states or touches a promise, a payment, a rule or a print capability; those need the founders' attention first. UK spelling ("colours"), to match the store.

### Frame (`frame`)
| Id | Text |
| --- | --- |
| W-ED1 | Close (accessible name: "Close the editor") |
| W-ED2 / W-ED3 | Undo / Redo |
| W-ED4 | Saved on this device |
| W-ED5 | Saving… |
| W-ED6 | Not saved |
| W-ED6b | This browser didn't let us save your design. Keep this page open, or free some space. |
| W-ED7 | Done |
| W-ED7a / W-ED7b / W-ED7c | Leave without saving? / Stay / Leave |
| W-ED8 | Saved *(later, with accounts)* |

### Tools (`tools`)
| Id | Text |
| --- | --- |
| W-ED10 | Design |
| W-ED11 | Colours |
| W-ED12 | Team |
| W-ED13 | Players |
| W-ED14 | Logos |
| W-ED15 | Text |
| W-ED16 | Show all / Show less |
| W-ED17 | ‹ Back |

### Start card (`start`)
| Id | Text |
| --- | --- |
| W-ED20 | Let's make your team's kit |
| W-ED21 | Team colours (pick 2 or 3) |
| W-ED22 | Team name |
| W-ED22b | e.g. Lahore Lions *(placeholder)* |
| W-ED23 | See designs in your colours |
| W-ED24 | Skip: start from this design |
| W-ED25 | You can change everything later. |

### Design (`templates`)
| Id | Text |
| --- | --- |
| W-ED30 | Designs |
| W-ED31 | Shown in your team colours. Tap one to try it. |
| W-ED32 | Current |
| W-ED33 | Your name, logo and colours stay when you change designs. |
| W-ED34 | Design changed · Undo |

### Colours (`colours`)
| Id | Text |
| --- | --- |
| W-ED40 | {zone}: {colour name} |
| W-ED41 | Team colours |
| W-ED42 | Main · Second · Accent |
| W-ED43 | Recently used |
| W-ED44 | All colours |
| W-ED45 | Edit team colours |
| W-ED46 | Swap main and second |
| W-ED47 | Tap the kit to choose a part. |
| W-ED48 | Match a colour code |
| W-ED49 | Enter a colour code, like #1F4E9C |
| W-ED50 | You entered / We'll print |
| W-ED50a / W-ED50b / W-ED50c | Very close match / Close match / Clearly different: check before you order |
| W-ED50d | Use {colour name} |
| W-ED50e | {zone}: {colour name} (matched from {code}) |
| W-ED51 | That isn't a colour code. Use 6 characters from 0–9 and A–F, like #1F4E9C. |
| W-ED54 **P** | Colours on screens vary. We print from our tested colour range. |

### Team, players, text (`lettering`)
| Id | Text |
| --- | --- |
| W-ED60 | Team name |
| W-ED61 | Where |
| W-ED62 | Chest · Above the number · Off |
| W-ED63 | Style |
| W-ED64 | Font · Colour · Outline · Size |
| W-ED65 | None · Thin · Thick |
| W-ED66 | Small · Medium · Large |
| W-ED70 | Names and numbers |
| W-ED71 **P** | Each player's name and number come from your team list. |
| W-ED72 | Preview as |
| W-ED72b | PLAYER *(sample name)* and 10 *(sample number)* |
| W-ED72c | Sample |
| W-ED73 / W-ED74 | Player name / Number |
| W-ED75 | On the shirt |
| W-ED76 | Name on back · Number on back · Number on front · Number on sleeve |
| W-ED77 | Digits: 0–9 · ٠–٩ |
| W-ED78 | Long names get smaller to fit. |
| W-ED79 | Use 1 or 2 digits, from 0 to 99. |
| W-ED80 | Use one kind of digits, not both. |
| W-ED81 | Enter a number to preview. |
| W-ED85 | Hard to read on {colour name}. |
| W-ED86 | Add outline / Choose a darker colour |
| W-ED87 | Latin only: Arabic and Urdu use {font} |
| W-ED100 | Add text |
| W-ED101 | Printed the same on every shirt. |
| W-ED102 | Start · Centre · End |

### Logos (`logos`)
| Id | Text |
| --- | --- |
| W-ED90 | Add your team logo |
| W-ED91 | PNG, JPG or WebP, up to 10 MB. A transparent background prints best. |
| W-ED91b | or drop it here *(pointer devices)* |
| W-ED92 | Checking your logo… |
| W-ED93 | Where |
| W-ED93b | Left chest · Right chest · Centre chest · Upper back · Left sleeve · Right sleeve |
| W-ED93c | Left chest (wearer's left) *(accessible name and tooltip)* |
| W-ED94a | {file} isn't a picture we can print. Use a PNG, JPG or WebP file. |
| W-ED94b | {file} seems damaged. Save it again and try once more. |
| W-ED94c | {file} is {size}. The largest we take is 10 MB. |
| W-ED94d | {file} is too small to print well. Use a bigger version of your logo. *(and "too large: save a smaller version")* |
| W-ED94e | {file} is animated. Use a still picture. |
| W-ED94f | SVG files can't be used yet. Save your logo as a PNG and try again. |
| W-ED95 | No transparent background: it will print as a box with its background colour. |
| W-ED95b | Keep it |
| W-ED95c **P** | Our designers can clean it up for you. *(copy from founders: free design help)* |
| W-ED96 | May print blurry at this size. Sharp up to {size}. |
| W-ED96b | Make it sharp |
| W-ED97 | Your logo didn't upload. Check your connection and try again. |
| W-ED98 | Replace · Remove · Add another logo |
| W-ED99 **P** | Only upload logos you have the right to use. *(Spized warns against trademarked logos, 1.1; founders decide)* |

### Selection and the list (`selection`)
| Id | Text |
| --- | --- |
| W-ED110 | Delete · Duplicate · More · Done |
| W-ED110b | Bring forward · Send back · Edit |
| W-ED111 | Part of this is cut off at the seam. |
| W-ED111b | Move it in |
| W-ED112 | Turn to edit |
| W-ED113 | Fine-tune |
| W-ED114 | Bigger · Smaller · Turn left · Turn right · Straighten · Centre on the shirt |
| W-ED116 | Drag to turn. Tap something to change it. / Drag to turn. Click something to change it. |
| W-ED130 | On this kit |
| W-ED131 | Nothing added yet. Add your team name, players or a logo. |
| W-ED132 | From the design · Locked |

### View (`view`)
| Id | Text |
| --- | --- |
| W-ED120 | Front · Back · Left · Right |
| W-ED121 | Zoom in · Zoom out · Reset view |
| W-ED122 | {product}, {side} view. {summary} *(stage description)* |

### States (`states`)
| Id | Text |
| --- | --- |
| W-ED140 | Loading your kit… {percent}% |
| W-ED140b | Almost ready… |
| W-ED141 | Still loading. Your connection seems slow. |
| W-ED141b | We couldn't load the 3D kit. / Try again / Use the flat view |
| W-ED142 | Continue your last design? / Continue / Start again |
| W-ED143 | The 3D view can't run on this device. You can still design your kit here. |
| W-ED144 | Restarting the 3D view… |
| W-ED145 | Fonts are still loading. Names may change shape slightly. |
| W-ED146 | Some fonts couldn't load. Check your connection and try again. |
| W-ED148 | This design changed in another tab. / Reload |
| W-ED149 | That change couldn't be made. |
| W-ED150 | Undone: {change} / Redone: {change} |

### Done panel (`done`)
| Id | Text |
| --- | --- |
| W-ED160 | Your kit |
| W-ED161 | {n} things to check / 1 thing to check · Show |
| W-ED162 | Add to team order *(when team orders exist)* |
| W-ED163 | Save and go back *(until then)* |
| W-ED164 **P** | Team orders open soon. Your design is saved on this device. *(copy from founders)* |
| W-ED165 | Share for feedback *(later)* |
| W-ED166 | Keep designing |
| W-ED167 | Check your proof · Making your proof images… *(E5)* |
| W-ED168 | Price *(host slot: the store's price line, copy from founders)* |

### Players preview, E4 (`roster`)
| Id | Text |
| --- | --- |
| W-ED170 | Previous player / Next player |
| W-ED171 | Player {i} of {n} |
| W-ED172 | Too long for this font |
| W-ED173 | Same number as {name} |

Change labels for the status line (W-ED150) come from the edit: "Body colour", "Team name", "Logo position", "Logo size", "Design", "Number style", and so on, one per edit type.

---

## 15. Build order, the E3 checklist, and what the engine must add

### 15.1 Recommendation: split E3 in two

E3 as written in dev-plan (palette with HEX snapping, templates) plus this interface is too large for one reviewable step (opinion). Recommended:

**E3a: the shell, templates and colours** (the founder sees the new editor quickly)
- `EditorShell` with the three layouts; top bar; tool tabs; panels with normal and expanded heights; stage with stage tones, view controls, zoom buttons and reset; `viewInsets` framing.
- Start card; Design with tap to try (4 or 5 placeholder templates with shapes); team colours and swap.
- Colours: zone chips, tap the kit to choose a zone, zone flash, swatch groups, recent colours, **colour code match with both colours shown** (dev-plan's E3 line).
- Team and Players tools with presets, style, sample player and switches; the readability warning; text outline if the engine owner sizes it at a day or less (otherwise E3b).
- Status line with undo labels; local autosave and "Continue your last design?".
- Loading, slow, and the flat view (static, with presets).
- The developer-only demo switch.

**E3b: on-model editing and logos**
- Selection on the model with select-first on touch; `SelectionOverlay` handles; snapping with guides; print areas; "Turn to edit"; contextual bar; fine-tune.
- Logos: drop zone, check wording, placement presets, Make it sharp, warnings and badges; Text tool; "On this kit".
- Draft-quality drags (5.3), with timings logged.
- Done panel (without proof), host slots.

**E4:** roster preview: player chip, list, previous and next; real maximum lengths per font; "Too long" and duplicate badges; the start of real phone measurements.
**E5:** proof renders in the Done panel; phone performance measured against 11.3.
**Later:** share and save with the backend; Add to team order; patterns and fades (4.4); mirror to the other sleeve; remove plain background; arched text; drag in the flat view; 3D template thumbnails; an Arabic or Urdu interface.

### 15.2 What the engine must add (for the engine owner and the coordinator)

| # | Need | For | Size (opinion) | Format change? |
| --- | --- | --- | --- | --- |
| N1 | A `role` on items: `team-name`, `player-name`, `player-number`, `crest`, `sponsor`, `text`, `graphic` | 4.5, E4 roster swap | S | Yes |
| N2 | Templates as data: colour roles mapped to zones, role slots with presets and styles; `applyTemplate(design, template, identity)` that keeps team colours, team name, logos; `teamColors` in the design | 4.1, 4.2 | L | Yes |
| N3 | A `shape` item: a vector path in piece millimetres with a fill colour, clipped to the piece, locked by default | 4.4 option A | M | Yes |
| N4 | Text outline: colour and width on text and number items, drawn in the texture and in proofs | 4.5.2 | S–M | Yes |
| N5 | Product data: position presets (id, label, piece, centre, maximum box, kinds allowed, camera side) and capabilities by decoration method | 4.6, 4.9 | M | Product format |
| N6 | Print areas per piece; keep the whole box inside; a "clipped by the outline" check | 5.2 | M | Product format |
| N7 | Camera: animated `showSide` with a duration and a reduced-motion cut; `focusOn(item)`; `zoomIn`, `zoomOut`, `reset`; `viewInsets` (bottom, right) to frame in the free area; an event when the user turns the camera; the current side | 3.3, 6 | M | No |
| N8 | Tap to choose a zone (raycast to `zoneAtUv`) and an editor-only zone highlight | 4.3 | S | No |
| N9 | Piece point to screen point (a UV-to-surface lookup) for the four corners of an item; whether the item faces the camera | 5.2 | L | No |
| N10 | Drag policy: `dragOnlySelected` for touch; scale and rotate gestures; a snapping function returning guides; editor-only guide drawing | 5.1, 5.2 | M | No |
| N11 | Draft quality during gestures (half-size texture, or partial upload of the changed piece) with timings | 5.3 | M | No |
| N12 | Report, per text item, whether it was shrunk to fit and by how much | 4.5 | S | No |
| N13 | Template thumbnails: the flat front piece drawn small (possible today with `drawPatternTexture` and `pieceTextureRect`) | 4.1 | S | No |
| N14 | Palette data: families, print-tested flag, "common" order; `nearestPaletteColour(hex)` with CIEDE2000 ΔE; whether to keep the requested code with a colour | 4.3 | S (+ format question) | Maybe |
| N15 | Readability helper: contrast between an item's colour and the zone under its centre | 4.5 | S | No |
| N16 | WebGL check, context lost and restored events; a flat view with 2D selection | 10.3 | M | No |
| N17 | Model loading progress | 10.1 | S | No |
| N18 | A label with each history step, for "Undone: …" | 10.5 | S | No |
| N19 | An optional IndexedDB asset store and design autosave helper (the host decides to use it) | 9.3 | M | No |

N1 to N4 change the design format. **Whether that is version 3, or optional additions to version 2, is the engine owner's and coordinator's decision** (Q-D5).

### 15.3 E3 review checklist (E3a and E3b), at 390 × 844 and 1366 × 900

Screenshots with device emulation at 390 px (and 360 × 640 for the starred items), and at 1366 px, each opened by the reviewer:

1. ★ At 360 × 640, with any tool at normal height, the garment is fully visible and the stage is at least 288 px tall (MO4).
2. ★ The six tabs fit at 360 px with their labels on one line; none is cut.
3. Opening a tool turns the camera as in 6.3 and frames the garment above the panel; the panel never covers the garment's body.
4. Expanded panel: the garment is still visible (stage ≥ 160 px); Back closes the panel; the close button is visible.
5. Phone keyboard open on the team name: the chest is visible above the field and each letter appears on the model as typed.
6. First open shows the start card; 2 colours and a name; "See designs in your colours" shows every card in those colours with that name.
7. Tapping a template changes the model within one frame of the tap (log ≤ 100 ms on desktop); team name, logo and colours survive; "Undo" brings back the previous design in one step.
8. Colours: tapping the body on the model selects "Body" and it flashes; the header line names the colour in words; the selected swatch has a check.
9. Colour code: `#1A5FB4` shows both colours, the match line and "Use …"; an invalid code shows the error; nothing off-palette reaches the design JSON.
10. Players: the camera turns to the back; switches add and remove name and number at the right places; a 30-character name shrinks and says so; `100` and `1٢` show the coach-grade errors.
11. Readability: navy number on a navy body shows "Hard to read on Navy" and the fix works.
12. ★ Touch: a drag starting on an unselected team name turns the garment and doesn't move the name; after a tap, dragging moves it.
13. Handles: corner resize and turn work on the model at 390 and 1366; snapping to the centre line shows a guide; the item can't leave the print area.
14. The contextual bar never covers the selected item or its handles.
15. Logos: a JPEG crest is placed on the left chest (screen right in the front view) and selected; the "box" warning and "Make it sharp" work; an SVG and a renamed PDF get the coach-grade errors; no engine message is visible anywhere.
16. Undo and redo from the top bar and the keyboard, with "Undone: …" announced.
17. Reload the page: "Continue your last design?" restores the design with its logo.
18. With WebGL disabled (Chrome `--disable-webgl`), the flat view appears with the banner, and colours, names and logos can still be changed.
19. Keyboard only, at 1366: every tool, every preset, view buttons and zoom can be reached and used, with a visible focus ring; the stage's accessible name describes the kit.
20. Reduced motion on: no camera turns animate, no panel slides, no flashes.
21. Test names: `محمد علی` and `عبدالله الهاشمي` as team name and sample player, `٧` as number, look right on the model and in the lists.
22. One red button per view; no developer text (JSON, "valid", texture sizes) without `?dev=1`.
23. Landscape phone (844 × 390): rail on the right, panel 320 px, garment to its left.

---

## 16. Open questions

### Design questions (for the coordinator and the engine owner)

| # | Question | Options | My recommendation |
| --- | --- | --- | --- |
| Q-D1 | Split E3? | A: E3a then E3b. B: one E3 | **A.** Smaller reviews; the founder sees the new editor sooner |
| Q-D2 | Touch: select first, then drag? | A: select first (touch), direct (mouse). B: direct everywhere (today) | **A.** Avoids moving the team name while turning the shirt |
| Q-D3 | Templates keep the team's colours, name and logos when switched? | A: keep. B: a template replaces everything | **A.** It is what makes "try a design" one tap |
| Q-D4 | Text outline in E3? | A: E3a if a day or less. B: E4 | **A** if sized small; names and numbers look unfinished without outlines |
| Q-D5 | Design format for roles, templates, shapes, outlines, team colours | A: version 3. B: optional fields in version 2 | Engine owner's call; nothing has been saved in production yet, so **A** costs little now |
| Q-D6 | Keep the colour code the coach asked for, next to the palette colour? | A: keep (`requested`). B: drop | **A.** Shows the coach where the colour came from; helps the design team |
| Q-D7 | Stage | A: light, deepening for light kits. B: light only. C: dark | **A** |
| Q-D8 | The "Players" tab name, before the roster exists | A: "Players". B: "Numbers" | **A.** It becomes the roster preview in E4 |
| Q-D9 | Where the editor's interface code lives | A: `packages/editor/src/ui`, with host slots. B: in the storefront | **A.** Keeps the editor portable (the plan's Shopify option) |

### Business questions (for the founders)

| # | Question | Options | My recommendation |
| --- | --- | --- | --- |
| Q-B1 | The print-tested palette: how many colours, which families, and which are "common" (shown first) | From the graphic designer and the factories | Needed for E3a; placeholders until then |
| Q-B2 | Logos without a transparent background: what do we offer? | A: free design help cleans it up (wording from you). B: an automatic remover later. C: nothing | **A** now, **B** tested later; not the AGPL library |
| Q-B3 | Should the editor show a price, and which: per piece at what quantity? | A: the product page's "from … per piece". B: none until the team order | **A**, wording from you |
| Q-B4 | Before team orders exist, what does "Done" lead to, and what do we say about when team orders open? | Wording from you (W-ED164) | Say nothing about dates unless you are sure |
| Q-B5 | Rights to logos: do we ask coaches to confirm they may use a crest or sponsor logo? | A: a line under the upload (W-ED99). B: in the terms only | **A**, short |
| Q-B6 | Patterns and fades: which products will be sublimated at launch? | Per product | Decides when 4.4 B and C can come |
| Q-B7 | Templates: 10 from the graphic designer, as planned; any for specific sports? | | Plain, hoops, sash, stripes, chevron as a minimum |
| Q-B8 | Fonts for names and numbers: which, and are their licences fine for printing? | | A varsity number font, a condensed name font, Noto Sans Arabic, and Noto Nastaliq Urdu once a reader has compared them (E2 note) |
| Q-B9 | Design check: do we promise a designer looks at every design (Spized and Admiral do, 1.1, 1.3)? | | Your decision; if yes, it belongs in the Done panel |
| Q-B10 | Printing-colour note (W-ED54) | | Your wording |

---

## 17. Sources

All opened on **12 Nov 2026** with a web-fetch tool (text only; no competitor site was opened in a browser).

| Source | What I took from it (evidence) |
| --- | --- |
| Spized configurator, Rio jersey: https://www.spized.com/en/configurator?apiLikeCfgId=4e887d7fd399dbef91bcf27e38d3aef6ee61b30cb98e64be05ec5af40c0f48ba800ea68682e76efe09253a9ac19e18c7d87eadcaca744059d25495ca8a53aca4&apiArticle=781001-V2&productNumber=781001-V2.SPIZED0026 | Action labels, drafts, price with promotion and countdown, team table, voting, design check, share options, "It's more fun on the desktop!" / "Switch to desktop" (text only, not seen) |
| Spized home: https://www.spized.com/en | "over 700 templates", step-by-step, share and vote, drafts |
| Spized design process: https://www.spized.com/en/design-process | The eight steps; outline advice; default positions; fixed text on every jersey; seams and neon tips |
| Spized help, category: https://spized.zendesk.com/hc/de/categories/18196091786397-Hilfe-im-Designprozess | Article list |
| Spized help, "configurator isn't working": https://spized.zendesk.com/hc/en-gb/articles/37608008379421-The-3D-configurator-isn-t-working-what-can-I-do | Recommends a laptop or PC over a smartphone; Chrome; clear cache |
| Spized help, default positions: https://spized.zendesk.com/hc/de/articles/22284464981661-Was-sind-Standardpositionen-und-wie-funktionieren-sie | Offered first time; left-hand window; not binding |
| Spized help, stand out from background: https://spized.zendesk.com/hc/de/articles/22284620533789-Was-kann-ich-tun-damit-sich-Namen-Nummern-und-Textfelder-besser-vom-Hintergrund-abheben | Outline with thickness, or a background rectangle, under "Farbe & Hintergrund" |
| Spized help, placing logos and lettering: https://spized.zendesk.com/hc/de/articles/18257690058397-Wie-platziere-ich-meine-Logos-und-Schriftz%C3%BCge-damit-sie-richtig-auf-dem-Trikot-sitzen | Guide lines and spacing indicators; mirror function |
| Spized help, checking names: https://spized.zendesk.com/hc/de/articles/22284273994013-Wo-kann-ich-pr%C3%BCfen-wie-die-Namen-Nummern-und-Initialen-die-ich-hinterlegt-habe-auf-meinem-Trikot-aussehen | Preview via "Bearbeiten" in the bottom navigation; opens after saving; "Ansehen" |
| Spized help, file formats: https://spized.zendesk.com/hc/de/articles/18257124369693-Welche-Dateiformate-kann-ich-f%C3%BCr-Logos-verwenden | Formats accepted; under 10 MB |
| Spized help, missing colours: https://spized.zendesk.com/hc/de/articles/18257794172317-Meine-Wunschfarben-sind-nicht-im-Konfigurator-was-soll-ich-tun | Pantone C; HEX not sufficient; by email |
| Spized help, own pattern: https://spized.zendesk.com/hc/en-gb/articles/37253902873245-I-can-t-find-a-suitable-pattern-in-the-configurator-can-I-use-my-own-pattern | "a little trick": shapes or an uploaded graphic |
| Spized help, templates: https://spized.zendesk.com/hc/en-gb/articles/36942964681373-Do-you-have-design-templates | "Best Customer Designs"; "Speed Designer" |
| owayo soccer: https://www.owayo.com/custom-soccer-jerseys.htm | Two configurator URLs (`konfigurator_html`, `konfigurator_m`); roster list in the 3D Designer |
| owayo phone configurator: https://www.owayo.com/konfigurator_m/?lang=en&land=us&sport=football&product=shirts_f3&design=Tackle&color=RDY52043963 | Returned only its title (not usable) |
| owayo colours: https://www.owayo.com/cycling/mydesign-colors-us.htm | 152 shades; smaller palette for some materials; Pantone/HKS/RAL by email |
| owayo lettering: https://www.owayo.com/cycling/mydesign-lettering-us.htm | 35 fonts; "We take care of the placement" |
| owayo logos: https://www.owayo.com/cycling/mydesign-logos-us.htm | JPG/PNG/GIF; logo pool; AI logo generator |
| Kukri kit designer: https://www.kukrisports.co.uk/kit-designer | Six steps; "4 week delivery" |
| Admiral Kitbuilder: https://admiralsports.com/pages/kit-builder-design-your-own-admiral-football-kit | Locker Room; share for internal review; design check |
| Kitlocker: https://www.kitlocker.com/ | Title only (not reached) |
| Nike By You: https://www.nike.com/nike-by-you | Marketing text only |
| Canva help: https://www.canva.com/help/editing-designing/ | 403 (not reached) |
| Adobe Express help: https://helpx.adobe.com/express/mobile/arrange-pages-and-elements/align-elements.html | 403 (not reached) |
| Adobe Community bug report, 16 Dec 2024: https://community.adobe.com/bug-reports-328/adobe-express-replace-bar-blocking-the-handle-to-crop-images-1468875 | The mobile bar blocks the crop handle |
| imgly background-removal-js: https://github.com/imgly/background-removal-js | AGPL-3.0 |
| Wikipedia, Color difference: https://en.wikipedia.org/wiki/Color_difference | RGB distance vs CIEDE2000; JND |
| caniuse, WebGL 2: https://caniuse.com/webgl2 | 97.29% global; iOS Safari 15+ |
| NN/g, Bottom sheets (11 Jun 2023): https://www.nngroup.com/articles/bottom-sheet/ | Nonmodal, close button, Back, no stacking |
| NN/g, Onboarding tutorials vs contextual help (12 Feb 2023): https://www.nngroup.com/articles/onboarding-tutorials/ | Push vs pull revelations |
| NN/g, Direct manipulation (2016, reviewed 2024): https://www.nngroup.com/articles/direct-manipulation/ | Definition; touch accidents; accessibility |
| NN/g, The power of defaults (2005): https://www.nngroup.com/articles/the-power-of-defaults/ | Users rarely change defaults |
| NN/g, Animation duration (9 Feb 2020): https://www.nngroup.com/articles/animation-duration/ | 100–500 ms; 200–300 ms for modals |
| web.dev, INP: https://web.dev/articles/inp | ≤ 200 ms good; > 500 ms poor |
| W3C, 2.5.1 Pointer gestures: https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html | Pinch needs a single-pointer alternative |
| W3C, 2.5.7 Dragging movements: https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html | Dragging needs an alternative |
| W3C, 2.5.8 Target size: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html | 24 px minimum; 44 px recommended |
| Shopify, media UX: https://shopify.dev/docs/storefronts/themes/product-merchandising/media/media-ux | 3D inactive by default; keyboard panning; labelled buttons |
| MDN, prefers-reduced-motion: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion | Definition and values |
| MDN, viewport meta: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport | `interactive-widget=resizes-content` |

**Opinion, not evidence:** the six tabs and their names, the panel heights, the start card, tap to try, select first on touch, the stage tones, the snapping distances, the ΔE thresholds, the budgets marked "opinion" and the split of E3 are my design judgements, based on the sources above, our demo's screenshots (section 2) and directions 03 and 05.
