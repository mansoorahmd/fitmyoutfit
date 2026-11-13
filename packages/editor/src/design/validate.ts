import type { z } from "zod";
import {
  DESIGN_SCHEMA_VERSION,
  PRODUCT_SCHEMA_VERSION,
  ROLES_BY_KIND,
  designSchema,
  productDefinitionSchema,
  type ColorValue,
  type DesignDocument,
  type FontRef,
  type ItemRole,
  type Layer,
  type ProductDefinition,
} from "./schema.js";
import { DEFAULT_JERSEY_NUMBER_RULES, type JerseyNumberRules } from "./jersey-number-rules.js";
import { checkJerseyNumber, checkJerseyNumberRules } from "./jersey-number.js";
import { flattenPath, parseSvgPath, pointInPolylines, polylineBounds, shapesOverlap } from "./svg-path.js";

export interface ValidationError {
  /** Where the problem is, for example `layers[2].position.x`. Empty for the document root. */
  path: string;
  /** A readable message that includes the path. */
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: ValidationError[] };

/** Turns a zod issue path into `layers[2].position.x`. */
export function formatPath(path: ReadonlyArray<PropertyKey>): string {
  let out = "";
  for (const part of path) {
    if (typeof part === "number") out += `[${part}]`;
    else out += out ? `.${String(part)}` : String(part);
  }
  return out;
}

function makeError(path: string, message: string): ValidationError {
  return { path, message: path ? `${path}: ${message}` : message };
}

/** Converts zod issues to readable errors. `prefix` names the thing being checked, for example `layer`. */
export function zodIssuesToErrors(issues: ReadonlyArray<z.core.$ZodIssue>, prefix = ""): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const issue of issues) {
    const own = formatPath(issue.path);
    const base = [prefix, own].filter(Boolean).join(own.startsWith("[") ? "" : ".");
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) {
        errors.push(makeError(base ? `${base}.${key}` : key, "unknown field"));
      }
    } else if (issue.code === "invalid_key") {
      // A key of a map (a zone id) failed its own check: say why, not just "Invalid key in record".
      const reasons = issue.issues.map((nested) => nested.message).join("; ");
      errors.push(makeError(base, reasons || issue.message));
    } else if (issue.code === "invalid_type" && issue.message.endsWith("received undefined")) {
      errors.push(makeError(base, `is required but missing (expected ${issue.expected})`));
    } else {
      errors.push(makeError(base, issue.message));
    }
  }
  return errors;
}

/**
 * The part of the jersey number rule that the JSON Schema cannot hold (the
 * maximum is data): a number layer's value must pass `checkJerseyNumber`.
 * `path` names the layer, for example `layers[1]` or `layer`.
 */
export function jerseyNumberLayerErrors(
  layer: Layer,
  path: string,
  rules: JerseyNumberRules = DEFAULT_JERSEY_NUMBER_RULES,
): ValidationError[] {
  if (layer.kind !== "number") return [];
  const result = checkJerseyNumber(layer.value, rules);
  return result.ok ? [] : [makeError(`${path}.value`, result.error)];
}

/** Roles whose text may be empty: a slot waiting for the team's or the player's name. */
const MAY_BE_EMPTY: readonly ItemRole[] = ["team-name", "player-name"];

/**
 * The rules for one layer that the JSON Schema cannot hold: the jersey number
 * rule (its maximum is data); a text layer holds a visible character, unless
 * it is the team name or the player's name, which may be empty (never only
 * spaces); the role fits the kind (also in the schema, repeated for a layer
 * built in code).
 */
export function layerRuleErrors(layer: Layer, path: string, rules: JerseyNumberRules = DEFAULT_JERSEY_NUMBER_RULES): ValidationError[] {
  const errors = jerseyNumberLayerErrors(layer, path, rules);
  const allowed: readonly string[] = ROLES_BY_KIND[layer.kind];
  if (!allowed.includes(layer.role)) {
    errors.push(makeError(`${path}.role`, `a ${layer.kind} layer cannot have the role "${layer.role}" (one of ${allowed.join(", ")})`));
  }
  if (layer.kind === "text" && layer.value.trim().length === 0) {
    const empty = layer.value.length === 0;
    if (!(empty && MAY_BE_EMPTY.includes(layer.role))) {
      errors.push(
        makeError(
          `${path}.value`,
          MAY_BE_EMPTY.includes(layer.role)
            ? "must be empty or contain a visible character, not only spaces"
            : "must contain a visible character, not only spaces",
        ),
      );
    }
  }
  return errors;
}

