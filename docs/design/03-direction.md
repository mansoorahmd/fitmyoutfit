# 03 Design direction

10 Nov 2026 · storefront-designer · Task S0-13. The evidence is in [01-research.md](01-research.md) and the defects in [02-current-state-review.md](02-current-state-review.md).

## Summary for the founder

The store today is Medusa's blank demo template. Its buttons don't even look like buttons (a setup fault, fixable in a day). Nothing on it says "team kit", shows a kit, or tells a coach why to trust us.

The best teamwear stores (owayo, Spized, Serious Sport, SWAZ, Sublimation Kings) share one simple structure:
- a plain headline and one obvious "design your kit" button;
- right under it, the three or four facts a coach worries about;
- the garments;
- "how it works" in a few steps;
- proof from real clubs.

I recommend we use that proven structure and add the one thing none of them show: **a delivery date**. For the look I recommend **Direction A, "Matchday"**. It is bold and sporty but disciplined: white pages, deep navy header and footer, one strong red for the main button, and tall condensed headings like jersey lettering. It reads as teamwear at a glance without looking cheap or childish, and it leaves the customer's own kit colours as the most colourful thing on screen.

**Your choices:**
1. **The look:** A "Matchday" (recommended), B "Clubhouse" or C "Kit Room" (below).
2. **Name and mark:** keep "FitMyOutfit" as a typed wordmark with the tagline "Custom team kit" for now (recommended), or commission a logo first.
3. **The four facts under the headline, and their exact wording:** I propose the delivery promise, free design help, the 7-day replacement, and one region-specific fact (payment methods in Pakistan; "shipping & duties included" and the minimum abroad).
4. **Photos:** a photo shoot of real kit from our partner factories before launch (recommended), or 3D renders from our editor only.
5. **WhatsApp:** show a WhatsApp help button on every page (recommended, if someone answers it).
6. **Club logos and reviews:** none until we have real ones (recommended). No placeholders.

Anything that is a promise, price, time, guarantee or minimum is marked **copy from founders** below. I have not written that wording.

---

## The three directions

All three use the same layout and behaviour (next section). Only colour, type and shape change. Colours are set as CSS variables, so switching direction later is a small change. Contrast ratios are WCAG 2.x, computed for each pair.

