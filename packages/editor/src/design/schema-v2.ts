/**
 * Format version 2 of the design document (step E2), kept only so that
 * `upgradeDesign` can read a version 2 document exactly as E2 did before it
 * turns it into version 3. Frozen: do not change it to follow version 3.
 *
 * It reuses the parts of the format that version 3 did not change (ids,
 * palette colours, fonts, assets, the jersey number pattern).
 */
import { z } from "zod";
import {
  JERSEY_NUMBER_VALUE_PATTERN,
  MAX_TEXT_LENGTH,
  ZONE_ID_PATTERN,
  ID_PATTERN,
  assetRefSchema,
  colorRefSchema,
  fontRefSchema,
  logoAssetRefSchema,
  paletteRefSchema,
  pointSchema,
  sizeSchema,
} from "./schema.js";
import { checkJerseyNumber } from "./jersey-number.js";
import { TEXT_ALIGNS, TEXT_DIRECTIONS, isNormalizedText } from "./text.js";

const id = z.string().regex(ID_PATTERN, "must be 1 to 64 characters: letters, digits, '-', '_' or '.', starting with a letter or digit");
const zoneId = z.string().regex(ZONE_ID_PATTERN, "must be a zone id");

const placement = {
  pieceId: id,
  position: pointSchema,
  size: sizeSchema,
  rotation: z.number(),
};

const textStyle = {
  fontId: id,
  fontSize: z.number().positive(),
  fill: colorRefSchema,
  align: z.enum(TEXT_ALIGNS),
};

const ONE_LINE = /^[^\p{Cc}]*$/u;

const textLayerV2 = z.strictObject({
  id,
  kind: z.literal("text"),
  ...placement,
  value: z
    .string()
    .min(1)
    .max(MAX_TEXT_LENGTH)
    .regex(ONE_LINE, "must be one line of text: no line breaks, tabs or other control characters")
    .refine((value) => value.trim().length > 0, "must contain a visible character, not only spaces")
    .refine(isNormalizedText, "must be in Unicode normal form NFC"),
  direction: z.enum(TEXT_DIRECTIONS),
  ...textStyle,
});

const numberLayerV2 = z.strictObject({
  id,
  kind: z.literal("number"),
  ...placement,
  value: z.string().regex(new RegExp(JERSEY_NUMBER_VALUE_PATTERN), {
    error: (issue) => {
      const result = checkJerseyNumber(issue.input);
      return result.ok ? "is not a valid jersey number" : result.error;
    },
  }),
  ...textStyle,
});

const logoLayerV2 = z.strictObject({ id, kind: z.literal("logo"), ...placement, asset: logoAssetRefSchema });
const clipartLayerV2 = z.strictObject({ id, kind: z.literal("clipart"), ...placement, asset: assetRefSchema });

export const layerSchemaV2 = z.discriminatedUnion("kind", [textLayerV2, numberLayerV2, logoLayerV2, clipartLayerV2]);

export const designSchemaV2 = z.strictObject({
  schemaVersion: z.literal(2),
  product: z.strictObject({ id }),
  palette: paletteRefSchema,
  zones: z.record(zoneId, colorRefSchema),
  fonts: z.array(fontRefSchema),
  layers: z.array(layerSchemaV2),
});

export type DesignDocumentV2 = z.infer<typeof designSchemaV2>;
export type LayerV2 = z.infer<typeof layerSchemaV2>;
