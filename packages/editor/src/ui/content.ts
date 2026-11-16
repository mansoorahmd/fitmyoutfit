/**
 * Every sentence and word the editor's interface shows, in one place, grouped
 * as in section 14 of the specification (docs/design/06-editor.md), so the
 * founders can confirm and translate them. Components never hold wording.
 *
 * // DRAFT WORDING, founders to confirm.
 *
 * - Ids in the comments are the specification's (W-ED…). "NEW" marks a
 *   sentence the specification did not have, written while building E3a-2
 *   (also draft). "P" marks a sentence that states or touches a promise, a
 *   payment, a rule or a print capability: those need the founders first.
 * - `{name}` marks a value filled in by `fill`.
 * - A host can replace any of it: `<EditorShell wording={{ frame: { done: "Fertig" } }}>`.
 */
import type { EditLabel } from "../state/history.js";

export const EDITOR_WORDING = {
  /** Frame (`frame`): the top bar and leaving. */
  frame: {
    close: "Close", // W-ED1 (shown as an icon; the accessible name is below)
    closeName: "Close the editor", // W-ED1
    undo: "Undo", // W-ED2
    redo: "Redo", // W-ED3
    saved: "Saved on this device", // W-ED4
    savedShort: "Saved", // NEW (E3b): W-ED4 in a phone's top bar, where the whole sentence does not fit; the sentence stays the accessible name
    saving: "Saving…", // W-ED5
    notSaved: "Not saved", // W-ED6
    notSavedHelp: "This browser didn't let us save your design. Keep this page open, or free some space.", // W-ED6b
    done: "Done", // W-ED7
    leaveTitle: "Leave without saving?", // W-ED7a
    stay: "Stay", // W-ED7b
    leave: "Leave", // W-ED7c
    savedAccount: "Saved", // W-ED8 (later, with accounts)
    editorName: "Kit editor", // NEW: the editor's accessible name
    otherTab: "This design changed in another tab.", // W-ED148
    reload: "Reload", // W-ED148
  },
  /** Tools (`tools`): the six tabs and the panels. */
  tools: {
    design: "Design", // W-ED10
    colours: "Colours", // W-ED11
    team: "Team", // W-ED12
    players: "Players", // W-ED13
    logos: "Logos", // W-ED14
    text: "Text", // W-ED15
    showAll: "Show all", // W-ED16
    showLess: "Show less", // W-ED16
    back: "‹ Back", // W-ED17
    closePanel: "Close the panel", // NEW: the panel's close button
    help: "Help", // NEW: the "?" button's accessible name
    toolsName: "Tools", // NEW: the tab list's accessible name
    almostReady: "Almost ready…", // W-ED140b
  },
  /** One short tip per tool, shown by the "?" button (a pull revelation, 06-editor.md 7.4). NEW. */
  help: {
    design: "Tap a design to try it on your kit. Your name, logo and colours stay. Undo brings back the one before.",
    colours: "Choose a part of the kit, then a colour. You can also tap the kit to choose a part.",
    team: "Your team name is printed the same on every shirt. Choose where it goes and how it looks.",
    players: "Each player gets their own name and number. Type a sample to see how they look.",
    logos: "Add your crest or a sponsor's logo. A PNG with a transparent background prints best.",
    text: "Add a motto, a sponsor's name or a year. It is printed the same on every shirt.",
  },
  /** Start card (`start`), the first open of a new design. */
  start: {
    title: "Let's make your team's kit", // W-ED20
    colours: "Team colours (pick 2 or 3)", // W-ED21
    name: "Team name", // W-ED22
    namePlaceholder: "e.g. Lahore Lions", // W-ED22b
    seeDesigns: "See designs in your colours", // W-ED23
    skip: "Skip: start from this design", // W-ED24
    later: "You can change everything later.", // W-ED25
    allColours: "All colours", // W-ED44
    clearSlot: "Remove {role}", // NEW: accessible name of a filled colour slot
    emptySlot: "{role}: not chosen", // NEW
  },
  /** Design (`templates`). */
  templates: {
    title: "Designs", // W-ED30
    intro: "Shown in your team colours. Tap one to try it.", // W-ED31
    current: "Current", // W-ED32
    keeps: "Your name, logo and colours stay when you change designs.", // W-ED33
    changed: "Design changed", // W-ED34 (with the Undo button beside it)
    loading: "Getting your designs ready…", // NEW: cards before the model has loaded
  },
  /** Colours (`colours`). */
  colours: {
    zoneColour: "{zone}: {colour}", // W-ED40
    teamColours: "Team colours", // W-ED41
    roles: { main: "Main", second: "Second", accent: "Accent" }, // W-ED42
    recent: "Recently used", // W-ED43
    all: "All colours", // W-ED44
    editTeam: "Edit team colours", // W-ED45
    swap: "Swap main and second", // W-ED46
    tapKit: "Tap the kit to choose a part.", // W-ED47
    matchCode: "Match a colour code", // W-ED48
    codeLabel: "Enter a colour code, like #1F4E9C", // W-ED49
    youEntered: "You entered", // W-ED50
    wePrint: "We'll print", // W-ED50
    match: { "very-close": "Very close match", close: "Close match", different: "Clearly different: check before you order" }, // W-ED50a/b/c
    use: "Use {colour}", // W-ED50d
    matched: "{zone}: {colour} (matched from {code})", // W-ED50e
    invalidCode: "That isn't a colour code. Use 6 characters from 0–9 and A–F, like #1F4E9C.", // W-ED51
    printNote: "Colours on screens vary. We print from our tested colour range.", // W-ED54 P
    selected: "{colour}, selected", // 06-editor.md 4.3 (accessible name)
    swatch: "{colour}", // accessible name of a swatch
    parts: "Parts of the kit", // NEW: the zone chips' group name
    noAccent: "No accent", // NEW: removes the accent colour
    addAccent: "Add an accent", // NEW
    editRole: "Choose the {role} colour", // NEW
  },
  /** Team, players, text (`lettering`). */
  lettering: {
    teamName: "Team name", // W-ED60
    where: "Where", // W-ED61
    off: "Off", // W-ED62
    style: "Style", // W-ED63
    font: "Font", // W-ED64
    colour: "Colour", // W-ED64
    outline: "Outline", // W-ED64
    size: "Size", // W-ED64
    outlineSteps: { none: "None", thin: "Thin", thick: "Thick" }, // W-ED65
    outlineColour: "Outline colour", // NEW
    sizeSteps: { small: "Small", medium: "Medium", large: "Large" }, // W-ED66
    namesAndNumbers: "Names and numbers", // W-ED70
    fromTeamList: "Each player's name and number come from your team list.", // W-ED71 P
    previewAs: "Preview as", // W-ED72
    sampleName: "PLAYER", // W-ED72b (sample name)
    sampleNumber: "10", // W-ED72b (sample number)
    sample: "Sample", // W-ED72c
    playerName: "Player name", // W-ED73
    number: "Number", // W-ED74
    onTheShirt: "On the shirt", // W-ED75
    slots: { "back-name": "Name on back", "back-number": "Number on back", "front-number": "Number on front", sleeve: "Number on sleeve" }, // W-ED76
    digits: "Digits", // W-ED77
    digitSystems: { western: "0–9", "arabic-indic": "٠–٩" }, // W-ED77
    shrunk: "Long names get smaller to fit.", // W-ED78
    numberTooLong: "Use 1 or 2 digits, from 0 to 99.", // W-ED79
    numberMixed: "Use one kind of digits, not both.", // W-ED80
    numberEmpty: "Enter a number to preview.", // W-ED81
    hardToRead: "{item} is hard to read on {colour}.", // W-ED85, NEW form (E3b): it names the item ("Number on the back is hard to read on Navy.")
    addOutline: "Add outline", // W-ED86
    addColourOutline: "Add {colour} outline", // NEW (E3c): W-ED86 saying what it adds ("Add white outline")
    darkerColour: "Choose a darker colour", // W-ED86
    useLetterColour: "Use {colour} letters", // NEW: the fix that changes the letters' colour ("Use white letters"; E3c: the colour in lower case)
    latinOnly: "Latin only: Arabic and Urdu use {font}", // W-ED87
    nameFont: "Font for names", // NEW
    numberFont: "Font for numbers", // NEW
    addText: "Add text", // W-ED100
    sameOnEvery: "Printed the same on every shirt.", // W-ED101
    align: { start: "Start", center: "Centre", end: "End" }, // W-ED102
    alignLabel: "Alignment", // NEW: the group name of W-ED102
    textLabel: "Your text", // NEW
    removeText: "Remove", // W-ED98
    fontsLoading: "Fonts are still loading. Names may change shape slightly.", // W-ED145
    fontsFailed: "Some fonts couldn't load. Check your connection and try again.", // W-ED146
    noPictographs: "Emoji and picture symbols can't be printed in a kit colour. Use letters, numbers and punctuation.", // NEW (E3c, S5): a field refuses them
    hasPictographs: "This has emoji or picture symbols, which can't be printed in a kit colour.", // NEW (E3c, S5): a saved design that holds them
    removePictographs: "Remove them", // NEW (E3c, S5)
    textBlank: "Type some text, or remove this line.", // NEW (E3c): why an empty line of text can't be used (the reason W-ED149 lacked)
  },
  /** Logos (`logos`). The simple panel of E3a; the full flow is E3b. */
  logos: {
    add: "Add your team logo", // W-ED90
    formats: "PNG, JPG or WebP, up to 10 MB. A transparent background prints best.", // W-ED91
    drop: "or drop it here", // W-ED91b
    checking: "Checking your logo…", // W-ED92
    where: "Where", // W-ED93
    wrongType: "{file} isn't a picture we can print. Use a PNG, JPG or WebP file.", // W-ED94a
    damaged: "{file} seems damaged. Save it again and try once more.", // W-ED94b
    tooBig: "{file} is {size}. The largest we take is 10 MB.", // W-ED94c
    tooSmall: "{file} is too small to print well. Use a bigger version of your logo.", // W-ED94d
    tooLarge: "{file} is too large. Save a smaller version and try again.", // W-ED94d
    animated: "{file} is animated. Use a still picture.", // W-ED94e
    svg: "SVG files can't be used yet. Save your logo as a PNG and try again.", // W-ED94f
    noTransparency: "No transparent background: it will print as a box with its background colour.", // W-ED95
    keepIt: "Keep it", // W-ED95b
    designHelp: "Our designers can clean it up for you.", // W-ED95c P (copy from founders: free design help)
    blurry: "May print blurry at this size. Sharp up to {size}.", // W-ED96
    makeSharp: "Make it sharp", // W-ED96b
    network: "Your logo didn't upload. Check your connection and try again.", // W-ED97
    tryAgain: "Try again", // W-ED97
    missingFile: "A logo in this design isn't on this device any more. Add it again, or remove it.", // NEW (E3c, S2): said when a saved design opens
    missingCard: "This logo's file isn't on this device any more.", // NEW (E3c, S2): on the logo's card
    addAgain: "Add it again", // NEW (E3c, S2)
    storageFull: "This device's storage is full, so your logo couldn't be kept. Free some space (or remove logos you no longer use), then try again.", // NEW (E3c, S4): with Try again
    replace: "Replace", // W-ED98
    remove: "Remove", // W-ED98
    addAnother: "Add another logo", // W-ED98
    rights: "Only upload logos you have the right to use.", // W-ED99 P
    logoName: "Logo: {file}", // 06-editor.md 4.8 ("Logo: crest.png")
    yourLogo: "Your logo", // NEW: a logo whose file name is not known (restored from the device)
    size: "Size", // W-ED64
    sizeSteps: { small: "Small", medium: "Medium", large: "Large" }, // W-ED66 (the stepper says the nearest)
    smaller: "Smaller", // NEW: the stepper's − (accessible name)
    bigger: "Bigger", // NEW: the stepper's +
    sharpSize: "{cm} cm wide", // NEW: the {size} of W-ED96 ("Sharp up to 9 cm wide.")
    replaceName: "Replace {file}", // NEW: accessible names of a logo's buttons
    removeName: "Remove {file}", // NEW
    selectName: "Select {file} on the kit", // NEW
  },
  /** Selection and the list (`selection`). Mostly E3b. */
  selection: {
    delete: "Delete", // W-ED110
    duplicate: "Duplicate", // W-ED110
    more: "More", // W-ED110
    done: "Done", // W-ED110
    bringForward: "Bring forward", // W-ED110b
    sendBack: "Send back", // W-ED110b
    edit: "Edit", // W-ED110b
    actionsFor: "Actions for {item}", // NEW: the contextual bar's accessible name
    clipped: "Part of this is cut off at the seam.", // W-ED111
    moveIn: "Move it in", // W-ED111b
    tooBigToFit: "Make it smaller so it fits on the shirt.", // NEW: when no place fits ("Move it in" cannot help)
    madeSmaller: "Made smaller so it fits where it prints.", // NEW (E3c): the print-area rule had to shrink the item (a turn, a place, a size)
    turnToEdit: "Turn to edit", // W-ED112
    fineTune: "Fine-tune", // W-ED113
    bigger: "Bigger", // W-ED114
    smaller: "Smaller", // W-ED114
    turnLeft: "Turn left", // W-ED114
    turnRight: "Turn right", // W-ED114
    straighten: "Straighten", // W-ED114
    centre: "Centre on the shirt", // W-ED114
    moveLeft: "Move left", // NEW (fine-tune's arrows)
    moveRight: "Move right", // NEW
    moveUp: "Move up", // NEW
    moveDown: "Move down", // NEW
    size: "Size", // NEW (fine-tune rows)
    turn: "Turn", // NEW
    move: "Move", // NEW
    sizeMm: "{width} × {height} mm", // NEW: desktop only, secondary text
    degrees: "{degrees}°", // NEW: desktop only, secondary text
    snap: "Snap to guides", // NEW: snapping on or off (touch has no Alt key)
    keys: "Arrows move it, Shift for bigger steps. [ and ] resize, with Shift they turn. Delete removes it. Esc lets go.", // NEW: keyboard help in fine-tune (desktop)
    hint: "Drag to turn. Tap something to change it.", // W-ED116
    hintPointer: "Drag to turn. Click something to change it.", // W-ED116
    onThisKit: "On this kit", // W-ED130
    onThisKitCount: "On this kit ({count})", // W-ED130 with the count
    onThisKitName: "On this kit, {count} items", // NEW: the button's accessible name (4.8)
    kitEmpty: "Nothing added yet. Add your team name, players or a logo.", // W-ED131
    fromDesign: "From the design", // W-ED132
    locked: "Locked", // W-ED132
    moreFor: "More for {item}", // NEW: a row's menu button (accessible name)
    needsALook: "Needs a look", // NEW: the warning badge's accessible name
    colourAction: "Colour", // NEW: the only action for the design's shapes
  },
  /** View (`view`). */
  view: {
    sides: { front: "Front", back: "Back", left: "Left", right: "Right" }, // W-ED120
    sidesName: "View", // NEW: the side buttons' group name
    zoomIn: "Zoom in", // W-ED121
    zoomOut: "Zoom out", // W-ED121
    reset: "Reset view", // W-ED121
    description: "{product}, {side} view. {summary}", // W-ED122
    sideWords: { front: "front", back: "back", left: "left side", right: "right side", turned: "turned" }, // NEW, for W-ED122
    zonesSummary: "{zones}.", // NEW, for W-ED122: "Body navy; sleeves and collar white."
    and: "and", // NEW, for W-ED122
    zonePart: "{zone} {colour}", // NEW
    itemOn: "{item} on the {where}.", // NEW, for W-ED122: "Team name TIGERS on the chest."
    teamNameItem: "Team name {value}", // NEW
    playerItem: "Name {name} and number {number}", // NEW
    logoItem: "Logo", // NEW
    textItem: "Text {value}", // NEW
    credit: "3D model", // NEW: the credit line's label (the host gives the credit)
    creditMore: "Model credit", // NEW (E3b): the button beside the short credit line that opens the full credit
  },
  /**
   * What an item on the kit is called (E3b, NEW): in warnings ("Number on the back is hard to read"),
   * the list "On this kit", the contextual bar and the Done panel. By role.
   */
  items: {
    roles: { "team-name": "Team name", "player-name": "Player name", "player-number": "Number", crest: "Logo", sponsor: "Logo", text: "Text", graphic: "Picture" } as Record<string, string>,
    at: "{item} on the {where}", // NEW: "Number on the back"
    named: "{item}: {value}", // NEW: "Team name: TIGERS", "Logo: crest.png" (06-editor.md 4.8)
  },
  /** States (`states`). */
  states: {
    loading: "Loading your kit… {percent}%", // W-ED140
    loadingNoPercent: "Loading your kit…", // W-ED140 without a percentage (NEW)
    almostReady: "Almost ready…", // W-ED140b
    slow: "Still loading. Your connection seems slow.", // W-ED141
    failed: "We couldn't load the 3D kit.", // W-ED141b
    tryAgain: "Try again", // W-ED141b
    useFlat: "Use the flat view", // W-ED141b
    continueTitle: "Continue your last design?", // W-ED142
    continue: "Continue", // W-ED142
    startAgain: "Start again", // W-ED142
    noWebgl: "The 3D view can't run on this device. You can still design your kit here.", // W-ED143
    restarting: "Restarting the 3D view…", // W-ED144
    changeFailed: "That change couldn't be made.", // W-ED149
    undone: "Undone: {change}", // W-ED150
    redone: "Redone: {change}", // W-ED150
    flatFront: "Front", // NEW: flat view captions
    flatBack: "Back", // NEW
  },
  /** Done (`done`). The Done panel is E3b; E3a saves and hands the design to the host. */
  done: {
    title: "Your kit", // W-ED160
    saveAndGoBack: "Save and go back", // W-ED163
    teamOrdersSoon: "Team orders open soon. Your design is saved on this device.", // W-ED164 P (copy from founders)
    keepDesigning: "Keep designing", // W-ED166
    close: "Close", // NEW: the Done panel's close button (accessible name)
    checksMany: "{count} things to check", // W-ED161
    checksOne: "1 thing to check", // W-ED161
    checksNone: "Nothing to check. Your kit looks ready.", // NEW
    show: "Show", // W-ED161
    checkLine: "{item}: {reason}", // NEW: one line of the summary ("Logo on the left chest: may print blurry at this size.")
    checkHardToRead: "hard to read on {colour}.", // NEW (W-ED85 in the summary)
    checks: { clipped: "part of it is cut off at the seam.", blurry: "may print blurry at this size.", box: "prints as a box with its background colour.", "hard-to-read": "hard to read.", pictographs: "has emoji or picture symbols, which can't be printed.", missing: "its picture is missing on this device." } as Record<"clipped" | "blurry" | "box" | "hard-to-read" | "pictographs" | "missing", string>, // pictographs, missing: NEW (E3c, S5, S2) // NEW (W-ED111, W-ED96, W-ED95 in the summary)
    price: "Price", // W-ED168 (the host fills the slot)
    kitLine: "{product} · {team}", // NEW: the Done panel's line ("Jersey · Lahore Lions")
    doneOpen: "Done: the panel is open", // NEW: the top bar's Done while the Done panel is open (accessible name)
    savedHere: "Saved on this device", // W-ED4
  },
  /** What an undo or redo changed, for the status line ("Undone: Colour"), one per kind of edit (W-ED150). */
  changes: {
    "zone-colour": "Colour",
    "team-colour": "Team colours",
    "swap-team-colours": "Swapped colours",
    "shape-colour": "Colour",
    template: "Design",
    "team-name": "Team name",
    "player-name": "Player name",
    "player-number": "Number",
    "add-item": "Added item",
    "remove-item": "Removed item",
    "replace-logo": "Logo replaced", // NEW (E3c, 10.5)
    move: "Position",
    resize: "Size",
    rotate: "Turn",
    order: "Order",
    placement: "Position",
    slot: "Names and numbers",
    text: "Text",
    font: "Font",
    colour: "Colour",
    outline: "Outline",
    size: "Size",
    align: "Alignment",
    direction: "Direction",
    fallback: "Change",
  } satisfies Record<EditLabel | "fallback", string>,
  /**
   * The same, naming what changed (E3c, 10.5: "Undone: Body colour", "Logo position"), NEW: {item} is the part
   * of the kit or the item ("Body front", "Logo", "Team name"). A key not listed uses `changes`.
   */
  changesOf: {
    "zone-colour": "{item} colour",
    "shape-colour": "{item} colour",
    "add-item": "{item} added",
    "remove-item": "{item} removed",
    move: "{item} position",
    resize: "{item} size",
    rotate: "{item} turn",
    order: "{item} order",
    placement: "{item} position",
    text: "{item} text",
    font: "{item} font",
    colour: "{item} colour",
    outline: "{item} outline",
    size: "{item} size",
    align: "{item} alignment",
  } as Record<string, string>,
  /**
   * The "Where" chips: words for the products' placement presets, by preset id.
   * A preset not listed shows the product's own name for it.
   */
  presets: {
    "chest-centre": "Chest",
    "left-chest": "Left chest",
    "right-chest": "Right chest",
    "front-number": "Front",
    "upper-back": "Upper back",
    "back-name": "Above the number",
    "back-number": "Back",
    "lower-back": "Lower back",
    "sleeve-left": "Left sleeve",
    "sleeve-right": "Right sleeve",
  } as Record<string, string>,
  /** Accessible names and tooltips that say more than the chip (W-ED93c). */
  presetsLong: {
    "left-chest": "Left chest (wearer's left)",
    "right-chest": "Right chest (wearer's right)",
    "sleeve-left": "Left sleeve (wearer's left)",
    "sleeve-right": "Right sleeve (wearer's right)",
  } as Record<string, string>,
  /** Where an item is, in the stage's description ("on the chest"). */
  presetsPlace: {
    "chest-centre": "chest",
    "left-chest": "left chest",
    "right-chest": "right chest",
    "front-number": "front",
    "upper-back": "upper back",
    "back-name": "back",
    "back-number": "back",
    "lower-back": "lower back",
    "sleeve-left": "left sleeve",
    "sleeve-right": "right sleeve",
  } as Record<string, string>,
  /** The Colours chips for the templates' groups of shapes, by group id; an unknown group shows `other`. */
  shapeGroups: {
    hoops: "Hoops",
    stripes: "Stripes",
    sash: "Sash",
    chevron: "Chevron",
    band: "Band",
    line: "Line",
    panel: "Number panel",
    other: "Pattern",
  } as Record<string, string>,
};