/** An error for rules that cannot be used, or null. Shared by `validateDesign` and the edit functions. */
export function jerseyNumberRulesError(rules: unknown): ValidationError | null {
  const problem = checkJerseyNumberRules(rules);
  return problem ? makeError("", `cannot check number layers: ${problem}`) : null;
}

function checkSchemaVersion(input: unknown, expected: number, what: string): ValidationError | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const version = (input as Record<string, unknown>).schemaVersion;
  if (typeof version === "number" && Number.isInteger(version) && version !== expected) {
    const upgradable = UPGRADABLE_VERSIONS.get(what);
    return makeError(
      "schemaVersion",
      version > expected
        ? `this document uses format version ${version}, which is newer than the version this code understands (${expected}); update the editor package`
        : upgradable?.versions.includes(version)
          ? `format version ${version} is an older format (this code understands ${expected}); upgrade it first with ${upgradable.how}`
          : `format version ${version} is not supported (this code understands ${expected}); no migration exists for it`,
    );
  }
  return null;
}

/** Older format versions that can be upgraded, per kind of document, and how. */
const UPGRADABLE_VERSIONS = new Map<string, { versions: number[]; how: string }>([
  ["a design", { versions: [2], how: "upgradeDesign() from @fitmyoutfit/editor/design" }],
]);

/**
 * zod silently skips a `__proto__` key in a record, so `{"zones": {"__proto__": ...}}`
 * would validate with that entry dropped. Nothing may be dropped silently, so
 * look for it before parsing. (In every other object a stray key is already an
 * 'unknown field' error.)
 */
function checkReservedKeys(input: Record<string, unknown>): ValidationError[] {
  const zones = input.zones;
  if (typeof zones !== "object" || zones === null || Array.isArray(zones)) return [];
  return Object.getOwnPropertyNames(zones)
    .filter((key) => key === "__proto__")
    .map((key) => makeError(`zones.${key}`, "this name is reserved and cannot be used as a zone id"));
}

/** Parses with a zod schema into readable errors. `version` is the format version to expect, if the format has one. */
export function parseWith<T>(
  schema: z.ZodType<T>,
  input: unknown,
  what: string,
  version: number | null,
): ValidationResult<T> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, errors: [makeError("", `${what} must be a JSON object`)] };
  }
  const versionError = version === null ? null : checkSchemaVersion(input, version, what);
  if (versionError) return { ok: false, errors: [versionError] };
  const reserved = what === "a design" ? checkReservedKeys(input as Record<string, unknown>) : [];
  if (reserved.length > 0) return { ok: false, errors: reserved };
  const result = schema.safeParse(input);
  if (!result.success) return { ok: false, errors: zodIssuesToErrors(result.error.issues) };
  return { ok: true, value: result.data };
}

/**
 * A font's fallbacks must be other fonts of the document, each listed once.
 * Shared by `validateDesign` and `addFont`.
 */
export function fontFallbackErrors(font: FontRef, fontIds: ReadonlySet<string>, path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Set<string>();
  (font.fallbackFontIds ?? []).forEach((fallback, k) => {
    const at = `${path}.fallbackFontIds[${k}]`;
    if (fallback === font.id) errors.push(makeError(at, `a font cannot be its own fallback ("${fallback}")`));
    else if (seen.has(fallback)) errors.push(makeError(at, `"${fallback}" is listed twice`));
    else if (!fontIds.has(fallback)) errors.push(makeError(at, `font "${fallback}" is not listed in 'fonts'; add it first`));
    seen.add(fallback);
  });
  return errors;
}

/**
 * Rules that a JSON Schema cannot express: unique ids and references between
 * parts of the document.
 */
