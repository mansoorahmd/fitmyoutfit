# 02 Current storefront review

10 Nov 2026 · storefront-designer · Task S0-13

**What I looked at.** The live preview at `http://localhost:8000`, region `/pk` (plus `/gb`), in headless Chrome 156:
- **Desktop:** 1366 × 768.
- **Phone:** true device emulation through the Chrome DevTools Protocol (`Emulation.setDeviceMetricsOverride` with width 390, height 844, `mobile: true`, scale 2, touch on). The page reported `innerWidth` 390 and `scrollWidth` 390, so this is a real phone layout with no sideways scroll.

I also measured element sizes and styles in the page. Nothing was added to the cart and no data was changed.

**Screenshots** are in `C:\Users\baapo\AppData\Local\Temp\claude\c--Users-baapo-source-repos-FitMyOutfit\46dc59a7-d35d-453d-8c31-f97d42b446b4\scratchpad\design\shots\`. Below, a file name means that folder.

**Not a defect:** the round "N" badge at the bottom left of every page is the Next.js development indicator. It does not appear in a production build.

**The verdict in one line:** this is Medusa's demo template with our name typed in. The founder's "childish" is fair. It has no brand, no imagery of team kit, buttons that don't look like buttons, and nothing that tells a coach what we do or why to trust us.

Ranked by how much each problem hurts a first-time team organizer on a phone:

| # | Page | What is wrong (evidence) | Why it matters | Screenshot |
| --- | --- | --- | --- | --- |
| 1 | All | **Buttons don't look like buttons.** The hero's "Start your team kit" measures 20 px tall, 13 px text, with a transparent background, no border and no shadow. The product page's "Select a size" / "Add to cart", the sticky bar's button and "Sign in" are also plain bold text. **Probable cause, for the developer to confirm:** `storefront/tailwind.config.js` scans `./node_modules/@medusajs/ui/dist/**`, but in the monorepo `@medusajs/ui` is installed in the root `node_modules`. No `storefront/node_modules/@medusajs/ui` exists in the preview copy. So Tailwind never generates the Medusa UI button classes | The one action we want is invisible. A visitor can't tell what is clickable | `phone-home-fold.png`, `phone-jersey-size-selected.png`, `phone-account-full.png` |
| 2 | Home | **The home page says almost nothing.** On a phone the first screen is a 75vh grey block with one line of text, and the first garment appears only below the fold (about 860 px down). There is no picture of a kit, no fact a coach worries about (delivery, minimum, help, duties) and no "how team orders work" | A coach decides in seconds whether this is a teamwear store. Nothing on screen says it is | `phone-home-fold.png`, `phone-home-full.png`, `desktop-home-full.png` |
| 3 | Product | **On a phone the order is wrong.** Title, a "Placeholder description" and two accordions come first. The image starts 432 px down. The size buttons and "From PKR 3,500" sit below the image, 1,431 px down. There is no delivery date, no size chart and no region rule | The organizer has to scroll past text to see the garment, and never learns when it arrives | `phone-jersey-fold.png`, `phone-jersey-full.png` |
| 4 | Product | **Picking a size throws the page back to the top.** Measured: scrolled to 1,200 px, tapped "M", and the page jumped to 0. The URL gains `?v_id=…` through `router.replace` in `product-actions/index.tsx`, which scrolls to the top by default. **Likely fix:** pass `{ scroll: false }` | It loses the user's place at the moment of decision. On a phone it feels broken | `phone-jersey-size-selected.png` |
| 5 | Product | **The size buttons are too small and ungrouped.** All 11 sizes sit in one wrapping row, youth mixed with adult. YS to XL measure 26–37 px wide by 40 px tall; 2XL and 3XL stretch to 167 px. The selected state is a thin border only | Below the 44 px target size, so mis-taps are likely. A coach can't see "youth" and "adult" at a glance | `phone-jersey-full.png`, `desktop-jersey-fold.png` |
| 6 | All | **Region and currency are invisible.** They appear only at the bottom of the full-screen menu ("Shipping to: Pakistan", with a tiny "→"). Nothing on `/gb` shows that the visitor is in the UK store | A UK or US coach can't confirm they see their own prices and rules. A Pakistani visitor can't tell this store is for them | `phone-menu-open.png`, `desktop-home-gb-fold.png` |
| 7 | All | **No brand.** The name is centred, grey, in uppercase system text. There is no logo, no colour and no tagline. The webfont never loads: `document.fonts` held only the dev overlay's Geist, so the page falls back to the system font. That is Segoe UI here, and a different font on each phone. Nav text is 12 px | It looks unfinished and untrustworthy, which is the founder's complaint | `phone-home-fold.png` |
| 8 | Listing, home | **The pictures are wrong for the product.** The "Jersey" shows a long-sleeve sweatshirt and the "Jacket" a crew-neck sweatshirt. A white tee on a near-white card is almost invisible on desktop. On the phone home page the Jacket card was blank; probably a lazy image not loaded when captured, not confirmed as a bug | Stand-in images, but they make the store look like a generic clothing shop | `desktop-home-full.png`, `phone-home-full.png`, `phone-store-full.png` |
| 9 | Menu | **The menu is a full-screen grey blur** with four huge words: Home, Store, Account, Cart. It has no garments, no help and no contact | The menu is where a lost visitor goes; it offers nothing | `phone-menu-open.png` |
| 10 | Listing | **Starter leftovers:** "Sort by" with bullet points and "Price: Low -> High" for three products, under the heading "All products" | It reads as a template and adds nothing with three items | `phone-store-full.png`, `desktop-store-full.png` |
| 11 | Footer | **The footer holds only "Collections: Garments"** and a copyright, with large empty space around them. There is no shipping, duties, returns, size, contact or company information | Users look in the footer for shipping and returns ([Baymard](https://baymard.com/blog/footer-needs-return-shipping-links)) | `phone-home-full.png` |
| 12 | Product | **The sticky bar on a phone shows "…ct Options" and a chevron**, with the size label squeezed to the left. The bar is full-width with no clear button shape | It is the one control always in reach, and it is unreadable | `phone-jersey-fold.png` |
| 13 | Cart, account | **Generic starter copy:** "Let's change that, use the link below to start browsing our products", "Sign in to access an enhanced shopping experience", "Got questions? … customer service page" | An empty cart should send a coach back to "Start your team kit" | `phone-cart-full.png`, `phone-account-full.png` |
| 14 | Errors | **A wrong product URL shows "Application error: a server-side exception has occurred"** instead of a not-found page. Seen in dev mode; recheck on a production build. An unknown region path gives a plain "Page not found" | A shared link with a typo looks like a broken site | (text captured by the probe; no screenshot) |
| 15 | Product, desktop | **Three columns:** description left, image centre, buy box right. The related block reads "You might also want to check out these products." | It works but is generic, and it will not fit the 3D editor | `desktop-jersey-fold-2.png`, `desktop-tshirt-fold.png` |

**Seen changing during the review:** the first desktop capture showed "Out of stock" under the sizes (`desktop-jersey-fold.png`). A later one shows "Select a size" (`desktop-jersey-fold-2.png`). Task S0-11 appears to have reached the preview between the two captures.

**What works:**
- The four regions resolve, and prices show in PKR.
- Sizes are buttons, not a drop-down.
- A sticky buy bar exists on phones.
- There is no sideways scrolling at 390 px.