export type EditorWording = typeof EDITOR_WORDING;

/** A partial set of wording a host passes to replace some of it. */
export type WordingOverrides = { [G in keyof EditorWording]?: Partial<EditorWording[G]> };

/** The wording with a host's replacements merged in, group by group. */
export function mergeWording(overrides?: WordingOverrides | null): EditorWording {
  if (!overrides) return EDITOR_WORDING;
  const out = { ...EDITOR_WORDING } as Record<string, unknown>;
  for (const [group, values] of Object.entries(overrides)) {
    if (!values || !(group in EDITOR_WORDING)) continue;
    out[group] = { ...(EDITOR_WORDING as Record<string, object>)[group], ...values };
  }
  return out as EditorWording;
}

/** Fills `{name}` marks from `values`; a mark without a value is left as it is. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : whole));
}

/** The words for an undo step's label key ("zone-colour" → "Colour"); never the key itself. */
export function changeWords(wording: EditorWording, label: string | null | undefined): string {
  // A label may name what changed: "move|Logo" (E3c, 10.5).
  const [key, subject] = (label ?? "").split("|");
  const named = key && subject ? wording.changesOf[key] : undefined;
  if (named) return fill(named, { item: subject! });
  return (key && (wording.changes as Record<string, string>)[key]) || wording.changes.fallback;
}

/** The words for a placement preset: the wording's, else the product's own name for it. */
export function presetWords(wording: EditorWording, preset: { id: string; name: string }): { short: string; long: string; place: string } {
  const short = wording.presets[preset.id] ?? preset.name;
  return { short, long: wording.presetsLong[preset.id] ?? short, place: wording.presetsPlace[preset.id] ?? short.toLowerCase() };
}

/** The Colours chip for a group of shapes. */
export function shapeGroupWords(wording: EditorWording, group: string): string {
  return wording.shapeGroups[group] ?? wording.shapeGroups.other ?? group;
}