function checkReferences(design: DesignDocument, rules: JerseyNumberRules): ValidationError[] {
  const errors: ValidationError[] = [];

  const fontIds = new Set<string>();
  design.fonts.forEach((font, i) => {
    if (fontIds.has(font.id)) errors.push(makeError(`fonts[${i}].id`, `duplicate font id "${font.id}"`));
    fontIds.add(font.id);
  });
  design.fonts.forEach((font, i) => errors.push(...fontFallbackErrors(font, fontIds, `fonts[${i}]`)));

  // Layers and shapes share one id space: the interface selects either by id.
  const itemIds = new Set<string>();
  design.shapes.forEach((shape, i) => {
    if (itemIds.has(shape.id)) errors.push(makeError(`shapes[${i}].id`, `duplicate item id "${shape.id}"`));
    itemIds.add(shape.id);
  });
  design.layers.forEach((layer, i) => {
    if (itemIds.has(layer.id)) errors.push(makeError(`layers[${i}].id`, `duplicate layer id "${layer.id}"`));
    itemIds.add(layer.id);
    errors.push(...layerRuleErrors(layer, `layers[${i}]`, rules));
    if ((layer.kind === "text" || layer.kind === "number") && !fontIds.has(layer.fontId)) {
      errors.push(
        makeError(`layers[${i}].fontId`, `font "${layer.fontId}" is not listed in 'fonts'; add it to the document`),
      );
    }
  });

  for (const { path, value } of designColourValues(design)) errors.push(...teamColourValueErrors(design, value, path));

  errors.push(...roleValueErrors(design, rules));
  return errors;
}

/** Every colour value of a design, with its path: zones, text fills and outlines, shapes. */
export function designColourValues(design: Pick<DesignDocument, "zones" | "shapes" | "layers">): Array<{ path: string; value: ColorValue }> {
  const out: Array<{ path: string; value: ColorValue }> = [];
  for (const [zone, value] of Object.entries(design.zones)) out.push({ path: `zones.${zone}`, value });
  design.shapes.forEach((shape, i) => out.push({ path: `shapes[${i}].fill`, value: shape.fill }));
  design.layers.forEach((layer, i) => {
    if (layer.kind !== "text" && layer.kind !== "number") return;
    out.push({ path: `layers[${i}].fill`, value: layer.fill });
    if (layer.outline) out.push({ path: `layers[${i}].outline.color`, value: layer.outline.color });
  });
  return out;
}

/**
 * A colour that follows a team colour must name a team colour the design has,
 * and hold that colour's id and code (and no code of its own).
 */
export function teamColourValueErrors(design: Pick<DesignDocument, "teamColors">, value: ColorValue, path: string): ValidationError[] {
  if (value.teamColor === undefined) return [];
  const team = design.teamColors[value.teamColor];
  if (!team) {
    return [makeError(`${path}.teamColor`, `follows team colour "${value.teamColor}", but the design has no ${value.teamColor} team colour`)];
  }
  const errors: ValidationError[] = [];
  if (team.id !== value.id || team.hex !== value.hex) {
    errors.push(
      makeError(path, `follows team colour "${value.teamColor}" (${team.id} ${team.hex}) but holds ${value.id} ${value.hex}; use setTeamColor to change team colours`),
    );
  }
  if (value.requested !== undefined) {
    errors.push(makeError(`${path}.requested`, `a colour that follows team colour "${value.teamColor}" has no colour code of its own (the team colour keeps it)`));
  }
  return errors;
}

/**
 * The team name and the sample player are one value each, shown by every
 * layer with their role: every `team-name` layer shows `teamName`, every
 * `player-name` layer the sample player's name, every `player-number` layer
 * the sample player's number. (The roster preview swaps them together.)
 */
