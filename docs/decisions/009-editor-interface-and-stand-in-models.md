# 009 Editor interface and stand-in models

12 Nov 2026 · coordinator. Choices taken after the founder compared the editor demo with Spized's configurator and asked for one that is easier, more dynamic and more modern. The founder asked the coordinator to take product and design decisions and report them; prices, payment terms and the wording of promises stay with the founders.

## Context

- The editor engine (steps E1 and E2) works: colour zones, text in Latin, Arabic and Urdu, numbers, logos, dragging on the model, undo and redo. Its interface was a developer demo and its garment a script-generated placeholder shape.
- The designer wrote the interface specification, [06-editor.md](../design/06-editor.md). It ends with nine design questions and ten business questions.
- A search for openly licensed garment models found one usable file; the founder then downloaded three more from Sketchfab. Details are in [progress.md](../progress.md).

## Decisions

### Interface

1. **The editor is built to 06-editor.md.** Phone first: the garment fills the screen, six tools sit in a bar at the bottom (Design, Colours, Team, Players, Logos, Text) and open as a short panel that never hides the garment. On a computer the same tools are a column on the left with their panel beside it.
2. **E3 is split in two.** E3a is the new layout, the start card, templates, team colours, the Colours tool with the colour-code match, and the Team and Players tools. E3b is handles and snapping on the model, the Logos flow, free text, the item list and the Done panel. The founder sees the new editor after E3a.
3. **The team comes first.** A start card asks for the team's colours and name; every template is shown in those colours with that name, and switching templates keeps the colours, name and logos.
4. **Names and numbers are roles, not text boxes.** The coach sets the style and position; the values come from each player. A sample player stands in until the roster preview (E4).
5. **On touch, select first, then drag.** With a mouse, dragging stays direct. Two fingers always move the camera.
6. **A colour code snaps to the print-tested palette** and shows both colours. The code the coach asked for is kept next to the palette colour.
7. **A light grey stage** that deepens for white kits; the store's navy frame; one red button, "Done".
8. **The tab is called "Players".**
9. **Patterns and gradients are not tools in E3.** Templates carry simple recolourable shapes (stripes, hoops, a sash, a chevron). A pattern library and two-colour fades come later, for sublimated products only, because other print methods cannot produce them and a pattern must line up across seams in the cutting file. Photo textures and free drawing are never offered: they cannot be checked for print and would break "a design is data". The founder was told and can bring patterns forward.
10. **Logo background removal is not in E3.** The free design help is offered instead; a "remove plain background" tool is tested later.
11. **Before accounts and team orders exist,** a design is saved on the device itself, including logo files, and "Done" returns to the product page. There is no share link yet.
12. **A flat view** is shown when 3D cannot run, so a missing WebGL is never a dead end.

### Engine

13. **The interface lives in `packages/editor/src/ui/`** with slots the storefront fills (price, add to order). It does not import the store; it matches the store's look by reading the same CSS variables. This keeps the editor loosely coupled from Medusa, as CLAUDE.md requires.
14. **The design format becomes version 3** (item roles, team colours, templates, shape items, text outlines). Nothing has been saved in production, so the change is cheap now. A version 2 design is upgraded by a plain function with tests, because E3a starts saving designs on the device.
15. **Text outline goes into E3a** if the developer sizes it at a day or less, otherwise E3b.

### Stand-in models

16. **Stand-in models are used until the 3D artist's models arrive.** Only models whose licence clearly allows commercial use and redistribution are used; the source, author and licence are kept in a notice file beside each model, and the original downloads are not committed.
17. **T-shirt:** "Garment 3D" by Prashant Verma, MIT (step E2b). **Jersey:** "Jersey Patterns 3D Free" by Wearable3D, CC-BY 4.0 (step E2c). "Men Regular Apparel Fit Sporty T-Shirt" by BINARYCLOTH, CC-BY 4.0, is kept in reserve.
18. **CC-BY needs the author credited** wherever the model is shown, so the site needs a credits line before a CC-BY stand-in is shown to customers.
19. **Not used:** the widely copied `shirt_baked.glb` (origin and licence cannot be traced), models with real club or brand kits, game rips, and Objaverse as a way around Sketchfab's login.

## Alternatives rejected

- **One large E3:** too big to review in one step, and the founder would wait longer to see anything.
- **Patterns and gradients in E3:** they depend on per-product print methods and on seam alignment in production files, neither of which is specified.
- **Optional fields added to format version 2:** two shapes of the same version to test and explain; a clean version with an upgrade function is simpler.
- **Building the interface inside the storefront:** it would tie the editor to the store and to Medusa.
- **Waiting for the 3D artist before improving the look:** the founder asked for a real garment now, and the processing built for the stand-ins is reused for the real models.

## Consequences

- The stand-ins show the editor; they cannot produce cutting files. The 3D artist's models, made from the factories' real pattern pieces, are still needed before production files come from the editor.
- The ten business questions in section 16 of the specification (palette, templates, fonts and their print licences, what "Done" leads to, the price in the editor, designer check, logo rights wording) are parked. The founder asked on 12 Nov to settle such inputs once the whole project works; E3 runs on placeholders until then.
- The founders have the editor's draft wording (section 14 of the specification) to confirm before launch, with the sentences that carry a promise marked.
- Handles on the model (E3b) need a way to map a point on a pattern piece to the screen through the model's UVs. It is the largest engine item and may need its own step.
- Speed on a mid-range phone is still unmeasured; the specification's budgets are targets until E5 measures them.
