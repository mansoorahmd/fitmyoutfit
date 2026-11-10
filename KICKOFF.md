Paste this into Claude Code after starting it in this folder:

---

Read CLAUDE.md and plan.md. Then run an adversarial review of plan.md using ALL six subagents in .claude/agents/, in parallel:
buyer-individual, team-organizer, corporate-buyer, production-manager, skeptical-investor, competitor-researcher.

Give each subagent plan.md and tell it to return its findings in its required format. Do not let them see each other's output.

When all six are done:
1. Save each subagent's raw findings to critiques/<agent-name>.md.
2. Write critiques/SYNTHESIS.md with: (a) objections raised by 2+ critics, ranked by severity; (b) the single most dangerous assumption in the plan; (c) concrete changes to plan.md, each tagged with the milestone (M0–M6) it affects; (d) open questions only the founders can answer.
3. Do NOT edit plan.md. Show me the synthesis first.