function roleValueErrors(design: DesignDocument, rules: JerseyNumberRules): ValidationError[] {
  const errors: ValidationError[] = [];
  const number = design.samplePlayer.number;
  if (number !== "") {
    const check = checkJerseyNumber(number, rules);
    if (!check.ok) errors.push(makeError("samplePlayer.number", check.error));
  }
  if (design.samplePlayer.name !== "" && design.samplePlayer.name.trim() === "") {
    errors.push(makeError("samplePlayer.name", "must be empty or contain a visible character, not only spaces"));
  }
  if (design.teamName !== "" && design.teamName.trim() === "") {
    errors.push(makeError("teamName", "must be empty or contain a visible character, not only spaces"));
  }
  const expected: Partial<Record<ItemRole, { value: string; source: string }>> = {
    "team-name": { value: design.teamName, source: "teamName" },
    "player-name": { value: design.samplePlayer.name, source: "samplePlayer.name" },
    "player-number": { value: number, source: "samplePlayer.number" },
  };
  design.layers.forEach((layer, i) => {
    const want = expected[layer.role];
    if ((layer.kind === "text" || layer.kind === "number") && want && layer.value !== want.value) {
      errors.push(
        makeError(`layers[${i}].value`, `a ${layer.role} layer shows ${want.source} (${JSON.stringify(want.value)}), not ${JSON.stringify(layer.value)}; change it with setTeamName or setSamplePlayer`),
      );
    }
  });
  return errors;
}

/** Checks a design against the product it is for: zones, pieces and placement presets must exist, shapes must lie on their piece. */
function checkAgainstProduct(design: DesignDocument, product: ProductDefinition): ValidationError[] {
  const errors: ValidationError[] = [];
  if (design.product.id !== product.id) {
    errors.push(
      makeError("product.id", `design is for product "${design.product.id}" but was checked against "${product.id}"`),
    );
  }
  const zoneIds = new Set(product.zones.map((z) => z.id));
  for (const zoneId of Object.keys(design.zones)) {
    if (!zoneIds.has(zoneId)) {
      errors.push(makeError(`zones.${zoneId}`, `product "${product.id}" has no colour zone with this id`));
    }
  }
  for (const zone of product.zones) {
    if (!Object.prototype.hasOwnProperty.call(design.zones, zone.id)) {
      errors.push(makeError(`zones.${zone.id}`, "this colour zone has no colour"));
    }
  }
  if (design.palette.id !== product.palette.id) {
    errors.push(
      makeError("palette.id", `design uses palette "${design.palette.id}" but the product uses "${product.palette.id}"`),
    );
  }
  const pieces = new Map(product.pieces.map((p) => [p.id, p]));
  const presets = new Map(product.placements.map((p) => [p.id, p]));
  design.layers.forEach((layer, i) => {
    if (!pieces.has(layer.pieceId)) {
      errors.push(makeError(`layers[${i}].pieceId`, `product "${product.id}" has no pattern piece "${layer.pieceId}"`));
    }
    if (layer.preset === undefined) return;
    const preset = presets.get(layer.preset);
    if (!preset) {
      errors.push(makeError(`layers[${i}].preset`, `product "${product.id}" has no placement preset "${layer.preset}" (presets: ${[...presets.keys()].join(", ") || "none"})`));
    } else if (preset.pieceId !== layer.pieceId) {
      errors.push(makeError(`layers[${i}].preset`, `placement preset "${preset.id}" is on piece "${preset.pieceId}", but the layer is on "${layer.pieceId}"`));
    } else if (!preset.roles.includes(layer.role)) {
      errors.push(makeError(`layers[${i}].preset`, `placement preset "${preset.id}" takes ${preset.roles.join(", ")}, not a ${layer.role} layer`));
    }
  });
  design.shapes.forEach((shape, i) => {
    const piece = pieces.get(shape.pieceId);
    if (!piece) {
      errors.push(makeError(`shapes[${i}].pieceId`, `product "${product.id}" has no pattern piece "${shape.pieceId}"`));
      return;
    }
    const parsed = parseSvgPath(shape.path);
    const outline = parseSvgPath(piece.outline);
    if (parsed.ok && outline.ok && !shapesOverlap(flattenPath(parsed.commands), flattenPath(outline.commands))) {
      errors.push(makeError(`shapes[${i}].path`, `lies outside piece "${piece.id}" (${piece.width} x ${piece.height} mm): none of it would be drawn`));
    }
  });
  return errors;
}

