/**
 * Upgrades an older design document to the current format version, as a
 * plain function. Version 2 (step E2) becomes version 3 (step E3a); version 1
 * stays refused (none was ever saved in production).
 *
 * What the upgrade does to a version 2 document, and why it paints the same
 * picture (src/test/v2-paint.test.ts checks it against what the E2 code painted):
 * - Colours keep their palette id and code. Nothing follows a team colour, so
 *   nothing changes colour.
 * - Team colours: a version 2 design has none. Main is the colour of the
 *   design's first zone, Second the first zone colour that differs from it
 *   (Main again when every zone has one colour). They colour nothing until
 *   the coach or a template uses them.
 * - Roles: a text layer gets the role "text" (free text: version 2 did not say
 *   what a line was for, and guessing from positions is what roles are there
 *   to stop). Number layers get "player-number" when they all show the same
 *   number, which becomes the sample player's number; otherwise each keeps
 *   its number with the role "text" (a fixed number). Logos get "crest",
 *   clipart "graphic".
 * - No team name, no sample player name, no template, no shapes, no outlines,
 *   no placement presets: version 2 had none of them.
 */
import { designSchemaV2, type DesignDocumentV2 } from "./schema-v2.js";
import { DESIGN_SCHEMA_VERSION, type DesignDocument, type Layer, type TeamColors } from "./schema.js";
import { parseWith, validateDesign, type ValidateDesignOptions, type ValidationResult } from "./validate.js";

/** Format versions `upgradeDesign` can read. */
export const UPGRADABLE_DESIGN_VERSIONS: readonly number[] = [2, DESIGN_SCHEMA_VERSION];

function teamColorsFromZones(zones: DesignDocumentV2["zones"]): TeamColors {
  const colours = Object.values(zones);
  const main = colours[0] ?? { id: "white", hex: "#FFFFFF" };
  const second = colours.find((c) => c.id !== main.id || c.hex !== main.hex) ?? main;
  return { main: { id: main.id, hex: main.hex }, second: { id: second.id, hex: second.hex } };
}

/** A version 2 document (already checked against the version 2 schema) as version 3. */
export function upgradeV2(design: DesignDocumentV2): DesignDocument {
  const numbers = design.layers.flatMap((l) => (l.kind === "number" ? [l.value] : []));
  const sameNumber = numbers.length > 0 && numbers.every((n) => n === numbers[0]);
  const layers: Layer[] = design.layers.map((layer): Layer => {
    switch (layer.kind) {
      case "text":
        return { ...layer, role: "text", fill: { ...layer.fill } };
      case "number":
        return { ...layer, role: sameNumber ? "player-number" : "text", fill: { ...layer.fill } };
      case "logo":
        return { ...layer, role: "crest", asset: { ...layer.asset } };
      case "clipart":
        return { ...layer, role: "graphic", asset: { ...layer.asset } };
    }
  });
  return {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    product: { id: design.product.id },
    palette: { ...design.palette },
    teamColors: teamColorsFromZones(design.zones),
    teamName: "",
    samplePlayer: { name: "", number: sameNumber ? numbers[0]! : "" },
    template: null,
    zones: Object.fromEntries(Object.entries(design.zones).map(([zone, colour]) => [zone, { ...colour }])),
    fonts: design.fonts.map((f) => ({ ...f, ...(f.fallbackFontIds ? { fallbackFontIds: [...f.fallbackFontIds] } : {}) })),
    shapes: [],
    layers,
  };
}

/**
 * Reads a design of any format version this code knows and returns it as the
 * current version, validated (with the same options as `validateDesign`).
 * A current document is only validated. Never throws: an unknown version, a
 * version 1 document or a malformed one comes back as errors.
 */
export function upgradeDesign(input: unknown, options: ValidateDesignOptions = {}): ValidationResult<DesignDocument> {
  try {
    const version = typeof input === "object" && input !== null && !Array.isArray(input) ? (input as { schemaVersion?: unknown }).schemaVersion : undefined;
    if (version === 2) {
      const parsed = parseWith(designSchemaV2, input, "a version 2 design", 2);
      if (!parsed.ok) return parsed;
      return validateDesign(upgradeV2(parsed.value), options);
    }
    return validateDesign(input, options);
  } catch (error) {
    return { ok: false, errors: [{ path: "", message: `a design could not be read (${error instanceof Error ? error.message : String(error)})` }] };
  }
}
