import {
  DESIGN_SCHEMA_VERSION,
  type DesignDocument,
  type ProductDefinition,
  type SamplePlayer,
  type TeamColors,
} from "./schema.js";
import { normalizeText } from "./text.js";

export interface CreateDesignOptions {
  /** The team's colours. Default: the product's `teamColors`. */
  teamColors?: TeamColors;
  /** The team name (normalised to NFC). Default: empty. */
  teamName?: string;
  /** The sample player shown while designing. Default: no name, no number. */
  samplePlayer?: SamplePlayer;
}

function copyTeamColors(colors: TeamColors): TeamColors {
  const out: TeamColors = { main: { ...colors.main }, second: { ...colors.second } };
  if (colors.accent) out.accent = { ...colors.accent };
  return out;
}

/**
 * Creates an empty design for a product: every colour zone at the product's
 * default colour (following no team colour), the product's palette and team
 * colours, no layers, shapes or fonts, and no template. Apply a template
 * (`applyTemplate`) to start from one, as the editor does.
 */
export function createDesign(product: ProductDefinition, options: CreateDesignOptions = {}): DesignDocument {
  const zones: DesignDocument["zones"] = {};
  for (const zone of product.zones) {
    zones[zone.id] = { ...zone.defaultColor };
  }
  return {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    product: { id: product.id },
    palette: { ...product.palette },
    teamColors: copyTeamColors(options.teamColors ?? product.teamColors),
    teamName: normalizeText(options.teamName ?? ""),
    samplePlayer: options.samplePlayer
      ? { name: normalizeText(options.samplePlayer.name), number: options.samplePlayer.number }
      : { name: "", number: "" },
    template: null,
    zones,
    fonts: [],
    shapes: [],
    layers: [],
  };
}
