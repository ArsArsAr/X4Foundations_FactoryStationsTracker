# X4 Factories Planner

A production-chain planner for **[X4: Foundations](https://www.egosoft.com/games/x4/info_en.html)**. Pick any ware and see its entire production chain unwound down to raw materials, sized for the output you want, next to what you have already built. A network view then tells you where your real production falls short and what to build next.

No install, no account, no server, no internet needed. Clone it, double-click `index.html`, and it runs in your browser.

> This is a fan-made tool, not affiliated with or endorsed by Egosoft.

## Why

X4's economy is a real dependency graph. Almost everything needs Energy Cells, most mid-tier goods need two or three refined inputs, and it is easy to lose track of what a new factory costs to feed once you are a dozen stations deep. This tool does the chain maths for you: give it a ware and a target, and it tells you how many modules of each upstream good you need, all the way down to what you should be mining.

## Three numbers, kept apart

The app deals in three different numbers, and the interface labels each one in words so they do not get mixed up:

| Number | Meaning | Scope |
|---|---|---|
| **Target** | The output the open chain is sized for. A what-if. | The open chain only |
| **Needed** | Modules and hourly rates that target implies for every input | The open chain only |
| **Built** | What you say you actually have. Saved in your browser. | Your whole network |

## Features

- **Production chains as a diagram.** Every input of a ware, tier by tier, down to raw materials. Columns are ordered so each ware sits near what it feeds, which keeps crossing lines to a minimum.
- **Target in modules or units per hour.** The two fields stay in sync. Opening a ware you have built sizes the chain for your built modules; **Use my N built** snaps back to that at any time.
- **Needed versus built on every node.** Each node states how many modules the target needs and how many you have, and flags a shortfall ("2 built, short 2").
- **Flow on hover.** Hover or focus a node to highlight its connections and see how much flows along each one per hour.
- **Track what you have built, from anywhere.** Tick a ware in the list for a quick "I produce this" (one module), type an exact count next to it, use the plus on a chain node, or the stepper in the details panel. Mined wares only have a tick, meaning "I have a source".
- **My network.** Supply and demand per hour across everything you have built, shortfalls first, each with a one-click fix that adds the missing modules. Also lists what to build next, ranked by how few new inputs it needs.
- **Export and import.** Save your built modules to a JSON file and load them on another machine or browser.
- **Details panel.** Price range, volume, storage class, cycle time, batch size, inputs per cycle and per hour, and where the ware is used.

## Getting started

1. Download or clone this repository.
2. Double-click `index.html`.

### Using it

1. **Find a ware** in the left list (press `/` to jump to search). Use **Built** to show only what you have marked.
2. **Click its name** to open its chain. Set the target at the top, in modules or per hour.
3. **Read a node:** the big number is the hourly rate the target needs, the line below says how many modules that takes and how many you have.
4. **Hover a node** to see what flows in and out of it. **Click a node** for full details (`Esc` closes them).
5. **Mark what you have built** with the tick and count in the list, or the plus and count on a node.
6. **Open My network** at the bottom for supply and demand across everything you have built, and for build suggestions.
7. **Export** saves your data to a file, **Import** loads it, **Reset** clears it (asks once more before it does).

## Data & credits

Ware and recipe data (prices, cycle times, batch sizes, production inputs, storage types) was sourced from [Roguey's X4 site](https://roguey.co.uk/x4/wares/), a community-maintained reference kept current with the live game patch. This project's code is an original implementation, not a copy or fork of any other X4 planning tool.

Fonts are [Red Hat Text and Red Hat Mono](https://github.com/RedHatOfficial/RedHatFont), bundled in `fonts/` under the SIL Open Font License (`fonts/OFL.txt`). Icons are from [Phosphor Icons](https://phosphoricons.com) (MIT).

## For developers

No build tooling. It is vanilla HTML/CSS/JS, kept that way on purpose so it always works by double-clicking the file.

**Files**

- `index.html` / `style.css`: layout and theme (design tokens at the top of `style.css`)
- `app.js`: all app logic. One `refresh()` re-renders every surface from `state` after any change.
- `data/wares.js`: the ware database (58 wares), loaded as a plain `<script>` tag so it works from a `file://` page with no fetch
- `data/wares.json`: the same data as plain JSON, the source of truth for tooling. If you edit it, regenerate `wares.js`:
  ```bash
  python3 -c "import json; d=json.load(open('data/wares.json',encoding='utf-8')); open('data/wares.js','w',encoding='utf-8').write('const WARES_DATA = '+json.dumps(d,indent=2)+';\n')"
  ```
- `fonts/`: self-hosted webfonts and their licence

**Data model** (one entry per ware in `wares.json`):

```jsonc
"refinedmetals": {
  "id": "refinedmetals",
  "label": "Refined Metals",
  "category": "Refined",       // Roguey's subtype grouping
  "price": { "min": 89, "avg": 148, "max": 207 },
  "volume": 14,
  "cycleTime": 150,             // seconds per production cycle
  "batchSize": 88,              // units produced per cycle
  "tier": 1,                    // computed: 1 + max(tier of inputs), tier 0 = no ware inputs
  "storageType": "Container",   // Solid, Liquid, or Container (X4's own storage classes)
  "isMined": false,             // true only for the 7 wares actually mined/harvested by ships
  "inputs": [
    { "wareID": "energycells", "amount": 90 },
    { "wareID": "ore", "amount": 240 }
  ]
}
```

Tier 0 (`inputs: []`) is not the same thing as "mined". Ore, Silicon, Ice, Helium, Hydrogen, Methane, and Raw Scrap are tier 0 *and* `isMined: true`. Energy Cells is also tier 0 (a Solar Power Plant needs no material inputs) but `isMined: false`: it is a real built module with no `cycleTime`/`batchSize` on record, because X4 generates it from sunlight rather than a fixed recipe. The UI uses `isMined`, not `tier`, to decide whether a ware gets a plain "I have a source" tick or a module count. Wares without a production rate cannot contribute a supply number, so in the network view their tick counts as "covered".

**Saved data** lives in `localStorage` under `x4-factories-planner:module-counts` (built modules) and `x4-factories-planner:ui` (open chain, target, panel state). If storage is unavailable the app still works, it just does not remember.

**Caching note**: if you edit `index.html`, `style.css`, or `app.js` and a reload does not pick up the change, your browser is serving a cached copy. Bump the `?v=15` query string on the `<link>`/`<script>` tags in `index.html` to the next number.

## Known limitations

- **No alternate recipes.** X4 has multiple production *methods* for some wares (e.g. Teladi vs. Universal), each with different inputs. This build models one canonical recipe per ware. To add methods, change `inputs` on a ware to `methods: [{ name, race, inputs }]` and update `computeChain()` in `app.js` to pick a method per ware.
- **No station module info** (build cost, workforce, race requirements).
- **Built for a desktop window.** Narrow windows still work (panels overlay or scroll), but it is not a phone layout.

## Contributing

Issues and pull requests are welcome. This is a small, dependency-free codebase, so most changes should be straightforward to review.
