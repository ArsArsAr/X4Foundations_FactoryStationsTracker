"use strict";

/* ---------------------------------------------------------------------
   X4 Factories Planner

   Data model (data/wares.js): { [wareID]: {
     id, label, category, price:{min,avg,max}, volume, storageType,
     cycleTime (sec/cycle), batchSize (units/cycle), tier, isMined,
     inputs: [ {wareID, amount} ]   // amount consumed per production cycle
   }}

   Three separate numbers live in this app, and the UI keeps them apart:
     target  - what the open chain is sized for (a what-if, per chain)
     needed  - modules/rates that target implies for every input
     built   - what the player says they actually have (saved, global)
--------------------------------------------------------------------- */

const W = WARES_DATA;

const STORAGE_KEY = "x4-factories-planner:module-counts";
const UI_KEY = "x4-factories-planner:ui";

const TIER_LABELS = { 0: "Base resources", 1: "Tier 1", 2: "Tier 2", 3: "Tier 3", 4: "Tier 4" };
const QUICK_PICKS = ["hullparts", "claytronics", "advancedelectronics", "engineparts", "shieldcomponents", "turretcomponents"];

const state = {
  moduleCounts: new Map(), // wareID -> modules built (mined wares: 1 = "I have a source")
  selected: null,          // root ware of the open chain
  targetRate: 0,           // units/hour the open chain is sized for
  chain: null,             // { nodes, edges } of the open chain
  inspected: null,         // ware shown in the inspector, null = closed
  networkOpen: false,
  filter: "all",           // "all" | "built"
  query: "",
  collapsed: new Set(),    // collapsed sidebar tiers
};

/* Phosphor Icons (regular weight), MIT licence. Path data only. */
const ICON_PATHS = {
  x: "M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z",
  check: "M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z",
  "caret-down": "M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z",
  "magnifying-glass": "M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z",
  plus: "M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z",
  minus: "M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128Z",
  "download-simple": "M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,124.69V32a8,8,0,0,0-16,0v92.69L93.66,98.34a8,8,0,0,0-11.32,11.32Z",
  "upload-simple": "M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0ZM93.66,77.66,120,51.31V144a8,8,0,0,0,16,0V51.31l26.34,26.35a8,8,0,0,0,11.32-11.32l-40-40a8,8,0,0,0-11.32,0l-40,40A8,8,0,0,0,93.66,77.66Z",
  "arrow-right": "M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z",
  "arrow-counter-clockwise": "M224,128a96,96,0,0,1-94.71,96H128A95.38,95.38,0,0,1,62.1,197.8a8,8,0,0,1,11-11.63A80,80,0,1,0,71.43,71.39a3.07,3.07,0,0,1-.26.25L44.59,96H72a8,8,0,0,1,0,16H24a8,8,0,0,1-8-8V56a8,8,0,0,1,16,0V85.8L60.25,60A96,96,0,0,1,224,128Z",
};

function icon(name, size = 14) {
  return `<svg class="icon" viewBox="0 0 256 256" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="${ICON_PATHS[name]}"/></svg>`;
}

const $ = (id) => document.getElementById(id);

const els = {
  status: $("status"),
  exportData: $("export-data"),
  importData: $("import-data"),
  importFile: $("import-file"),
  clearData: $("clear-data"),
  clearDataLabel: $("clear-data-label"),
  search: $("search"),
  countAll: $("count-all"),
  countBuilt: $("count-built"),
  wareList: $("ware-list"),
  wareEmpty: $("ware-empty"),
  chainBar: $("chain-bar"),
  chainName: $("chain-name"),
  chainSub: $("chain-sub"),
  targetModulesWrap: $("target-modules-wrap"),
  targetModules: $("target-modules"),
  targetModulesUnit: $("target-modules-unit"),
  targetDec: $("target-dec"),
  targetInc: $("target-inc"),
  targetRate: $("target-rate"),
  targetMatch: $("target-match"),
  canvas: $("chain-canvas"),
  emptyState: $("empty-state"),
  quickPicks: $("quick-picks"),
  chainScroll: $("chain-scroll"),
  chainLines: $("chain-lines"),
  chainColumns: $("chain-columns"),
  details: $("details"),
  detailsContent: $("details-content"),
  network: $("network"),
  networkToggle: $("network-toggle"),
  networkSummary: $("network-summary"),
  networkBody: $("network-body"),
  builtList: $("built-list"),
  balanceList: $("balance-list"),
  suggestList: $("suggest-list"),
};

const sidebarRows = new Map(); // wareID -> { row, toggle, qty }
const sidebarCats = [];

/* ---------------------------------------------------------------------
   Small helpers
--------------------------------------------------------------------- */

function getCount(id) {
  return state.moduleCounts.get(id) || 0;
}

function isBuilt(id) {
  return getCount(id) > 0;
}

// units/hour one module makes; 0 when the ware has no fixed production rate
// (mined materials, and Energy Cells which X4 generates from sunlight)
function perModule(w) {
  return w.batchSize && w.cycleTime ? (w.batchSize * 3600) / w.cycleTime : 0;
}

function plural(n, word) {
  return n === 1 ? word : word + "s";
}

function fmtRate(n) {
  if (n >= 100) return Math.round(n).toLocaleString("en-US");
  if (n >= 10) return (Math.round(n * 10) / 10).toLocaleString("en-US");
  return (Math.round(n * 100) / 100).toLocaleString("en-US");
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m && s) return `${m}m ${s}s`;
  if (m) return `${m}m`;
  return `${s}s`;
}

