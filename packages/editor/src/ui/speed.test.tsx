/**
 * E3d (speed): the editor's shared state is stable. Its functions never change identity and always call the
 * latest implementation; the tools are memoised, so a render of the shell for anything else (the camera, a status
 * line, a hover) no longer re-renders them.
 */
import { describe, expect, it } from "vitest";
import { createHandlers } from "./EditorShell";
import { ColoursTool } from "./ColoursTool";
import { DesignTool } from "./DesignTool";
import { TeamTool } from "./LetteringTools";
import { PlayersTool } from "./PlayersTool";
import { LogosTool } from "./LogosTool";
import { TextTool } from "./TextTool";
import { ClippedNote, ContextBar, FineTune, SelectedWarnings } from "./SelectedItem";

describe("createHandlers", () => {
  it("stable functions that call the latest implementation given", () => {
    const { handlers, set } = createHandlers();
    const commit = handlers.commit;
    const seen: string[] = [];
    set({ ...Object.fromEntries(Object.keys(handlers).map((k) => [k, () => undefined])), commit: () => (seen.push("first"), true) } as never);
    handlers.commit((d) => d, "colour");
    set({ ...Object.fromEntries(Object.keys(handlers).map((k) => [k, () => undefined])), commit: () => (seen.push("second"), true) } as never);
    handlers.commit((d) => d, "colour");
    expect(handlers.commit).toBe(commit);
    expect(seen).toEqual(["first", "second"]);
  });
  it("before anything is set, a call does nothing (never throws)", () => {
    expect(() => createHandlers().handlers.announce("x")).not.toThrow();
  });
});

describe("the tools are memoised", () => {
  it("each re-renders only when its props or the editor's data change", () => {
    const MEMO = Symbol.for("react.memo");
    for (const [name, c] of Object.entries({ ColoursTool, DesignTool, TeamTool, PlayersTool, LogosTool, TextTool, ContextBar, SelectedWarnings, ClippedNote, FineTune })) {
      expect((c as unknown as { $$typeof: symbol }).$$typeof, name).toBe(MEMO);
    }
  });
});
