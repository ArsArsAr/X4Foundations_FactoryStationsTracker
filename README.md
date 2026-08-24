# X4 Factories Planner

A production-chain planner for **[X4: Foundations](https://www.egosoft.com/games/x4/info_en.html)**. Pick any ware and see its entire production chain unwound down to raw materials, with the module counts and per-hour resource rates you'd actually need to hit a target output — plus a running tracker for what you've already built, where your production is falling short, and what to build next.

No install, no account, no server. Clone it, double-click `index.html`, and it's running in your browser.

> This is a fan-made tool, not affiliated with or endorsed by Egosoft.

## Why

X4's economy is a real dependency graph — almost everything needs Energy Cells, most mid-tier goods need two or three refined inputs, and it's easy to lose track of what a new factory actually costs to feed once you're a dozen stations deep. This tool does the chain math for you: give it a ware and a target rate, and it tells you exactly how many modules of each upstream good you need, all the way down to what you should be mining.

## Features

- **Full production chains** — select any ware and see every input it depends on, tier by tier, down to raw materials, connected as a diagram.
- **Live rate math** — set a target output (units/hour, or "1 module") and every node in the chain shows the module count and resource rate needed to actually hit it, correctly combining shared inputs (e.g. Energy Cells feeding a dozen different nodes sums to one real total instead of being double-counted).
- **Track what you've built** — tick a checkbox for a quick "I produce this," or enter an exact module count for precision. Saved locally in your browser, so it's still there next time you open the app.
- **Bottleneck detection** — a real supply-vs-demand pass across everything you've entered: for every ware your built modules consume, it compares what your built producers actually make against what your built consumers need, and lists every shortfall, worst first, with how many more modules would close the gap.
- **Suggested next build** — ranks every ware you *haven't* built by how many resources its full chain still needs that you don't already produce (raw materials included), so you can always see the cheapest next factory to add.
- **Storage type, prices, cycle times** — every ware card shows its storage class (Solid / Liquid / Container), average price, batch size, and cycle time, sourced from current-patch game data.

## Getting started

1. Download or clone this repository.
2. Double-click `index.html`. That's it — it opens in your default browser with no server or build step required.

### Using it

1. **Browse or search** for a ware in the left sidebar, grouped by tier (Raw Materials, Tier 1, Tier 2, Tier 3).
2. **Click a ware's name** to see its full production chain in the main panel. Set a target output rate at the top (or hit **1 module** to size the chain for exactly one production module of that ware).
3. **Click any node** in the chain to see its full detail panel — price, volume, cycle time, and what it's used to make.
4. **Mark what you've actually built**: tick the checkbox next to a ware in the sidebar for a quick "I produce this," or type an exact module count if you want precise bottleneck math. Raw materials get a checkbox too (no quantity — just "I have a source for this").
5. Open the **My Factories** drawer at the bottom of the page to see:
   - Everything you've marked as built, as removable chips.
   - **Bottlenecks** — where your built consumers need more than your built producers make.
   - **Suggested next build** — the ware that would add the fewest new, not-yet-produced resources to your empire.
6. Use **Clear all data** in the drawer header if you want to wipe your saved progress and start over.

## Data & credits

Ware and recipe data (prices, cycle times, batch sizes, production inputs, storage types) was sourced from [Roguey's X4 site](https://roguey.co.uk/x4/wares/), a community-maintained reference kept current with the live game patch. This project's code is an original implementation — it is not a copy or fork of any other X4 planning tool.

## For developers

No build tooling — it's vanilla HTML/CSS/JS, kept that way on purpose so it always "just works" by double-clicking the file.

**Files**

- `index.html` / `style.css` — layout and theme
- `app.js` — all app logic: sidebar, chain-rate math, SVG connector drawing, details panel, bottleneck/suggestion ranking
- `data/wares.js` — the ware database (58 wares: 8 raw + 12/21/17 across tiers 1–3), loaded as a plain `<script>` tag so it works from a double-clicked `file://` page with no CORS/fetch issues
- `data/wares.json` — the same data as plain JSON, kept as the source of truth for tooling. If you edit the data, edit this file, then regenerate `wares.js`:
  ```bash
  python3 -c "import json; d=json.load(open('data/wares.json',encoding='utf-8')); open('data/wares.js','w',encoding='utf-8').write('const WARES_DATA = '+json.dumps(d,indent=2)+';\n')"
  ```

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
  "tier": 1,                    // computed: 1 + max(tier of inputs), raw = 0
  "storageType": "Container",   // Solid, Liquid, or Container (X4's own storage classes)
  "inputs": [
    { "wareID": "energycells", "amount": 90 },
    { "wareID": "ore", "amount": 240 }
  ]
}
```

Raw materials (`tier: 0`) have `inputs: []`, `cycleTime: 0`, `batchSize: 0` — they're mined/harvested, not produced in a module.

**Caching note**: if you edit `index.html`, `style.css`, or `app.js` and a browser reload doesn't seem to pick up the change, your browser is serving a cached copy — bump the `?v=8` query string on the `<link>`/`<script>` tags at the bottom of `index.html` to the next number to force a fresh fetch.

## Known limitations

- **No alternate recipes.** X4 has multiple production *methods* for some wares (e.g. Teladi vs. Universal), each with different inputs. This build models one canonical recipe per ware. To add methods, change `inputs` on a ware to `methods: [{ name, race, inputs }]` and update `computeChain()` in `app.js` to pick a method per ware (a `<select>` on the node card would work well).
- **No station module info** (build cost, workforce, race requirements). Roguey's site has this per-module if you want to pull it in.

## Contributing

Issues and pull requests are welcome — this is a small, dependency-free codebase, so most changes should be straightforward to review.
