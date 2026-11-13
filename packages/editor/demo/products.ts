/**
 * The products the demo can show, and the credit each model needs wherever it
 * is shown. Data, not code. The licence notices are next to the models
 * (samples/models/*.LICENSE.txt); the credit lines here repeat what they ask
 * for in short.
 */

export interface ModelCredit {
  /** The work's title, as its author gave it. */
  title: string;
  author: string;
  /** Where the work comes from. */
  sourceUrl: string;
  licence: string;
  licenceUrl: string;
  /** Whether we changed it (CC BY asks to say so). */
  changed: boolean;
}

export interface DemoProduct {
  id: string;
  /** Short name for the product switch. */
  label: string;
  /** The garment's name in the editor ("Jersey"): the top bar and the stage's description. */
  shortName: string;
  /** Null for a model we made ourselves. */
  credit: ModelCredit | null;
}

export const DEMO_PRODUCTS: readonly DemoProduct[] = [
  {
    id: "stand-in-jersey",
    label: "Football jersey (stand-in)",
    shortName: "Jersey",
    credit: {
      title: "Jersey Patterns 3D Free",
      author: "Wearable3D",
      sourceUrl: "https://sketchfab.com/3d-models/jersey-patterns-3d-free-a6b7401510484ee1b375c02f97f14e86",
      licence: "CC BY 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
      changed: true,
    },
  },
  {
    id: "stand-in-tshirt",
    label: "T-shirt (stand-in)",
    shortName: "T-shirt",
    credit: {
      title: "Garment 3D",
      author: "Prashant Verma",
      sourceUrl: "https://github.com/prashant3285/garment",
      licence: "MIT",
      licenceUrl: "https://opensource.org/license/mit",
      changed: true,
    },
  },
  { id: "placeholder-jersey", label: "Placeholder (generated)", shortName: "Jersey", credit: null },
];

/** The product a page address asks for (`?product=<id>`), else the first one. */
export function chooseProduct(search: string): DemoProduct {
  const requested = new URLSearchParams(search).get("product");
  return DEMO_PRODUCTS.find((p) => p.id === requested) ?? DEMO_PRODUCTS[0]!;
}
