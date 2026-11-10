# Placeholder product images

**PLACEHOLDER DATA.** Simple flat drawings, one per seeded product, so the store has a picture
before real product photos exist. Real input: product photos from the product lead.

- Made by `backend/scripts/generate-placeholder-images.mjs` (our own drawings, no third-party
  assets, no dependencies). Regenerate with `npm run images:placeholders -w backend`.
- 1160 x 1360 px PNG (29:34, the storefront product gallery's ratio). Each drawing stays in the
  middle 60% of the width, which is what the narrower 9:16 listing thumbnails show.
- Which product uses which file is the `image` field in `../products.ts`.

To use a real photo: replace the file, or add a new file here and name it in `products.ts`.
No code change is needed. The seed uploads the image through Medusa's file module only for a
product that has no thumbnail and no images yet, so a photo set in the admin is never replaced.