function fmtPrice(n) {
  return `${n.toLocaleString("en-US")} Cr`;
}

function trimNumber(n) {
  return String(Math.round(n * 100) / 100);
}

let statusTimer = null;
function setStatus(text) {
  els.status.textContent = text;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (els.status.textContent = ""), 5000);
}

/* ---------------------------------------------------------------------
   Persistence. localStorage can throw (private browsing, some file://
   security modes); the app then simply runs without saving.
--------------------------------------------------------------------- */

function loadCounts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) applyCounts(JSON.parse(raw));
  } catch (e) {
    console.warn("Could not load saved module counts:", e);
  }
}

function applyCounts(obj) {
  let applied = 0;
  for (const [id, count] of Object.entries(obj || {})) {
    const n = Math.floor(Number(count));
    if (W[id] && n > 0) {
      state.moduleCounts.set(id, W[id].isMined ? 1 : n);
      applied++;
    }
  }
  return applied;
}

function saveCounts() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(state.moduleCounts)));
  } catch (e) {
    console.warn("Could not save module counts:", e);
  }
}

function loadUI() {
  try {
    const ui = JSON.parse(localStorage.getItem(UI_KEY) || "null");
    if (!ui) return null;
    state.networkOpen = !!ui.networkOpen;
    state.filter = ui.filter === "built" ? "built" : "all";
    state.collapsed = new Set(Array.isArray(ui.collapsed) ? ui.collapsed.map(Number) : []);
    return ui;
  } catch (e) {
    return null;
  }
}

function saveUI() {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify({
      selected: state.selected,
      targetRate: state.targetRate,
      networkOpen: state.networkOpen,
      filter: state.filter,
      collapsed: [...state.collapsed],
    }));
  } catch (e) {
    /* not fatal */
  }
}

/* ---------------------------------------------------------------------
   Central update path. Every change to counts, selection or target goes
   through refresh(), which re-renders each surface from state and puts
   keyboard focus back on the control the user was using.
--------------------------------------------------------------------- */

function refresh() {
  const active = document.activeElement;
  const fk = active && active.dataset ? active.dataset.fk : null;

  syncSidebar();
  renderChainBar();
  renderChain();
  renderInspector();
  renderNetwork();
  saveUI();

  if (fk) {
    const el = document.querySelector(`[data-fk="${fk}"]`) ||
      document.querySelector(`[data-fk="${fk.replace(/:add$/, ":count")}"]`);
    if (el && el !== document.activeElement) el.focus({ preventScroll: true });
  }
}

function setCount(id, rawValue) {
  let count = Math.max(0, Math.floor(Number(rawValue) || 0));
  if (W[id].isMined && count > 1) count = 1;
  if (count > 0) state.moduleCounts.set(id, count);
  else state.moduleCounts.delete(id);
  saveCounts();
  refresh();
}

function selectWare(id, opts = {}) {
  const w = W[id];
  const pm = perModule(w);
  state.selected = id;

  if (opts.rate > 0) state.targetRate = opts.rate;
  else if (pm) state.targetRate = pm * Math.max(1, getCount(id)); // size it for what you have, or one module
  else if (!(state.targetRate > 0)) state.targetRate = 1000;

  if (state.inspected) state.inspected = id; // an open inspector follows the selection
  refresh();

  // the target sits in the right-most column; make sure it is on screen
  setTimeout(() => (els.canvas.scrollLeft = els.canvas.scrollWidth), 0);
}

function inspect(id) {
  state.inspected = id;
  renderInspector();
}

/* ---------------------------------------------------------------------
   Sidebar
--------------------------------------------------------------------- */

function buildSidebar() {
  const byTier = new Map();
  for (const w of Object.values(W)) {
    if (!byTier.has(w.tier)) byTier.set(w.tier, []);
    byTier.get(w.tier).push(w);
  }

  els.wareList.textContent = "";
  for (const tier of [...byTier.keys()].sort((a, b) => a - b)) {
    const items = byTier.get(tier).sort((a, b) => a.label.localeCompare(b.label));

    const cat = document.createElement("section");
    cat.className = "category";
    if (state.collapsed.has(tier)) cat.classList.add("collapsed");

    const head = document.createElement("button");
    head.type = "button";
    head.className = "category-head";
    head.setAttribute("aria-expanded", String(!state.collapsed.has(tier)));
    head.innerHTML = `<span>${TIER_LABELS[tier] || "Tier " + tier}</span><span class="num">${items.length}</span><span class="caret">${icon("caret-down", 12)}</span>`;
    head.addEventListener("click", () => {
      const nowCollapsed = cat.classList.toggle("collapsed");
      if (nowCollapsed) state.collapsed.add(tier);
      else state.collapsed.delete(tier);
      head.setAttribute("aria-expanded", String(!nowCollapsed));
      saveUI();
    });

    const list = document.createElement("div");
    list.className = "category-items";

    for (const w of items) list.appendChild(buildSidebarRow(w));

    cat.append(head, list);
    els.wareList.appendChild(cat);
    sidebarCats.push(cat);
  }
}