/** The palette colours a design may use: what `validateDesign` needs from a palette. */
export interface PaletteColours {
  id: string;
  colors: ReadonlyArray<{ id: string; hex: string }>;
}

/** Every colour of the design (team colours too) must be a colour of the palette, with the palette's code. */
function checkAgainstPalette(design: DesignDocument, palette: PaletteColours): ValidationError[] {
  const errors: ValidationError[] = [];
  if (design.palette.id !== palette.id) {
    errors.push(makeError("palette.id", `design uses palette "${design.palette.id}" but was checked against "${palette.id}"`));
  }
  const byId = new Map(palette.colors.map((c) => [c.id, c.hex]));
  const team = Object.entries(design.teamColors).flatMap(([role, value]) => (value ? [{ path: `teamColors.${role}`, value }] : []));
  for (const { path, value } of [...team, ...designColourValues(design)]) {
    const known = byId.get(value.id);
    if (known === undefined) {
      errors.push(makeError(path, `colour "${value.id}" (${value.hex}) is not in palette "${palette.id}"; only palette colours can be printed`));
    } else if (known !== value.hex) {
      errors.push(makeError(path, `colour "${value.id}" is ${known} in palette "${palette.id}" but ${value.hex} here; the printed colour must be the palette's`));
    }
  }
  return errors;
}

export interface ValidateDesignOptions {
  /** When given, the design is also checked against this product's zones, pieces and placement presets. */
  product?: ProductDefinition;
  /** When given, every colour of the design must be a colour of this palette, with its code (nothing off-palette is printed). */
  palette?: PaletteColours;
  /**
   * The jersey number rules for number layers (see jersey-number-rules.ts).
   * Defaults to `DEFAULT_JERSEY_NUMBER_RULES`. Rules may change the maximum or
   * allow fewer digit systems. Digit systems the schema does not know (it
   * knows the three in the default data) are still refused by its pattern.
   */
  jerseyNumberRules?: JerseyNumberRules;
}

/**
 * Validates an unknown value as a design document. Never throws. On success
 * the returned `value` is a fresh copy. On failure `errors` lists every
 * problem found, each with a path and a readable message.
 */
export function validateDesign(
  input: unknown,
  options: ValidateDesignOptions = {},
): ValidationResult<DesignDocument> {
  try {
    const rules = options.jerseyNumberRules ?? DEFAULT_JERSEY_NUMBER_RULES;
    const rulesError = jerseyNumberRulesError(rules);
    if (rulesError) return { ok: false, errors: [rulesError] };
    const parsed = parseWith(designSchema, input, "a design", DESIGN_SCHEMA_VERSION);
    if (!parsed.ok) return parsed;
    const errors = checkReferences(parsed.value, rules);
    if (options.product) errors.push(...checkAgainstProduct(parsed.value, options.product));
    if (options.palette) errors.push(...checkAgainstPalette(parsed.value, options.palette));
    return errors.length > 0 ? { ok: false, errors } : parsed;
  } catch (error) {
    return unreadable("a design", error);
  }
}

/**
 * A value that cannot be read (a throwing getter, a Proxy that throws, a
 * product definition with the wrong shape) becomes a root-level error. The
 * validators promise never to throw.
 */
function unreadable(what: string, error: unknown): { ok: false; errors: ValidationError[] } {
  let reason = "unknown error";
  try {
    reason = error instanceof Error ? error.message : String(error);
  } catch {
    // keep the generic reason
  }
  return { ok: false, errors: [makeError("", `${what} could not be read (${reason})`)] };
}

/** Validates an unknown value as a product definition. Never throws. */
export function validateProductDefinition(input: unknown): ValidationResult<ProductDefinition> {
  try {
    return checkProductDefinition(input);
  } catch (error) {
    return unreadable("a product definition", error);
  }
}

