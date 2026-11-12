/**
 * Selection in the coach's terms (06-editor.md 4.8, 5): which tool an item
 * belongs to, and the rules for what is drawn round the selected item. Plain
 * functions, tested without a browser.
 */
import type { Layer } from "../design/schema.js";
import type { ToolId } from "./context.js";

/** The tool that edits an item: the team name in Team, names and numbers in Players, logos in Logos, free text in Text. */
export function toolForLayer(layer: Pick<Layer, "role" | "kind">): ToolId {
  switch (layer.role) {
    case "team-name":
      return "team";
    case "player-name":
    case "player-number":
      return "players";
    case "text":
      return layer.kind === "logo" || layer.kind === "clipart" ? "logos" : "text";
    default:
      return layer.kind === "text" || layer.kind === "number" ? "text" : "logos";
  }
}