function buildSidebarRow(w) {
  const row = document.createElement("div");
  row.className = "ware-item";

  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.className = "built-toggle";
  toggle.dataset.fk = `side:${w.id}:toggle`;
  const toggleLabel = w.isMined ? `I have a source for ${w.label}` : `I produce ${w.label}`;
  toggle.title = toggleLabel;
  toggle.setAttribute("aria-label", toggleLabel);
  // ticking with no quantity means one module; unticking clears it
  toggle.addEventListener("change", () => setCount(w.id, toggle.checked ? Math.max(1, getCount(w.id)) : 0));

  const name = document.createElement("button");
  name.type = "button";
  name.className = "ware-item-label";
  name.textContent = w.label;
  name.title = w.label;
  name.dataset.fk = `side:${w.id}:name`;
  name.addEventListener("click", () => selectWare(w.id));

  // mined wares have nothing to count: the tick alone means "sourced"
  let qty = null;
  if (!w.isMined) {
    qty = document.createElement("input");
    qty.type = "number";
    qty.className = "module-count";
    qty.min = "0";
    qty.step = "1";
    qty.hidden = true;
    qty.title = "Modules built";
    qty.setAttribute("aria-label", `Modules of ${w.label} built`);
    qty.dataset.fk = `side:${w.id}:qty`;
    qty.addEventListener("change", () => setCount(w.id, qty.value));
  }

  const price = document.createElement("span");
  price.className = "ware-item-price num";
  price.textContent = fmtPrice(w.price.avg);
  price.title = "Average price";

  row.append(toggle, name);
  if (qty) row.append(qty);
  row.append(price);

  sidebarRows.set(w.id, { row, toggle, qty });
  return row;
}

function syncSidebar() {
  for (const [id, { row, toggle, qty }] of sidebarRows) {
    const count = getCount(id);
    toggle.checked = count > 0;
    row.classList.toggle("built", count > 0);
    row.classList.toggle("active", id === state.selected);
    if (qty) {
      qty.hidden = count === 0;
      if (document.activeElement !== qty) qty.value = count || "";
    }
  }
  els.countAll.textContent = sidebarRows.size;
  els.countBuilt.textContent = state.moduleCounts.size;
  applyFilter();
}

function applyFilter() {
  const q = state.query.trim().toLowerCase();
  let visible = 0;

  for (const [id, { row }] of sidebarRows) {
    const match = (!q || W[id].label.toLowerCase().includes(q)) && (state.filter === "all" || isBuilt(id));
    row.hidden = !match;
    if (match) visible++;
  }

  for (const cat of sidebarCats) {
    cat.hidden = !cat.querySelector(".ware-item:not([hidden])");
    // a search or the built filter should never hide matches inside a collapsed tier
    cat.classList.toggle("force-open", !!q || state.filter === "built");
  }

  document.querySelectorAll(".segmented button").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.filter === state.filter));
  });

  els.wareEmpty.hidden = visible > 0;
  if (!visible) {
    els.wareEmpty.textContent = q
      ? `No wares match "${state.query.trim()}".`
      : "Nothing marked as built yet. Tick a ware under All to start tracking it.";
  }
}

/* ---------------------------------------------------------------------
   Chain maths

   Given a target rate (units/hour) for the root ware, walk the dependency
   graph and work out, for every ware involved, the combined rate needed
   by all of its consumers in this chain, the modules that implies, and
   how much flows along each connection.
--------------------------------------------------------------------- */

function computeChain(rootID, targetRate) {
  const involved = new Set();
  (function collect(id) {
    if (involved.has(id)) return;
    involved.add(id);
    for (const inp of W[id].inputs) collect(inp.wareID);
  })(rootID);

  // an input always sits on a lower tier than its consumer, so walking
  // tiers high to low sees every consumer before the ware it draws from
  const ordered = [...involved].sort((a, b) => W[b].tier - W[a].tier);
  const rate = new Map([[rootID, targetRate]]);
  const edges = [];

  for (const id of ordered) {
    const w = W[id];
    const r = rate.get(id) || 0;
    if (!r || !perModule(w)) continue;
    const cyclesPerHour = r / w.batchSize;
    for (const inp of w.inputs) {
      const flow = cyclesPerHour * inp.amount;
      rate.set(inp.wareID, (rate.get(inp.wareID) || 0) + flow);
      edges.push({ from: inp.wareID, to: id, flow });
    }
  }

  const nodes = {};
  for (const id of involved) {
    const pm = perModule(W[id]);
    const r = rate.get(id) || 0;
    nodes[id] = { id, rate: r, perModule: pm, modules: pm ? Math.ceil(r / pm - 1e-9) : null };
  }
  return { nodes, edges };
}

// Order each column so a ware sits near the things it feeds: fewer
// crossing lines than alphabetical order.
function orderColumns(chain, rootID) {
  const consumers = new Map();
  for (const e of chain.edges) {
    if (!consumers.has(e.from)) consumers.set(e.from, []);
    consumers.get(e.from).push(e.to);
  }

  const ids = Object.keys(chain.nodes);
  const tiers = [...new Set(ids.map((id) => W[id].tier))].sort((a, b) => b - a);
  const pos = new Map([[rootID, 0.5]]);
  const columns = [];

  for (const tier of tiers) {
    const col = ids.filter((id) => W[id].tier === tier);
    const score = (id) => {
      const placed = (consumers.get(id) || []).filter((c) => pos.has(c));
      return placed.length ? placed.reduce((sum, c) => sum + pos.get(c), 0) / placed.length : 0.5;
    };
    const scores = new Map(col.map((id) => [id, score(id)]));
    col.sort((a, b) => scores.get(a) - scores.get(b) || W[a].label.localeCompare(W[b].label));
    col.forEach((id, i) => pos.set(id, (i + 0.5) / col.length));
    columns.unshift({ tier, ids: col });
  }
  return columns;
}

