# 05 M1 page specifications

11 Nov 2026 · storefront-designer · Task S1-2.

These are the pages a customer sees after "Add to cart", plus the size chart on the product page. They follow direction A, "Matchday" ([03-direction.md](03-direction.md), decided in [decision 007](../decisions/007-storefront-design-direction.md)), and use only the facts in the [M1 checkout contract](../contracts/m1-checkout.md). Nothing here adds a promise, price, time, fee or minimum. Every new sentence is a draft, collected in [section 11](#11-draft-wording-founders-to-confirm).

**How to read this file.** Section 1 says what the pages look like today. Section 2 holds rules and parts that every page shares. Sections 3 to 9 cover one area each: layout at 360, 768 and 1280 px, the content in order, where each piece of data comes from, and the states. Section 10 lists the components. Sections 11 to 13 cover wording, contract gaps and sources.

Contents:
1. [What the pages look like today](#1-what-the-pages-look-like-today)
2. [Shared rules and parts](#2-shared-rules-and-parts)
3. [Size chart on the product page](#3-size-chart-on-the-product-page)
4. [Cart page and the cart panel in the header](#4-cart-page-and-the-cart-panel-in-the-header)
5. [Minimum quantity](#5-minimum-quantity)
6. [Checkout](#6-checkout)
7. [Order confirmation](#7-order-confirmation)
8. [Sign-in and create account](#8-sign-in-and-create-account)
9. [Account](#9-account)
10. [Components: new and reused](#10-components-new-and-reused)
11. [Draft wording, founders to confirm](#11-draft-wording-founders-to-confirm)
12. [Contract gaps](#12-contract-gaps)
13. [Sources](#13-sources)

---

## 1. What the pages look like today

**Method.** On 11 Nov 2026 I took screenshots of the preview at `http://localhost:8000` in headless Chrome, driven through the Chrome DevTools Protocol:
- **Phone:** `Emulation.setDeviceMetricsOverride` at 390 × 800 and 360 × 800, with `mobile: true`, scale 2 and touch on. The page reported `innerWidth` 390 or 360.
- **Desktop:** 1280 × 900.

I added a Jersey (M) and a T-shirt (YL) to a cart in my own browser profile. I did not create an account. Checkout was opened but not submitted.

The screenshots are outside the repository, in `C:\Users\baapo\AppData\Local\Temp\claude\c--Users-baapo-source-repos-FitMyOutfit\46dc59a7-d35d-453d-8c31-f97d42b446b4\scratchpad\s12\shots\`. The file names below refer to that folder. The round "N" and "1 Issue" badges are the Next.js development overlay. They are not defects.

Evidence (what the screenshots show):

| # | Page | What is there | Screenshot |
| --- | --- | --- | --- |
| 1 | Product, phone | After "Add to cart", nothing on the page changes except the header badge going from 0 to 1. The cart preview is hidden below 1024 px (`hidden small:block`). | `p-after-add.png` |
| 2 | Product, phone and desktop | No "Size chart" link and no quantity control. The button always adds 1 piece. | `p-jersey.png`, `p360-gb-price.png` |
| 3 | Product, 360 px, UK | The price shows as "£22.00", but Pakistan shows "PKR 3,500" (currency code). Direction A asked for currency codes. | `p360-gb-price.png` |
| 4 | Cart, 360 px | The table header "Total" and the line totals run off the right edge of the screen. | `p360-cart.png` |
| 5 | Cart, phone | The line reads "Variant: YL", split over two lines. The quantity is a 1–10 drop-down, so it can't reach 11 or more. "Summary" and the button sit below the fold, after the items. | `p-cart.png` |
| 6 | Cart, all | "Taxes PKR 0" and "Shipping PKR 0" read as facts, but the tax is not final and shipping is not yet chosen. There is no "Tax not final" label, although the product page has one. "Add Promotion Code(s)" is a blue link, and no promotions exist. | `d-cart.png` |
| 7 | Cart, all | "Go to checkout" is the Medusa UI dark grey button, not our primary button. The sign-in prompt is the first thing on the page, above the items. | `d-cart.png` |
| 8 | Cart preview, desktop | It opens on hover only. The prices are clipped at the right edge ("PKR 2,000" is cut). "Subtotal (excl. taxes)". It has a dark grey button. | `d-dropdown.png` |
| 9 | Empty cart | A large blank area, a starter sentence and a blue "Explore products ↗" link. | `p-cart-empty.png` |
| 10 | Checkout, phone | Inputs sit two to a row at 390 px (about 170 px each), with floating labels inside grey boxes. The "In your Cart" summary is at the very bottom, after the empty "Delivery", "Payment" and "Review" headings. The white header has the shop name centred. | `p-checkout.png` |
| 11 | Checkout, all | Postal code is required for every country, including the UAE, which has no postal codes (section 13). | `d-checkout.png` |
| 12 | Sign-in | A floating-label form, "Not a member? Join us", then a "Got questions? Customer Service ↗" block that links to a page that does not exist. | `p-account-login.png` |
| 13 | Account overview (code, not seen signed in) | The overview is `hidden small:block`, so on a phone it shows only a list of links. It shows "Profile 60% completed". Changing the email and the password are not built: the code shows a "not implemented" toast. | `modules/account/components/overview`, `profile-password`, `profile-email` |

---

## 2. Shared rules and parts

### 2.1 Tokens

Use the direction A tokens in `globals.css` as they are. There are two new colour tokens, for the background of alert panels only:

| Token | Hex | Use | Contrast |
| --- | --- | --- | --- |
| `error-surface` | #FDF3F2 | background of error alerts | `error` text on it 6.0:1; `ink` 16.6:1 |
| `success-surface` | #EEF7F1 | background of success alerts | `success` text on it 5.0:1; `ink` 16.5:1 |

Other pairs used in this file, computed on 11 Nov 2026 (WCAG 2.x):
- `ink-muted` on `surface-alt`: 6.9:1.
- `error` on `surface-alt`: 6.0:1.
- `success` on `surface-alt`: 5.0:1.
- `border-strong` on `surface-alt`: 4.2:1 (outlines only; non-text needs 3:1).

Red (`primary`) is still used for **one main button per screen** and nothing else. Errors use `error`, which is a different red, always with an icon and words.

### 2.2 Breakpoints and layout

- **Widths:** base (360), `md` 768, `lg` 1024, `xl` 1280.
- **Page gutters:** 16, 24 and 32 px. Content max width 1200 px.
- **Two columns from `lg` (1024 px):** pages with a summary (cart, checkout, confirmation, order detail) put the main column at 7/12 and the summary at 5/12, with 48 px between them. The summary is sticky (top = header height + 16 px).
- **768 px:** still one column. Forms and summaries are centred with a max width of 560 px, so lines don't run long.

### 2.3 Form fields (replaces today's floating-label `Input`)

One `TextField` for the whole store. Checkout, sign-in, create account, profile and addresses all use it.

- **Label** above the field, `body` 16/24 semibold `ink`. Optional fields say "(optional)" in the label. Required fields have no asterisk, because most fields are required.
- **Hint** (optional) under the label, `small` `ink-muted`, tied to the field with `aria-describedby`.
- **Field:** 48 px tall, 16 px text (so iOS doesn't zoom), 12 px side padding, 1 px `border-strong` outline, `radius-control` (4 px), white fill.
- **Gaps:** 16 px between fields; 24 px between groups.
- **States:**

| State | Look |
| --- | --- |
| Default | `border-strong` outline |
| Hover | `ink` outline |
| Focus | 2 px `focus` ring, 2 px offset, `ink` outline |
| Disabled / read-only | `surface-alt` fill, `ink-muted` text, no hover; read-only stays focusable |
| Error | 2 px `error` outline. Under the field: `alert` icon plus the message in `small` semibold `error`. The field gets `aria-invalid="true"` and `aria-describedby` = the message id. |
| Loading (form submitting) | fields stay as they are; only the button shows loading |

- **When to validate:**
  - A field is checked when it loses focus, but only after it has been edited.
  - Every field is checked on submit. Focus moves to the first field with an error.
  - When there are 3 or more errors, a short error list appears at the top of the form (an `Alert`, 2.5), with a link to each field.
- **Text direction:**
  - Every free-text field (names, address lines, city, team name) has `dir="auto"`, so Arabic and Urdu type right to left and Latin left to right.
  - Email, phone, postal code and password fields have `dir="ltr"`.
  - The label stays at the start of the page's direction.
  - The font stack already puts Noto Sans Arabic before the fallback (`lib/util/font-stack.ts`), so Arabic script renders in Noto.
- **Password field:** a "Show" / "Hide" text button inside the right end, 44 × 44 px. It says what it does in words, not just an eye icon.
- **Selects:** `SelectField` has the same look, with a chevron. It uses the native `<select>`, so phones show their own picker.

### 2.4 Showing names, addresses and money

- **Names and addresses** that a customer typed are shown inside `<bdi>` (or an element with `dir="auto"`).
  - Example: "Hello, <bdi>محمد علی</bdi>" keeps the comma and the Latin words in the right place.
  - Address blocks are a list of lines, each line `dir="auto"` and aligned to the start.
- **Test names**, to be used in every screenshot review of these pages:
  - `Ali Raza` (Latin);
  - `محمد علی` (Urdu);
  - `عبدالله الهاشمي` (Arabic);
  - `Muhammad Abdul Rehman Qureshi` (long Latin, 30 characters).
- **Money:** always `convertToLocale` with the cart's or order's `currency_code`, the same helper as the product page, so a price reads the same on every page. Amounts are wrapped in `dir="ltr"` and `whitespace-nowrap`, so "PKR 21,000" never breaks or flips. The question of symbol or code ("£22.00" or "GBP 22.00") is for the founder, Q1 in the report. The pages don't change with the answer.
- **Dates** from the contract are `YYYY-MM-DD`.
  - Format them as calendar dates, not instants: `new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })` applied to `Date.UTC(y, m-1, d)`. This gives "Thursday 26 November".
  - Parsing the string as local time can shift the day by one in the US.
  - Order dates ("Placed on") use the same format with the year: "11 November 2026".

### 2.5 Alert

A box for messages that belong to a whole section, not to one field.

- **Layout:** 16 px padding, `radius-card` (8 px), a 4 px bar on the start edge, a 24 px icon, a title (`body` semibold) and text (`small`). Optional: one action (secondary button or text link).
- **Variants:**
  - **info:** `surface-alt` background, `ink` bar, no icon or the relevant line icon.
  - **error:** `error-surface` background, `error` bar, `alert` icon.
  - **success:** `success-surface` background, `success` bar, `check` icon.
- **Announcing:**
  - An alert that appears after an action has `role="alert"` (errors) or `role="status"` (others).
  - An error alert that blocks the main action gets focus (`tabindex="-1"`) when it appears.
- The variant is never shown by colour alone: the icon and the title say it.

### 2.6 Delivery date line

`DeliveryDateLine`: the `delivery` line icon (24 px), then **"Delivered by Thursday 26 November"** (`body` semibold), then a note in `small` `ink-muted` on the next line.
- **Data:** `checkout-rules.delivery_promise.standard.date`. The rush date is shown only once the cart can hold rush (a later M1 task; see gap G1 in section 12).
- **The note** is W-D2: it says that in M1 the date counts from today. **Founders to confirm.**
- **Loading:** a grey bar 220 × 20 px in place of the date.
- **Missing** (the rules call failed): the line is left out. It is never replaced by a guess.
- **Where it appears:** the cart summary, the cart panel, the checkout delivery block, the place-order area, the order confirmation and the order detail (the last two only if the order stores the date; gap G2).
- **Not on the product page:** a date needs a cart, and the product page keeps the "Delivered in 15 days" fact box (gap G3).

### 2.7 Quantity stepper

`QuantityStepper`: [−] [number] [+].

- **Size:** each button 44 × 44 px; the number field 56 px wide, `inputmode="numeric"`, centred, `aria-label="Quantity, Jersey, size M"`. Overall 144 × 44 px, 1 px `border-strong` outline round the group, `radius-control`.
- **Range:** − is inactive at 1. + is inactive at the maximum: 999 for now, or stock if a variant ever manages stock. The field accepts typed numbers; values below 1 or above the maximum snap back on blur, with a message under the stepper: "Enter a number from 1 to 999" (W-C9).
- **On the product page** it only sets the number to add.
- **In the cart**, a change is saved after 600 ms of no further presses, or on blur. While it saves:
  - the stepper stays usable, but its buttons ignore presses;
  - the line total shows a grey bar;
  - the summary totals show grey bars of their own width;
  - the checkout button shows its loading state "Updating…" (W-C10).
- **Error:** the number goes back to the saved value, and under the line: `alert` icon + "We couldn't change the quantity. Try again." (W-C8), with a "Try again" text button.
- **States:**
  - **Default:** `ink` icons.
  - **Hover:** `surface-alt` fill on the button.
  - **Focus:** ring on the focused part.
  - **Inactive:** `ink-muted` icon, `aria-disabled`.

---

## 3. Size chart on the product page

### 3.1 Data

`product.metadata.size_chart` (contract section 2):
- `columns[]`: each a `key` and a `label`, for example "Chest width" and "Body length";
- `rows[]`: one per size, in the product's size order;
- `unit` ("cm");
- `draft` (true or false).

Garments have eleven rows: YS YM YL YXL XS S M L XL 2XL 3XL. The fit kit carries a chart too. If `size_chart` is missing or has no rows, nothing in this section shows: no link and no accordion item.

### 3.2 Decision: sizes run down, measurements run across

Direction A's first sketch put the sizes as columns. With eleven sizes that is a table about 900 px wide, scrolled sideways on a 360 px phone. **Sizes as rows and measurements as columns** fits on a phone without sideways scrolling:
- the size column is 64 px;
- each measurement column is at least 96 px;
- 360 − 32 px of gutter = 328 px, enough for the size column plus two measurement columns at 132 px each, or three at 88 px.

So:
- **Up to 3 measurement columns:** no sideways scroll at 360 px.
- **4 or more columns:** the table scrolls sideways inside its own box. The size column is sticky (`position: sticky; left: 0`, with a `surface` background and a 1 px `border` on its end edge). The table has a right-edge fade, so it is clear there is more.
- **From 768 px** there is room for 5 columns without scrolling.

### 3.3 How it is reached

1. **"Size chart" link** at the end of the size label row ("Size: M ........ Size chart").
   - Text-button style: underlined, `small` semibold, a 44 px tall hit area, with the `ruler` line icon (a new icon, 20 px) before it.
   - Garments only (any product with a chart and a size option).
   - It opens the size chart **sheet** (3.4).
2. **The "Size chart" accordion item** in the product details, after "Fabric and decoration".
   - It shows the same table inline, without the diagram. Search engines and desktop users who scroll get it without a pop-up.
   - Products with a chart only.
3. **Fit kit page:** it has no size picker, so the chart shows inline as its own section, "Sizes in the kit" (W-S6), under the price block.

### 3.4 The sheet, in order

- **Below 768 px:** a bottom sheet.
  - Full width, max height 90vh, `radius-sheet` top corners.
  - A drag handle (decorative, 32 × 4 px `border`).
  - The body scrolls inside the sheet.
- **From 768 px:** a centred dialog, 640 px wide, max height 85vh.
- **Shared behaviour** (reuse the region selector's Headless UI `Dialog` pattern; extract it as `Sheet`, section 10):
  - Opening adds a history entry, so Back closes it.
  - Focus moves to the title, and is trapped inside.
  - Esc, the backdrop and the close button (44 × 44, label "Close size chart") close it. Focus then returns to the "Size chart" link.

Content, in order:

1. **Title** (`h3`): "Size chart" (W-S1), with the product name under it in `small` `ink-muted` ("Jersey").
2. **Draft note.** Shown only when `draft: true`.
   - An info `Alert` with the title "Draft measurements" (W-S2) and the text "These measurements may change before production. We'll update this chart when they're final." (W-S3).
   - It sits above the table, so it is seen before the numbers.
3. **Unit switch:** a two-option segmented control, "cm" | "in".
   - Built as a radio group: each option 44 px tall and 56 px wide; selected = `ink` fill and white text plus `aria-checked`; focus ring.
   - The chart's `unit` is the default.
   - Inches = cm ÷ 2.54, shown to 1 decimal place. Centimetres are shown as stored, with no rounding.
   - The choice is kept for the visit (`sessionStorage`).
4. **"How we measure" line:** "Measured on the garment laid flat." (W-S4). This states what the contract defines: a garment-measurement chart, not a body chart.
5. **Diagram** (optional, see 3.6). A flat garment outline, 160 px tall, with lettered arrows. Each column header carries the same letter: "A Chest width".
6. **Table** (`<table>` with `<caption class="sr-only">`, "Jersey size chart, in centimetres"):
   - **Header row:** "Size", then each `columns[].label` with the unit ("Chest width (cm)"). Headers are `<th scope="col">`, `small` semibold, `ink`, on `surface-alt`.
   - **Size cells:** `<th scope="row">`, `body` semibold.
   - **Values:** `body`, right-aligned, tabular numerals (`font-variant-numeric: tabular-nums`).
   - **Group rows:** a row "Youth" before YS and "Adult" before XS (`small` semibold `ink-muted`, `colspan` all). They match the size picker's groups (`lib/util/sizes.ts`).
   - **Row height** 44 px; a 1 px `border` between rows.
   - **The chosen size** (if one is chosen on the page) gets a `surface-alt` background, an `ink` 4 px bar on the start edge, and the words "Your choice" (W-S5) after the size in `caption`. It is marked by words, not by colour alone. The sheet scrolls so that row is in view when it opens.
   - A missing value in a row shows "–", with "not measured" for screen readers.
7. **Footer links** (text buttons):
   - "Not sure? See the fit kit" (W-S7) goes to `/products/fit-kit`. It is hidden on the fit kit's own page.
   - "Need help with sizes? Contact us" stays hidden until a contact page or WhatsApp exists.

### 3.5 Layout

| Width | Sheet / dialog | Table |
| --- | --- | --- |
| 360 | Bottom sheet, gutter 16 | Size 64 px, measurement columns share the rest; 1–3 columns fit; 4+ scroll inside the box with a sticky size column |
| 768 | Dialog 640 px | Up to 5 columns without scrolling; the diagram sits on the left (200 px), the table on the right |
| 1280 | Dialog 640 px | As 768 |

### 3.6 States

| State | What shows |
| --- | --- |
| Default | As above |
| Link hover | Thicker underline |
| Focus | Ring on the link, close button, unit options and the table scroll box (the scroll box is focusable only when it scrolls, `tabindex="0"`, with the label "Size chart table, scrolls sideways") |
| No size chosen | No row is marked |
| Draft | Draft alert shown |
| Not draft | Draft alert hidden |
| Empty (no chart) | Link and accordion item hidden; the fit-kit fact box stays |
| Loading | None. The chart comes with the product data. |
| Error | A chart with bad data (no `columns`, or rows without `values`) is treated as empty. Log it to the console in development. |
| Diagram missing | When the column keys are not ones the diagram knows (`chest`, `length` first; `sleeve`, `shoulder` later), the diagram is left out and the letters are dropped from the headers. Build the diagram once the pattern maker confirms how each measurement is taken. Until then it is optional. |

---

## 4. Cart page and the cart panel in the header

### 4.1 Data

- The cart (`retrieveCart`): `items[]` with `product` (and `product.metadata.kind`), `variant`, `quantity`, `unit_price`, `total`, `thumbnail`; `item_subtotal`, `shipping_subtotal`, `total`, `currency_code`, `region.metadata`.
- `GET /store/carts/:id/checkout-rules` (contract section 6), fetched on the server with the cart, and again after every change to the cart:
  - `minimum_quantity` (section 5);
  - `cash_on_delivery` (for the Pakistan note, 4.4);
  - `delivery_promise` (the date).
- `showsTaxNote(region)` (exists): true while `region.metadata.tax_final` is not `true`.
- The product kind (`lib/util/product-kind.ts`): `garment`, `fit_kit`, `rush_add_on`.

### 4.2 Cart page, in order (360 px)

1. **Title** (`h1`): "Your cart", with the piece count after it in `body` `ink-muted`: "5 pieces" (W-C1; "1 piece" for one).
2. **Minimum alert**, export regions only, when the cart has garments and is below the minimum (section 5). Here, at the top, it can't be missed.
3. **Lines**, newest first (as today). Each line is a `CartLine` (4.3). There are 16 px of padding between lines and a 1 px `border` divider.
4. **Summary** (`CartSummary`, 4.4).
5. **Checkout button**, primary, full width, "Go to checkout" (W-C2).
   - Below the minimum it is inactive and shows the reason (section 5).
   - It links to `/checkout?step=address`, or `?step=payment` when the address is already saved.
6. **Sign-in line** under the button, for guests only: "Have an account? Sign in" (W-C3). It is a text link to `/account?next=/cart`. It is no longer a block above the items: the starter's block pushed the items below the fold, and checkout does not need an account (section 8.1).
7. **Help line** (hidden until a help page or WhatsApp exists).

**Sticky checkout bar** (below 1024 px):
- **When:** it appears when the checkout button in the summary is out of view, and hides when it is in view. Reuse `lib/util/sticky-buy-bar.ts`.
- **Look:** 64 px plus the safe-area inset, `surface` background, 1 px `border` on top.
- **Left side:**
  - normally, "Total" in `caption` over the amount in `body` semibold;
  - below the minimum, "7 of 10 pieces" (W-M3) instead.
- **Right side:** the same button, "Checkout" (W-C2b), at least 160 px wide; inactive below the minimum.

**768 px:** one column, with the lines and the summary centred at a max width of 560 px.

**1280 px (from 1024):**
- **Left column (7/12):** the title, the minimum alert, then the lines.
- **Right column (5/12), sticky:** the summary in a box (1 px `border-strong`, `radius-card`, 24 px padding), then the button, then the sign-in line.
- No sticky bar.

### 4.3 Cart line (`CartLine`)

**Layout (360):** a grid of `[72px thumbnail] [1fr]` with a 12 px gap.

- **Thumbnail:** 72 × 90 (4:5), `object-fit: contain` on `surface-alt`, `radius-control`. It links to the product page. If there is no image: the garment outline.
- **Row 1:** the product title (`body` semibold, links to the product) at the start; the line total (`body` semibold, `dir="ltr"`) at the end.
- **Row 2:** "Size: M" (W-C4, the variant's size option value) · the unit price + "each" (W-C5), in `small` `ink-muted`. Lines without a size (fit kit) skip "Size".
- **Row 3, fit kit only:**
  - "Refundable deposit" (W-C6, the fit kit's own wording, from `productContent`);
  - in export regions, also "Not counted towards the minimum" (W-M5), `small` `ink-muted`.
- **Row 4:** the `QuantityStepper` (2.7) at the start; "Remove" at the end (a text button with the `trash` icon, 44 px tall, `aria-label="Remove Jersey, size M"`).

**From 768 px:** the thumbnail is 96 × 120. Rows 1 to 4 are unchanged; the stepper and Remove sit on the same row as the unit price.

**Remove:**
- **What happens:**
  - The line removes at once. Its height collapses over 200 ms, or instantly with reduced motion.
  - A toast appears (Medusa UI `toast`, restyled): "Removed: Jersey, M × 4" with an "Undo" action (W-C7). Undo adds the same variant and quantity back.
  - The toast stays 8 seconds. The removal can still be reversed after that by adding the item again, so the time limit loses nothing.
- **States:**
  - **Hover:** thicker underline.
  - **Focus:** ring.
  - **Loading:** the line fades to 50% with a spinner over the thumbnail, and its controls are inactive.
- **Error:** "We couldn't remove this. Try again." (W-C8b) under the line, with "Try again".

**Rush add-on:** in M1 it is not added to carts (contract section 8). When it is, it shows as a line with no thumbnail, no stepper and no Remove of its own. Its wording comes from the founders.

### 4.4 Summary (`CartSummary`), in order

| Row | Shows | Data |
| --- | --- | --- |
| Items | "Items (5)" … amount | `item_subtotal`; the count is the sum of quantities |
| Delivery, Pakistan | "Delivery in Pakistan" … "Added at checkout" (W-C11) | The option name comes from the backend at checkout. In the cart, before one is chosen, no amount is shown, because showing "PKR 0" would be wrong. |
| Delivery, export | "Shipping & duties included" … "Included" (W-C12) | The single DDP line (contract section 3). Never a separate duties line. |
| Total | "Total" (`h3` size, semibold) … amount (`h3` size) | `total`. In Pakistan, before delivery is chosen, the label is "Total before delivery" (W-C13). |
| Tax note | "Tax not final" (existing `productContent.price.taxNote`) under the total, `small` `ink-muted` | `showsTaxNote(region)` |
| Delivery date | `DeliveryDateLine` (2.6) | `delivery_promise.standard.date` |
| Cash on delivery note, Pakistan only | When `cash_on_delivery.reason === "over_limit"`: an info line, "Cash on delivery is for orders up to PKR 20,000." (W-P4; the amount comes from `limit` and `limit_currency_code`). Nothing when it is available. | `cash_on_delivery` |
| Minimum | `MinimumProgress` (section 5), export only | `minimum_quantity` |

- **No "Taxes" row** while the tax is not final. A "Taxes PKR 0" row reads as "no tax", which isn't known yet. When `tax_final` becomes true, a tax row is added, with wording from the founders.
- **No promotion code field** until the store has promotions. Hide it behind a content flag (`cartContent.showPromotionCode = false`).
- **Amounts while updating:** grey bars of the same width.
- **Rules failed to load:**
  - The date line and the minimum progress are left out.
  - The checkout button stays usable. The backend still enforces the rules at completion (contract section 6), and checkout explains a refusal (6.8).
  - A quiet `small` line says "Some details couldn't load. Refresh the page to try again." (W-C14).

### 4.5 Empty cart

- **Content:**
  - `h1` "Your cart is empty" (W-C15; as 03-direction);
  - one `body` line: "Start with a garment, or design your team's kit." (W-C16);
  - the primary button "Start your team kit" (`homeContent.button`, the same label and link as the home page);
  - a text link "See the fit kit" (`homeContent.sizing.button`).
- 03 also asked for "Browse garments". Today "Start your team kit" already goes to `/store`, so a second link to the same place would be noise. Show "Browse garments" only when the button's link changes to the editor.
- **Layout:** the block is left-aligned, with 48 px of space above, under the header. There is no tall empty space (today it is 300 px). Below it, the "Choose your garment" cards (`FeaturedProducts`, reused from the home page) fill the page with something useful.
- **On a phone** the button is full width.

### 4.6 Cart page states

| State | What shows |
| --- | --- |
| Loading (first load) | `loading.tsx`: the title, 3 line skeletons (a 72 × 90 box and two text bars, at the final sizes), and a summary skeleton |
| Updating a line | 2.7 and 4.3 |
| Empty | 4.5 |
| Below the minimum | Section 5 |
| Rules failed | 4.4 |
| Cart failed to load | The styled server-error block (03-direction): "Something went wrong on our side" plus "Try again" |
| Region changed with items in the cart | Out of scope. 03-direction already marks the warning as copy from the founders. |

### 4.7 The cart panel in the header (replaces the hover dropdown)

**Decision.** The cart icon in the header is a **link to `/cart` at every width**, as today. The hover dropdown goes:
- hover-only panels can't be opened by touch or keyboard;
- they open by accident when the pointer crosses the header;
- today's panel clips prices (defect 8).

What the dropdown was useful for, confirming an add, becomes the **"Added to cart" panel**. It appears only after an add.
- **From 1024 px:** a popover under the cart icon.
- **Below 1024 px:** a confirmation on the product page.

Both use one component, `AddedToCart`.

**Content, in order:**
1. **Heading:** `check` icon (`success`) and "Added to your cart" (W-A1), `body` semibold. `role="status"`, so screen readers announce it.
2. **The added line:** a 56 × 70 thumbnail, the title, "Size: M", "× 4" and the amount for that line.
3. **The cart in one line:** "5 pieces in your cart · PKR 17,500" (W-A2).
4. **Export only:** `MinimumProgress`, compact (section 5).
5. **Buttons:**
   - primary "View cart" (W-A3), full width;
   - text button "Keep shopping" (W-A4), which closes the panel.

   There is no "Checkout" button here. The cart is where the minimum and the totals are checked, and it is one tap away.

**From 1024 px (popover):**
- **Position:** 400 px wide, right edge aligned with the cart icon, 8 px below the header.
- **Look:** `surface` background, 1 px `border-strong`, `radius-card`, shadow `0 8px 24px rgb(11 21 48 / 0.16)`, 16 px padding.
- **Behaviour:**
  - It is not modal, and focus stays on the add button.
  - It closes on Esc, a click outside, "Keep shopping", its close button (44 × 44, label "Close"), or a page change.
  - It has **no timer**. Today's 5-second auto-close removes it while someone is still reading.

**Below 1024 px (inline):**
- **Position:** the same content, shown inline directly under the main button on the product page, inside the buy block. It is not a sheet or a pop-up: organizers add one size after another, and a sheet after every add would get in the way.
- **Look:** a success `Alert` box holding items 1 to 5.
- **Lifetime:** it stays until the next add replaces it, or until the visitor leaves the page.
- **If the add came from the sticky buy bar** (so the inline box is out of view): a snackbar shows as well.
  - **Content:** "Added: Jersey, M × 4" plus a "View cart" link.
  - **Position:** fixed, 8 px above the sticky bar, gutter 16, `inverse` background, white text (18:1), a 44 px close button.
  - **Lifetime:** it stays until it is closed or the page is scrolled to the inline box.

**States:**

| State | What shows |
| --- | --- |
| Adding | The main button's loading state ("Adding…", exists) |
| Added | The panel or inline box, and the header badge count goes up |
| Error | "We couldn't add this to your cart. Try again." (W-A5) as an error `Alert` under the main button, focused. The panel doesn't open. |
| Focus inside the panel | Ring on each control |

**Header badge:**
- It shows the total quantity, as today.
- Its accessible name is "Cart, 5 items" (exists).
- At 0 the badge is hidden and the name is "Cart, empty".

### 4.8 Product page changes that belong to the cart

- **Quantity:** a `QuantityStepper` and the main button share one row: the stepper (144 px) at the start and the button filling the rest (at least 176 px at 360). Garments and the fit kit only. The default is 1 in every region.
- **The sticky buy bar** adds the number when it is above 1: "M × 4 · PKR 14,000".
- **The minimum line** for export regions: section 5.2.

---

## 5. Minimum quantity

### 5.1 The rule, as the contract states it

- `min_garment_quantity` is on the region: 1 in Pakistan, 10 in the UK, UAE and US.
- Only garment pieces count (`metadata.kind === "garment"`), across the whole cart, in any mix of sizes and garments.
- The fit kit and the rush add-on don't count. A cart with no garments passes.
- The backend refuses completion below the minimum.

**When anything shows:** the minimum UI appears only when `required > 1`. Pakistan (`required` 1) never sees any of it.

On the cart and checkout it appears only when the cart holds at least one garment. A cart with only a fit kit shows nothing (`counted` is 0 and `ok` is true).

### 5.2 Product page (export regions, garments only)

Under the price block, after "Shipping and duties included" (exists):
- **The line:** the `shipping` icon is already used there, so this uses a `team` icon (new, 20 px). Text: "Minimum order: 10 garment pieces. Mix sizes and garments." (W-M1), `small` semibold `ink`.
  - The number comes from `region.metadata.min_garment_quantity`.
  - Decision 007 said the minimum is not shown until the founders set it. The contract now sets 10 as a placeholder in region settings. Showing it is **for the founders to confirm** (Q2 in the report). Until they confirm, hide it behind a content flag (`productContent.minimum.show`), on by default in development only.
- **When the cart already has garments:** a second line, "You have 4 in your cart." (W-M2), from `checkout-rules.minimum_quantity.counted`.
- **Not on the fit kit page.**

### 5.3 `MinimumProgress` (cart, cart panel, checkout)

**Below the minimum** (`ok: false`):

```
[team icon]  7 of 10 garment pieces            (body semibold, ink)
[■■■■■■■□□□]                                    (8 px bar)
Add 3 more to check out. Mix any sizes and garments.   (small, ink-muted)
```

- **Text:** W-M3 ("7 of 10 garment pieces") and W-M4 ("Add 3 more to check out. Mix any sizes and garments."). "3" is `required − counted`.
- **The bar** is decorative (`aria-hidden`); the text carries the information.
  - **Track:** `surface-alt` with a 1 px `border-strong` outline (non-text 4.2:1).
  - **Fill:** `ink`, width `min(counted / required, 1)`.
- **Cart:** inside an info `Alert` at the top of the page, and again in the summary just above the checkout button (compact: bar and first line only).

**At or above the minimum** (`ok: true`, `counted ≥ required`):
- **Text:** `check` icon in `success`, then "Minimum reached: 12 garment pieces" (W-M6), in `small` semibold `success` (5.4:1).
- **The bar** is full, filled `success`.
- **Where:** the summary only. The top alert is removed.
- **Screen readers:** the change is announced once through a `role="status"` region: "Minimum reached".

**Checkout button below the minimum:**
- **Look:** inactive (`aria-disabled="true"`, 40% fill, as the Button already does). It stays focusable.
- **Reason:** `aria-describedby` points to the "Add 3 more to check out…" text.
- **On press:** it scrolls to and focuses the top minimum alert. It never goes to checkout.
- The same applies to the sticky bar button.

**Loading:** the progress row shows grey bars while `checkout-rules` loads. The checkout button shows the loading state "Updating…" (W-C10) until the rules arrive, so it is never usable for a moment before being refused.

### 5.4 Checkout

- **On entry:** if `minimum_quantity.ok` is false (for example, a second tab removed items), the checkout shows an error `Alert` at the top:
  - title "Your order needs 10 garment pieces" (W-M7);
  - text "You have 7. Add 3 more in your cart to place the order." (W-M8);
  - a secondary button "Back to cart" (W-M9).
- **The form** stays usable, but "Place order" is inactive with the same reason.
- **After a refused order:** 6.8.

### 5.5 Summary of where it shows

| Region | Cart content | Product page | Cart and panel | Checkout |
| --- | --- | --- | --- | --- |
| Pakistan | anything | nothing | nothing | nothing |
| UK, UAE, US | only a fit kit | fit kit page: nothing | nothing | nothing |
| UK, UAE, US | 1–9 garment pieces | minimum line + "You have N" | progress, checkout inactive | alert, "Place order" inactive |
| UK, UAE, US | 10+ garment pieces | minimum line + "You have N" | "Minimum reached" | nothing |
| UK, UAE, US | no cart yet | minimum line | — | — |

---

## 6. Checkout

### 6.1 Decision: two short steps on one page, plus "Place order"

**Evidence:**
- Baymard found that a one-page checkout does not perform better than an equally good multi-step one. What decides it is what customers must do in each step (Baymard, 2011; section 13).
- Their later accordion-checkout research found two common faults:
  - completed steps that collapse to a heading only, so customers can't check what they entered;
  - a browser Back button that leaves the checkout instead of going back one step.

**Decision (opinion):** keep the starter's structure, one URL with a `?step=` query, since the developer already has it. Cut it to **two steps** and fix both faults.

1. **Contact and address** (`?step=address`).
2. **Delivery and payment** (`?step=payment`). This holds the delivery line, the date, the payment choice, the order check and the **"Place order"** button.

Why not four steps, as today:
- Delivery has exactly one option per region (contract section 3), so a step to "choose" it is a wasted screen on a phone. It is selected automatically when the address is saved, and shown as a line.
- Review becomes the bottom of step 2, so the customer can see everything without tapping "Continue" again.

If a region ever has two delivery options, the delivery line becomes a radio group in the same place, with no new step.

**The two faults, fixed:**
- **A finished step collapses to a summary**, not a heading: the email, the phone, the address in 2–4 lines and the delivery line. It has a "Change" text button (44 px, `aria-label="Change contact and address"`).
- **Each step change uses `router.push`**, so Back returns to the previous step. Today's code already does this. Keep it, and test it.

### 6.2 Header and frame

- **Header:** a checkout header, 56 px, `inverse` background.
  - **Left:** the wordmark, linking home.
  - **Right:** "Back to cart" (W-K1) as a text link, white, 44 px tall, with a `‹` chevron. At 360 px it shortens to "Cart".
  - No menu, no region chip, no garment links: there is nothing to wander off to.
- **Step indicator** under the header, in `small`: "Step 1 of 2 · Contact and address" (W-K2). A text label, not dots.
- **Footer:** no full footer. One `small` line with "© FitMyOutfit" (exists) and, once those pages exist, the Terms and Privacy links.

### 6.3 Phone layout (360 px), in order

1. **Order summary bar** (`OrderSummaryDisclosure`), collapsed by default.
   - **Collapsed:** a full-width row, 56 px, `surface-alt`: "Show order summary (5 pieces)" (W-K3), a chevron, and the total at the end.
   - **Open:** the lines (thumbnail 56 × 70, title, size, × quantity, amount), then the summary rows (4.4).
   - A native `<button aria-expanded>`.
2. **Minimum alert** if needed (5.4).
3. **Step 1**, open or summarised.
4. **Step 2**, open, or a closed heading with `ink-muted` text ("2. Delivery and payment") before step 1 is done.
5. **Place-order block**, visible only in step 2 (6.6).

**768 px:** the same single column, max width 560 px, centred.

**1280 px (from 1024):**
- **Left (7/12, max 640 px):** the step indicator, step 1, step 2, the place-order block.
- **Right (5/12), sticky:** the summary box: "Your order" (`h3`), the lines, the summary rows, the `DeliveryDateLine`.
- The disclosure bar is not used.

### 6.4 Step 1: Contact and address

**Title:** "1. Contact and address" (`h2`, W-K4).

**Signed-in customer with saved addresses in this region:**
- First, a radio group of saved addresses, each an `AddressCard` (9.5) inside a `RadioCard`.
- The last option is "Use a new address" (W-K5). Choosing it shows the form below.
- The default address is selected first.

**Fields, in order:**

| # | Field | Required | Notes |
| --- | --- | --- | --- |
| 1 | Email | yes | `type="email"`, `autocomplete="email"`, `dir="ltr"`. Hint: "For your order confirmation." (W-K6). Filled in from the account. |
| 2 | Phone | see Q3 | `type="tel"`, `autocomplete="tel"`, `dir="ltr"`. Hint: "The courier may call you." (W-K7). Recommended required: couriers in Pakistan and the UAE deliver by phone call, and cash on delivery needs one. Founder question Q3. |
| 3 | First name | yes | `autocomplete="given-name"`, `dir="auto"` |
| 4 | Last name | no | "(optional)"; `autocomplete="family-name"`, `dir="auto"`. Optional because not everyone has a family name (W3C, section 13). |
| 5 | Team or club name | no | "(optional)", maps to `company`, `dir="auto"`. A team name on the box label helps a club secretary find it. |
| 6 | Country | yes | If the region has one country, show it as read-only text ("Pakistan") with the hidden value. Otherwise a `SelectField`. |
| 7 | Address | yes | `address_1`, label "House and street" (W-K8), `autocomplete="address-line1"`, `dir="auto"` |
| 8 | Area, block or apartment | no | `address_2`, "(optional)", `autocomplete="address-line2"`, `dir="auto"`. Pakistani addresses usually need the area or block (opinion; the founders may know better). |
| 9 | City | yes | `autocomplete="address-level2"`, `dir="auto"` |
| 10 | Province / State / Emirate | PK, US, AE: yes. GB: hidden | `SelectField` with the list for the country. The label depends on the country: "Province", "State", "Emirate" (W-K9). Values are stored in `province`. |
| 11 | Postal code | GB, US: yes. PK: optional. AE: hidden | The label depends on the country: "Postcode" (GB), "ZIP code" (US), "Postal code (optional)" (PK). Hidden for the UAE, which has no postal codes (section 13). `autocomplete="postal-code"`, `dir="ltr"`. |
| 12 | Billing address | — | A checkbox, "Billing address is the same" (W-K10), checked by default. Unchecked, it shows a second address group with fields 3 and 6–11. |
| 13 | Save to account | — | Signed-in customers with a new address only: a checkbox, "Save this address to my account" (W-K11), unchecked. |

- **At 360 px:** one field per row, always. Two fields per row only from 768 px, and only for pairs that are short: First / Last name, City / Postal code.
- **The button:** primary, full width at 360 px (auto width at least 240 px from 768 px), "Continue to delivery and payment" (W-K12). Loading text: "Saving…" (W-K13).
- **What happens on save:**
  1. The address and email are saved to the cart.
  2. The one shipping option is added automatically.
  3. `checkout-rules` is re-read.
  4. The page moves to `?step=payment`.
- **If adding the shipping option fails:** step 2 shows an error `Alert`: "We couldn't set up delivery to this address. Check the address, or try again." (W-K14) with "Try again".

**Messages for field errors** (W-K15 to W-K19):
- "Enter your email address, like name@example.com"
- "Enter a phone number"
- "Enter your first name"
- "Enter the house and street"
- "Enter the city"
- "Choose a province / state / emirate"
- "Enter a postcode / ZIP code"

Each one says what to do, not just "Invalid".

### 6.5 Step 2: Delivery and payment

**Title:** "2. Delivery and payment" (`h2`, W-K20).

**a. Delivery block** (a box with a 1 px `border`, `radius-card`, 16 px padding; not a choice):

| Region | Line | Amount |
| --- | --- | --- |
| Pakistan | the option name from the backend: "Delivery in Pakistan" | `PKR 250` (the option's amount) |
| UK, UAE, US | the option name: "Shipping & duties included" | "Included" (W-C12). The amount is 0, and "£0.00" would read as "free shipping", which is a different promise. Show "Included" when `data.ddp` is true (gap G4). |

Under it, the `DeliveryDateLine` (2.6). **Never** a separate duties line, in any region.

**b. Payment** (`h3` "Payment", W-K21): a radio group of `RadioCard`s.

| Option | Shown | Title | Text |
| --- | --- | --- | --- |
| Placeholder payment (`pp_system_default`) | every region | "Test payment" (W-P1) | "No money is taken. For testing the store." (W-P2) |
| Cash on delivery (`pp_cod_cod`) | Pakistan only | "Cash on delivery" (W-P3) | "Pay the courier in cash when your order arrives." (W-P5) |

- **The placeholder** must never reach customers under that wording. **Before launch it is replaced** by the real gateways (dev-plan M4). Its wording is development wording, and the founders must confirm the stand-in label for any preview shown outside the team.

**Cash on delivery states:**

| State (from `checkout-rules.cash_on_delivery`) | What shows |
| --- | --- |
| `available: true` | A normal radio card, selectable |
| `reason: "over_limit"` | The card is shown but inactive: `ink-muted` text, `surface-alt` fill, radio `aria-disabled`, still focusable. Its text is replaced by "Not available for orders over PKR 20,000." (W-P4; `limit` and `limit_currency_code` from the rules, formatted with `convertToLocale`), with the `alert` icon. A short line under the group: "Lower the total in your cart to use cash on delivery." (W-P6), with a "Back to cart" text link. |
| `reason: "region"` | Not shown at all |
| rules failed to load | Not shown. Only the placeholder payment is offered, with a quiet line: "Cash on delivery couldn't load. Refresh to try again." (W-P7) |

**`RadioCard`:**
- **Layout:** full width, min height 64 px, 16 px padding, 1 px `border-strong`, `radius-card`. A 24 px radio circle at the start, then the title (`body` semibold) and the text (`small` `ink-muted`). The whole card is the label.
- **States:**

| State | Look |
| --- | --- |
| Default | As above |
| Hover | `ink` outline |
| Focus | Ring around the card |
| Selected | 2 px `ink` outline, filled radio dot, `aria-checked` |
| Disabled | As COD over the limit above |
| Loading | When chosen, Medusa starts a payment session: a spinner replaces the radio dot, and the other cards are inactive until it finishes |
| Error | Starting the session failed: an error message under the group, "We couldn't select this payment method. Try again." (W-P8). The choice goes back to the previous one. |

**c. Check your order** (`h3`, W-K22). The place to review before paying. Baymard found that customers check the summary before they buy.
- A summary of step 1: email, phone, the delivery address lines, and "Change".
- The lines, compact: the title, "Size: M", "× 4" and the amount. Over 6 lines, show the first 5 and a "Show all 9" button (W-K23).
- The summary rows (4.4), now with the real delivery amount. In Pakistan the label is "Total" and includes the PKR 250.
- The `DeliveryDateLine`.

### 6.6 Place-order block (end of step 2)

1. **Cash on delivery chosen:** an info line, "You'll pay PKR 21,250 in cash when your order arrives." (W-P9), with `total` from the cart.
2. **Terms line**, `small`: "By placing your order you agree to our Terms and Privacy policy." (W-K24). The links appear only when those pages exist. Until then the line is left out. The starter's line names policies that don't exist.
3. **"Place order"** (W-K25): primary, full width at 360 px; from 768 px auto width, at least 240 px.
   - **Loading:** "Placing your order…" (W-K26). The button keeps its width and ignores more presses (the Button already does this).
   - **Inactive** when the minimum isn't met (5.4), the address step isn't done, or no payment method is chosen. The reason is shown above the button in `small`, tied with `aria-describedby`:
     - "Add 3 more garment pieces to place the order." (W-M4b);
     - "Choose how to pay." (W-K27).
4. On success: go to `/order/[id]/confirmed`.

The **sticky bar is not used** in checkout. The place-order block is the end of the page, and on a phone a fixed bar would cover the fields.

### 6.7 Loading

- **Page load:** a skeleton of the header, the step indicator, three field boxes and a button box, at their final sizes. The summary bar shows a grey bar for the total.
- **Saving a step:** the button shows its loading text; the fields keep their values.
- **Re-reading the rules after a refusal:** the place-order block shows "Checking your order…" (W-K28) with a spinner, for at most one request.

### 6.8 Errors

Every error appears as an error `Alert` **directly above the "Place order" button**, where the customer is looking. It is focused when it appears, and announced (`role="alert"`). Nothing the customer typed is lost.

**a. Refused order** (an HTTP 4xx from cart completion). The storefront does **not** read the message (contract section 6). It re-reads `checkout-rules` and explains from that, checking in this order:

| What the rules now say | Alert title | Alert text | Action |
| --- | --- | --- | --- |
| `minimum_quantity.ok` false | "Your order needs 10 garment pieces" (W-M7) | "You have 7. Add 3 more in your cart to place the order." (W-M8) | Secondary "Back to cart" |
| COD chosen and `cash_on_delivery.available` false, `over_limit` | "Cash on delivery isn't available for this order" (W-E1) | "It's for orders up to PKR 20,000. Your total is PKR 21,250. Choose another way to pay." (W-E2) | The COD card switches to its over-limit state and is deselected; focus moves to the payment group |
| COD chosen and `reason: "region"` (region changed in another tab) | the same title (W-E1) | "Cash on delivery is for orders in Pakistan." (W-E3) | As above |
| None of the above | "We couldn't place your order" (W-E4) | "Your order was not placed. Try again, or go back to your cart and check it." (W-E5) | Primary "Try again"; text link "Back to cart" |

Because the backend refuses before creating an order, "was not placed" is true for a 4xx. **"Nothing was charged"** is not said here. It is true for the placeholder and for cash on delivery, but it must be confirmed per gateway before it is promised (W-E6, founders).

**b. Failed payment.** In M1 neither payment method can fail at the payment stage: the placeholder always passes, and cash on delivery takes no payment. The state is specified for the real gateways:
- **Title:** "The payment didn't go through" (W-E7).
- **Text:** "Try again, or choose another way to pay." (W-E8).
- **Actions:** "Try again" (primary); focus moves to the payment group.
- The gateway's own reason, if it gives a safe one ("card declined"), is shown as a second line. The wording comes later, with the gateway.

**c. Lost connection.**
- **Offline before pressing:** an `OfflineBanner` shows at the top of the page while `navigator.onLine` is false (`role="status"`): "You're offline. Your details are kept on this page." (W-E9). "Place order" is inactive with the reason "Reconnect to place your order." (W-E10).
- **Connection lost while placing the order** (the request fails without a response, or times out after 30 s): the result is unknown, and the order **may** have been created.
  - **Title:** "We lost the connection" (W-E11).
  - **Text:** "We don't know yet if your order went through. Check before you try again, so you don't order twice." (W-E12).
  - **Action:** primary "Check my order" (W-E13).
  - **"Check my order"** reads the cart again:
    - if the cart is completed, go to the confirmation;
    - if not, show alert (a) "We couldn't place your order" with "Try again".
  - This needs the backend to tell the storefront whether a cart has become an order (gap G5).

**d. Session or cart lost** (the cart can't be found):
- **Title:** "Your cart has expired" (W-E14).
- **Text:** "Start again from your cart." (W-E15).
- **Action:** primary "Go to cart".

---

## 7. Order confirmation

Route `/order/[id]/confirmed` (exists). Data: the order (`retrieveOrder`): `display_id`, `email`, `created_at`, `items`, totals, `shipping_address`, `shipping_methods`, `payment_collections`, `region`, `metadata`.

### 7.1 Content, in order (360 px)

1. **Confirmation band:** `surface-alt`, 24 px padding, no image.
   - The `check` icon (32 px, `success`).
   - `h1` "Thank you, <bdi>{first name}</bdi>" (W-O1). The first name comes from the shipping address. With no first name: "Thank you".
   - "Your order is placed." (W-O2), `body-lg`.
   - "Order number" in `small` `ink-muted`, then **#1042** in `h2` size (tabular numerals). It is easy to read out on the phone.
   - "Placed on 11 November 2026" (W-O3).
   - **Email line:** shown **only if the store sends confirmation emails** (gap G6): "We've sent a confirmation to <bdi>{email}</bdi>." (W-O4). Until then: "Your confirmation is on this page. Keep the order number." (W-O5).
2. **Delivery date:** a `DeliveryDateLine` in a box, from the stored promise (gap G2). If the order has none, the line is left out. It is never worked out again from today's date, because it would drift.
3. **Payment line:**
   - Cash on delivery: "Pay PKR 21,250 in cash when your order arrives." (W-O6).
   - Placeholder: "Test payment. No money was taken." (W-O7).
4. **What happens next** (`h2`, W-O8). An ordered list of 3 steps, each with an icon:
   1. "We make your order." (W-O9)
   2. "We check it before it ships." (W-O10)
   3. "It's delivered by Thursday 26 November." (W-O11). With no stored date: "We deliver it to the address below." (W-O11b)

   These restate CLAUDE.md decisions (quality checks, delivery promise). **Founders to confirm**, especially whether plain single-piece orders in Pakistan are checked at the Lahore hub or at the factory (CLAUDE.md says personalised team orders are checked at the hub, and plain bulk at the factory).
5. **Your order** (`h2`): the order lines (the cart line layout without controls), then the summary rows:
   - "Items";
   - the delivery line ("Delivery in Pakistan PKR 250" or "Shipping & duties included · Included");
   - "Total";
   - the tax note, if the founders decide (Q4).
6. **Delivery address:** the address block (`dir="auto"` lines), the phone, and the team or club name if given.
7. **Payment method:** "Cash on delivery" or "Test payment".
8. **Help:** hidden until a contact page or WhatsApp exists. Today's links go to `/contact`, which doesn't exist.
9. **Next action:**
   - **Guests:** a box, "Save your details for next time" (W-O12), with a secondary "Create an account" (W-O13) linking to `/account?view=create&email={email}`. It does not promise that this order will appear in the account (gap G7).
   - **Signed-in customers:** a text link "See all your orders" (W-O14).
   - **Everyone:** a primary "Back to the store" (W-O15), linking home. This is the main action now.

### 7.2 Layout

| Width | Layout |
| --- | --- |
| 360 | One column in the order above |
| 768 | One column, max width 640 px, centred |
| 1280 | The band across the content width. Below it, two columns: left 7/12 holds "What happens next", the address and payment; right 5/12 holds "Your order" in a box, not sticky. |

### 7.3 States

| State | What shows |
| --- | --- |
| Loading | `loading.tsx`: the band with grey bars for the name and number, and line skeletons |
| Order not found, or not this customer's | The styled not-found page, "We can't find that order" (W-O16), with a link home |
| Printing | `@media print`: hide the header, footer and buttons; keep the number, date, lines, totals and address |
| Arabic or Urdu name | "Thank you, <bdi>محمد علی</bdi>" renders right to left inside a left-to-right sentence. Check by screenshot with the test names (2.4). |

---

## 8. Sign-in and create account

### 8.1 Decisions

- **Checkout never requires an account.** Baymard's abandonment survey lists "the site required creating an account" as a reason for 18% of abandoning shoppers (section 13).
- **One route, two views**, chosen by `?view=signin` (default) or `?view=create`, so Back and links work. Today the view is local state, so Back leaves the page.
- **Return after sign-in:** to `?next=` (a path inside the store only, never a full URL), or to `/account`. The cart's sign-in link passes `next=/cart`.

### 8.2 Layout

| Width | Layout |
| --- | --- |
| 360 | One column, gutter 16. The form spans the full width (328 px). No empty block above the title: 32 px from the header. |
| 768 | The form is centred, max width 440 px |
| 1280 | The form is centred, max width 440 px, inside a box (1 px `border-strong`, `radius-card`, 32 px padding), with 64 px above and below |

### 8.3 Content, in order

1. `h1`: "Sign in" (W-L1) or "Create an account" (W-L2). Barlow Condensed, uppercase.
2. **View switch:** two tabs under the title, "Sign in" | "Create account" (W-L3).
   - Built as **links**, not ARIA tabs, because each view has its own URL.
   - Each is 44 px tall; the current one has a 3 px `ink` underline and `aria-current="page"`.
3. **One line on why** (`body` `ink-muted`):
   - Sign in: "See your orders and use your saved addresses." (W-L4).
   - Create: "Save your addresses and see your orders in one place." (W-L5).
   These replace "an enhanced shopping experience", which says nothing.
4. **Fields** (`TextField`, 2.3):
   - **Sign in:** Email; Password (with Show / Hide).
   - **Create account:**
     - First name (`dir="auto"`);
     - Last name "(optional)";
     - Email;
     - Phone "(optional)";
     - Password, with the hint "At least 8 characters." (W-L6). The hint stays only if the backend enforces it. Medusa's default has no rule, so the storefront checks it, or the hint is left out (developer to confirm).
   - Prefill Email from `?email=` (from the confirmation page).
5. **Error area** directly above the button (an error `Alert`).
6. **The button:** primary, full width. "Sign in" / "Create account" (W-L7), loading "Signing in…" (exists) / "Creating your account…" (W-L8).
7. **Create only:** the terms line, as W-K24. Hidden until the Terms and Privacy pages exist; the starter links to pages that don't exist.
8. **Forgot password:** a text link, "Forgot your password?" (W-L9), under the password field. **Hidden** until a reset flow and an email provider exist (gap G8). Without it, a customer who forgets their password is stuck. This is the biggest hole in M1 accounts.
9. **Remove** the "Got questions? Customer Service" block under the form until a help page exists.

### 8.4 States

| State | What shows |
| --- | --- |
| Default | As above |
| Submitting | Button loading; fields stay |
| Wrong email or password | "That email and password don't match an account." (W-L10). It doesn't say which one was wrong. Focus moves to the alert. The password field is cleared; the email is kept. |
| Email already has an account (create) | "There's already an account with this email." (W-L11), with a link "Sign in instead" (W-L12) to `?view=signin&email=…` |
| Field errors | Under each field (2.3) |
| Network error | "We couldn't reach the store. Check your connection and try again." (W-E16) |
| Already signed in | `/account` shows the overview (9), as today |

---

## 9. Account

Routes exist: `/account`, `/account/orders`, `/account/orders/details/[id]`, `/account/profile`, `/account/addresses`. Data comes from Medusa's own customer routes (contract section 8).

### 9.1 Frame

**360 px:**
- **Overview page:** the title band, then the overview content, then the account menu as a list (`AccountMenu`). It is no longer a page with only a menu: today the overview is hidden on phones.
- **Inner pages:** a "‹ Your account" (W-U1) text link, 44 px tall, above the page title, then the page.

**768 px:** the same, with a max width of 640 px.

**1280 px (from 1024):**
- **Left column (240 px):** the menu as a vertical list, sticky.
- **Right:** the page.
- The current item has a 3 px `ink` bar on the start edge, semibold text and `aria-current="page"`.

**Title band:** `h1` "Your account" (W-U2), then "Hello, <bdi>{first_name}</bdi>" (W-U3) and the email in `small` `ink-muted`.

**Menu items** (each a 48 px row, the item's icon at 20 px, a label, and a chevron on phones):
- "Orders" (W-U4);
- "Addresses" (W-U5);
- "Profile" (W-U6);
- "Sign out" (W-U7), a button. It has no confirm step. Loading: "Signing out…" (W-U8).

**Remove:**
- the "Got questions? Customer Service" block, until a help page exists;
- "Profile 60% completed" (a number that helps no one place an order).

### 9.2 Overview

1. The title band (9.1).
2. **Recent orders** (`h2`, W-U9): the latest 3, as `OrderCard`s (9.3), then "See all orders" (W-U10). Empty: the empty state (9.3).
3. **Default address** (`h2`, W-U11): one `AddressCard`, then "Manage addresses" (W-U12). With none saved: "No saved address yet." (W-U13), with "Add an address".
4. **On phones:** the menu (9.1) at the end.

### 9.3 Order history (`/account/orders`)

`h1` "Your orders" (W-U14). A list of `OrderCard`s, newest first.

**`OrderCard`:** a 1 px `border-strong` box, `radius-card`, 16 px padding. The whole card is one link to the order (one focus ring), with the name "Order #1042, placed 11 November 2026".

**Content:**
- **Row 1:** "Order #1042" (`h3`) at the start; the status label (`OrderStatus`) at the end.
- **Row 2:** "Placed on 11 November 2026 · 5 pieces · PKR 21,250" (`small` `ink-muted`).
- **Row 3:** up to 3 thumbnails, 48 × 60, then "+2" in `small` if there are more.
- **Row 4:** the `DeliveryDateLine`, compact (no note), only while the order isn't delivered and a date is stored.

**`OrderStatus`:** an icon plus words. **Never colour alone.**

| Medusa state | Label (draft) |
| --- | --- |
| `status: canceled` | "Cancelled" (W-U15), `x` icon, `ink-muted` |
| `fulfillment_status` `not_fulfilled`, `partially_fulfilled` | "Order placed" (W-U16), `package` icon, `ink` |
| `fulfilled`, `partially_shipped`, `shipped` | "On its way" (W-U17), `delivery` icon, `ink` |
| `delivered`, `partially_delivered` | "Delivered" (W-U18), `check` icon, `success` |

The production stages ("Being made", "Quality check") come with factory status after M4 (dev-plan, "Not in this plan"). Don't invent them now.

**Pages:** show 10 orders, then "Show more orders" (W-U19). Not infinite scroll, so the footer stays reachable.

**States:**

| State | What shows |
| --- | --- |
| Loading | 3 card skeletons at the final size |
| Empty | "No orders yet" (`h2`, as 03-direction), plus the primary "Start your team kit" (`homeContent.button`). It replaces "Nothing to see here … :)". |
| Error | "We couldn't load your orders." (W-U20), with "Try again" |

### 9.4 One order (`/account/orders/details/[id]`)

The same blocks as the confirmation (7.1), without the thank-you band and without the "What happens next" list:
1. "‹ Your orders" (W-U21) link.
2. `h1` "Order #1042", the `OrderStatus`, and "Placed on 11 November 2026".
3. The `DeliveryDateLine`, if one is stored and the order isn't delivered.
4. The payment line (for cash on delivery while unpaid: "Pay PKR 21,250 in cash when your order arrives.", W-O6).
5. Your order: the lines and summary rows.
6. The delivery address.
7. The payment method.
8. Help (hidden until it exists).

**Layout:** as the confirmation (7.2). **States:** as 7.3; not found → "We can't find that order".

### 9.5 Addresses (`/account/addresses`)

`h1` "Addresses" (W-U22).

**`AddressCard`:**
- **Box:** 1 px `border-strong`, `radius-card`, 16 px padding.
- **Content:** the name (`body` semibold, `<bdi>`); the address lines (`dir="auto"`); the phone (`dir="ltr"`).
- **Default:** a "Default" text label (W-U23) with the `check` icon.
- **Actions:** text buttons, 44 px tall: "Edit" and "Remove" (W-U24). Their accessible names include the first address line: "Edit address, 12 Mall Road".

**Grid:** one column at 360; two at 768 and 1280.

**"Add an address"** (W-U25): a secondary button, full width at 360. It opens the `AddressForm` (the same fields as checkout 6.4, rows 3 and 5–11, plus phone and a "Make this my default address" checkbox, W-U26).
- **Phones:** a full-height `Sheet` with a sticky footer holding "Save address" (primary, W-U27) and "Cancel" (text).
- **From 768 px:** a dialog, 560 px.

**Remove:** a small confirm dialog: "Remove this address?" (W-U28), with "Remove" (secondary, not red; red is only for the main button) and "Keep it" (text, W-U29).

**Country:** the country choice lists the store's countries (Pakistan, United Kingdom, United Arab Emirates, United States). Postal code and province follow the country, as in 6.4. In checkout, only addresses in the current region are offered (as today).

**States:**

| State | What shows |
| --- | --- |
| Empty | "No saved addresses yet. Add one to check out faster." (W-U30), with "Add an address" |
| Saving | The button shows "Saving…" |
| Field errors | As 2.3 |
| Save failed | An error `Alert` in the form: "We couldn't save the address. Try again." (W-U31) |
| Remove failed | A toast: "We couldn't remove the address." (W-U32) |

### 9.6 Profile (`/account/profile`)

`h1` "Profile" (W-U33). Rows, each with a label, the value and an "Edit" text button. Editing opens the field in place, with "Save" (primary) and "Cancel" (text).

| Row | Editable | Notes |
| --- | --- | --- |
| Name | yes | First name, Last name "(optional)", `dir="auto"` |
| Phone | yes | `dir="ltr"` |
| Email | **no** in M1 | Shown read-only. The starter's email form is not wired (a TODO in `profile-email`). Hidden "Edit" until it works. |
| Password | **hidden** in M1 | The starter's password form shows "not implemented". Remove the row until a reset and change flow exists (gap G8). |
| Billing address | removed | Addresses live on the Addresses page; the starter's separate billing block duplicates it |

- **Saved:** a success toast, "Saved" (W-U34).
- **Failed:** an error message under the row, "We couldn't save this. Try again." (W-U35).

---

## 10. Components: new and reused

Size key: **S** about half a day, **M** about 1 day, **L** 2 days or more (opinion, for planning only).

### 10.1 New

| Component | Where | Size | Notes |
| --- | --- | --- | --- |
| `Sheet` | size chart, address form, (later) others | M | Extracted from the region selector's Headless UI `Dialog`: a bottom sheet below 768 px, a dialog above. History entry, so Back closes it. |
| `SizeChartTable` | sheet, accordion, fit kit page | M | Rows = sizes, Youth/Adult group rows, chosen-size row, sticky size column when scrolling |
| `SizeChartSheet` | product page | S | Title, draft alert, unit switch, diagram slot, table, links |
| `UnitSwitch` (segmented radio) | size chart | S | |
| `SizeChartDiagram` | size chart | M | Optional; after the pattern maker confirms the measuring points |
| `QuantityStepper` | product page, cart | M | |
| `CartLine` | cart, checkout check, order pages (read-only mode) | M | Replaces `cart/components/item` and its `Table` layout |
| `CartSummary` | cart, checkout, order pages | M | Replaces `common/components/cart-totals`; no Taxes row while tax isn't final |
| `MinimumProgress` | product page (line only), cart, panel, checkout | S | |
| `AddedToCart` (popover / inline / snackbar) | header, product page | L | Replaces the hover `cart-dropdown` |
| `StickyCheckoutBar` | cart (phone) | S | Reuses `sticky-buy-bar` logic |
| `CheckoutHeader` | checkout layout | S | Replaces the white starter header |
| `CheckoutStep` | checkout | M | Open / summary / closed states, "Change" |
| `OrderSummaryDisclosure` | checkout (phone) | S | |
| `TextField`, `SelectField` | every form | M | Replace the floating-label `Input` and `NativeSelect` look |
| `PasswordField` | sign-in, create | S | Show / Hide in words |
| `AddressFields` | checkout, address form | L | Fields by country (postal code, province rules) |
| `RadioCard` | payment, saved addresses | S | |
| `DeliveryDateLine` | cart, panel, checkout, confirmation, order | S | Includes the date-only formatting helper |
| `Alert` (info / error / success) | everywhere | S | Plus the two new colour tokens |
| `OfflineBanner` | checkout | S | |
| `OrderConfirmation` template | confirmation | M | Rebuilt from `order-completed-template` |
| `OrderStatus` | account | S | |
| `OrderCard` | account | S | Rewritten |
| `AccountMenu` | account | S | Rewritten `account-nav` |
| `AuthViewSwitch` | sign-in | S | |
| `AddressCard` | account, checkout | S | Rewritten `address-card` |
| `ConfirmDialog` | remove address | S | On `Sheet` |
| Line icons `ruler`, `team`, `trash`, `package`, `x` | various | S | Added to `LineIcon`; same 1.5 px stroke |
| `content/cart.ts`, `content/checkout.ts`, `content/order.ts`, `content/account.ts`, and additions to `content/product.ts` | — | S | All wording in section 11, marked `// DRAFT WORDING.` |

### 10.2 Reused as they are

- `Button` and `ButtonLink` (all variants, loading and inactive states).
- `LineIcon` (`delivery`, `shipping`, `payment`, `fit-kit`, `check`, `alert`).
- `Thumbnail`, at the 4:5 ratio.
- `LocalizedClientLink`, `Spinner`.
- Helpers: `convertToLocale`, `showsTaxNote`, `isPakistan`, `lib/util/product-kind.ts`, `lib/util/sizes.ts` (`groupOptionValues`), `lib/util/sticky-buy-bar.ts`.
- The region selector's sheet styles (as `Sheet`).
- `FeaturedProducts` (the empty cart).
- The Medusa UI `toast` (restyled).
- The not-found page and the server-error block from 03-direction.
- The existing data calls: `retrieveCart`, `updateLineItem`, `deleteLineItem`, `placeOrder`, `retrieveOrder`, `listOrders`, `login`, `signup`, `signout`, the address actions.
- **New data calls:** `getCheckoutRules(cartId)`.

### 10.3 Removed

- The hover `cart-dropdown`.
- `cart-item-select` (the 1–10 drop-down).
- `sign-in-prompt` as a block.
- `discount-code`, hidden behind a flag.
- The account "Got questions" block.
- The profile completion figure.
- The profile email and password forms (until they work).
- The order `help` links to `/contact`.
- The starter's review terms sentence.

---

## 11. Draft wording, founders to confirm

All of this is **DRAFT WORDING, founders to confirm**. It goes into `storefront/src/content/` as data, marked `// DRAFT WORDING.`, never into components. **P** marks a sentence that states or touches a promise, a payment or a rule; those need the founders' attention first. The rest are plain interface labels.

### Size chart (`content/product.ts`, `sizeChart`)
| Id | Text |
| --- | --- |
| W-S1 | Size chart |
| W-S2 | Draft measurements |
| W-S3 **P** | These measurements may change before production. We'll update this chart when they're final. |
| W-S4 | Measured on the garment laid flat. |
| W-S5 | Your choice |
| W-S6 | Sizes in the kit |
| W-S7 | Not sure? See the fit kit |

### Minimum (`content/product.ts` and `content/cart.ts`, `minimum`)
| Id | Text |
| --- | --- |
| W-M1 **P** | Minimum order: {n} garment pieces. Mix sizes and garments. |
| W-M2 | You have {counted} in your cart. |
| W-M3 | {counted} of {required} garment pieces |
| W-M4 **P** | Add {missing} more to check out. Mix any sizes and garments. |
| W-M4b | Add {missing} more garment pieces to place the order. |
| W-M5 **P** | Not counted towards the minimum |
| W-M6 | Minimum reached: {counted} garment pieces |
| W-M7 **P** | Your order needs {required} garment pieces |
| W-M8 | You have {counted}. Add {missing} more in your cart to place the order. |
| W-M9 | Back to cart |

### Cart (`content/cart.ts`)
| Id | Text |
| --- | --- |
| W-C1 | Your cart · {n} pieces / 1 piece |
| W-C2 / W-C2b | Go to checkout / Checkout |
| W-C3 | Have an account? Sign in |
| W-C4 | Size: {size} |
| W-C5 | {price} each |
| W-C6 **P** | Refundable deposit |
| W-C7 | Removed: {title}, {size} × {qty} · Undo |
| W-C8 / W-C8b | We couldn't change the quantity. Try again. / We couldn't remove this. Try again. |
| W-C9 | Enter a number from 1 to 999 |
| W-C10 | Updating… |
| W-C11 | Added at checkout |
| W-C12 **P** | Included (beside "Shipping & duties included") |
| W-C13 | Total before delivery |
| W-C14 | Some details couldn't load. Refresh the page to try again. |
| W-C15 | Your cart is empty |
| W-C16 | Start with a garment, or design your team's kit. |

### Added to cart (`content/cart.ts`, `added`)
| Id | Text |
| --- | --- |
| W-A1 | Added to your cart |
| W-A2 | {n} pieces in your cart · {total} |
| W-A3 | View cart |
| W-A4 | Keep shopping |
| W-A5 | We couldn't add this to your cart. Try again. |

### Delivery date (`content/checkout.ts`, `delivery`)
| Id | Text |
| --- | --- |
| W-D1 **P** | Delivered by {date} |
| W-D2 **P** | Counted from today. For team orders it counts from the day you approve your proof. *(M1 only, while the date counts from today: contract section 5. The founders must choose the words. The current fact box says "From the day you approve your proof", which doesn't match a single-piece order with no proof.)* |

### Checkout (`content/checkout.ts`)
| Id | Text |
| --- | --- |
| W-K1 | Back to cart (phone: Cart) |
| W-K2 | Step {n} of 2 · {step name} |
| W-K3 | Show order summary ({n} pieces) / Hide order summary |
| W-K4 | 1. Contact and address |
| W-K5 | Use a new address |
| W-K6 | For your order confirmation. |
| W-K7 **P** | The courier may call you. |
| W-K8 | House and street |
| W-K9 | Province / State / Emirate; Postcode / ZIP code / Postal code |
| W-K10 | Billing address is the same |
| W-K11 | Save this address to my account |
| W-K12 | Continue to delivery and payment |
| W-K13 | Saving… |
| W-K14 | We couldn't set up delivery to this address. Check the address, or try again. |
| W-K15–19 | Field error messages (6.4) |
| W-K20 | 2. Delivery and payment |
| W-K21 | Payment |
| W-K22 | Check your order |
| W-K23 | Show all {n} |
| W-K24 **P** | By placing your order you agree to our Terms and Privacy policy. |
| W-K25 | Place order |
| W-K26 | Placing your order… |
| W-K27 | Choose how to pay. |
| W-K28 | Checking your order… |

### Payment (`content/checkout.ts`, `payment`)
| Id | Text |
| --- | --- |
| W-P1 | Test payment *(development only)* |
| W-P2 **P** | No money is taken. For testing the store. *(development only)* |
| W-P3 | Cash on delivery |
| W-P4 **P** | Not available for orders over {limit}. / Cash on delivery is for orders up to {limit}. |
| W-P5 **P** | Pay the courier in cash when your order arrives. |
| W-P6 | Lower the total in your cart to use cash on delivery. |
| W-P7 | Cash on delivery couldn't load. Refresh to try again. |
| W-P8 | We couldn't select this payment method. Try again. |
| W-P9 **P** | You'll pay {total} in cash when your order arrives. |

### Errors (`content/checkout.ts`, `errors`)
| Id | Text |
| --- | --- |
| W-E1 | Cash on delivery isn't available for this order |
| W-E2 **P** | It's for orders up to {limit}. Your total is {total}. Choose another way to pay. |
| W-E3 **P** | Cash on delivery is for orders in Pakistan. |
| W-E4 | We couldn't place your order |
| W-E5 | Your order was not placed. Try again, or go back to your cart and check it. |
| W-E6 **P** | (Not used yet) "Nothing was charged." Only once confirmed per gateway. |
| W-E7 | The payment didn't go through |
| W-E8 | Try again, or choose another way to pay. |
| W-E9 | You're offline. Your details are kept on this page. |
| W-E10 | Reconnect to place your order. |
| W-E11 | We lost the connection |
| W-E12 | We don't know yet if your order went through. Check before you try again, so you don't order twice. |
| W-E13 | Check my order |
| W-E14 | Your cart has expired |
| W-E15 | Start again from your cart. |
| W-E16 | We couldn't reach the store. Check your connection and try again. |

### Order confirmation (`content/order.ts`)
| Id | Text |
| --- | --- |
| W-O1 | Thank you, {first name} / Thank you |
| W-O2 | Your order is placed. |
| W-O3 | Placed on {date} |
| W-O4 **P** | We've sent a confirmation to {email}. *(only once emails are sent)* |
| W-O5 | Your confirmation is on this page. Keep the order number. |
| W-O6 **P** | Pay {total} in cash when your order arrives. |
| W-O7 | Test payment. No money was taken. *(development only)* |
| W-O8 | What happens next |
| W-O9 **P** | We make your order. |
| W-O10 **P** | We check it before it ships. |
| W-O11 / W-O11b **P** | It's delivered by {date}. / We deliver it to the address below. |
| W-O12 | Save your details for next time |
| W-O13 | Create an account |
| W-O14 | See all your orders |
| W-O15 | Back to the store |
| W-O16 | We can't find that order |

### Sign-in (`content/account.ts`, `auth`)
| Id | Text |
| --- | --- |
| W-L1 / W-L2 | Sign in / Create an account |
| W-L3 | Sign in · Create account |
| W-L4 | See your orders and use your saved addresses. |
| W-L5 | Save your addresses and see your orders in one place. |
| W-L6 | At least 8 characters. |
| W-L7 | Sign in / Create account |
| W-L8 | Creating your account… |
| W-L9 | Forgot your password? *(hidden until reset exists)* |
| W-L10 | That email and password don't match an account. |
| W-L11 | There's already an account with this email. |
| W-L12 | Sign in instead |

### Account (`content/account.ts`)
| Id | Text |
| --- | --- |
| W-U1 | ‹ Your account |
| W-U2 | Your account |
| W-U3 | Hello, {first name} |
| W-U4–U7 | Orders · Addresses · Profile · Sign out |
| W-U8 | Signing out… |
| W-U9 / W-U10 | Recent orders / See all orders |
| W-U11 / W-U12 / W-U13 | Default address / Manage addresses / No saved address yet. |
| W-U14 | Your orders |
| W-U15–U18 **P** | Cancelled · Order placed · On its way · Delivered |
| W-U19 | Show more orders |
| W-U20 | We couldn't load your orders. |
| W-U21 | ‹ Your orders |
| W-U22 | Addresses |
| W-U23 | Default |
| W-U24 / W-U25 | Edit · Remove / Add an address |
| W-U26 | Make this my default address |
| W-U27 | Save address |
| W-U28 / W-U29 | Remove this address? / Keep it |
| W-U30 | No saved addresses yet. Add one to check out faster. |
| W-U31 / W-U32 | We couldn't save the address. Try again. / We couldn't remove the address. |
| W-U33 | Profile |
| W-U34 / W-U35 | Saved / We couldn't save this. Try again. |

---

## 12. Contract gaps

These are things in [m1-checkout.md](../contracts/m1-checkout.md) that make a good page hard or impossible, with the change I'd ask for. The coordinator decides.

| # | Gap | Effect on the pages | Proposed change |
| --- | --- | --- | --- |
| G1 | `delivery_promise` returns both the standard and the rush date, but not which one applies to this cart | Once rush can be added, the storefront would have to guess from the lines | Add `delivery_promise.applies: "standard" \| "rush"` (or `rush_in_cart: boolean`) |
| G2 | The promised date is not stored on the order | The confirmation and the account can't show "Delivered by"; working it out again later would give a different date | At completion, copy the applying date and days to `order.metadata.delivery_promise` (`{ date, days, kind }`) |
| G3 | The rules route needs a cart | The product page can't show a date before anything is added, so it keeps "Delivered in 15 days" | Optional: `GET /store/delivery-promise` with no cart, the same rule. Low priority. |
| G4 | The storefront needs `data.ddp` on the shipping option to show "Included" instead of "£0.00" | If the store API doesn't return `data` on cart shipping options, the export line would read "£0.00" (a free-shipping look) | Confirm that `data.ddp` comes back in `/store/shipping-options?cart_id=`, or add `ddp: true` to the rules response |
| G5 | Nothing says how to tell, after a lost connection, whether a cart became an order | "Check my order" can't be built safely, and a second press may order twice | Confirm that completing an already completed cart returns the existing order (no second order), and that `GET /store/carts/:id` shows `completed_at`. If not, add `order_id` to the rules response once completed. |
| G6 | Order confirmation emails are not in M1 | The confirmation can't say "We've sent a confirmation" | Either add the email in M1, or keep W-O5 until it exists |
| G7 | Guest orders are not linked to an account created afterwards. The starter has an order-transfer request (`createTransferRequest` in `lib/data/orders.ts`), but no page in this spec uses it and it needs email | "Create an account" on the confirmation can't promise the order appears there | Decide whether to link by email, or use the transfer request once emails work (a backend task), or keep W-O12 as is |
| G8 | Password reset is not in M1 (contract section 8 uses Medusa's routes as they are; the storefront has no reset page) | A customer who forgets their password is locked out; the profile password row has to be hidden | Add a reset flow (Medusa's `reset-password` plus the email provider) to M1 or M2 |
| G9 | `cash_on_delivery.limit` is a number with a currency code, but the contract doesn't say whether it is in major units (20000 = PKR 20,000) | A unit mix-up would show "PKR 200" or "PKR 2,000,000" | State "major units, like Medusa v2 prices" in the contract |
| G10 | The COD limit is compared with the cart total, including delivery | A cart at PKR 19,900 plus PKR 250 delivery fails at checkout after looking fine in the cart | Keep the rule, but have the cart page show the note only after delivery is known, or compare in the cart with the delivery added. I specified the note from `reason`, so it shows what the backend decides. Worth a line in the contract. |

---

## 13. Sources

All opened on 11 Nov 2026.

| Source | What I took from it (evidence) |
| --- | --- |
| Baymard Institute, "One page checkout vs multi-step", 26 Apr 2011: https://baymard.com/blog/one-page-checkout | A one-page checkout "won't necessarily perform better than a comparatively optimized multi-step checkout"; users had few problems moving between steps, and most problems came from what each step asked of them. |
| Baymard Institute, "Accordion checkout usability": https://baymard.com/blog/accordion-checkout-usability | Two pitfalls: completed steps collapsed to headings only, and a Back button that leaves the checkout. Recommendations: collapse finished steps into summaries; make Back return to the previous step (`history.pushState`). No percentages on the page. |
| Baymard Institute, "Cart abandonment rate" list: https://baymard.com/lists/cart-abandonment-rate | Reasons for abandonment during checkout include extra costs too high (40%), delivery too slow (20%), the site required creating an account (18%), checkout too long or complicated (17%), and the total couldn't be seen up front (12%). The page doesn't date the survey; the page itself shows an update on 28 Oct 2026. |
| W3C Internationalization, "Personal names around the world": https://www.w3.org/International/questions/qa-personal-names | Ask whether separate given and family name fields are needed; a full name is simpler where possible; "first/last name" labels confuse people who write the family name first. |
| GeoPostcodes, "United Arab Emirates address validation": https://www.geopostcodes.com/country/uae/address-validation/ | The UAE has "no postal code system available"; mail relies on P.O. boxes. This is a commercial data vendor, not Emirates Post; I could not open an official Emirates Post page in this session. |

**Opinion, not evidence:** the step count, the panel that replaces the dropdown, the sizes-as-rows table, phone required, and the field order are my design judgements. They are based on the sources above, the screenshots in section 1 and the direction in 03.
