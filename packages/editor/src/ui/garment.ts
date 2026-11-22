/**
 * The garment chooser's plain functions (G4): the host's list grouped for the sheet, and what changing garment says:
 * the question before anything is left behind, and the notice after. No React.
 */
import { carryDesign, type CarryResult } from "../design/carry.js";
import type { DesignDocument, ProductDefinition } from "../design/schema.js";
import type { SavedTeamList } from "../team-list/types.js";
import { fill, type EditorWording } from "./content.js";
import { itemWords } from "./items.js";

/** One garment the customer may choose, as the host gives it (data: the editor fetches nothing). */
export interface GarmentChoice {
  /** The garment's id: what `garmentId` and `onChooseGarment` use (the product's id in the demo). */
  id: string;
  /** Its name ("Jersey, V-neck"): the choice's words where it stands alone, and in sentences ("the Jersey, V-neck"). */
  name: string;
  /** Garments with the same `group` are one card, each a chip under it ("Jersey" with "V-neck" and "Round neck"). Default: its own card. */
  group?: string;
  /** The card's name for a group ("Jersey"); the first member's. Default: the garment's name. */
  groupName?: string;
  /** The chip's words inside a group ("V-neck"). Default: the name. */
  variant?: string;
  /** A small picture (a URL the host serves, shown square, 64 px). Without one the card shows the editor's shirt icon. */
  picture?: string;
  /**
   * The garment's product definition (data the store already has). With it the editor can say what a change would leave
   * behind and carry the design over (`carryDesign`) before it calls `onChooseGarment`. Without it, the host is called
   * with the design as it is and does the carrying itself (the function is exported).
   */
  product?: ProductDefinition;
}

/** What `onChooseGarment` is given. */
export interface GarmentChange {
  /** The garment chosen (a `GarmentChoice.id`). */
  garmentId: string;
  /** The design carried over to it (for a garment without `product`: the design as it is, still the old garment's). */
  design: DesignDocument;
  /**
   * The two garments share their pattern (the necks of one jersey): everything is kept, so the new garment's design is
   * this one, whatever it had saved. Another garment: its own saved design wins when the host has one (switching back
   * brings it back), else this one.
   */
  samePattern: boolean;
  /** How many items had no place on the new garment (the customer was asked first). */
  leftBehind: number;
  /** The team list as it stands, for the new garment's product (`productId`, and what the carried design prints), or null with no lines. */
  teamList: SavedTeamList | null;
  /** The editor's own sentence about the change, to hand back to the new editor as `startNotice`. */
  notice: string;
}

export interface GarmentGroup {
  key: string;
  name: string;
  picture?: string;
  members: GarmentChoice[];
}

/** The host's garments as cards, in the host's order (a group is where its first member is). */
export function groupGarments(garments: readonly GarmentChoice[]): GarmentGroup[] {
  const groups: GarmentGroup[] = [];
  for (const g of garments) {
    const key = g.group ?? g.id;
    let group = groups.find((x) => x.key === key);
    if (!group) {
      group = { key, name: g.groupName ?? g.name, ...(g.picture ? { picture: g.picture } : {}), members: [] };
      groups.push(group);
    }
    if (!group.picture && g.picture) group.picture = g.picture;
    group.members.push(g);
  }
  return groups;
}

export interface GarmentPlan {
  carry: CarryResult | null;
  /** The question to ask before switching, when something would be left behind; null when nothing is. */
  ask: { title: string; body: string; switchLabel: string; stayLabel: string } | null;
  /** The sentence for the new editor to open with. */
  notice: string;
}

/** What changing from `from` (the garment now) to `to` does to `design`, and the words for it. */
export function planGarmentChange(wording: EditorWording, design: DesignDocument, from: GarmentChoice & { product: ProductDefinition }, to: GarmentChoice): GarmentPlan {
  const w = wording.garment;
  if (!to.product) return { carry: null, ask: null, notice: fill(w.noticeOther, { name: to.name }) };
  const carry = carryDesign(design, from.product, to.product);
  let ask: GarmentPlan["ask"] = null;
  const n = carry.leftBehind.length;
  if (n > 0) {
    const items = carry.leftBehind.map((l) => itemWords(wording, from.product, l).at).join(", ");
    ask = {
      title: fill(w.askTitle, { name: to.name }),
      body: fill(n === 1 ? w.askBody : w.askBodyMany, { count: n, name: to.name, items, old: from.name }),
      switchLabel: fill(w.askSwitch, { name: to.name }),
      stayLabel: fill(w.askStay, { old: from.name }),
    };
  }
  const a = carry.adjusted.length;
  let notice: string;
  if (n > 0) notice = fill(n === 1 ? w.noticeLeftOne : w.noticeLeft, { name: to.name, count: n, old: from.name });
  else if (carry.samePattern) notice = a === 0 ? fill(w.noticeKept, { name: to.name }) : a === 1 ? fill(w.noticeAdjustedOne, { name: to.name }) : fill(w.noticeAdjusted, { name: to.name, count: a });
  else notice = fill(w.noticeOther, { name: to.name });
  if (carry.patternLeftBehind) notice += fill(w.noticePattern, { old: from.name });
  return { carry, ask, notice };
}