/* ---------------------------------------------------------------------
   Chain bar: what is open, and what it is sized for
--------------------------------------------------------------------- */

function renderChainBar() {
  const id = state.selected;
  els.chainBar.hidden = !id;
  if (!id) return;

  const w = W[id];
  const pm = perModule(w);
  const built = getCount(id);

  els.chainName.textContent = w.label;
  const facts = [TIER_LABELS[w.tier] || "Tier " + w.tier, `${w.storageType.toLowerCase()} storage`];
  if (pm) facts.push(`one module makes ${fmtRate(pm)} per hour`);
  else facts.push(w.isMined ? "mined, not built" : "no fixed production rate");
  els.chainSub.textContent = facts.join(", ");

  els.targetModulesWrap.hidden = !pm;
  if (pm) {
    const modules = state.targetRate / pm;
    if (document.activeElement !== els.targetModules) els.targetModules.value = trimNumber(modules);
    els.targetModulesUnit.textContent = plural(Math.round(modules * 100) / 100, "module");
  }
  if (document.activeElement !== els.targetRate) els.targetRate.value = trimNumber(state.targetRate);

  const matches = pm && built > 0 && Math.abs(state.targetRate - pm * built) < 0.01;
  els.targetMatch.hidden = !pm || built === 0 || matches;
  if (!els.targetMatch.hidden) els.targetMatch.textContent = `Use my ${built} built`;
}

function setTargetRate(rate) {
  state.targetRate = Math.max(1, Number(rate) || 1);
  refresh();
}

function stepTargetModules(direction) {
  const pm = perModule(W[state.selected]);
  if (!pm) return;
  const modules = state.targetRate / pm;
  const next = direction > 0 ? Math.floor(modules + 1e-9) + 1 : Math.max(1, Math.ceil(modules - 1e-9) - 1);
  setTargetRate(next * pm);
}

/* ---------------------------------------------------------------------
   Chain diagram
--------------------------------------------------------------------- */

function renderChain() {
  const rootID = state.selected;
  els.emptyState.hidden = !!rootID;
  els.chainScroll.hidden = !rootID;
  clearHighlight();

  if (!rootID) {
    state.chain = null;
    els.chainColumns.textContent = "";
    els.chainLines.textContent = "";
    return;
  }

  const chain = computeChain(rootID, state.targetRate);
  state.chain = chain;

  els.chainColumns.textContent = "";
  for (const { tier, ids } of orderColumns(chain, rootID)) {
    const col = document.createElement("div");
    col.className = "chain-col";

    const label = document.createElement("div");
    label.className = "chain-col-label";
    label.textContent = TIER_LABELS[tier] || "Tier " + tier;

    const nodes = document.createElement("div");
    nodes.className = "chain-col-nodes";
    for (const id of ids) nodes.appendChild(buildNode(id, chain.nodes[id], id === rootID));

    col.append(label, nodes);
    els.chainColumns.appendChild(col);
  }

  // setTimeout rather than rAF so lines still draw in a backgrounded tab
  setTimeout(drawEdges, 0);
}

function buildNode(id, data, isRoot) {
  const w = W[id];
  const built = getCount(id);
  const el = document.createElement("article");
  el.className = "node" + (isRoot ? " root" : "");
  el.dataset.id = id;

  let control;
  let need;
  let have;

  if (w.isMined) {
    control = `<button type="button" class="node-source" aria-pressed="${built > 0}" data-fk="node:${id}:source"
      title="${built ? "You have a source for this. Click to unmark." : "Mark as sourced"}"
      aria-label="${built ? "Sourced" : "Mark as sourced"}: ${w.label}">${icon("check", 13)}</button>`;
    need = "Mined";
    have = built ? `<span class="have">sourced</span>` : `<span>no source marked</span>`;
  } else {
    control = built
      ? `<span class="node-built" title="Modules you have built">${icon("check", 12)}<input type="number" class="node-module-count" min="0" step="1" value="${built}" aria-label="Modules of ${w.label} built" data-fk="node:${id}:count"></span>`
      : `<button type="button" class="node-add" title="Mark as built" aria-label="Mark ${w.label} as built" data-fk="node:${id}:add">${icon("plus", 13)}</button>`;

    if (data.perModule) {
      need = `${data.modules} ${plural(data.modules, "module")} needed`;
      if (built >= data.modules) {
        have = `<span class="have">${built} built</span>`;
      } else if (built > 0) {
        el.classList.add("is-short");
        have = `<span class="short">${built} built, short ${data.modules - built}</span>`;
      } else {
        have = `<span>not built</span>`;
      }
    } else {
      need = "No fixed rate";
      have = built ? `<span class="have">${built} built</span>` : `<span>not built</span>`;
    }
  }

  el.innerHTML = `
    <div class="node-head">
      <button type="button" class="node-title" data-fk="node:${id}:title">${w.label}</button>
      ${control}
    </div>
    <div class="node-rate"><span class="num">${fmtRate(data.rate)}</span><span class="unit">per hour</span></div>
    <div class="node-need"><span>${need}</span>${have}</div>
    <div class="node-meta"><span class="num">${fmtPrice(w.price.avg)}</span><span>${w.storageType}</span></div>
  `;

  el.addEventListener("mouseenter", () => highlight(id));
  el.addEventListener("mouseleave", () => highlight(null));
  el.addEventListener("focusin", () => highlight(id));
  el.addEventListener("focusout", () => highlight(null));
  return el;
}

