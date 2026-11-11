/**
 * Where the demo puts a new layer: print positions per product and piece, in
 * piece millimetres (origin at the piece's top-left corner, Y down). Data, not
 * code; a piece or product not listed gets the library's default (the
 * piece's centre).
 *
 * The stand-in T-shirt's positions follow its traced pattern (see
 * samples/products/stand-in-tshirt.json): the front is 520 mm wide and its
 * V-neck reaches 133 mm down at x = 260; the back is 522 mm wide with a
 * shallow neck. Positions are the layer's centre.
 *
 * Later these belong in the product definition (print areas per piece), so
 * the store and templates use the same ones; that is a format decision.
 */
import type { Point } from "../src";

export type PlacementKind = "text" | "number" | "logo";

export interface StartPlacement {
  position: Point;
  /** Text and numbers: the first font size in mm. */
  fontSize?: number;
}

export const START_PLACEMENTS: Record<string, Record<string, Partial<Record<PlacementKind, StartPlacement>>>> = {
  "stand-in-tshirt": {
    front: {
      // A team name across the chest, under the V.
      text: { position: { x: 260, y: 290 }, fontSize: 55 },
      // A small number under the name.
      number: { position: { x: 260, y: 410 }, fontSize: 110 },
      // A club badge on the left chest (the wearer's left: the right of the piece seen from outside).
      logo: { position: { x: 380, y: 185 } },
    },
    back: {
      // A player's name above the number, below the collar.
      text: { position: { x: 261, y: 125 }, fontSize: 60 },
      // A large number centred on the back.
      number: { position: { x: 261, y: 320 }, fontSize: 230 },
      logo: { position: { x: 261, y: 560 } },
    },
  },
};

/** The start placement for a new layer, or an empty object for the library's default. */
export function startPlacement(productId: string, pieceId: string, kind: PlacementKind): Partial<StartPlacement> {
  return START_PLACEMENTS[productId]?.[pieceId]?.[kind] ?? {};
}
