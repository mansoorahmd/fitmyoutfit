# 04 Reference: spized.com

10 Nov 2026 · coordinator. The founder named [spized.com](https://www.spized.com/en) as the reference design and as the source of stand-in photos for development. The designer's research ([01-research.md](01-research.md)) read Spized as page text only. This note adds what the pages look like, and what we take from them.

## Evidence

Looked at on 10 Nov 2026 in headless Chrome at 1366 px and at a 390 px phone size: the [home page](https://www.spized.com/en), the [football products listing](https://www.spized.com/en/football-products), the [Rio men's football jersey page](https://www.spized.com/en/football-products/rio-men-s-football-jersey/781001-v2) and the [football jackets listing](https://www.spized.com/en/custom/football-products/jackets). Fonts and colours are the page's computed styles.

- **Header:** white. Logo on the left, text navigation, a second row of sports with small line icons, a search box, one black button "Design your own jersey now", then language, account and cart as round icon buttons. On the phone: menu icon, logo, three icon buttons, and the sports row scrolling sideways.
- **Type:** headings in a condensed uppercase display face (`HudsonNYPro`; h1 64 px, h2 44 px). Body text in Open Sans at 16 px.
- **Buttons:** black fill, white label, square corners. The secondary button is light grey with a thin border.
- **Colour:** black and white, with red for sale banners and yellow for discount labels.
- **Home page:** a full-width hero made of jersey renders with the headline over it and two buttons ("To the product overview", "Design in the 3D configurator"). Then a strip of club logos ("Top clubs wear spized"), photo tiles per sport with the label over the photo, and a black band about the company.
- **Listing:** a filter column on the left that starts with a quantity field ("Show prices for"); a row of garment-type tiles with line drawings; cards with a 4:5 photo on light grey, the name, and two prices: per piece for 10 pieces and for 1 piece.
- **Product page, desktop:** a column of thumbnails on the left; one large render on light grey; under it a switcher "Selection in 3D configurator, 75 designs / 48 colors". On the right: name, a short description, the two unit prices, a full-width black button "Customise now", then boxed facts: printing costs included, how long it takes, available sizes with a "Size table" link.
- **Product page, phone:** the render first, then the design switcher, then the full-width button, then a strip of photos, and only then the name and description.
- **Also there:** a sale pop-up that covers the page on arrival, and countdown timers on listing cards and the product image.

## What we take from it (opinion)

Our direction A ([03-direction.md](03-direction.md)) is already close to this in structure: condensed capital headings, dark bands, solid square-cornered buttons, the image first on phones. These points change or sharpen the specification:

1. **Hero:** a full-width kit image behind the headline, not text on a flat colour. Two buttons: the main one to design a kit, a secondary one to the garments.
2. **Product page on phones:** the main button sits directly under the image, before the name and description.
3. **Facts in boxes beside the button:** what is included, how long it takes, the sizes with a size-chart link. This is where our delivery date goes.
4. **Listing:** garment-type tiles with simple line drawings once there are more than three garments. Two prices per card (team quantity and single piece) once price tiers exist.
5. **Thumbnails beside the main image on desktop,** as the gallery specification already says.

## What we do not take

- **The pop-up on arrival and the countdown timers.** They get between the visitor and the kit.
- **The exact colours.** We keep navy and one red so the store is ours and not a copy. Colours are variables: moving to black and white is a change of values if the founders want it.
- **The photos, beyond development.** They are stand-ins in local development only (see "Product images" in [the Sprint 0 contract](../contracts/sprint-0-dev-setup.md)).

## Stand-in hero image for development

`https://www.spized.com/thumbnail/ee/83/13/1787036820/header-trikot-selbst-gestalten-desktop_1920x1920.webp?ts=1789131738` (1920 × 1080, a person in a custom jersey). To be set as data in `storefront/src/content/home.ts` in the home page step, under the same development-only rule.