function checkProductDefinition(input: unknown): ValidationResult<ProductDefinition> {
  const parsed = parseWith(productDefinitionSchema, input, "a product definition", PRODUCT_SCHEMA_VERSION);
  if (!parsed.ok) return parsed;
  const errors: ValidationError[] = [];
  const dupes = (ids: string[], label: string) => {
    const seen = new Set<string>();
    ids.forEach((value, i) => {
      if (seen.has(value)) errors.push(makeError(`${label}[${i}].id`, `duplicate id "${value}"`));
      seen.add(value);
    });
  };
  dupes(parsed.value.pieces.map((p) => p.id), "pieces");
  dupes(parsed.value.zones.map((z) => z.id), "zones");
  parsed.value.pieces.forEach((piece, i) => {
    if (piece.uv.x + piece.uv.width > 1 + 1e-9 || piece.uv.y + piece.uv.height > 1 + 1e-9) {
      errors.push(makeError(`pieces[${i}].uv`, "the UV rectangle extends outside the 0 to 1 range"));
    }
  });
  errors.push(...checkPieceGeometry(parsed.value));
  errors.push(...checkPlacements(parsed.value));
  return errors.length > 0 ? { ok: false, errors } : parsed;
}

/** The views name pieces of the product; each placement preset sits inside its piece's outline, with a unique id. */
function checkPlacements(product: ProductDefinition): ValidationError[] {
  const errors: ValidationError[] = [];
  const pieces = new Map(product.pieces.map((p) => [p.id, p]));
  const list = [...pieces.keys()].join(", ");
  for (const side of ["front", "back"] as const) {
    if (!pieces.has(product.views[side])) errors.push(makeError(`views.${side}`, `"${product.views[side]}" is not one of the product's pieces (${list})`));
  }
  const ids = new Set<string>();
  product.placements.forEach((preset, i) => {
    const at = `placements[${i}]`;
    if (ids.has(preset.id)) errors.push(makeError(`${at}.id`, `duplicate placement preset id "${preset.id}"`));
    ids.add(preset.id);
    const piece = pieces.get(preset.pieceId);
    if (!piece) {
      errors.push(makeError(`${at}.pieceId`, `"${preset.pieceId}" is not one of the product's pieces (${list})`));
      return;
    }
    const outline = parseSvgPath(piece.outline);
    const area = piece.printArea;
    if (area && (preset.centre.x < area.x || preset.centre.x > area.x + area.width || preset.centre.y < area.y || preset.centre.y > area.y + area.height)) {
      errors.push(makeError(`${at}.centre`, `(${preset.centre.x}, ${preset.centre.y}) is outside the print area of piece "${piece.id}"`));
    }
    if (outline.ok && !pointInPolylines(flattenPath(outline.commands), preset.centre)) {
      errors.push(makeError(`${at}.centre`, `(${preset.centre.x}, ${preset.centre.y}) is outside the outline of piece "${piece.id}"`));
    }
    const duplicateRoles = preset.roles.filter((role, k) => preset.roles.indexOf(role) !== k);
    if (duplicateRoles.length > 0) errors.push(makeError(`${at}.roles`, `lists ${duplicateRoles.join(", ")} twice`));
  });
  return errors;
}

/** How far (relative) a UV rectangle's proportions may differ from its piece's before artwork counts as stretched. */
export const UV_ASPECT_TOLERANCE = 0.01;
/** How far (mm) an outline point may lie outside the piece's box, for rounding in exported patterns. */
const OUTLINE_BOX_TOLERANCE_MM = 0.01;

/**
 * Rules for the vector pattern pieces that a JSON Schema cannot express:
 * outlines are one closed shape inside the piece's box, zones referred to
 * exist and are each drawn somewhere, UV rectangles keep the piece's
 * proportions and do not overlap (the whole model shares one texture).
 */
