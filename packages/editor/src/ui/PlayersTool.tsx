/**
 * The Players tab (08-team-list.md 3.1, decision D-TL1): the team list is the default view; the name and number
 * style (the old Players panel) is one level down, "Style ›", with "‹ Back" to the list.
 */
import { memo } from "react";
import { PlayersStyle } from "./LetteringTools.js";
import { TeamListView } from "./TeamList.js";
import { useTeamList } from "./team-list-context.js";

function PlayersToolView() {
  const t = useTeamList();
  if (t.view === "style") return <PlayersStyle onBack={() => t.setView("list")} showPreviewAs={t.analysis.filled.length === 0} />;
  return <TeamListView />;
}

export const PlayersTool = memo(PlayersToolView);
