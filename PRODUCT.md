# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user today: an X4: Foundations player planning their own in-game factories — the tool's author, using it against their own save. Confirmed future audience: other X4 players the author shares the tool with (friends, a multiplayer/community group) — this is file/repo sharing, not a hosted multi-tenant product, so no accounts or per-user server state are implied.

## Product Purpose

Helps X4: Foundations players decide what to build next. Visualizes a ware's full production chain down to raw materials, computes the module counts and per-hour resource rates needed to hit a target output, and lets the player enter the actual module counts of what they've already built. From those real counts it does two things: ranks unbuilt wares by how few new resource chains they'd need to add, and — the deeper feature — runs a supply-vs-demand pass across the player's whole entered production empire to surface bottlenecks (built consumers demanding more than built producers supply) and modules missing outright (demand with zero supply). Success means looking at the tool and immediately knowing both what to build next and what's currently starving in what's already built, without doing the chain math by hand or alt-tabbing to a wiki.

## Positioning

Unlike static production-chain reference charts (e.g. x4prodchart.com), this tool computes live demand propagation from a target output rate through the entire chain — correctly accumulating shared inputs across branches (e.g. Energy Cells feeding a dozen different nodes sums to one real total) — and cross-references the result against the player's own "already built" list to actively recommend the next cheapest factory to add. It's a planning tool, not just a reference chart.

## Operating Context

Used alongside an active X4: Foundations play session, most likely a second window or monitor while the game runs. Opened by double-clicking `index.html` directly — no dev server, no build step, no install, works fully offline. Ware, recipe, module and sector data (X4 9.00 game files, base game plus official DLC) is generated into `data/wares.js` by `tools/build_data.py`, not fetched live. The player's own empire is read from their save file in the browser.

## Capabilities and Constraints

- Save import: the player picks an X4 save (`.xml.gz` or plain `.xml`, 500 MB to 1 GB unpacked); `savegame.js` streams and scans it in the browser in a few seconds and nothing is uploaded. It reads every player-owned station's name, sector, production modules (with recipe and recorded efficiency), habitats and workforce. Imported built counts replace hand-entered ones; hand edits afterwards are layered on top until the next load.
- Gamification: estimated empire earnings per hour (value added at average prices) map to twenty playful levels, from Space Toddler to Super Mega Duper Huge Empire (level 10 is a billion credits per hour, level 20 a trillion), shown as a badge. It is deliberately a flattering estimate, not a credit forecast.

- Must keep working as a zero-install, double-clicked `file://` page — no server dependency for core functionality. This was an explicit, confirmed hard constraint.
- No network dependency at all: fonts (Red Hat Text / Red Hat Mono, OFL) are self-hosted in `fonts/` and icons are inlined, so the app is fully offline.
- The "My Factories" module counts persist in the browser's `localStorage` (key `x4-factories-planner:module-counts`), so they survive reloads and reopening the file. The top bar has Export and Import (a JSON file, so data can move between browsers or be shared) and a two-click Reset that wipes it. The open chain, target and panel state are saved too (key `x4-factories-planner:ui`). This reverses the tool's original session-only design — the user explicitly asked for persistence.
- No accounts, backend, or shared/multiplayer state today. Sharing with other players (see Users) currently means sharing the files themselves, not a hosted service — avoid decisions that would block adding that later, but don't build it preemptively.
- Every race recipe a player module can run is modelled (Teladi, Terran, Boron, Paranid, Split). Modules read from a save use their own recipe and the efficiency the game recorded; the chain planner plans with each ware's standard recipe.
- Module counts (and the bottleneck analysis built on them) only produce real supply numbers for wares with a batch size + cycle time on record. Whether a ware gets the checkbox-only "I have a source" treatment vs. a full editable module count is driven by `isMined` (true only for Ore, Silicon, Ice, Helium, Hydrogen, Methane, Raw Scrap — the wares actually gathered by mining/collection ships), not by tier and not by whether rate data exists. Energy Cells is `isMined: false` — it's a real built module (Solar Power Plant), it just has no fixed batch/cycle rate on record, so it gets full module-count tracking but is still excluded from bottleneck supply math the same way mined materials are (the checkbox is trusted as "covered" rather than computed).
- Data comes from the game files via `tools/build_data.py` (earlier versions used Roguey's X4 site, which matched on every shared ware). Nothing is taken from x4prodchart.com, which is closed-source ("all rights reserved").

## Evidence on Hand

- `data/wares.js` / `data/wares.json`: 59 wares with all player-buildable recipes, 61 production module macros mapped to ware and recipe, and 192 sectors with sunlight, generated from the 9.00 game files.
- `README.md` documents the data model, file layout, and known gaps (alternate recipe methods, no persistence, no module/build-cost info).
- No testimonials, pricing, or usage benchmarks exist for this project — none should be fabricated.

## Product Principles

1. Zero-friction launch beats every other convenience — double-click and it works, every time.
2. Real game numbers, not approximations — every rate, price, and recipe traces back to a cited data source.
3. Compute, don't just display — the tool's value is doing the chain-rate math and ranking suggestions, not presenting a static chart.
4. What the player enters about their own empire (module counts) should survive closing the tab — it's their data, not a scratch value.
5. Stay ready to become shareable later without being over-built for that now.

## Accessibility & Inclusion

No specific accessibility requirement has been established beyond standard web practice. Visible keyboard-focus rings exist across interactive controls, and ware rows, chain nodes, suggestion rows, chips, and detail input rows are all keyboard-operable (tabbable, `Enter`/`Space` activate them) as of the second `impeccable` design pass — the mouse-only gap noted after the first pass has been closed.
