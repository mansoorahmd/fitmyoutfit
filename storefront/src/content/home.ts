// PLACEHOLDER COPY. The founders will replace this wording; it was written by
// the coordinator at the founder's request. It makes no promise about price,
// delivery time or guarantees. Placeholders are data: keep these strings here
// and never write them into a component.

/** A still of a real team kit for the hero (docs/design/03-direction.md). */
export type HeroImage = {
  src: string
  alt: string
}

type HomeContent = {
  headline: string
  subline: string
  button: { label: string; href: string }
  /**
   * Optional. There is no photo of our own kit yet, and stock or other
   * stores' photos are not allowed, so this stays null and the hero is
   * text only until the founders supply one.
   */
  heroImage: HeroImage | null
}

export const homeContent: HomeContent = {
  headline: "Design the kit. Drop the link.",
  subline:
    "Build your team's jersey in 3D, then share one link. Every player adds their own name, number and size.",
  button: {
    label: "Start your team kit",
    // A path without the country code. The hero passes it to the localized
    // link, which adds the country code. This will change to the editor once
    // the editor is embedded in the storefront.
    href: "/store",
  },
  heroImage: null,
}