**Arabic and Urdu.** All three use **Noto Sans Arabic** for Arabic-script text. It is the only candidate whose Google Fonts metadata lists Urdu (`languages: "ur_Arab"`), with a variable weight of 100–900 ([metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/notosansarabic/METADATA.pb)). All fonts below are OFL-licensed Google Fonts, loadable through `next/font/google`, which self-hosts them at build time ([Next.js](https://nextjs.org/docs/app/api-reference/components/font)).

### A. "Matchday": bold sports (recommended)

**The idea:** a matchday programme. Navy and white, one red for action, condensed capitals for headings.

| Token | Hex | Use | Contrast |
| --- | --- | --- | --- |
| `bg` / `surface` | #FFFFFF | page, cards | — |
| `surface-alt` | #F3F5F9 | image backgrounds, bands | ink on it 16.5:1 |
| `ink` | #0B1530 | text | 18.0:1 on white |
| `ink-muted` | #4A5568 | secondary text | 7.5:1 on white |
| `inverse` | #0B1530 | header, hero, footer | white on it 18.0:1 |
| `on-inverse-muted` | #B8C2D6 | secondary text on navy | 10.1:1 |
| `primary` | #C8102E | main button only | white text 5.9:1; against white page 5.9:1 |
| `primary-hover` | #A50D26 | hover/pressed | white text 7.8:1 |
| `accent` | #D8FF3E | small highlights **on navy only** (step numbers, "new") | 15.7:1 on navy. Never on white |
| `border` | #C9D1DE | dividers only (decorative) | 1.5:1, so not used for control outlines |
| `border-strong` | #6B7689 | input, size-chip and card outlines | 4.6:1 |
| `success` | #0F7A3D | confirmations | 5.4:1 |
| `error` | #B42318 | errors | 6.6:1 |
| `focus` | #2563EB | focus ring | 5.2:1 |

- **Type:** **Barlow Condensed** 700/800, uppercase, for display and headings (Latin only, [metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/barlowcondensed/METADATA.pb)). **Inter** (variable) for body and UI. **Noto Sans Arabic** for Arabic-script text.
- **Buttons:** 4 px radius, 48 px tall, uppercase condensed labels at 18 px, solid fill. **Cards:** flat, 8 px radius, 1 px `border-strong`, image on `surface-alt`.
- **Closest researched sites:** Serious Sport, Sublimation Kings and Wooter in tone and content: sport-first wording and bold calls to action. I could not see their visuals, so this is about content, not looks.
- **Risks:**
  - It can slide into a "discount sports" look if red is used for anything but the main button.
  - Red may clash with a team's own colours in the editor; keep the editor's frame neutral.
  - Condensed capitals are hard to read in long text, so use them for headings only.
  - Barlow has no Arabic, so an Arabic heading falls back to Noto Sans Arabic, which is not condensed and looks uneven beside Latin. Test with real names.

### B. "Clubhouse": clean premium

**The idea:** a well-run club's own shop. Off-white, deep club green, calm and spacious.

| Token | Hex | Contrast |
| --- | --- | --- |
| `bg` | #FAFAF7 | — |
| `surface-alt` | #EFEEE8 | ink on it 15.9:1 |
| `ink` | #141414 | 17.6:1 on bg |
| `ink-muted` | #55595F | 6.7:1 on bg |
| `inverse` | #141414 | white on it 18.4:1 |
| `primary` | #145A3C | white text 8.2:1; against bg 7.9:1 |
| `primary-hover` | #0E4029 | white text 11.8:1 |
| `accent` | #8A5A12 (brass) | text on bg 5.7:1 |
| `border-strong` | #8A8D91 | 3.2:1 |
| `error` | #B42318 | 6.3:1 |
| `focus` | #2563EB | — |

- **Type:** **Archivo** (variable width and weight; headings at width 110, weight 700, [metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/archivo/METADATA.pb)). **Inter** for body. **Noto Sans Arabic**.
- **Buttons:** 8 px radius, sentence case, 16 px semibold, 48 px tall. **Cards:** no outline, 12 px radius, large image, lots of white space.
- **Closest researched sites:** owayo and Spized in tone: process explained, production story, samples.
- **Risks:** it can read as a fashion store, not teamwear. It has less energy for a sports audience. Green may read as Pakistan's national colour; that helps at home but means nothing abroad (opinion).

### C. "Kit Room": warm and friendly

**The idea:** the club kit room. Cream and sand, burnt orange, rounded shapes.

| Token | Hex | Contrast |
| --- | --- | --- |
| `bg` | #FBF6EE | — |
| `surface-alt` | #F1E7D8 | ink on it 14.1:1 |
| `ink` | #1F1A17 | 16.0:1 on bg |
| `ink-muted` | #5E544C | 6.9:1 |
| `primary` | #B8420F | white text 5.5:1; against bg 5.1:1 |
| `primary-hover` | #963409 | white text 7.5:1 |
| `secondary` | #0E6B63 (teal) | white text 6.4:1; as text on bg 5.9:1 |
| `border-strong` | #8C7F73 | 3.6:1 |
| `error` | #B42318 | 6.1:1 |

- **Type:** **Cairo** (variable, Latin and Arabic in one family, [metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/cairo/METADATA.pb)) for headings and body, with **Noto Sans Arabic** as the Urdu fallback. Cairo's metadata does not list Urdu, so Urdu-only letters (ٹ ڈ ڑ ں ے) must be tested.
- **Buttons:** pill-shaped (fully rounded), 48 px. **Cards:** 16 px radius on sand.
- **Closest researched sites:** SquadLocker and SWAZ in tone: club community, "we sort it for you".
- **Risks:** rounded pills and warm colours are the nearest thing to the "childish" look the founder rejected. It is also least like a sports brand.

**Why A:**
- Our buyers are team organizers. The researched stores all lead with sport, and a coach should recognise teamwear in two seconds.
- A's navy-and-white frame keeps pages neutral, so the kit colours (which are the product) stand out.
- B is the safe second choice if the founder wants a quieter, more premium feel for UK and US buyers.

---

## What holds for every direction

### Tokens

**Colours.** Use the token names above as CSS variables in `globals.css` (`--c-bg`, `--c-ink`, `--c-primary` and so on). Map them in `tailwind.config.js` as `colors.brand.*`, using the form `rgb(var(--c-…) / <alpha-value>)`. Components use only token classes, never raw hex.

**Type scale** (size/line-height in px; Latin). Arabic-script text gets 1.2× the line-height, to be tested.

| Token | 360 px | 768 px | 1280 px | Notes |
| --- | --- | --- | --- | --- |
| `display` | 40/44 | 56/60 | 72/76 | Hero headline only |
| `h1` | 32/38 | 40/46 | 48/54 | Page title |
| `h2` | 26/32 | 30/36 | 36/42 | Section title |
| `h3` | 20/26 | 22/28 | 22/28 | Card title |
| `body-lg` | 18/28 | 18/28 | 20/30 | Hero subline, intros |
| `body` | 16/24 | 16/24 | 16/24 | Default; inputs never below 16 |
| `small` | 14/20 | 14/20 | 14/20 | Meta, breadcrumbs |
| `caption` | 12/16 | 12/16 | 12/16 | Never for prices, promises or controls |

**Spacing** (4 px base):
- `space-1` 4, `space-2` 8, `space-3` 12, `space-4` 16, `space-6` 24, `space-8` 32, `space-12` 48, `space-16` 64, `space-24` 96.
- Page gutter: 16 px at 360, 24 px at 768, 32 px at 1280. Content max width 1200 px.
- Section spacing: 48 px on phone, 96 px on desktop.

**Radii** come from the chosen direction: `radius-control`, `radius-card` and `radius-sheet` (16 px top corners on all directions).

**Motion:** 150–250 ms ease-out. Honour `prefers-reduced-motion` (no slide animations). Nothing auto-plays or auto-advances.

**Touch and focus:**
- Every interactive element is at least **44 × 44 px**; primary buttons and size chips are 48 px tall. Leave 8 px between targets.
- Focus ring: 2 px `focus` outline with a 2 px offset, on every focusable element.
- State is never shown by colour alone.

**Breakpoints:** Tailwind defaults: base (360), `md` 768, `lg` 1024 (product page switches to two columns), `xl` 1280. Don't add new uses of the starter's `small`/`medium` names.

**Libraries:** none new.
- Use Tailwind, `next/font`, and `@headlessui/react` (already installed) for the drawer, dialog and bottom sheet.
- Build the carousel on CSS scroll-snap.
- Medusa UI stays for toasts and form inputs, restyled with the tokens.

### Header (all pages)

- **360 px:** 56 px tall, `inverse` background, sticky.
  - **Left:** menu icon button (44 × 44, label "Menu"), then the wordmark, left-aligned and linking home. NN/g advises against a centred logo.
  - **Right:** region chip (flag + "PK · PKR", 44 px tall), then a cart icon button with the item count as a number badge.
  - No announcement bar: Baymard found banner-only facts get missed. The facts go near the buy button instead.
- **768 px:** 64 px tall. The tagline "Custom team kit" appears beside the wordmark.
- **1280 px:** 72 px tall. Wordmark and tagline on the left. Nav links: Jerseys · T-shirts · Jackets · How team orders work · Help. On the right: region chip, Account, Cart, and a compact primary button "Start your team kit".
- **Menu drawer (below 1280):** opens from the left, 85% of the width (max 360 px), white.
  - **Top:** region selector.
  - **Then four groups:** Garments (3 links, each with a 48 px thumbnail); Team orders (How it works, Size charts, Fit kit, Free design help); Help (Shipping & duties, Delivery times, Replacements & returns, Contact / WhatsApp); Account.
  - **Behaviour:** close button 44 px; Esc and the backdrop close it; focus is trapped inside.
- **Region selector:** a bottom sheet on phones and a small dialog on desktop.
  - Four rows: flag, country, currency code. The current region is marked with a tick and the word "Current".
  - Choosing a region keeps the visitor on the same page in the new region.
  - If the cart's prices will change, say so before switching (**copy from founders**).

### Home page (in order)

Everything except the hero copy is a placeholder until the founders give wording. Store all of it as data in `storefront/src/content/home.ts`, as the hero copy already is.

1. **Hero.**
   - **Background:** `inverse`. **Text:** the headline "Design the kit. Drop the link." (`display`), the subline from `home.ts` (`body-lg`), the primary button "Start your team kit" (goes to `/store` until the editor exists), and a text link "How team orders work" that jumps to section 4.
   - **Image:** one still image of a real team kit (front and back flat-lay, or a team photo).
   - **360 px:** text first, button full width. The text block stays under about 420 px tall so the button sits on the first screen. The image follows below at 4:3.
   - **1280 px:** two columns, text 5/12 and image 7/12; height min(640 px, 80vh).
   - No carousel, no video.
2. **Promise strip.** Four items, each a 24 px icon, a short title and one line of detail. Two-by-two at 360 px, four across from 768 px. The content is regional data:
   - **Delivery:** the 15-day promise from proof approval and paid rush (**copy from founders**).
   - **Free design help for teams** (**copy from founders**).
   - **Free replacement within 7 days for our errors** (**copy from founders**).
   - **A region fact.** Pakistan: payment methods, including cash on delivery below a limit. UK, UAE and US: "Shipping & duties included" and the minimum order (**copy from founders**).
3. **Choose your garment.** The three garment cards (see "Listing").
4. **How team orders work.** Four numbered steps, each with a small picture of that screen once it exists:
   1. Design your kit in 3D.
   2. Share one link with your team.
   3. Each player adds their name, number and size; players don't pay.
   4. Check and sign the roster proof; we make and deliver the kit.

   A payment line sits under the steps (the 50% deposit and 50% balance terms, **copy from founders**), then the button "Start your team kit". Layout: a vertical list at 360 px, four columns at 1280 px.
5. **The roster proof.** A picture of a proof page (from our own proof PDF once it exists), with three points: every name, number and size on one page; you sign it; we check the finished kit against it at our Lahore hub before it ships (**copy from founders**).
6. **Sizing.** "Not sure of sizes?" Link to the size charts, plus the refundable fit kit (**copy from founders**).
7. **Free design help.** A short block with a button to the request form. Hidden until the form exists (Sprint 3).
8. **Clubs that use us.** Hidden until there are real logos or quotes, used with permission.
9. **Questions.** Four to six questions in native `<details>` elements: delivery, minimums by region, shipping and duties, payment methods, replacements, and whether names can be in Arabic or Urdu (yes, per the founder). All answers are **copy from founders**.
10. **Footer.**

### Product listing (`/store`)

- **Title** "Team kit" (`h1`), then a one-line intro (**copy from founders**).
- **Export regions only:** an info row with the minimum order and "Shipping & duties included" (**copy from founders**).
- **Grid:**
  - 360 px: 1 column while there are 3 products or fewer, 2 columns above that.
  - 768 px: 3 columns.
  - 1280 px: 3 columns (4 when there are more than 6 products).
  - Gaps: 16, 24 and 32 px.
- **Remove "Sort by"** until there are more than 8 products.
- **Product card:**
  - **Image:** 4:5 on `surface-alt`, `object-fit: contain` so sleeves are never cropped. On hover (pointer devices only) it swaps to the back view.
  - **Text:** name (`h3`); one descriptor line from product data (the decoration method); price "from PKR 3,500" plus "per piece" (the price-tier line, **copy from founders**, once tiers exist).
  - **Behaviour:** the whole card is one link with one focus ring. No "Sale" badges.

### Product page

**360 px, in order:**
1. Breadcrumb: Team kit › Jersey (`small`).
2. Gallery (spec below).
3. Title (`h1`) and the descriptor line.
4. **Price block:**
   - the price in the region's currency code ("PKR 3,500"), plus "per piece";
   - the "tax not final" note while prices are placeholders (dev-plan rule);
   - for export regions, "Shipping & duties included" and the minimum (**copy from founders**).
5. **Delivery line:** "Delivered by [date]", worked out from today by the founders' rule, with a short note on what it counts from (**copy from founders**).
6. **Size selector** and quantity, then the main button. Later, when the editor and team orders exist, the main button becomes "Design your team kit", and size plus "Add to cart" stays as the single-piece path for Pakistan.
7. **Help line:** free design help, and a WhatsApp link if the founders approve it (**copy from founders**).
8. **Accordions:** Description; Fabric & decoration; Size chart; Delivery & duties; Replacements & returns.
9. "Complete the kit": the other two garments.

**768 px:** the same single column. The gallery and the buy block each have a maximum width of 560 px, centred.

**1024 px and up:** two columns. The gallery takes 7/12 on the left; the buy column takes 5/12 on the right and stays sticky (top offset = header + 16 px). The accordions sit under the buy block.

**3D editor:** a "Photos | Design in 3D" switch above the gallery from 1024 px. On phones, "Design in 3D" opens the editor full screen on its own route instead of inside the page. The 3D view starts inactive until tapped (Shopify media guideline), so scrolling never spins the model.

**Sticky buy bar (below 1024 px):**
- Appears once the main button scrolls out of view, and hides when the footer is visible.
- Height 64 px plus the safe-area inset, `surface` background, top border.
- Left: price and the chosen size ("M · PKR 3,500"). Right: the button, at least 160 px wide with 16 px of space around it, not full width (Baymard).

**Size selector:**
- **Label row:** "Size: M" on the left, a "Size chart" link on the right.
- **Two labelled groups:** **Youth** (YS YM YL YXL) and **Adult** (XS S M L XL 2XL 3XL).
- **Chips:** a 4-column grid at 360 px with 8 px gaps (about 76 × 48 px each); a flexible row from 768 px.
- **Chip states:**
  - default: `border-strong` outline;
  - hover: `ink` outline;
  - selected: `ink` fill, white text, `aria-checked` in a radio group;
  - unavailable: dashed outline, muted text and a diagonal strike, with "unavailable" in the accessible name; still visible;
  - focus: ring.
- **Choosing a size must not scroll the page** (see 02, item 4).
- **Error:** pressing the button with no size shows "Choose a size" in `error` with an icon under the label, and moves focus to the group.

**Size chart:**
- A bottom sheet on phones (max height 85vh, close button, drag handle) and a dialog on desktop.
- Opening it adds a history entry, so Back closes it.
- **Content:**
  - a measurement diagram;
  - a table with sizes as columns and measurements as rows, a sticky first column and sideways scroll;
  - a cm / in switch;
  - the note "Measured flat on the finished garment" (**copy from founders**);
  - a fit-kit link and a contact link.

### Product gallery carousel (decided by the founder; for task S0-12)

**Phone and tablet (below 1024 px):**
- **Layout:** the gallery sits inside the 16 px page gutters, not edge to edge, so edge swipes don't trigger the browser's Back (NN/g).
- **Track:** native horizontal scroll with `scroll-snap-type: x mandatory`, one image per slide.
- **Frame:** a fixed 4:5 frame reserved before the image loads, so nothing jumps. `object-fit: contain` on `surface-alt`.
- **Controls:**
  - A counter "2 / 5" in the top-right corner of the image (14 px, `inverse` chip).
  - Previous and next buttons, 44 × 44 px, at the left and right edges of the image. They are disabled, not hidden, at the ends. No wrap-around.
  - Swipe is not the only way to move (Shopify guideline).
- **Thumbnail row** under the image:
  - 56 × 70 px buttons with 8 px gaps;
  - scrolls sideways, and a cut-off last thumbnail shows that more exist (Baymard);
  - the active thumbnail gets a 2 px `ink` outline and `aria-current`;
  - use thumbnails, not dots.
- **Zoom:** tapping the image opens a full-screen viewer that allows pinch-zoom. Close is a 44 px button, and Back also closes it.
- **Motion:** no autoplay; reduced motion means instant moves.
- **Loading:** the first image loads with `priority`; the rest lazy-load. While loading, show a `surface-alt` box in the same 4:5 frame.

**Desktop (1024 px and up):**
- The main image is 4:5, as tall as the viewport minus the header and 48 px.
- A vertical thumbnail column (72 × 90 px) sits to its left.
- The arrows stay visible at low emphasis and get stronger on hover and focus.
- Clicking opens the viewer. No hover-zoom.

**Both:**
- **Accessibility:**
  - The gallery is `role="region"`, `aria-roledescription="carousel"`, `aria-label="Jersey images"`.
  - Each slide is labelled "Image 2 of 5" plus its alt text (for example "back view").
  - The left and right arrow keys move between images when focus is inside.
  - Thumbnails are buttons.
- **One image:** no arrows, counter or thumbnails. **No image:** a garment outline with "Photo coming soon".
- **Later:** choosing a colourway jumps to that colourway's first image.

### Footer

- **Background:** `inverse` in A and B; `surface-alt` in C.
- **360 px:** a 2-column grid of plain links, not accordions, because users scan the footer for words like "shipping" ([Baymard](https://baymard.com/blog/footer-needs-return-shipping-links)). Columns stack to 3 at 768 px and 4 at 1280 px.
- **Columns:**
  - **Shop:** Jersey, T-shirt, Jacket, Fit kit.
  - **Team orders:** How it works, Size charts, Free design help.
  - **Help:** Shipping & duties, Delivery times, Replacements & returns, FAQ, Contact.
  - **Company:** About, Terms, Privacy.
- **Below the columns:**
  - the region selector;
  - the payment methods live in the visitor's region (**copy from founders**);
  - the company's legal name and address (**copy from founders**);
  - the copyright.
- Vertical padding: 48 px on phone, 64 px on desktop.

### States for every component

| Component | Default | Hover | Focus | Disabled | Loading | Error |
| --- | --- | --- | --- | --- | --- | --- |
| Primary button | `primary` fill, white label | `primary-hover` | ring | 40% opacity, `aria-disabled`, with the reason shown in text nearby | spinner plus "Adding…", same width, no double submit | inline message under the button, with a retry |
| Secondary button | `ink` outline, `ink` label | `surface-alt` fill | ring | as above | as above | as above |
| Text link | `ink`, underlined | thicker underline | ring | — | — | — |
| Size chip | see the size selector | | | unavailable state | — | group message |
| Product card | image, name, price | back image, outline turns `ink` | ring round the card | — | skeleton: 4:5 box and 2 text bars | image missing: garment outline |
| Input | `border-strong` outline, 16 px text | — | ring plus `ink` outline | `surface-alt` fill | — | `error` outline, an icon and a message under the field; never colour alone |

### Loading, empty and failure

- **Loading:** skeletons at the final sizes, never spinners for page content and never collapsing boxes. Prices load as a grey bar the same width as the price.
- **Empty:**
  - **Listing:** "No garments in this region yet", plus a contact link.
  - **Cart:** "Your cart is empty", plus the "Start your team kit" button and a "Browse garments" link.
  - **Account orders:** "No orders yet", plus the same button.
- **Not found:** a styled page with the header and footer. Heading "We can't find that page", with links to home, the garments and contact. **This also replaces today's "Application error" on unknown product links.**
- **Server failure:** "Something went wrong on our side", with a "Try again" button and contact details. Never a raw error.
- **Region without a price:** hide the buy button and show "Not available in [country] yet" plus a contact link.

### Imagery the design needs

- **Product shots:** for each garment and main colourway, front and back flat-lays of **real kit made by our partner factories**. Same angle, same light-grey background, 4:5, at least 1600 px tall.
- **Detail shots:** fabric, a printed name and number, embroidery, and the per-player bag and label.
- **Team photos:** a few of real teams in the kit, with their permission.
- **3D renders:** renders from our editor can fill colourway gaps.
- **Never:** photos from another store, or stock photos of other brands' kit.
- **Until then:** the demo images stay. The "Jersey" should at least show a short-sleeve shirt.

---

## Build order (one developer task each)

0. **Fixes that need no founder decision** (start now):
   - Point Tailwind's content path at the installed `@medusajs/ui`, which is hoisted to the root `node_modules`.
   - Stop the scroll jump on size select (`router.replace(…, { scroll: false })`).
   - Show a styled not-found page for unknown products.
   - Make size chips 48 px tall and grouped Youth and Adult.
1. **Brand foundation: the smallest step that stops it looking like a template.**
   - The chosen direction's tokens as CSS variables plus the Tailwind mapping.
   - The fonts through `next/font` (Inter, the heading font, Noto Sans Arabic).
   - Our own `Button` (primary, secondary, text) used everywhere.
   - The new header (left wordmark and tagline, region chip, cart icon).
   - The hero restyled on `inverse` with an image slot.
2. **Home page sections 2–10**, with all copy in `content/home.ts` and promise items as regional data.
3. **Product page layout:** reorder, the price, delivery and region block, the size-chart sheet and the sticky bar. Align S0-12's carousel with the gallery spec.
4. **Listing and product card.**
5. **Menu drawer, region selector sheet and footer.**
6. **Cart, account and checkout restyle,** plus the empty, not-found and error pages.
7. **Arabic and Urdu check:** render sample Arabic and Urdu names in the cart line and account pages with `dir="auto"` and Noto Sans Arabic, then screenshot at 360 px. Do this before the roster pages in Sprint 3.

Each step ends with screenshots at 390 px (device emulation) and 1366 px, reviewed by storefront-designer.
