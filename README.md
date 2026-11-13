# X4 Factories Planner

A production-chain planner for **[X4: Foundations](https://www.egosoft.com/games/x4/info_en.html)**. Load your save and it reads every station you own, with each one's modules, race recipes, sunlight and workforce. It shows roughly what each station earns, ranks your empire from Space Toddler upwards, and plans any production chain down to raw materials next to what you already have.

No install, no account, no server, no internet needed. Clone it, double-click `index.html`, and it runs in your browser.

> This is a fan-made tool, not affiliated with or endorsed by Egosoft.

## Why

X4's economy is a real dependency graph. Almost everything needs Energy Cells, most mid-tier goods need two or three refined inputs, and it is easy to lose track of what a new factory costs to feed once you are a dozen stations deep. This tool does the chain maths for you and reads your real empire straight from the save, so you never have to type in module counts by hand.

## Features

- **Load your save.** Pick a save file and every player-owned station is read in a few seconds: name, sector, production modules, the race recipe each module runs, its real efficiency (sunlight and workforce included), and the station's workforce. The file is read on your computer and never uploaded.
- **Empire level.** Your estimated earnings per hour put you on one of twenty levels, from **Space Toddler** to **Super Mega Duper Huge Empire** (a trillion credits per hour), with progress to the next one. Every level has its own badge: iron, bronze, silver, gold and platinum frames with a level icon, and a gold crown on level 20. Your badge sits in the top bar, and the Empire view shows the whole ladder.
- **Per-station earnings.** The Empire view lists every station with its estimated value per hour. Open one to see each module group (count, efficiency, output, value) and what the station has to ship in and out.
- **Production chains as a diagram.** Every input of a ware, tier by tier, down to raw materials, sized for the output you want, in modules or units per hour. Each node shows modules needed versus built and flags shortfalls. Hover a node to see how much flows along each connection.
- **Race recipes.** Teladi Hull Parts, Terran Energy Cells and the other race variants use their own inputs and yields wherever your save says they are in use. The details panel lists every recipe.
- **Energy Cells with sunlight.** Solar output scales with each sector's sunlight, taken from the game files.
- **My network.** Supply and demand per hour across everything you have built, shortfalls first, each with a one-click fix. Also suggests what to build next, ranked by how few new inputs it needs.
- **Manual mode still works.** Without a save you can tick wares and enter module counts by hand, and export or import them as a JSON file.

## Getting started

1. Download or clone this repository.
2. Double-click `index.html`.
3. Click **Load save** and pick your newest save. On Windows saves live in `Documents\Egosoft\X4\<number>\save`, for example `quicksave.xml.gz`. On Linux they are in `~/.config/EgoSoft/X4/<number>/save`.

### Using it

- **Empire** (top bar): your level, estimated earnings, and every station. Click a station to open it.
- **Planner**: find a ware in the left list (press `/` to search), click its name, and set a target. Each node shows the hourly rate needed and the modules needed versus built.
- **Click any node or ware** for full details (`Esc` closes them).
- **My network** (bottom): supply and demand across everything you have built.
- Load a newer save whenever you have played more. Built counts you change by hand afterwards are kept on top of the save until the next load.

### How earnings are estimated

Each module's value is what it makes per hour at the ware's average price, minus what it uses per hour at the inputs' average prices. A station's figure is the sum of its modules, and the empire figure is the sum of everything you have built. It assumes everything sells and every input is bought at average price. That makes it a good way to compare stations and track growth, not an exact credit forecast.

## Data & credits

All ware, recipe, module and sector data is read from the X4: Foundations 9.00 game files (base game plus official DLC) by `tools/build_data.py`. Earlier versions used figures from [Roguey's X4 site](https://roguey.co.uk/x4/wares/), which matched the game files on every shared ware. This project's code is an original implementation, not a copy or fork of any other X4 tool.

Fonts are [Red Hat Text and Red Hat Mono](https://github.com/RedHatOfficial/RedHatFont), bundled in `fonts/` under the SIL Open Font License (`fonts/OFL.txt`). Icons, including the badge icons, are from [Phosphor Icons](https://phosphoricons.com) (MIT).

## For developers

No build tooling for the app. It is vanilla HTML/CSS/JS, kept that way on purpose so it always works by double-clicking the file.

**Files**

- `index.html` / `style.css`: layout and theme (design tokens at the top of `style.css`)
- `app.js`: all app logic. One `refresh()` re-renders every surface from `state` after any change.
- `badges.js`: draws the 20 level badges as SVG (tier, frame, icon, pips).
- `savegame.js`: the save reader. It streams and unpacks the gzipped save and scans it line by line, because saves are 500 MB to 1 GB of XML. It also runs in Node for testing.
- `data/wares.js`: generated data, loaded as a plain `<script>` so it works from a `file://` page: `WARES_DATA`, `MODULE_MACROS` (module macro to ware and recipe) and `SECTORS` (name and sunlight)
- `data/wares.json`: the same data as plain JSON
- `tools/build_data.py`, `tools/x4cat.py`: regenerate the data from your own install after a game patch:
  ```bash
  X4_GAME_DIR="D:/SteamLibrary/steamapps/common/X4 Foundations" python tools/build_data.py
  ```
- `fonts/`: self-hosted webfonts and their licence

**Data model** (one entry per ware):

```jsonc
"hullparts": {
  "id": "hullparts",
  "label": "Hull Parts",
  "category": "Hightech",
  "price": { "min": 146, "avg": 209, "max": 272 },
  "volume": 12,
  "storageType": "Container",   // Solid, Liquid, Container (X4's storage classes)
  "isMined": false,             // true only for wares gathered by ships
  "tier": 2,                    // 1 + max(tier of inputs); 0 = no ware inputs
  "recipes": {                  // every recipe a player module can run
    "default": { "time": 900, "amount": 294, "inputs": [...], "work": 0.37, "sunlight": false },
    "teladi":  { "time": 900, "amount": 294, "inputs": [...], "work": 0.37, "sunlight": false }
  },
  "mainMethod": "default",      // recipe the planner uses for chains
  "cycleTime": 900, "batchSize": 294, "inputs": [...]   // copy of the main recipe
}
```

Tier 0 is not the same thing as "mined". Energy Cells is tier 0 (a Solar Power Plant needs no material inputs) but is a real built module with a sunlight-scaled rate. The UI uses `isMined`, not `tier`, to decide whether a ware gets a plain "I have a source" tick or a module count.

**Saved data** lives in `localStorage`: `x4-factories-planner:module-counts` (built modules), `x4-factories-planner:empire` (stations read from the last save) and `x4-factories-planner:ui` (open chain, target, view). If storage is unavailable the app still works, it just does not remember.

**Caching note**: if you edit the app's files and a reload does not pick up the change, bump the `?v=20` query string on the `<link>`/`<script>` tags in `index.html`.

## Known limitations

- **Chains use the standard recipe.** Race recipes are applied to modules read from your save, but the chain diagram plans with each ware's standard recipe.
- **Scrap recyclers are not modelled.** They have no fixed recipe, so a save import skips them and says so.
- **Earnings are estimates** at average prices (see above). Hand-entered modules count at 100% efficiency; modules from a save use the efficiency the game recorded.
- **Built for a desktop window.** Narrow windows still work, but it is not a phone layout.

## Contributing

Issues and pull requests are welcome. This is a small, dependency-free codebase, so most changes should be straightforward to review.
