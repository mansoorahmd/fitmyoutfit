import type { z } from "zod";
import {
  DESIGN_SCHEMA_VERSION,
  designSchema,
  productDefinitionSchema,
  type DesignDocument,
  type ProductDefinition,
} from "./schema";

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
    } else {
      errors.push(makeError(base, issue.message));
    }
  }
  return errors;
}

function checkSchemaVersion(input: unknown): ValidationError | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const version = (input as Record<string, unknown>).schemaVersion;
  if (typeof version === "number" && Number.isInteger(version) && version !== DESIGN_SCHEMA_VERSION) {
    return makeError(
      "schemaVersion",
      version > DESIGN_SCHEMA_VERSION
        ? `this document uses format version ${version}, which is newer than the version this code understands (${DESIGN_SCHEMA_VERSION}); update the editor package`
        : `format version ${version} is not supported (this code understands ${DESIGN_SCHEMA_VERSION}); no migration exists for it`,
    );
  }
  return null;
}

function parseWith<T>(
  schema: z.ZodType<T>,
  input: unknown,
  what: string,
): ValidationResult<T> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, errors: [makeError("", `${what} must be a JSON object`)] };
  }
  const versionError = checkSchemaVersion(input);
  if (versionError) return { ok: false, errors: [versionError] };
  const result = schema.safeParse(input);
  if (!result.success) return { ok: false, errors: zodIssuesToErrors(result.error.issues) };
  return { ok: true, value: result.data };
}

/**
 * Rules that a JSON Schema cannot express: unique ids and references between
 * parts of the document.
 */
function checkReferences(design: DesignDocument): ValidationError[] {
  const errors: ValidationError[] = [];

  const fontIds = new Set<string>();
  design.fonts.forEach((font, i) => {
    if (fontIds.has(font.id)) errors.push(makeError(`fonts[${i}].id`, `duplicate font id "${font.id}"`));
    fontIds.add(font.id);
  });

  const layerIds = new Set<string>();
  design.layers.forEach((layer, i) => {
    if (layerIds.has(layer.id)) errors.push(makeError(`layers[${i}].id`, `duplicate layer id "${layer.id}"`));
    layerIds.add(layer.id);
    if ((layer.kind === "text" || layer.kind === "number") && !fontIds.has(layer.fontId)) {
      errors.push(
        makeError(`layers[${i}].fontId`, `font "${layer.fontId}" is not listed in 'fonts'; add it to the document`),
      );
    }
  });
  return errors;
}

/** Checks a design against the product it is for: zones and pattern pieces must exist. */
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
      errors.push(makeError(`zones.${zoneId}`, `product "${product.id}" has no colour zone "${zoneId}"`));
    }
  }
  for (const zone of product.zones) {
    if (!(zone.id in design.zones)) {
      errors.push(makeError(`zones.${zone.id}`, `missing colour for zone "${zone.id}"`));
    }
  }
  if (design.palette.id !== product.palette.id) {
    errors.push(
      makeError("palette.id", `design uses palette "${design.palette.id}" but the product uses "${product.palette.id}"`),
    );
  }
  const pieceIds = new Set(product.pieces.map((p) => p.id));
  design.layers.forEach((layer, i) => {
    if (!pieceIds.has(layer.pieceId)) {
      errors.push(makeError(`layers[${i}].pieceId`, `product "${product.id}" has no pattern piece "${layer.pieceId}"`));
    }
  });
  return errors;
}

export interface ValidateDesignOptions {
  /** When given, the design is also checked against this product's zones and pieces. */
  product?: ProductDefinition;
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
  const parsed = parseWith(designSchema, input, "a design");
  if (!parsed.ok) return parsed;
  const errors = checkReferences(parsed.value);
  if (options.product) errors.push(...checkAgainstProduct(parsed.value, options.product));
  return errors.length > 0 ? { ok: false, errors } : parsed;
}

/** Validates an unknown value as a product definition. Never throws. */
export function validateProductDefinition(input: unknown): ValidationResult<ProductDefinition> {
  const parsed = parseWith(productDefinitionSchema, input, "a product definition");
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
  return errors.length > 0 ? { ok: false, errors } : parsed;
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
