// DRAFT WORDING. The founders will replace this wording. The hero copy was
// written by the coordinator at the founder's request; the sections below it
// restate decisions the founders have already made (critiques/DECISIONS.md,
// decision 007) and add no new promise, number, price, time or guarantee.
// All home page copy is data: keep these strings here and never write them
// into a component.

/** An image for a home page block. Development stand-ins only, never in production. */
export type HomeImage = {
  src: string
  alt: string
}

/** A link, as a path without the country code (the localized link adds it). */
export type HomeLink = { label: string; href: string }

/**
 * Who sees an item. Pakistan is the home market; "export" is every other
 * region (UK, UAE, US). See lib/util/home-regions.ts.
 */
export type RegionScope = "all" | "pakistan" | "export"

/** The line icons the promise strip and the roster block can show. */
export type HomeIconName =
  | "delivery"
  | "design-help"
  | "replacement"
  | "payment"
  | "shipping"

export type PromiseItem = {
  icon: HomeIconName
  title: string
  text: string
  showIn: RegionScope
}

export type Question = {
  question: string
  answer: string
  showIn: RegionScope
}

type HomeContent = {
  headline: string
  subline: string
  button: HomeLink
  /** The hero's second button, readable on navy (never red). */
  secondaryButton: HomeLink
  /** A text link in the hero that jumps to the "How team orders work" section. */
  howItWorksLink: HomeLink
  /**
   * The full-width image behind the hero's text, under a navy overlay.
   * Optional: with null the hero is a finished navy band.
   */
  heroImage: HomeImage | null
  /** The promise strip's heading, read by screen readers only. */
  promisesHeading: string
  /** Four per region: three for everyone, then one for Pakistan or for export. */
  promises: PromiseItem[]
  garments: { title: string }
  howItWorks: {
    /** The section's id, so links can jump to it (`#how-team-orders-work`). */
    id: string
    title: string
    steps: string[]
    paymentLine: string
    button: HomeLink
  }
  rosterProof: {
    title: string
    points: string[]
    /** Optional picture of a proof page, once our own proof PDF exists. */
    image: HomeImage | null
  }
  sizing: {
    title: string
    text: string
    button: HomeLink
  }
  questions: {
    title: string
    items: Question[]
  }
}

const HOW_IT_WORKS_ID = "how-team-orders-work"

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
  secondaryButton: { label: "See the garments", href: "/store" },
  // "#…" after the country code gives "/pk#how-team-orders-work".
  howItWorksLink: {
    label: "How team orders work",
    href: `#${HOW_IT_WORKS_ID}`,
  },
  // Stand-in from the founder's reference site, for local development only
  // (docs/design/04-reference-spized.md). next.config.js allows this host in
  // non-production builds only, so a production build must replace it.
  heroImage: {
    src: "https://www.spized.com/thumbnail/ee/83/13/1787036820/header-trikot-selbst-gestalten-desktop_1920x1920.webp?ts=1789131738",
    alt: "A player wearing a custom team jersey",
  },
  promisesHeading: "What we promise",
  promises: [
    {
      icon: "delivery",
      title: "Delivered in 15 days",
      text: "From the day you approve your proof. 10 days with paid rush.",
      showIn: "all",
    },
    {
      icon: "design-help",
      title: "Free design help",
      text: "For teams. Tell us the idea and we set up the kit with you.",
      showIn: "all",
    },
    {
      icon: "replacement",
      title: "Free replacement",
      text: "Within 7 days, if the mistake is ours.",
      showIn: "all",
    },
    {
      icon: "payment",
      title: "Pay your way",
      text: "JazzCash, Easypaisa or card.",
      showIn: "pakistan",
    },
    {
      icon: "shipping",
      title: "Shipping and duties included",
      text: "One box to the organizer, every jersey bagged and labelled.",
      showIn: "export",
    },
  ],
  garments: { title: "Choose your garment" },
  howItWorks: {
    id: HOW_IT_WORKS_ID,
    title: "How team orders work",
    steps: [
      "Design your kit in 3D.",
      "Share one link with your team.",
      "Each player adds their name, number and size. Players don't pay.",
      "Check and sign the roster proof. We make and deliver the kit.",
    ],
    paymentLine:
      "The organizer pays 50% when the proof is approved and 50% before shipping.",
    button: { label: "Start your team kit", href: "/store" },
  },
  rosterProof: {
    title: "One page everyone signs off",
    points: [
      "Every name, number and size on one page.",
      "You sign it before we make anything.",
      "We check the finished kit against it at our hub in Lahore before it ships.",
    ],
    image: null,
  },
  sizing: {
    title: "Not sure of sizes?",
    text: "Order a fit kit and try the sizes on first. The deposit is refundable.",
    button: { label: "See the fit kit", href: "/products/fit-kit" },
  },
  questions: {
    title: "Questions",
    items: [
      {
        question: "How long does delivery take?",
        answer:
          "15 days from the day you approve your proof, or 10 days with paid rush.",
        showIn: "all",
      },
      {
        question: "Do players have to pay?",
        answer:
          "No. The organizer pays for the team: 50% when the proof is approved and 50% before shipping.",
        showIn: "all",
      },
      {
        question: "Can names be in Arabic or Urdu?",
        answer:
          "Yes. Names can be in English, Arabic or Urdu, and numbers in English or Arabic digits.",
        showIn: "all",
      },
      {
        question: "What if something is wrong with our order?",
        answer: "If the mistake is ours, we replace it free within 7 days.",
        showIn: "all",
      },
      {
        question: "Who pays shipping and duties?",
        answer:
          "For orders outside Pakistan, shipping and duties are included. The kit arrives in one box to the organizer.",
        showIn: "export",
      },
    ],
  },
}
