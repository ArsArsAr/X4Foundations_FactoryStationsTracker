# X4 Factories Planner

A production-chain planner and empire dashboard for **[X4: Foundations](https://www.egosoft.com/games/x4/info_en.html)**. Load your save and it reads every station you own: modules, race recipes, sunlight, workforce, stock and trade prices. It shows what needs fixing, roughly what each station earns, how your prices compare with the NPC market in your own universe, and ranks your empire from Space Toddler upwards. It also plans any production chain down to raw materials next to what you already have.

**Use it online: [arsarsar.github.io/X4Foundations_FactoryStationsTracker](https://arsarsar.github.io/X4Foundations_FactoryStationsTracker/)**

Or run it offline: no install, no account, no server. Download or clone the repository, double-click `index.html`, and it runs in your browser.

Either way your save is read inside your own browser and never uploaded anywhere.

> This is a fan-made tool, not affiliated with or endorsed by Egosoft.

## Why

X4's economy is a real dependency graph. Almost everything needs Energy Cells, most mid-tier goods need two or three refined inputs, and it is easy to lose track of what a new factory costs to feed once you are a dozen stations deep. This tool does the chain maths for you and reads your real empire straight from the save, so you never have to type in module counts by hand.

## Features

- **Load your save.** Pick a save file and every player-owned station is read in a few seconds: name, sector, production modules, the race recipe each module runs, its real efficiency (sunlight and workforce included), and the station's workforce. The file is read on your computer and never uploaded.
- **Do these first.** The Overview ranks the few changes worth most per hour across every tab: habitats, miners, missing modules, trade prices, supplying your own stations, idle ships and hub haulers, each with a button to the right place. Next to it, the estimated earnings and what your empire actually earned from trades sit side by side.
- **Search (Ctrl+K).** Jump to any tab, ware, station, mission or ship by typing.
- **Needs attention.** What is going wrong right now, grouped by cause: modules idle because their output has no room left (and wares that pile up at one station while another waits for them), a mining shortfall with the stations it stalls, low stock, nearly full storage, stations short of workers (with what full staff would add after feeding them). Open a cause to see its stations and jump to one.
- **Mining coverage.** From the trade log in your save (roughly the last game day), how much of each ore, gas and ice your stations use, how much your miners actually delivered, what you bought from NPCs, how many modules are stalled for it, and how many more miners would close the gap, per ship size ("about 18 L or 44 M"), measured from what your own miners of each size deliver.
- **Bought and sold at the same time.** Wares your empire sells to NPCs while also buying them back from NPCs, at the real prices in the log, and what supplying your own stations first would keep.
- **Logistics and distribution hubs.** A hub is your own station that stores wares and passes them on, so traders can be assigned to one hub instead of to every factory. Hubs are found automatically (no production, storage, traffic in the log, or a name like "Distro" or "Hub"), and you can track any station. Each hub shows what comes in and goes out per hour, stock and how long it lasts, how fast storage fills, where it gets wares and where it delivers, how many of your miners and traders work for it, and what to fix: stock your factories are stalled for, storage about to fill, wares with no sell offer. **Who runs your transport** shows which stations still run their own traders although a hub already moves their wares. **Deliveries between your stations** lists every route your ships run. Routes come from following each of your ships in the trade log, from where it loaded a ware to where it delivered it.
- **Missions.** Every mission you are on, with how far along it is (the step you are on, a checklist of done and upcoming steps, reward and briefing), story threads with their open sub-missions, station and ship upkeep tasks grouped by kind, the missions on offer (rewards, guild missions, faction war contracts, projects, tutorials left), and a log of what you have done, newest first.
- **Blueprints.** Which of the game's 1,395 player blueprints you own and which you are missing, by category (station modules, ships, equipment, equipment mods, paint jobs, clothing), with the factions that sell each missing one. "Worth getting" points out missing production modules for wares your stations need. Filter by name, type, DLC or faction.
- **What your market wants.** Wares NPC stations in your universe want more of than anyone has for sale, ranked by what one module would earn at local prices, with the inputs you do not make yet and the payback time.
- **Price check.** Your stations' buy and sell prices next to every NPC buyer and seller in your save, per ware. It points out where you undercut everyone and could ask more, where you overpay, and where you are priced out, with the gain per hour. It uses your universe's economy, not wiki averages.
- **What-if plan.** Add or remove modules on any station and see the change in earnings, the build cost, how long it takes to pay for itself, which wares would fall short, and whether it gets you to the next level.
- **Earnings over time.** Every save you load adds a point to a chart, with the change since the save before.
- **Empire level.** Your estimated earnings per hour put you on one of twenty levels, from **Space Toddler** to **Super Mega Duper Huge Empire** (a trillion credits per hour), with progress to the next one. Every level has its own badge: iron, bronze, silver, gold and platinum frames with a level icon, and a gold crown on level 20. Your badge sits in the top bar, and the Empire view shows the ladder. Levels you have not reached stay locked, so each new badge is a surprise, and crossing one plays a small level-up reveal. Fifteen **achievements** (First Brick, Megafactory, Cash Cow, Billionaire and more) sit next to the ladder. **Share card** makes a PNG of your badge, earnings and top stations for Reddit or Discord.
- **Actual earnings.** Next to the estimates, what really happened in the save's trade log: credits your empire took from and paid to NPC stations per hour, and each station's own books (sales minus purchases at real prices). Stations that build ships are marked, because ship sales are not in the trade log.
- **Trade rules.** Stations and wares you set to trade only with your own faction are tagged "yours only". Price tips skip them, since NPC prices do not apply there. Wares locked to your ships that no station of yours uses or sells on are flagged as dead ends. Rules are judged by their factions list, never by their name, so they work however you named them.
- **Why modules sit idle.** When a module has no room for its output, the app follows the ware in the trade log to whoever collects it and says what is wrong there: the hub is full, the hub is at its stock limit for that ware, it has no buy offer, or its ships cannot keep up. This works with a central hub, ships assigned per station, or plain NPC trade.
- **Ships.** Every freighter and mining ship's standing order checked against what it did in the trade log: ships idle on Wait or with no order, ships on a trade or mining order that made no trades, ships that went quiet for hours, and miners on a well covered ware while another of the same kind runs short.
- **Per-station earnings.** Every station with its estimated value per hour, at average prices and at its own trade prices. Open one to see each module group (count, efficiency, output, value), what it ships in and out, how long its stock lasts, and how full its storage is.
- **Production chains that know your save.** Mined wares your miners deliver show how much arrives per hour, and chain nodes show how many of your modules are stalled.
- **Production chains as a diagram.** Every input of a ware, tier by tier, down to raw materials, sized for the output you want, in modules or units per hour. Each node shows modules needed versus built and flags shortfalls. Hover a node to see how much flows along each connection.
- **Race recipes and sunlight.** Teladi Hull Parts, Terran Energy Cells and the other race variants use their own inputs and yields wherever your save says they are in use. In the planner you can pick a race's recipes for a whole chain, and the sector your solar plants sit in (sunlight comes from the game files).
- **Build costs.** The chain shows what its modules cost, what is still missing, and how long the chain takes to pay for itself. Next-build suggestions show their start-up cost too.
- **My network.** Supply and demand per hour across everything you have built, shortfalls first, each with a one-click fix. Also suggests what to build next, ranked by how few new inputs it needs.
- **Manual mode still works.** Without a save you can tick wares and enter module counts by hand, and export or import them as a JSON file.

## Getting started

1. Open the [online version](https://arsarsar.github.io/X4Foundations_FactoryStationsTracker/), or download this repository and double-click `index.html`.
3. Click **Load save** and pick your newest save, or choose **Use my save folder** once (Chrome and Edge) so that later loads always take the newest save in one click. On Windows saves live in `Documents\Egosoft\X4\<number>\save`, for example `quicksave.xml.gz`. On Linux they are in `~/.config/EgoSoft/X4/<number>/save`.

### Using it

- **Empire** (top bar) has eight tabs. **Overview**: level, earnings, what needs attention, earnings over time. **Stations**: every station; open one to see its detail and use the plus and minus buttons to plan changes. **Supply**: mining coverage and wares you buy and sell at the same time. **Logistics**: distribution hubs, who runs your transport, ships that are idle or stuck, and the routes between your stations. **Market**: what NPCs are short of, and your prices against theirs. **Missions**: in progress, on offer and done. **Blueprints**: owned and missing. **Rewards**: levels and achievements.
- **Planner**: find a ware in the left list (press `/` to search), click its name, and set a target. Each node shows the hourly rate needed and the modules needed versus built.
- **Click any node or ware** for full details (`Esc` closes them). From the details panel, **Plan this chain** opens it in the Planner.
- **Keys:** `Ctrl+K` searches everything, `/` searches wares (or filters stations in the Empire view), `1` to `8` switch Empire tabs.
- **Stations** can be sorted by any column and filtered by name, sector or ware. Hover a dotted column title for what it means. The what-if plan is kept until you clear it or load a new save.
- **My network** (bottom): supply and demand across everything you have built.
- Load a newer save whenever you have played more. Built counts you change by hand afterwards are kept on top of the save until the next load.

### How earnings are estimated

Each module's value is what it makes per hour at the ware's average price, minus what it uses per hour at the inputs' average prices. Stations with habitats also pay for what their workers eat (food and medical supplies, by race; employed workers eat more than idle ones). A station's figure is the sum of its modules, and the empire figure is the sum of everything you have built. It assumes everything sells and every input is bought at average price. That makes it a good way to compare stations and track growth, not an exact credit forecast. Your level always uses this figure, so it does not jump around with prices.

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
- `savegame.js`: the save reader. It streams and unpacks the gzipped save and scans it line by line, because saves are 500 MB to 1 GB of XML. It reads player stations (modules, production state, shortages, workforce by race, cargo, trade offers, manual prices), player ships, the economy log of completed trades, and a summary of every NPC trade offer. It also runs in Node for testing.
- `data/wares.js`: generated data, loaded as a plain `<script>` so it works from a `file://` page: `WARES_DATA`, `MODULE_MACROS` (module macro to ware, recipe, workforce and build cost), `FACTION_TEXT` (faction names the logbook refers to), `BLUEPRINTS` (every blueprint a player can own, with category, DLC, price, the factions that sell it and, for production modules, the ware it makes), `SECTORS` (name and sunlight), `HABITATS` (worker capacity) and `STORAGE` (capacity by storage type) and `WORKFORCE` (what workers of each race eat per hour)
- `data/wares.json`: the same data as plain JSON
- `tools/build_data.py`, `tools/x4cat.py`: regenerate the data from your own install after a game patch:
  ```bash
  X4_GAME_DIR="D:/SteamLibrary/steamapps/common/X4 Foundations" python tools/build_data.py
  ```
- `fonts/`: self-hosted webfonts and their licence
- `tests/`: automated tests, run with Node's built-in test runner (nothing to install):
  ```bash
  node --test "tests/*.test.js"
  ```
  `savegame.test.js` reads a small hand-written save with every element the app uses; `logic.test.js` loads the real app scripts into a sandbox and checks the chain maths, levels, worker upkeep, ship roles, route tracing, actual earnings, own-price earnings and mission progress against the real game data.

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

**Saved data** lives in `localStorage`: `x4-factories-planner:module-counts` (built modules), `x4-factories-planner:empire` (stations and market summary from the last save), `x4-factories-planner:history` (earnings per loaded save), `x4-factories-planner:progress` (highest level and achievements earned), `x4-factories-planner:plan` (the what-if plan), `x4-factories-planner:hubs` (stations you track or untrack as hubs) and `x4-factories-planner:ui` (open chain, target, view, chain options). The remembered save folder is kept in IndexedDB. If storage is unavailable the app still works, it just does not remember.

**Caching note**: if you edit the app's files and a reload does not pick up the change, bump the `?v=40` query string on the `<link>`/`<script>` tags in `index.html`.

## Known limitations

- **Prices are a snapshot.** The price check and own-price earnings use the offers in the save at the moment it was written. Stations on automatic pricing move their prices with their stock.
- **Mission progress is by step.** X4 stores which step of a mission you are on, not counts inside a step (such as 12 of 21 delivered), so the tracker shows "step 3 of 4". The done list comes from the logbook, which X4 trims over a long game.
- **Ships are sorted by their standing order, not their hull.** Only mining ships can carry ore and gas, so mining ships set to trade (TradeRoutine) count as traders that haul raw materials, and only ships on MiningRoutine count as mining.
- **Routes and ship homes are read from behaviour.** X4 keeps ship assignments in script state, so a ship's home is the station it traded with most in the trade log, and a route is matched from a ship's loads to its deliveries (oldest load first). Loads made before the log starts show as "earlier loads". "Needed" assumes every module runs.
- **Scrap recyclers are not modelled.** They have no fixed recipe, so a save import skips them and says so.
- **Earnings are estimates** at average prices (see above). Hand-entered modules count at 100% efficiency; modules from a save use the efficiency the game recorded.
- **Built for a desktop window.** Narrow windows still work, but it is not a phone layout.

## Privacy and security

- **Nothing leaves your computer.** The app has no server, no accounts, no analytics and no network requests. Save files are unpacked and read in your browser; nothing is uploaded, including on the online version.
- **What it remembers** stays in your browser's storage for this site (see "Saved data" above). Reset clears built modules; your browser's site settings clear everything.
- **Save files are treated as untrusted.** A save can be edited by anyone, so every piece of text taken from one (station, ship and mission names, factions and so on) is escaped before it is shown, names that could tamper with JavaScript objects are rejected while reading, and the lookup tables have no built-in properties a save could reach. The tests in `tests/` include crafted-save cases for this.
- **No third-party code.** No libraries, no CDN, no external fonts: everything the page runs is in this repository.

## License

The code is released under the [MIT License](LICENSE). Game data and names belong to Egosoft; the fonts are under the SIL Open Font License (`fonts/OFL.txt`).

## Contributing

Issues and pull requests are welcome. This is a small, dependency-free codebase, so most changes should be straightforward to review.
