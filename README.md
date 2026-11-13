# X4 Factories Planner

A production-chain planner and empire dashboard for **[X4: Foundations](https://www.egosoft.com/games/x4/info_en.html)**. Load your save and it reads every station you own: modules, race recipes, sunlight, workforce, stock and trade prices. It shows what needs fixing, roughly what each station earns, how your prices compare with the NPC market in your own universe, and ranks your empire from Space Toddler upwards. It also plans any production chain down to raw materials next to what you already have.

No install, no account, no server, no internet needed. Clone it, double-click `index.html`, and it runs in your browser.

> This is a fan-made tool, not affiliated with or endorsed by Egosoft.

## Why

X4's economy is a real dependency graph. Almost everything needs Energy Cells, most mid-tier goods need two or three refined inputs, and it is easy to lose track of what a new factory costs to feed once you are a dozen stations deep. This tool does the chain maths for you and reads your real empire straight from the save, so you never have to type in module counts by hand.

## Features

- **Load your save.** Pick a save file and every player-owned station is read in a few seconds: name, sector, production modules, the race recipe each module runs, its real efficiency (sunlight and workforce included), and the station's workforce. The file is read on your computer and never uploaded.
- **Needs attention.** One list of what is going wrong right now: stalled modules and the inputs they wait for, stock that runs out within a few hours, storage that is nearly full, and stations short of workers (with what full staff would add). Click an entry to jump to the station.
- **Price check.** Your stations' buy and sell prices next to every NPC buyer and seller in your save, per ware. It points out where you undercut everyone and could ask more, where you overpay, and where you are priced out, with the gain per hour. It uses your universe's economy, not wiki averages.
- **What-if plan.** Add or remove modules on any station and see the change in earnings, the build cost, how long it takes to pay for itself, which wares would fall short, and whether it gets you to the next level.
- **Earnings over time.** Every save you load adds a point to a chart, with the change since the save before.
- **Empire level.** Your estimated earnings per hour put you on one of twenty levels, from **Space Toddler** to **Super Mega Duper Huge Empire** (a trillion credits per hour), with progress to the next one. Every level has its own badge: iron, bronze, silver, gold and platinum frames with a level icon, and a gold crown on level 20. Your badge sits in the top bar, and the Empire view shows the ladder. Levels you have not reached stay locked, so each new badge is a surprise, and crossing one plays a small level-up reveal. Fifteen **achievements** (First Brick, Megafactory, Cash Cow, Billionaire and more) sit next to the ladder. **Share card** makes a PNG of your badge, earnings and top stations for Reddit or Discord.
- **Per-station earnings.** Every station with its estimated value per hour, at average prices and at its own trade prices. Open one to see each module group (count, efficiency, output, value), what it ships in and out, how long its stock lasts, and how full its storage is.
- **Production chains as a diagram.** Every input of a ware, tier by tier, down to raw materials, sized for the output you want, in modules or units per hour. Each node shows modules needed versus built and flags shortfalls. Hover a node to see how much flows along each connection.
- **Race recipes and sunlight.** Teladi Hull Parts, Terran Energy Cells and the other race variants use their own inputs and yields wherever your save says they are in use. In the planner you can pick a race's recipes for a whole chain, and the sector your solar plants sit in (sunlight comes from the game files).
- **Build costs.** The chain shows what its modules cost, what is still missing, and how long the chain takes to pay for itself. Next-build suggestions show their start-up cost too.
- **My network.** Supply and demand per hour across everything you have built, shortfalls first, each with a one-click fix. Also suggests what to build next, ranked by how few new inputs it needs.
- **Manual mode still works.** Without a save you can tick wares and enter module counts by hand, and export or import them as a JSON file.

## Getting started

1. Download or clone this repository.
2. Double-click `index.html`.
3. Click **Load save** and pick your newest save. On Windows saves live in `Documents\Egosoft\X4\<number>\save`, for example `quicksave.xml.gz`. On Linux they are in `~/.config/EgoSoft/X4/<number>/save`.

### Using it

- **Empire** (top bar) has four tabs. **Overview**: level, earnings, what needs attention, earnings over time. **Stations**: every station; open one to see its detail and use the plus and minus buttons to plan changes. **Prices**: your prices against the NPC market. **Rewards**: levels and achievements.
- **Planner**: find a ware in the left list (press `/` to search), click its name, and set a target. Each node shows the hourly rate needed and the modules needed versus built.
- **Click any node or ware** for full details (`Esc` closes them).
- **My network** (bottom): supply and demand across everything you have built.
- Load a newer save whenever you have played more. Built counts you change by hand afterwards are kept on top of the save until the next load.

### How earnings are estimated

Each module's value is what it makes per hour at the ware's average price, minus what it uses per hour at the inputs' average prices. A station's figure is the sum of its modules, and the empire figure is the sum of everything you have built. It assumes everything sells and every input is bought at average price. That makes it a good way to compare stations and track growth, not an exact credit forecast. Your level always uses this figure, so it does not jump around with prices.

The **own prices** figure uses each station's trade offers from the save instead (or the price you set by hand). For the empire total, wares your stations pass to each other cancel out, since that is money moving between your own pockets. Only what leaves or enters your empire is counted.

## Data & credits

All ware, recipe, module and sector data is read from the X4: Foundations 9.00 game files (base game plus official DLC) by `tools/build_data.py`. Earlier versions used figures from [Roguey's X4 site](https://roguey.co.uk/x4/wares/), which matched the game files on every shared ware. This project's code is an original implementation, not a copy or fork of any other X4 tool.

Fonts are [Red Hat Text and Red Hat Mono](https://github.com/RedHatOfficial/RedHatFont), bundled in `fonts/` under the SIL Open Font License (`fonts/OFL.txt`). Icons, including the badge icons, are from [Phosphor Icons](https://phosphoricons.com) (MIT).

## For developers

No build tooling for the app. It is vanilla HTML/CSS/JS, kept that way on purpose so it always works by double-clicking the file.

**Files**

- `index.html` / `style.css`: layout and theme (design tokens at the top of `style.css`)
- `app.js`: planner logic, chain maths, persistence. One `refresh()` re-renders every surface from `state` after any change.
- `empire.js`: the Empire view: save import, attention list, stations and the what-if plan, price check, history, achievements, celebration and share card.
- `badges.js`: draws the 20 level badges and the achievement medals as SVG.
- `savegame.js`: the save reader. It streams and unpacks the gzipped save and scans it line by line, because saves are 500 MB to 1 GB of XML. It reads player stations (modules, production state, shortages, workforce, cargo, trade offers, manual prices) and a summary of every NPC trade offer. It also runs in Node for testing.
- `data/wares.js`: generated data, loaded as a plain `<script>` so it works from a `file://` page: `WARES_DATA`, `MODULE_MACROS` (module macro to ware, recipe, workforce and build cost), `SECTORS` (name and sunlight), `HABITATS` (worker capacity) and `STORAGE` (capacity by storage type)
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

**Saved data** lives in `localStorage`: `x4-factories-planner:module-counts` (built modules), `x4-factories-planner:empire` (stations and market summary from the last save), `x4-factories-planner:history` (earnings per loaded save), `x4-factories-planner:progress` (highest level and achievements earned) and `x4-factories-planner:ui` (open chain, target, view, chain options). If storage is unavailable the app still works, it just does not remember.

**Caching note**: if you edit the app's files and a reload does not pick up the change, bump the `?v=23` query string on the `<link>`/`<script>` tags in `index.html`.

## Known limitations

- **Prices are a snapshot.** The price check and own-price earnings use the offers in the save at the moment it was written. Stations on automatic pricing move their prices with their stock.
- **The what-if plan is not saved.** It lasts until you reload the page or load a save.
- **Scrap recyclers are not modelled.** They have no fixed recipe, so a save import skips them and says so.
- **Earnings are estimates** at average prices (see above). Hand-entered modules count at 100% efficiency; modules from a save use the efficiency the game recorded.
- **Built for a desktop window.** Narrow windows still work, but it is not a phone layout.

## Contributing

Issues and pull requests are welcome. This is a small, dependency-free codebase, so most changes should be straightforward to review.
