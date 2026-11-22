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
import type { ProblemCode, RosterNote } from "@fitmyoutfit/team-rules";
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
    colours: "Every part of the kit has its own row of colours: tap a colour to use it. You can also tap a part on the kit.", // CHANGED (E3f)
    team: "Your team name is printed the same on every shirt. Choose where it goes and how it looks.",
    players: "Add each player's name, number and size. The shirt shows the player you are on.",
    logos: "Add your crest or a sponsor's logo. A PNG with a transparent background prints best.",
    text: "Add a motto, a sponsor's name or a year. It is printed the same on every shirt.",
  },
  /** Start card (`start`), the first open of a new design. */
  start: {
    title: "Let's make your team's kit", // W-ED20
    colours: "Your team colours", // W-ED21, CHANGED (E3f): each colour is a heading with its swatches
    name: "Team name", // W-ED22
    namePlaceholder: "e.g. Lahore Lions", // W-ED22b
    seeDesigns: "See designs in your colours", // W-ED23
    skip: "Skip: start from this design", // W-ED24
    later: "You can change everything later.", // W-ED25
    allColours: "All colours", // W-ED44
    clearSlot: "Remove {role}", // NEW: accessible name of a filled colour slot
    emptySlot: "{role}: not chosen", // NEW
    skipLater: "Skip for now: you can change everything later", // NEW (E3d, R5): the skip line and the reassurance in one line
    pickedAs: "{colour}, {role}", // NEW (E3d, R5): a picked swatch's accessible name ("Red, Main"); tap again to remove
    pickedRole: "{role}: {colour}", // NEW (E3d, R5): one pick in the line under the swatches ("Main: Red")
    pickedJoin: " · ", // NEW (E3d, R5): between the picks in that line
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
    swapShort: "Swap", // NEW (E3d, R21): the swap chip's visible word (its accessible name stays "Swap main and second")
    tapKit: "You can also tap a part of the kit to change its colour.", // W-ED47, CHANGED (E3f)
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
    roleHeading: { main: "Main colour", second: "Second colour", accent: "Accent colour" }, // NEW (E3f): the team colour rows' headings
    optional: "optional", // NEW (E3f): after "Accent colour"
    none: "None", // NEW (E3f): no accent colour
    usedAs: "{colour}, already used for {role}", // NEW (E3f): a dimmed swatch's name; the same colour is never in two rows
    fewer: "Fewer colours", // NEW (E3f): closes a row's "All colours"
    addAccentColour: "Add an accent colour", // NEW (E3g): on the start card, the accent row is closed behind this line and opens in place
  },
  /** Team, players, text (`lettering`). */
  lettering: {
    letters: "Letters", // NEW (E4b, Q-TL2): the Style view's choice for names
    lettersUpper: "Capitals", // NEW (E4b)
    lettersTyped: "As typed", // NEW (E4b)
    lettersNote: "Arabic and Urdu names have no capitals: they print as typed.", // NEW (E4b)
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
  /**
   * The team list in the Players tab (`teamList`, docs/design/08-team-list.md section 15). The checks come from
   * `@fitmyoutfit/team-rules` as CODES; `problems` has the words for every code (a test reads the package's list).
   *
   * // DRAFT WORDING, founders to confirm. W-TL ids are the specification's; P marks a sentence that states a rule of sale.
   */
  teamList: {
    heading: { name: "Name", number: "No.", size: "Size", nameNotPrinted: "Name (not printed)" }, // W-TL3, W-TL73
    placeholder: { name: "Name", number: "No.", size: "Size" }, // W-TL3
    listName: "Team list, {n} players", // 13.8
    lineName: "Player {i} of {n}: {name}, {number}, {size}", // W-TL28
    noNameYet: "no name yet", // 13.8
    noNumberYet: "no number yet", // 13.8
    noSizeYet: "no size yet", // W-TL28
    fieldName: "Name, player {i}", // 13.8
    fieldNumber: "Number, player {i}", // 13.8
    fieldSize: "Size, player {i}", // 13.8
    empty: { title: "No players yet", body: "Add each player's name, number and size, or paste the list you already have.", add: "Add a player" }, // W-TL4, W-TL5, W-TL6
    addPlayer: "Add a player", // W-TL6
    style: "Style", // W-TL2
    styleLong: "Name and number style", // W-TL7
    sort: "Sort", // W-TL2
    sortBy: { number: "By number", name: "By name", size: "By size", entered: "As entered" }, // W-TL18
    sortedBy: { number: "Sorted by number", name: "Sorted by name", size: "Sorted by size", entered: "Back in the order you entered" }, // W-TL18
    players: "{n} players", // W-TL10
    onePlayer: "1 player", // W-TL10
    toFix: "{k} to fix", // W-TL10
    allReady: "All ready", // W-TL13
    shortBar: "Player {i} of {n} · {k} to fix", // W-TL11
    shortBarReady: "Player {i} of {n} · All ready", // W-TL11
    summaryOpen: "Show the team summary", // NEW: the disclosure's accessible name
    summaryClose: "Hide the team summary", // NEW
    nextToFix: "Next to fix", // W-TL12
    nextToFixName: "Next line to fix, {k} left", // W-TL12
    onlyToFix: "Only lines to fix", // W-TL14b
    showing: "Showing {k} of {n}", // W-TL14
    showAll: "Show all", // W-TL14
    removed: "Removed {name}", // W-TL15 (the status line adds its Undo button)
    removedLine: "player {i}", // NEW: what a removed line is called when it has no name
    pieces: "{pieces} {noun}", // W-TL16
    piecesWith: "({name} has {count})", // W-TL16
    sizes: "Sizes", // W-TL17
    noSizeCount: "No size yet {n}", // W-TL17
    readyCount: "Ready {r}", // W-TL17
    toFixCount: "To fix {k}", // W-TL17
    limitReached: "You've reached {max} players, the most one list can hold.", // W-TL19
    minimum: "Orders to {region} need at least {minimum} {noun}. You have {pieces}: add {missing} more.", // W-TL20 P, copy from founders
    more: "More for {name}", // W-TL21
    moveUp: "Move up", // W-TL21
    moveDown: "Move down", // W-TL21
    remove: "Remove", // W-TL21
    countItem: "{count} of this shirt…", // W-TL75
    countName: "{count} of this shirt", // W-TL75
    countBadge: "×{count}", // W-TL75
    countLabel: "How many of this shirt", // NEW: the stepper
    countLess: "One less", // NEW
    countMore: "One more", // NEW
    done: "Done", // NEW: closes the line menu's stepper
    noNameItem: "No name on this shirt", // W-TL22
    noNumberItem: "No number on this shirt", // W-TL22
    tagNoName: "No name", // W-TL23
    tagNoNumber: "No number", // W-TL23
    sizeChart: "Size chart", // W-TL24
    sizesGroup: "Sizes", // W-TL25
    youth: "Youth", // W-TL25
    adult: "Adult", // W-TL25
    problemPrefix: "Problem:", // W-TL63 (hidden, for screen readers)
    unnamedPlayer: "player {i}", // NEW: a player with no name yet, in "Same number as player 3 (7)."
    /** The words for every code the rules package can return (a test reads the package's list). Beside the field or under the line. */
    problems: {
      "name-missing": "Needs a name", // W-TL50
      "number-missing": "Needs a number", // W-TL51
      "size-missing": "Needs a size", // W-TL52
      "number-not-digits": "Use digits only, from 0 to 99.", // W-TL53
      "number-too-long": "Use 1 or 2 digits, from 0 to 99.", // W-ED79
      "number-mixed-digits": "Use one kind of digits, not both.", // W-ED80
      "number-duplicate": "Same number as {name} ({number}).", // W-TL55
      "number-duplicate-two": "Same number as {name} and 1 other ({number}).", // W-TL55 (three lines on one number)
      "number-duplicate-many": "Same number as {name} and {k} others ({number}).", // W-TL55
      "number-taken-first-order": "This number is already taken in the team's signed list.", // NEW (a late player's add-on order, M2-3)
      "number-taken-add-on": "This number is already taken by another late player.", // NEW (a late player's add-on order, M2-3)
      "name-character": "Can't print “{character}”. Use letters, spaces, and - ' .", // W-TL56
      "name-digit": "Numbers go in the No. box, not in the name.", // W-TL57
      "name-too-long": "Too long for the back: about {k} letters too many. Initials help: {example}.", // W-TL59
      "size-unknown": "We don't make “{size}” in this {noun}. Sizes: {first} to {last}.", // W-TL62
      "quantity-range": "Choose from {min} to {max} of this shirt.", // NEW: the stepper cannot do this; the server checks it
      "list-too-long": "You've reached {max} players, the most one list can hold.", // W-TL19
    } satisfies Record<ProblemCode | "number-duplicate-two" | "number-duplicate-many" | "name-digit", string>,
    /** Notes that are not problems (6.1, 7.4). */
    notes: {
      "name-mixed-scripts": "Mixes two alphabets. Check it on the shirt.", // W-TL61
      "mixed-digit-systems": "Some numbers use 0‎–‎9 and some ٠‎–‎٩.", // W-TL71 (direction marks keep the digit ranges from flipping)
      smaller: "Prints smaller to fit.", // W-TL60
    } satisfies Record<RosterNote["code"] | "smaller", string>,
    digitsTo: { western: "Show all numbers as 0‎–‎9", "arabic-indic": "Show all numbers as ٠‎–‎٩" }, // W-TL70
    numbersOff: "Numbers are off on this design. The numbers you typed are kept and come back if you turn numbers on.", // W-TL72
    bySize: { addNames: "Add names for the bag labels", hideNames: "Hide the names", total: "Total {n}", sizeCount: "{size}: {count}", less: "One less {size}", more: "One more {size}", title: "How many of each size" }, // W-TL74
    skipEmpty: "An empty line was removed", // NEW (status)
    /** The signed list (11.3). DRAFT WORDING. */
    locked: {
      note: "Signed on {date}. Changing the list makes a new proof.", // W-TL87 P, copy from founders
      change: "Change the list", // W-TL88
    },
    /** Pasting a list and a CSV file (section 5, W-TL30 to W-TL44). DRAFT WORDING. */
    paste: {
      button: "Paste a list", // W-TL2
      back: "Back", // NEW: the paste view's way back
      title: "Paste your team list", // W-TL30
      body: "One player per line: name, number and size, in any order. From WhatsApp, Excel or Google Sheets.", // W-TL31
      examples: ["Ali Raza 10 M", "7, Bilal Ahmed, L", "محمد علی ٧ XL"], // W-TL31 (the placeholder's three example lines)
      boxName: "Your team list, one player per line", // NEW: the box's accessible name
      paste: "Paste", // W-TL32
      chooseFile: "Choose a file", // W-TL32
      editText: "Edit text", // W-TL32
      yourText: "Your text: {n} lines", // W-TL32
      yourTextOne: "Your text: 1 line", // W-TL32
      hold: "Press and hold in the box, then Paste.", // W-TL33
      read: "We read {n} players", // W-TL34
      readOne: "We read 1 player", // W-TL34
      readNone: "We couldn't read any players", // NEW
      needLook: "{k} need a look", // W-TL34
      needLookOne: "1 needs a look", // W-TL34
      notAdded: "Not added ({n})", // W-TL35
      add: "Add", // W-TL35
      addAsLine: "Add “{text}” as a line", // NEW: the accessible name of "Add" on a line that is not a player
      columns: "Used as column names: {names}", // W-TL35
      columnNames: { name: "Name", number: "No.", size: "Size", count: "Qty" }, // W-TL35 (Qty: NEW)
      addTo: "Add to the {n} players in the list", // W-TL36
      replace: "Replace the list", // W-TL36
      addN: "Add {n} players", // W-TL36
      addOne: "Add 1 player", // W-TL36
      replaceN: "Replace with {n} players", // W-TL36
      replaceOne: "Replace with 1 player", // W-TL36
      cancel: "Cancel", // W-TL36
      modeName: "What to do with the players", // NEW: the radio group's name
      twoNumbers: "Two numbers here: {a} and {b}. Type the shirt number.", // W-TL37
      twoSizes: "Two sizes here: {a} and {b}. Choose one.", // NEW: the reader's note
      twoCounts: "Two quantities here: {a} and {b}. Set how many in the line's menu.", // NEW
      countUnclear: "Couldn't read “{value}” as a quantity. It's set to 1.", // NEW
      notAPlayer: "Doesn't look like a player.", // W-TL38
      nothingToRead: "Nothing to read.", // W-TL39
      overLimit: "Only {fit} more players fit in the list. We'll add the first {fit}.", // W-TL40
      overLimitNone: "The list is full: no more players fit.", // NEW (W-TL40 with room for none)
      excelHint: "Excel file? Select the cells in Excel, copy, and paste them here.", // W-TL41
      fileUnreadable: "We can't read this file. In Excel choose Save As › CSV UTF-8, or copy the cells and paste them here.", // W-TL42
      fileTooBig: "This file is too big ({size}). The largest we read is {max}. Copy the cells and paste them here instead.", // NEW
      fileNotText: "This file isn't a text file. Save the list as CSV UTF-8, or copy the cells and paste them here.", // NEW
      fileEmpty: "This file has nothing in it to read.", // NEW
      fileRead: "Read {file}", // NEW (status)
      cut: "The text was longer than {max} characters, so only the first part was read. Add the rest in a second paste.", // NEW (G4): pasted or file text cut at the limit
      dropHere: "Drop a CSV file here", // NEW
      noSizeFound: "No size found. You can add it after.", // W-TL43
      noNumberFound: "No number found.", // W-TL43
      noNameFound: "No name found.", // W-TL43
      added: "Added {n} players", // W-TL44 (status)
      addedOne: "Added 1 player", // W-TL44
      empty: "—", // the sign for an empty field in a row
      noSizeRow: "no size", // NEW: what a screen reader says for an empty size
      noNumberRow: "no number", // NEW
      noNameRow: "no name", // NEW
      rowName: "{name}, {number}, {size}", // NEW: a row's accessible name
      listName: "Players we read", // NEW
      notAddedName: "Lines that are not players", // NEW
    },
    /** The player chip on the stage (7.2, W-TL27, W-ED170, W-ED171). DRAFT WORDING. */
    chip: {
      group: "Player on the shirt", // W-TL27
      previous: "Previous player: {name}", // W-TL27, W-ED170
      next: "Next player: {name}", // W-TL27, W-ED170
      previousNone: "Previous player", // NEW: the first line has none before it (inactive)
      nextNone: "Next player", // NEW: the last line has none after it (inactive)
      show: "{name}, number {number}, size {size}. Show in the team list.", // 7.2
      showSample: "Sample player: {name}, number {number}. Show the name and number style.", // NEW
      stepped: "Player {i} of {n}: {name}", // W-ED171 (status, polite)
      sample: "Sample", // W-ED72c
      samplePlayer: "PLAYER", // W-ED72b (the default sample name)
      noName: "No name", // W-TL23
      noNumber: "No number", // W-TL23
      noNumberName: "no number", // NEW (accessible name)
      noSizeName: "no size yet", // W-TL28
      unnamed: "Player {i}", // NEW (a line with no name yet)
      whole: "Show the whole shirt", // W-TL26
      closeUp: "Zoom to name and number", // W-TL26
      problem: "Has a problem to fix", // NEW (the chip's mark for a line with a problem, in words)
      spare: "Spare shirt", // NEW
      pageKeys: "Page Up and Page Down choose the previous and next player.", // 7.2 (the "?" help)
    },
    /** The Done panel's team section (11.2, W-TL80 to W-TL86). DRAFT WORDING. */
    doneSection: {
      title: "Team list", // W-TL80
      none: "No players yet", // W-TL80
      addPlayers: "Add players", // W-TL80
      show: "Show", // W-TL80
      showName: "Show the team list", // NEW: the button's accessible name
      players: "{players} · {pieces} · {state}", // 11.2: "18 players · 19 jerseys · 2 to fix"
      playersSame: "{players} · {state}", // when the pieces are the players
      note: "You can't order from here yet. Your design and team list are saved on this device.", // NEW, replaces W-TL82 and W-ED164: no date, no price (P, copy from founders)
      noteEmpty: "You can't order from here yet. Your design is saved on this device.", // NEW, replaces W-ED164 (P, copy from founders)
      addYourPlayers: "Add your players", // W-TL83 (the main button when the host needs a list to continue)
      fixLines: "Fix {k} lines", // W-TL84
      fixOne: "Fix 1 line", // W-TL84
      finishLater: "Save and finish later", // W-TL85
      addMore: "Add {missing} more players", // W-TL86
      addMoreOne: "Add 1 more player", // W-TL86
    },
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
    tooMany: "A kit can carry up to {count} logos. Remove one to add another.", // NEW (E3c): several files dropped at once, beyond the limit
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
    hint: "Drag to turn. Two fingers slide. Tap a part.", // W-ED116, CHANGED (E3f)
    hintPointer: "Drag to turn. Right-drag to slide. Click a part.", // W-ED116, CHANGED (E3f)
    onThisKit: "On this kit", // W-ED130
    onThisKitCount: "On this kit ({count})", // W-ED130 with the count
    onThisKitName: "On this kit, {count} items", // NEW: the button's accessible name (4.8)
    kitEmpty: "Nothing added yet. Add your team name, players or a logo.", // W-ED131
    fromDesign: "From the design", // W-ED132
    locked: "Locked", // W-ED132
    moreFor: "More for {item}", // NEW: a row's menu button (accessible name)
    needsLook: "Needs a look: {reason}", // NEW (E3d, R15): a warning badge on the model (its name and tooltip; a tap selects the item)
    covers: "This covers the {item}.", // NEW (E3d): the selected item lies over another one
    moveClear: "Move it clear", // NEW (E3d): the one-tap fix (moves it to the nearest free place, or makes it smaller)
    coversNoRoom: "There is no free place for it here. Make it smaller or move it by hand.", // NEW (E3e): it covers another item and no fix exists, so the button is not offered
    madeSmallerClear: "Made smaller so it no longer covers the {item}.", // NEW (E3e): the fix had to shrink the item instead of moving it
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
    continueBody: "We kept the kit you were working on, on this device.", // NEW (E3d, R40): DRAFT WORDING, founders to confirm
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
    teamOrdersSoon: "You can't order from here yet. Your design is saved on this device.", // W-ED164 P (copy from founders); NEW wording (E4b): no "soon", no date, no price
    keepDesigning: "Keep designing", // W-ED166
    close: "Close", // NEW: the Done panel's close button (accessible name)
    checksMany: "{count} things to check", // W-ED161
    checksOne: "1 thing to check", // W-ED161
    checksNone: "Nothing to check. Your kit looks ready.", // NEW
    checksNoneDesign: "Your design has nothing to check.", // NEW (G4, S4): said instead of checksNone while the team list has lines to fix or is short of the minimum: the design is fine, the kit is not ready yet
    show: "Show", // W-ED161
    checkLine: "{item}: {reason}", // NEW: one line of the summary ("Logo on the left chest: may print blurry at this size.")
    checkHardToRead: "hard to read on {colour}.", // NEW (W-ED85 in the summary)
    checkCovers: "covers the {item}.", // NEW (E3d): an item over another one ("covers the player name.")
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
    "list-name": "Name",
    "list-number": "Number",
    "list-size": "Size",
    "list-add": "Added a player",
    "list-remove": "Removed a player",
    "list-move": "Moved a player",
    "list-sort": "Sorted the list",
    "list-count": "Shirts for a player",
    "list-flag": "Name or number on a shirt",
    "list-digits": "Digits in numbers",
    "list-paste": "Pasted players",
    "letter-case": "Letters of names", // NEW (E4b)
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
    "list-name": "Name of {item}",
    "list-number": "Number of {item}",
    "list-size": "Size of {item}",
    "list-remove": "Removed {item}",
    "list-move": "Moved {item}",
    "list-count": "Shirts for {item}",
    "list-flag": "Name or number of {item}",
    "list-paste": "Pasted {item}", // W-TL44 ("Undone: Pasted 18 players")
    "letter-case": "Letters of names", // NEW (E4b)
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