function checkPieceGeometry(product: ProductDefinition): ValidationError[] {
  const errors: ValidationError[] = [];
  const zoneIds = new Set(product.zones.map((z) => z.id));
  const drawn = new Set<string>();
  const zoneList = [...zoneIds].join(", ");

  product.pieces.forEach((piece, i) => {
    const at = `pieces[${i}]`;
    // Proportions: the texture is square, so a UV rectangle with other proportions than the piece stretches it.
    const pieceAspect = piece.width / piece.height;
    const uvAspect = piece.uv.width / piece.uv.height;
    if (Math.abs(uvAspect / pieceAspect - 1) > UV_ASPECT_TOLERANCE) {
      errors.push(
        makeError(
          `${at}.uv`,
          `the UV rectangle's proportions (${uvAspect.toFixed(3)}) differ from the piece's (${pieceAspect.toFixed(3)}) by more than ${UV_ASPECT_TOLERANCE * 100}%, which would stretch artwork on the model`,
        ),
      );
    }

    const outline = parseSvgPath(piece.outline);
    if (outline.ok) {
      const lines = flattenPath(outline.commands);
      const last = outline.commands[outline.commands.length - 1];
      if (lines.length !== 1 || last?.type !== "Z") {
        errors.push(makeError(`${at}.outline`, `must be one closed shape (a single M ... Z), found ${lines.length} shape(s)${last?.type === "Z" ? "" : " and no closing Z"}`));
      } else if (Math.abs(polygonArea(lines[0]!.points)) < 1) {
        errors.push(makeError(`${at}.outline`, "encloses no area"));
      }
      const box = polylineBounds(lines);
      const t = OUTLINE_BOX_TOLERANCE_MM;
      if (box && (box.minX < -t || box.minY < -t || box.maxX > piece.width + t || box.maxY > piece.height + t)) {
        errors.push(
          makeError(`${at}.outline`, `must lie inside the piece's box, 0 to ${piece.width} by 0 to ${piece.height} mm`),
        );
      }
    }

    // The print area lies inside the piece's box.
    const area = piece.printArea;
    if (area && (area.x + area.width > piece.width + OUTLINE_BOX_TOLERANCE_MM || area.y + area.height > piece.height + OUTLINE_BOX_TOLERANCE_MM)) {
      errors.push(makeError(`${at}.printArea`, `must lie inside the piece's box, 0 to ${piece.width} by 0 to ${piece.height} mm`));
    }

    const refer = (zone: string, path: string) => {
      if (zoneIds.has(zone)) drawn.add(zone);
      else errors.push(makeError(path, `"${zone}" is not one of the product's colour zones (${zoneList})`));
    };
    refer(piece.zone, `${at}.zone`);
    piece.regions.forEach((region, k) => refer(region.zone, `${at}.regions[${k}].zone`));
  });

  product.zones.forEach((zone, i) => {
    if (!drawn.has(zone.id)) {
      errors.push(makeError(`zones[${i}]`, `colour zone "${zone.id}" is not drawn on any piece (use it as a piece's zone or in a region)`));
    }
  });

  const pieces = product.pieces;
  for (let a = 0; a < pieces.length; a++) {
    for (let b = a + 1; b < pieces.length; b++) {
      const p = pieces[a]!.uv;
      const q = pieces[b]!.uv;
      if (p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height) {
        errors.push(
          makeError(
            `pieces[${b}].uv`,
            `overlaps the UV rectangle of piece "${pieces[a]!.id}"; each piece needs its own area of the texture`,
          ),
        );
      }
    }
  }
  return errors;
}

/** Signed area of a polygon (shoelace formula). */
function polygonArea(points: ReadonlyArray<{ x: number; y: number }>): number {
  let sum = 0;
  for (let k = 0; k < points.length; k++) {
    const a = points[k]!;
    const b = points[(k + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** Thrown by `assertValidDesign` and the edit functions. Carries every error. */
export class DesignError extends Error {
  readonly errors: ValidationError[];
  constructor(message: string, errors: ValidationError[] = []) {
    super(errors.length > 0 ? `${message}\n${errors.map((e) => `  - ${e.message}`).join("\n")}` : message);
    this.name = "DesignError";
    this.errors = errors;
  }
}

/** Like `validateDesign`, but returns the document or throws a `DesignError`. */
export function assertValidDesign(input: unknown, options: ValidateDesignOptions = {}): DesignDocument {
  const result = validateDesign(input, options);
  if (!result.ok) throw new DesignError("Invalid design document", result.errors);
  return result.value;
}