function drawEdges() {
  const svg = els.chainLines;
  svg.textContent = "";
  if (!state.chain || els.chainScroll.hidden) return;

  // the svg lives inside #chain-scroll, so it scrolls with the nodes and
  // rects relative to that element stay valid at any scroll position
  const origin = els.chainScroll.getBoundingClientRect();
  svg.setAttribute("width", els.chainScroll.scrollWidth);
  svg.setAttribute("height", els.chainScroll.scrollHeight);

  const rects = new Map();
  els.chainColumns.querySelectorAll(".node").forEach((n) => rects.set(n.dataset.id, n.getBoundingClientRect()));

  for (const e of state.chain.edges) {
    const a = rects.get(e.from);
    const b = rects.get(e.to);
    if (!a || !b || !a.width || !b.width) continue;

    const x1 = a.right - origin.left;
    const y1 = a.top - origin.top + a.height / 2;
    const x2 = b.left - origin.left;
    const y2 = b.top - origin.top + b.height / 2;
    const bend = Math.max(36, (x2 - x1) / 2);

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`);
    path.dataset.from = e.from;
    path.dataset.to = e.to;
    svg.appendChild(path);
  }
}

// Hover or focus a node: light up its connections and show how much
// flows along each one, so "what feeds this, and how much" is one glance.
function highlight(id) {
  clearHighlight();
  if (!id || !state.chain) return;

  const linked = new Set([id]);
  const chips = [];
  for (const e of state.chain.edges) {
    if (e.to === id) {
      linked.add(e.from);
      chips.push({ on: e.from, cls: "is-out", flow: e.flow });
    } else if (e.from === id) {
      linked.add(e.to);
      chips.push({ on: e.to, cls: "is-in", flow: e.flow });
    }
  }
  if (linked.size === 1) return;

  els.chainColumns.classList.add("focus");
  els.chainLines.classList.add("focus");

  els.chainColumns.querySelectorAll(".node").forEach((n) => n.classList.toggle("linked", linked.has(n.dataset.id)));
  els.chainLines.querySelectorAll("path").forEach((p) => {
    p.classList.toggle("hot", p.dataset.from === id || p.dataset.to === id);
  });

  for (const c of chips) {
    const node = els.chainColumns.querySelector(`.node[data-id="${c.on}"]`);
    if (!node) continue;
    const chip = document.createElement("span");
    chip.className = `flow-chip ${c.cls}`;
    chip.textContent = `${fmtRate(c.flow)}/h`;
    node.appendChild(chip);
  }
}

function clearHighlight() {
  els.chainColumns.classList.remove("focus");
  els.chainLines.classList.remove("focus");
  els.chainColumns.querySelectorAll(".flow-chip").forEach((c) => c.remove());
  els.chainColumns.querySelectorAll(".node.linked").forEach((n) => n.classList.remove("linked"));
  els.chainLines.querySelectorAll("path.hot").forEach((p) => p.classList.remove("hot"));
}

/* ---------------------------------------------------------------------
   Inspector
--------------------------------------------------------------------- */

function renderInspector() {
  const id = state.inspected;
  els.details.hidden = !id;
  if (!id) {
    els.detailsContent.textContent = "";
    return;
  }

  const w = W[id];
  const pm = perModule(w);
  const built = getCount(id);
  const usedBy = Object.values(W)
    .filter((o) => o.inputs.some((i) => i.wareID === id))
    .sort((a, b) => a.label.localeCompare(b.label));

  const builtControl = w.isMined
    ? `<label class="check-label"><input type="checkbox" class="built-toggle" id="insp-toggle" data-fk="insp:toggle" ${built ? "checked" : ""}>I have a source for this</label>`
    : `<label for="insp-count">Modules built</label>
       <span class="stepper is-small">
         <button type="button" data-action="dec" data-id="${id}" data-fk="insp:dec" aria-label="One module less">${icon("minus", 12)}</button>
         <input type="number" id="insp-count" min="0" step="1" value="${built}" data-fk="insp:count">
         <button type="button" data-action="inc" data-id="${id}" data-fk="insp:inc" aria-label="One module more">${icon("plus", 12)}</button>
       </span>`;

  const stats = [
    ["Average price", fmtPrice(w.price.avg)],
    ["Price range", `${w.price.min.toLocaleString("en-US")} to ${fmtPrice(w.price.max)}`],
    ["Volume", w.volume],
    ["Storage", w.storageType],
  ];
  if (pm) {
    stats.push(["Cycle time", fmtTime(w.cycleTime)], ["Batch per cycle", w.batchSize], ["One module makes", `${fmtRate(pm)} per hour`]);
  } else {
    stats.push(["Source", w.isMined ? "Mined or collected" : "Built, no fixed rate"]);
  }

  const inputs = w.inputs.length
    ? `<section class="inspector-section">
        <h3>Inputs</h3>
        <div class="cols-head"><span>Ware</span><span>per cycle</span><span>per hour</span></div>
        ${w.inputs.map((i) => `
          <button type="button" class="link-row" data-action="goto" data-id="${i.wareID}">
            <span class="name">${W[i.wareID].label}</span>
            <span class="num">${i.amount}</span>
            <span class="num dim">${pm ? fmtRate((i.amount * 3600) / w.cycleTime) : ""}</span>
          </button>`).join("")}
      </section>`
    : "";

  const uses = usedBy.length
    ? `<section class="inspector-section">
        <h3>Used in</h3>
        <div class="cols-head"><span>Ware</span><span></span><span>per cycle</span></div>
        ${usedBy.map((o) => `
          <button type="button" class="link-row" data-action="goto" data-id="${o.id}">
            <span class="name">${o.label}</span>
            <span></span>
            <span class="num dim" title="Units of ${w.label} one cycle uses">${o.inputs.find((i) => i.wareID === id).amount}</span>
          </button>`).join("")}
      </section>`
    : "";

  els.detailsContent.innerHTML = `
    <div class="inspector-head">
      <div>
        <h2>${w.label}</h2>
        <p class="inspector-sub">${w.category}, ${(TIER_LABELS[w.tier] || "Tier " + w.tier).toLowerCase()}</p>
      </div>
      <button type="button" class="icon-btn" data-action="close" aria-label="Close details" title="Close (Esc)">${icon("x", 14)}</button>
    </div>
    <div class="inspector-built">${builtControl}</div>
    ${id !== state.selected ? `<div class="inspector-actions"><button type="button" class="btn" data-action="goto" data-id="${id}">Plan this chain${icon("arrow-right", 13)}</button></div>` : ""}
    <dl class="stats">${stats.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
    ${inputs}
    ${uses}
  `;
}

/* ---------------------------------------------------------------------
   My network: everything the player has built, taken together.

   Supply comes from built modules that have a production rate. Mined
   wares and Energy Cells have no rate on record, so for those the tick
   is taken as "this is covered" instead of a number.
--------------------------------------------------------------------- */

function computeBalance() {
  const supply = new Map();
  const demand = new Map();

  for (const [id, count] of state.moduleCounts) {
    const w = W[id];
    const pm = perModule(w);
    if (!pm) continue;
    supply.set(id, pm * count);
    const cyclesPerHour = (3600 / w.cycleTime) * count;
    for (const inp of w.inputs) {
      demand.set(inp.wareID, (demand.get(inp.wareID) || 0) + cyclesPerHour * inp.amount);
    }
  }

  const rows = [...new Set([...supply.keys(), ...demand.keys()])].map((id) => {
    const w = W[id];
    const pm = perModule(w);
    const dem = demand.get(id) || 0;
    if (!pm) {
      return { id, tracked: false, demand: dem, supply: 0, net: -dem, short: dem > 0 && !isBuilt(id), modulesNeeded: 0 };
    }
    const sup = supply.get(id) || 0;
    const net = sup - dem;
    const short = net < -1e-6;
    return { id, tracked: true, demand: dem, supply: sup, net, short, modulesNeeded: short ? Math.ceil(-net / pm - 1e-9) : 0 };
  });

  return rows.sort((a, b) => {
    if (a.short !== b.short) return a.short ? -1 : 1;
    if (a.short) {
      if ((a.supply === 0) !== (b.supply === 0)) return a.supply === 0 ? -1 : 1;
      return a.net - b.net;
    }
    return W[a.id].label.localeCompare(W[b.id].label);
  });
}

function allTransitiveInputs(id) {
  const set = new Set();
  (function walk(cur) {
    for (const inp of W[cur].inputs) {
      if (!set.has(inp.wareID)) {
        set.add(inp.wareID);
        walk(inp.wareID);
      }
    }
  })(id);
  return set;
}

// Rank what is not built yet by how many inputs in its whole chain the
// player does not have: the top entry is the cheapest thing to add next.
function computeSuggestions() {
  return Object.values(W)
    .filter((w) => !w.isMined && !isBuilt(w.id))
    .map((w) => ({ id: w.id, missing: [...allTransitiveInputs(w.id)].filter((id) => !isBuilt(id)) }))
    .sort((a, b) => a.missing.length - b.missing.length || W[a.id].label.localeCompare(W[b.id].label));
}

function renderNetwork() {
  els.network.classList.toggle("collapsed", !state.networkOpen);
  els.networkToggle.setAttribute("aria-expanded", String(state.networkOpen));

  const builtIDs = [...state.moduleCounts.keys()]
    .filter((id) => !W[id].isMined)
    .sort((a, b) => W[a].label.localeCompare(W[b].label));
  const moduleTotal = builtIDs.reduce((sum, id) => sum + getCount(id), 0);
  const balance = computeBalance();
  const shortCount = balance.filter((r) => r.short).length;

  // summary stays readable while the drawer is closed
  if (!state.moduleCounts.size) {
    els.networkSummary.innerHTML = `<span>Nothing tracked yet</span>`;
  } else {
    const status = shortCount
      ? `<span class="tag is-short">${shortCount} ${plural(shortCount, "shortfall")}</span>`
      : `<span class="tag is-ok">balanced</span>`;
    els.networkSummary.innerHTML = `<span>${moduleTotal} ${plural(moduleTotal, "module")} across ${builtIDs.length} ${plural(builtIDs.length, "ware")}</span>${status}`;
  }

  // built modules (mined wares are "sourced", not modules, so not listed)
  els.builtList.innerHTML = builtIDs.length
    ? builtIDs.map((id) => {
        const pm = perModule(W[id]);
        const count = getCount(id);
        return `<div class="net-row is-built">
          <button type="button" class="net-name" data-action="goto" data-id="${id}" data-fk="net:${id}:name">${W[id].label}</button>
          <span class="stepper is-small">
            <button type="button" data-action="dec" data-id="${id}" data-fk="net:${id}:dec" aria-label="One module less">${icon("minus", 12)}</button>
            <input type="number" class="net-count" min="0" step="1" value="${count}" data-id="${id}" data-fk="net:${id}:count" aria-label="Modules of ${W[id].label} built">
            <button type="button" data-action="inc" data-id="${id}" data-fk="net:${id}:inc" aria-label="One module more">${icon("plus", 12)}</button>
          </span>
          <span class="num dim" title="Total output per hour">${pm ? fmtRate(pm * count) + "/h" : "no rate"}</span>
          <button type="button" class="icon-btn is-danger" data-action="remove" data-id="${id}" aria-label="Remove ${W[id].label}" title="Remove">${icon("x", 12)}</button>
        </div>`;
      }).join("")
    : `<p class="quiet-note">Tick a ware in the list, or use the plus on a chain node, to track what you have built.</p>`;

  // supply and demand
  if (!state.moduleCounts.size) {
    els.balanceList.innerHTML = `<p class="quiet-note">Once you track some modules, this shows what they make and use per hour, and where supply falls short.</p>`;
  } else if (!balance.length) {
    els.balanceList.innerHTML = `<p class="quiet-note">Nothing you have marked makes or uses anything yet.</p>`;
  } else {
    els.balanceList.innerHTML = `
      <div class="net-row is-balance net-head"><span>Per hour</span><span>Make</span><span>Use</span><span>Net</span><span></span></div>
      ${balance.map((r) => {
        const w = W[r.id];
        let make;
        let net;
        let action = "";
        if (r.tracked) {
          make = `<span class="num ${r.supply ? "" : "dim"}">${fmtRate(r.supply)}</span>`;
          net = r.short
            ? `<span class="num is-short">-${fmtRate(-r.net)}</span>`
            : `<span class="num is-ok">+${fmtRate(r.net)}</span>`;
          if (r.short) {
            action = `<button type="button" class="btn is-small is-fix" data-action="fix" data-id="${r.id}" data-n="${r.modulesNeeded}"
              title="Add ${r.modulesNeeded} ${plural(r.modulesNeeded, "module")} to cover the shortfall" data-fk="net:${r.id}:fix">${icon("plus", 11)}${r.modulesNeeded}</button>`;
          }
        } else {
          make = `<span class="num dim">${r.short ? "none" : w.isMined ? "sourced" : "built"}</span>`;
          net = r.short ? `<span class="num is-short">-${fmtRate(r.demand)}</span>` : `<span class="num dim">covered</span>`;
          if (r.short) {
            action = `<button type="button" class="btn is-small is-fix" data-action="fix" data-id="${r.id}" data-n="1"
              title="${w.isMined ? "Mark as sourced" : "Mark one module built"}" data-fk="net:${r.id}:fix">${w.isMined ? "Mark" : icon("plus", 11) + "1"}</button>`;
          }
        }
        return `<div class="net-row is-balance">
          <button type="button" class="net-name" data-action="goto" data-id="${r.id}">${w.label}</button>
          ${make}
          <span class="num ${r.demand ? "" : "dim"}">${fmtRate(r.demand)}</span>
          ${net}
          <span class="net-action">${action}</span>
        </div>`;
      }).join("")}`;
  }

  // next build
  const ranked = computeSuggestions().slice(0, 8);
  els.suggestList.innerHTML = ranked.length
    ? ranked.map((r) => {
        const ready = r.missing.length === 0;
        const sub = ready ? "Every input is covered" : "Still needs " + r.missing.map((id) => W[id].label).join(", ");
        return `<div class="net-row is-suggest">
          <span style="min-width:0">
            <button type="button" class="net-name" data-action="goto" data-id="${r.id}">${W[r.id].label}</button>
            <span class="suggest-sub" title="${sub}">${sub}</span>
          </span>
          <span class="tag ${ready ? "is-ok" : "is-plain"}">${ready ? "ready" : r.missing.length + " new"}</span>
        </div>`;
      }).join("")
    : `<p class="quiet-note">Everything is built. Nothing left to suggest.</p>`;
}

/* ---------------------------------------------------------------------
   Export, import, reset
--------------------------------------------------------------------- */

function exportData() {
  if (!state.moduleCounts.size) {
    setStatus("Nothing to export yet.");
    return;
  }
  const payload = { app: "x4-factories-planner", version: 1, moduleCounts: Object.fromEntries(state.moduleCounts) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "x4-factories-planner.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus(`Exported ${state.moduleCounts.size} ${state.moduleCounts.size === 1 ? "entry" : "entries"}.`);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const counts = parsed && typeof parsed.moduleCounts === "object" ? parsed.moduleCounts : parsed;
      const previous = new Map(state.moduleCounts);
      state.moduleCounts.clear();
      const applied = applyCounts(counts);
      if (!applied) {
        state.moduleCounts = previous;
        setStatus("That file has no module counts this app can read.");
        return;
      }
      saveCounts();
      refresh();
      setStatus(`Imported ${applied} ${applied === 1 ? "entry" : "entries"}.`);
    } catch (e) {
      setStatus("Could not read that file. It needs to be a JSON export from this app.");
    }
  };
  reader.onerror = () => setStatus("Could not read that file.");
  reader.readAsText(file);
}

let resetTimer = null;
function disarmReset() {
  clearTimeout(resetTimer);
  els.clearData.classList.remove("is-confirming");
  els.clearDataLabel.textContent = "Reset";
}

// two clicks instead of a blocking dialog: the first arms it for a few seconds
function handleReset() {
  if (!state.moduleCounts.size) {
    setStatus("Nothing to reset.");
    return;
  }
  if (!els.clearData.classList.contains("is-confirming")) {
    els.clearData.classList.add("is-confirming");
    els.clearDataLabel.textContent = `Clear ${state.moduleCounts.size} ${state.moduleCounts.size === 1 ? "entry" : "entries"}?`;
    resetTimer = setTimeout(disarmReset, 4000);
    return;
  }
  disarmReset();
  state.moduleCounts.clear();
  saveCounts();
  refresh();
  setStatus("Cleared everything you had marked as built.");
}

/* ---------------------------------------------------------------------
   Wiring
--------------------------------------------------------------------- */

function bindEvents() {
  els.search.addEventListener("input", () => {
    state.query = els.search.value;
    applyFilter();
  });

  document.querySelectorAll(".segmented button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.filter = btn.dataset.filter;
      applyFilter();
      saveUI();
    });
  });

  // target controls
  els.targetModules.addEventListener("change", () => {
    const pm = perModule(W[state.selected]);
    setTargetRate((Number(els.targetModules.value) || 1) * pm);
  });
  els.targetRate.addEventListener("change", () => setTargetRate(els.targetRate.value));
  els.targetDec.addEventListener("click", () => stepTargetModules(-1));
  els.targetInc.addEventListener("click", () => stepTargetModules(1));
  els.targetMatch.addEventListener("click", () => {
    setTargetRate(perModule(W[state.selected]) * getCount(state.selected));
  });

  // chain nodes
  els.chainColumns.addEventListener("click", (e) => {
    const node = e.target.closest(".node");
    if (!node) return;
    const id = node.dataset.id;
    if (e.target.closest(".node-add")) setCount(id, 1);
    else if (e.target.closest(".node-source")) setCount(id, isBuilt(id) ? 0 : 1);
    else if (!e.target.closest("input")) inspect(id);
  });
  els.chainColumns.addEventListener("change", (e) => {
    if (e.target.matches(".node-module-count")) setCount(e.target.closest(".node").dataset.id, e.target.value);
  });

  // inspector
  els.detailsContent.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === "close") {
      state.inspected = null;
      renderInspector();
    } else if (action === "goto") selectWare(id);
    else if (action === "inc") setCount(id, getCount(id) + 1);
    else if (action === "dec") setCount(id, getCount(id) - 1);
  });
  els.detailsContent.addEventListener("change", (e) => {
    if (e.target.id === "insp-count") setCount(state.inspected, e.target.value);
    else if (e.target.id === "insp-toggle") setCount(state.inspected, e.target.checked ? 1 : 0);
  });

  // network drawer
  els.networkToggle.addEventListener("click", () => {
    state.networkOpen = !state.networkOpen;
    renderNetwork();
    saveUI();
  });
  els.networkBody.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === "goto") selectWare(id);
    else if (action === "remove") setCount(id, 0);
    else if (action === "inc") setCount(id, getCount(id) + 1);
    else if (action === "dec") setCount(id, getCount(id) - 1);
    else if (action === "fix") setCount(id, getCount(id) + Number(btn.dataset.n));
  });
  els.networkBody.addEventListener("change", (e) => {
    if (e.target.matches(".net-count")) setCount(e.target.dataset.id, e.target.value);
  });

  els.quickPicks.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-id]");
    if (btn) selectWare(btn.dataset.id);
  });

  // data
  els.exportData.addEventListener("click", exportData);
  els.importData.addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", () => {
    if (els.importFile.files[0]) importData(els.importFile.files[0]);
    els.importFile.value = "";
  });
  els.clearData.addEventListener("click", handleReset);

  // keyboard: "/" jumps to search, Esc clears it or closes the inspector
  document.addEventListener("keydown", (e) => {
    const inField = e.target instanceof HTMLInputElement;
    if (e.key === "/" && !inField && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      els.search.focus();
      els.search.select();
    } else if (e.key === "Escape") {
      if (e.target === els.search && els.search.value) {
        els.search.value = "";
        state.query = "";
        applyFilter();
      } else if (state.inspected) {
        state.inspected = null;
        renderInspector();
      }
    }
  });

  // node sizes change when the window, fonts or panels do; keep lines attached
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => drawEdges()).observe(els.chainColumns);
  }
  window.addEventListener("resize", drawEdges);
}

function init() {
  loadCounts();
  const ui = loadUI();

  document.querySelectorAll("[data-icon]").forEach((el) => {
    el.innerHTML = icon(el.dataset.icon, 14);
  });

  els.quickPicks.innerHTML = QUICK_PICKS.filter((id) => W[id])
    .map((id) => `<button type="button" class="btn" data-id="${id}">${W[id].label}</button>`)
    .join("");

  buildSidebar();
  bindEvents();

  if (ui && ui.selected && W[ui.selected]) selectWare(ui.selected, { rate: Number(ui.targetRate) });
  else refresh();
}

init();
