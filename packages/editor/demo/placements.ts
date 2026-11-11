/**
 * Where the demo puts a new layer: print positions per product and piece, in
 * piece millimetres (origin at the piece's top-left corner, Y down). Data, not
 * code; a piece or product not listed gets the library's default (the
 * piece's centre).
 *
 * The stand-in jersey's and T-shirt's positions follow their traced patterns
 * (samples/products/stand-in-*.json; the jersey's measurements are noted
 * below). The T-shirt's front is 520 mm wide and its V-neck reaches 133 mm
 * down at x = 260; its back is 522 mm wide with a shallow neck. Positions are
 * the layer's centre.
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
  // The stand-in jersey (samples/products/stand-in-jersey.json): the front is 671 mm wide at the hem
  // (it wraps round under the side panels), centred on x = 335.5, its V-neck reaching 120 mm down;
  // the back is 491 mm wide, centred on x = 244, its neckline 18 mm down at the centre; the sleeves
  // are 371 x 212 mm with the top of the shoulder at x = 186.
  "stand-in-jersey": {
    front: {
      // The club or sponsor name across the chest, below the V.
      text: { position: { x: 335.5, y: 290 }, fontSize: 55 },
      // A small number under the name.
      number: { position: { x: 335.5, y: 410 }, fontSize: 110 },
      // The club badge on the left chest (the wearer's left: the right of the piece seen from outside).
      logo: { position: { x: 440, y: 195 } },
    },
    back: {
      // The player's name above the number, below the collar.
      text: { position: { x: 244, y: 105 }, fontSize: 60 },
      // A large number centred on the back.
      number: { position: { x: 244, y: 300 }, fontSize: 230 },
      logo: { position: { x: 244, y: 560 } },
    },
    // A badge or flag on the outside of each sleeve, below the shoulder.
    sleeve_left: { logo: { position: { x: 186, y: 105 } }, text: { position: { x: 186, y: 105 }, fontSize: 30 }, number: { position: { x: 186, y: 105 }, fontSize: 60 } },
    sleeve_right: { logo: { position: { x: 186, y: 105 } }, text: { position: { x: 186, y: 105 }, fontSize: 30 }, number: { position: { x: 186, y: 105 }, fontSize: 60 } },
  },
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
