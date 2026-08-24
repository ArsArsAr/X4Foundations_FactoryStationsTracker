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

Used alongside an active X4: Foundations play session, most likely a second window or monitor while the game runs. Opened by double-clicking `index.html` directly — no dev server, no build step, no install, works fully offline. Ware/recipe data (58 wares, current-patch numbers) is baked into `data/wares.js` at build time, not fetched live.

## Capabilities and Constraints

- Must keep working as a zero-install, double-clicked `file://` page — no server dependency for core functionality. This was an explicit, confirmed hard constraint.
- The only network dependency is optional: Google Fonts (Space Grotesk) loads if online and falls back cleanly to system fonts if not — never a hard requirement.
- The "My Factories" module counts persist in the browser's `localStorage` (key `x4-factories-planner:module-counts`), so they survive reloads and reopening the file. A "Clear all data" button in the drawer header wipes it (behind a confirmation). This reverses the tool's original session-only design — the user explicitly asked for persistence.
- No accounts, backend, or shared/multiplayer state today. Sharing with other players (see Users) currently means sharing the files themselves, not a hosted service — avoid decisions that would block adding that later, but don't build it preemptively.
- Only one canonical recipe is modeled per ware; X4's alternate production methods (e.g. Teladi vs. Universal variants) aren't represented yet.
- Module counts (and the bottleneck analysis built on them) only produce real supply numbers for wares with a batch size + cycle time on record. Whether a ware gets the checkbox-only "I have a source" treatment vs. a full editable module count is driven by `isMined` (true only for Ore, Silicon, Ice, Helium, Hydrogen, Methane, Raw Scrap — the wares actually gathered by mining/collection ships), not by tier and not by whether rate data exists. Energy Cells is `isMined: false` — it's a real built module (Solar Power Plant), it just has no fixed batch/cycle rate on record, so it gets full module-count tracking but is still excluded from bottleneck supply math the same way mined materials are (the checkbox is trusted as "covered" rather than computed).
- Ware/recipe data is sourced from Roguey's X4 site (a community reference), not scraped from x4prodchart.com's code — that site is closed-source ("all rights reserved").

## Evidence on Hand

- `data/wares.js` / `data/wares.json`: 58 wares (8 raw + 12/21/17 across tiers 1–3) with price, volume, cycle time, batch size, and inputs, sourced from https://roguey.co.uk/x4/wares/.
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
