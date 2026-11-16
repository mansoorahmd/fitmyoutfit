/**
 * The Players and Team tools' plain logic: the sample number field's
 * coach-grade errors (06-editor.md 4.5), the digits switch, and which
 * placement presets the switches and "Where" chips offer.
 */
import { checkTypedText } from "../design/typed-text.js";
import { checkJerseyNumber } from "../design/jersey-number.js";
import { DEFAULT_JERSEY_NUMBER_RULES } from "../design/jersey-number-rules.js";
import type { ItemRole, PlacementPreset, ProductDefinition } from "../design/schema.js";
import type { EditorWording } from "./content.js";

export type NumberFieldError = "too-long" | "mixed" | "empty" | "invalid";

/**
 * What is wrong with a number typed in the sample player's field, for the
 * coach: empty; more than 2 digits (or above 99); digits of two kinds
 * ("1٢"); anything else (letters, spaces). Null when it is a jersey number.
 */
export function numberFieldError(value: string): NumberFieldError | null {
  if (value === "") return "empty";
  if (checkJerseyNumber(value).ok) return null;
  const systems = new Set<string>();
  let digits = 0;
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    const system = DEFAULT_JERSEY_NUMBER_RULES.digitSystems.find((s) => code >= s.zero && code <= s.zero + 9);
    if (!system) return "invalid";
    systems.add(system.id);
    digits++;
  }
  if (systems.size > 1) return "mixed";
  return digits > 2 ? "too-long" : "invalid";
}

/** The coach's sentence for a number field error (W-ED79 to W-ED81). Letters and spaces get the digits rule. */
/** What a text field does with what was typed or pasted (E3c): the value for the design, or the coach's reason it cannot be used. */
export type FieldKind = "name" | "text" | "number";

export function fieldCheck(wording: EditorWording, raw: string, kind: FieldKind): { value: string; error: string | null } {
  if (kind === "number") {
    const error = numberFieldError(raw);
    return { value: raw, error: error ? numberErrorText(wording, error) : null };
  }
  const { value, problem } = checkTypedText(raw, { allowEmpty: kind === "name" });
  return { value, error: problem === "pictographs" ? wording.lettering.noPictographs : problem === "blank" ? wording.lettering.textBlank : null };
}

/**
 * A field's own state (E3c): what is shown while typing, and the error. Typing something that cannot be used
 * shows it with the error (the kit keeps the last good value); leaving the field shows the last good value and
 * clears the error.
 */
export interface FieldState {
  draft: string | null;
  error: string | null;
}
export function fieldStep(state: FieldState, action: { type: "typed"; raw: string; error: string | null } | { type: "left" }): FieldState {
  return action.type === "left" ? { draft: null, error: null } : { draft: action.raw, error: action.error };
}

export function numberErrorText(wording: EditorWording, error: NumberFieldError): string {
  if (error === "empty") return wording.lettering.numberEmpty;
  if (error === "mixed") return wording.lettering.numberMixed;
  return wording.lettering.numberTooLong;
}

/** The two digit systems the Players tool offers (06-editor.md 4.5: the founder's two). */
export type DigitChoice = "western" | "arabic-indic";

/** Which of the offered systems a number is written in (Urdu-form digits count as Arabic), or null for none. */
export function digitChoiceOf(value: string): DigitChoice | null {
  const first = value.codePointAt(0);
  if (first === undefined) return null;
  if (first >= 0x30 && first <= 0x39) return "western";
  if ((first >= 0x660 && first <= 0x669) || (first >= 0x6f0 && first <= 0x6f9)) return "arabic-indic";
  return null;
}

/** The number written in the other digits, same value, same leading zeros ("07" ⇄ "٠٧"). Other characters stay. */
export function convertDigits(value: string, to: DigitChoice): string {
  const zero = to === "western" ? 0x30 : 0x660;
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    const digit = code >= 0x30 && code <= 0x39 ? code - 0x30 : code >= 0x660 && code <= 0x669 ? code - 0x660 : code >= 0x6f0 && code <= 0x6f9 ? code - 0x6f0 : -1;
    out += digit >= 0 ? String.fromCodePoint(zero + digit) : ch;
  }
  return out;
}

/** The presets that take a role, in the product's order. */
export function presetsFor(product: ProductDefinition, role: ItemRole): PlacementPreset[] {
  return product.placements.filter((p) => p.roles.includes(role));
}

/** A switch of the Players tool: a role at a preset, with its words. */
export interface PlayerSwitch {
  role: "player-name" | "player-number";
  preset: PlacementPreset;
  label: string;
}

/**
 * The Players tool's switches (06-editor.md 4.5): "Name on back", "Number on
 * back", "Number on front", and "Number on sleeve" when the product has a
 * sleeve preset for the number. Only the presets the product has.
 */
export function playerSwitches(product: ProductDefinition, wording: EditorWording): PlayerSwitch[] {
  const out: PlayerSwitch[] = [];
  const find = (id: string) => product.placements.find((p) => p.id === id);
  const name = find("back-name");
  if (name?.roles.includes("player-name")) out.push({ role: "player-name", preset: name, label: wording.lettering.slots["back-name"] });
  for (const id of ["back-number", "front-number"] as const) {
    const preset = find(id);
    if (preset?.roles.includes("player-number")) out.push({ role: "player-number", preset, label: wording.lettering.slots[id] });
  }
  const sleeve = product.placements.find((p) => p.roles.includes("player-number") && (p.side === "left" || p.side === "right"));
  if (sleeve) out.push({ role: "player-number", preset: sleeve, label: wording.lettering.slots.sleeve });
  return out;
}
