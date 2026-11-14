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
const EMPIRE_KEY = "x4-factories-planner:empire";

// ware IDs that changed when the data moved from a web scrape to the game files
const RENAMED_WARES = { weaponscomponents: "weaponcomponents", scruffinfruit: "scruffinfruits" };

/* Empire levels by estimated value added per hour. Pure flattery. */
const LEVELS = [
  { min: 0, name: "Space Toddler", flavor: "Your empire fits in a cockpit. Everyone starts somewhere." },
  { min: 50e3, name: "Asteroid Licker", flavor: "One module and a dream. The ore is starting to taste like money." },
  { min: 250e3, name: "Scrap Hoarder", flavor: "Several modules, a few credits, and a suspicious amount of drones." },
  { min: 1e6, name: "Backwater Trader", flavor: "A million an hour. The locals have started saying your name." },
  { min: 3e6, name: "Station Tycoon", flavor: "Real stations, real income. The Teladi are taking notes." },
  { min: 8e6, name: "Sector Magnate", flavor: "A whole sector hums to the rhythm of your production lines." },
  { min: 20e6, name: "Cluster Baron", flavor: "Factions check with you before they set their prices." },
  { min: 60e6, name: "Galactic Industrialist", flavor: "The economy is no longer something you take part in. It is something you own." },
  { min: 200e6, name: "Gate Network Overlord", flavor: "Every jump gate leads to one of your stations, or to a customer of one." },
  { min: 1e9, name: "Billion-an-Hour Club", flavor: "A billion credits every hour. Banks open branches next to your stations." },
  { min: 2e9, name: "Economic Black Hole", flavor: "Credits fall in. Nothing ever comes back out." },
  { min: 4e9, name: "Living Stock Market", flavor: "Prices across the galaxy move when you sneeze." },
  { min: 7.5e9, name: "Galactic Central Bank", flavor: "Factions borrow from you to pay their fleets." },
  { min: 15e9, name: "Xenon Insurance Policy", flavor: "The Xenon have started avoiding your sectors. Out of respect." },
  { min: 30e9, name: "Sun Hoarder", flavor: "You bought the sunlight. All of it." },
  { min: 60e9, name: "Pocket Universe Owner", flavor: "Some sectors on the map are just your storage rooms." },
  { min: 125e9, name: "Egosoft's Problem", flavor: "Your save file is now a support ticket." },
  { min: 250e9, name: "Credit Singularity", flavor: "Your balance has its own gravity well." },
  { min: 500e9, name: "Main Character", flavor: "The galaxy is just a backdrop for your production lines." },
  { min: 1e12, name: "Super Mega Duper Huge Empire", flavor: "A trillion credits per hour. There is no level 21. You won X4." },
];

const TIER_LABELS = { 0: "Base resources", 1: "Tier 1", 2: "Tier 2", 3: "Tier 3", 4: "Tier 4" };
const QUICK_PICKS = ["hullparts", "claytronics", "advancedelectronics", "engineparts", "shieldcomponents", "turretcomponents"];

const state = {
  moduleCounts: new Map(), // wareID -> modules built (mined wares: 1 = "I have a source")
  selected: null,          // root ware of the open chain
  targetRate: 0,           // units/hour the open chain is sized for
  chain: null,             // { nodes, edges } of the open chain
  inspected: null,         // ware shown in the inspector, null = closed
  networkOpen: false,
  view: "planner",         // "planner" | "empire"
  empire: null,            // stations read from a save, see importSave()
  openStation: null,       // expanded station row in the empire view
  empireTab: "overview",   // "overview" | "stations" | "prices" | "rewards"
  plan: {},                // what-if: stationID -> { "ware|method": module delta }
  chainRace: "default",    // recipe family the chain plans with
  chainSunlight: 1,        // sunlight for solar modules in the chain
  chainSector: "",         // sector macro the sunlight came from ("" = 100%)
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
  "folder-open": "M245,110.64A16,16,0,0,0,232,104H216V88a16,16,0,0,0-16-16H130.67L102.94,51.2a16.14,16.14,0,0,0-9.6-3.2H40A16,16,0,0,0,24,64V208h0a8,8,0,0,0,8,8H211.1a8,8,0,0,0,7.59-5.47l28.49-85.47A16.05,16.05,0,0,0,245,110.64ZM93.34,64,123.2,86.4A8,8,0,0,0,128,88h72v16H69.77a16,16,0,0,0-15.18,10.94L40,158.7V64Zm112,136H43.1l26.67-80H232Z",
  "image": "M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,16V158.75l-26.07-26.06a16,16,0,0,0-22.63,0l-20,20-44-44a16,16,0,0,0-22.62,0L40,149.37V56ZM40,172l52-52,80,80H40Zm176,28H194.63l-36-36,20-20L216,181.38V200ZM144,100a12,12,0,1,1,12,12A12,12,0,0,1,144,100Z",
  "share-fat": "M237.66,106.35l-80-80A8,8,0,0,0,144,32V72.35c-25.94,2.22-54.59,14.92-78.16,34.91-28.38,24.08-46.05,55.11-49.76,87.37a12,12,0,0,0,20.68,9.58h0c11-11.71,50.14-48.74,107.24-52V192a8,8,0,0,0,13.66,5.65l80-80A8,8,0,0,0,237.66,106.35ZM160,172.69V144a8,8,0,0,0-8-8c-28.08,0-55.43,7.33-81.29,21.8a196.17,196.17,0,0,0-36.57,26.52c5.8-23.84,20.42-46.51,42.05-64.86C99.41,99.77,127.75,88,152,88a8,8,0,0,0,8-8V51.32L220.69,112Z",
  "warning": "M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM222.93,203.8a8.5,8.5,0,0,1-7.48,4.2H40.55a8.5,8.5,0,0,1-7.48-4.2,7.59,7.59,0,0,1,0-7.72L120.52,44.21a8.75,8.75,0,0,1,15,0l87.45,151.87A7.59,7.59,0,0,1,222.93,203.8ZM120,144V104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,180Z",
  "clock": "M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm64-88a8,8,0,0,1-8,8H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48A8,8,0,0,1,192,128Z",
  "trend-up": "M240,56v64a8,8,0,0,1-16,0V75.31l-82.34,82.35a8,8,0,0,1-11.32,0L96,123.31,29.66,189.66a8,8,0,0,1-11.32-11.32l72-72a8,8,0,0,1,11.32,0L136,140.69,212.69,64H168a8,8,0,0,1,0-16h64A8,8,0,0,1,240,56Z",
  "caret-right": "M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z",
};

function icon(name, size = 14) {
  return `<svg class="icon" viewBox="0 0 256 256" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="${ICON_PATHS[name]}"/></svg>`;
}

const $ = (id) => document.getElementById(id);

const els = {
  status: $("status"),
  rankChip: $("rank-chip"),
  loadSave: $("load-save"),
  saveFile: $("save-file"),
  chainView: $("chain-view"),
  empireView: $("empire-view"),
  rankBadge: $("rank-badge"),
  rankLevel: $("rank-level"),
  rankName: $("rank-name"),
  rankFlavor: $("rank-flavor"),
  rankProfit: $("rank-profit"),
  rankDay: $("rank-day"),
  rankNext: $("rank-next"),
  empireSource: $("empire-source"),
  levelLadder: $("level-ladder"),
  stationsNote: $("stations-note"),
  stationList: $("station-list"),
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

// units/hour one module makes with the main recipe at 100% efficiency
// (Energy Cells: at 100% sunlight); 0 for mined wares
function perModule(w) {
  return w.batchSize && w.cycleTime ? (w.batchSize * 3600) / w.cycleTime : 0;
}

// The recipe a chain plans with: the chosen race variant where the ware
// has one, otherwise its standard recipe.
function methodOf(w) {
  return w.recipes[state.chainRace] ? state.chainRace : w.mainMethod;
}

function recipeOf(w) {
  return w.recipes[methodOf(w)] || null;
}

// units/hour one module makes in the open chain: chosen recipe, and the
// chosen sector's sunlight for solar modules
function chainPerModule(w) {
  const r = recipeOf(w);
  if (!r || !r.time) return 0;
  return ((r.amount * 3600) / r.time) * (r.sunlight ? state.chainSunlight : 1);
}

// build cost of one production module (average price of the module ware)
let moduleCostCache = null;
function moduleCost(ware, method) {
  if (!moduleCostCache) {
    moduleCostCache = new Map();
    for (const m of Object.values(MODULE_MACROS)) {
      if (!m.cost) continue;
      for (const key of [`${m.ware}|${m.method}`, m.ware]) {
        if (!moduleCostCache.has(key) || moduleCostCache.get(key) > m.cost) moduleCostCache.set(key, m.cost);
      }
    }
  }
  return moduleCostCache.get(`${ware}|${method}`) || moduleCostCache.get(ware) || 0;
}

// value one module adds per hour at average prices, for payback maths
function moduleValue(ware, method, efficiency = 1) {
  return unitFlows({ ware, method: method || W[ware].mainMethod, count: 1, efficiency }).value;
}

function fmtHours(h) {
  if (!Number.isFinite(h) || h < 0) return "never";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h * 10) / 10} h`;
  return `${Math.round(h / 24)} days`;
}

function plural(n, word) {
  return n === 1 ? word : word + "s";
}

function fmtRate(n) {
  if (n < 0) return "-" + fmtRate(-n);
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

// 21,834,112 -> "21.8M", for big credit figures
function fmtCredits(n) {
  // drop trailing zeros: "50.0k" -> "50k", "7.50B" -> "7.5B", "21.8M" stays
  return fmtCreditsRaw(n).replace(/(\.\d*?)0+([kMBT])$/, "$1$2").replace(/\.([kMBT])$/, "$1");
}

function fmtCreditsRaw(n) {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1e12) return `${sign}${(a / 1e12).toFixed(a >= 1e13 ? 1 : 2)}T`;
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(a >= 1e10 ? 1 : 2)}B`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k`;
  return `${sign}${Math.round(a)}`;
}

function fmtPercent(x) {
  return `${Math.round(x * 100)}%`;
}

// Named stations keep their name; unnamed ones say what they make, so
// "RHK-687 (Silicon Wafers, Energy Cells)" instead of a bare code.
function stationLabel(st) {
  if (st.name) return st.name;
  const code = st.code || "?";
  const made = [...(st.modules || [])]
    .sort((a, b) => b.count - a.count)
    .map((m) => W[m.ware].label)
    .filter((label, i, all) => all.indexOf(label) === i)
    .slice(0, 2);
  return made.length ? `${code} (${made.join(", ")})` : `Station ${code}`;
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
  for (const [rawID, count] of Object.entries(obj || {})) {
    const id = RENAMED_WARES[rawID] || rawID;
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
    state.view = ui.view === "empire" ? "empire" : "planner";
    if (["overview", "stations", "supply", "prices", "rewards"].includes(ui.empireTab)) state.empireTab = ui.empireTab;
    if (typeof ui.chainRace === "string") state.chainRace = ui.chainRace;
    if (ui.chainSector && SECTORS[ui.chainSector]) {
      state.chainSector = ui.chainSector;
      state.chainSunlight = SECTORS[ui.chainSector].sunlight;
    }
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
      view: state.view,
      empireTab: state.empireTab,
      chainRace: state.chainRace,
      chainSector: state.chainSector,
      filter: state.filter,
      collapsed: [...state.collapsed],
    }));
  } catch (e) {
    /* not fatal */
  }
}

function loadEmpire() {
  try {
    const empire = JSON.parse(localStorage.getItem(EMPIRE_KEY) || "null");
    if (empire && Array.isArray(empire.stations)) {
      for (const st of empire.stations) st.modules = st.modules.filter((m) => W[m.ware] && W[m.ware].recipes[m.method]);
      state.empire = empire;
    }
  } catch (e) {
    console.warn("Could not load the imported empire:", e);
  }
}

function saveEmpire() {
  try {
    if (state.empire) localStorage.setItem(EMPIRE_KEY, JSON.stringify(state.empire));
    else localStorage.removeItem(EMPIRE_KEY);
  } catch (e) {
    console.warn("Could not save the imported empire:", e);
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
  renderView();
  renderChainBar();
  renderChain();
  renderInspector();
  renderNetwork();
  renderRank();
  renderEmpire();
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
  const pm = chainPerModule(w);
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

  document.querySelectorAll(".segmented button[data-filter]").forEach((btn) => {
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
    const r = recipeOf(W[id]);
    for (const inp of r ? r.inputs : []) collect(inp.wareID);
  })(rootID);

  // an input always sits on a lower tier than its consumer, so walking
  // tiers high to low sees every consumer before the ware it draws from
  const ordered = [...involved].sort((a, b) => W[b].tier - W[a].tier);
  const rate = new Map([[rootID, targetRate]]);
  const edges = [];

  for (const id of ordered) {
    const w = W[id];
    const r = rate.get(id) || 0;
    const recipe = recipeOf(w);
    if (!r || !chainPerModule(w)) continue;
    // inputs are used per cycle; sunlight only changes the output of a cycle
    const cyclesPerHour = r / (recipe.amount * (recipe.sunlight ? state.chainSunlight : 1));
    for (const inp of recipe.inputs) {
      const flow = cyclesPerHour * inp.amount;
      rate.set(inp.wareID, (rate.get(inp.wareID) || 0) + flow);
      edges.push({ from: inp.wareID, to: id, flow });
    }
  }

  const nodes = {};
  for (const id of involved) {
    const pm = chainPerModule(W[id]);
    const r = rate.get(id) || 0;
    nodes[id] = { id, method: methodOf(W[id]), rate: r, perModule: pm, modules: pm ? Math.ceil(r / pm - 1e-9) : null };
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
  const pm = chainPerModule(w);
  const built = getCount(id);

  els.chainName.textContent = w.label;
  const facts = [TIER_LABELS[w.tier] || "Tier " + w.tier, `${w.storageType.toLowerCase()} storage`];
  const rootRecipe = recipeOf(w);
  if (pm) facts.push(`one module makes ${fmtRate(pm)} per hour${rootRecipe.sunlight ? ` at ${fmtPercent(state.chainSunlight)} sunlight` : ""}`);
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

  renderChainOptions();
}

// Recipe family and sector sunlight for the open chain, plus what the
// modules it needs would cost to build.
function renderChainOptions() {
  const chain = computeChain(state.selected, state.targetRate);
  const ids = Object.keys(chain.nodes);

  // offer only the race recipes that exist somewhere in this chain
  const all = new Set();
  (function walk(id, seen) {
    if (seen.has(id)) return;
    seen.add(id);
    for (const [m, r] of Object.entries(W[id].recipes)) {
      if (m !== W[id].mainMethod) all.add(m);
      for (const i of r.inputs) walk(i.wareID, seen);
    }
  })(state.selected, new Set());
  if (state.chainRace !== "default") all.add(state.chainRace);
  const raceSel = $("chain-race");
  $("chain-race-wrap").hidden = all.size === 0;
  const raceOpts = [["default", "Standard"], ...[...all].sort().map((m) => [m, METHOD_LABEL[m] || m])];
  const raceHTML = raceOpts.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  if (raceSel.dataset.html !== raceHTML) {
    raceSel.innerHTML = raceHTML;
    raceSel.dataset.html = raceHTML;
  }
  raceSel.value = state.chainRace;

  const solar = ids.some((id) => (recipeOf(W[id]) || {}).sunlight);
  $("chain-sun-wrap").hidden = !solar;
  const sunSel = $("chain-sun");
  if (solar && !sunSel.options.length) {
    const sectors = Object.entries(SECTORS)
      .filter(([, s]) => s.name)
      .sort((a, b) => b[1].sunlight - a[1].sunlight || a[1].name.localeCompare(b[1].name));
    sunSel.innerHTML = `<option value="">Any, at 100%</option>` +
      sectors.map(([k, s]) => `<option value="${k}">${escapeHTML(s.name)} (${fmtPercent(s.sunlight)})</option>`).join("");
  }
  if (solar) sunSel.value = state.chainSector;

  // build cost: everything the chain needs, and what is still missing
  let fullN = 0, fullCost = 0, missN = 0, missCost = 0;
  for (const id of ids) {
    const n = chain.nodes[id];
    if (!n.modules) continue;
    const cost = moduleCost(id, n.method);
    const missing = Math.max(0, n.modules - getCount(id));
    fullN += n.modules;
    fullCost += n.modules * cost;
    missN += missing;
    missCost += missing * cost;
  }
  const minedCost = ids.filter((id) => W[id].isMined).reduce((s, id) => s + chain.nodes[id].rate * W[id].price.avg, 0);
  const value = state.targetRate * W[state.selected].price.avg - minedCost;
  const n = (v) => `<strong class="num">${v}</strong>`;
  let text = `<span class="cost-line">Whole chain: ${n(fullN)} ${plural(fullN, "module")}, about ${n(fmtCredits(fullCost))} Cr. ` +
    (missN ? `${n(missN)} still to build, about ${n(fmtCredits(missCost))} Cr.` : "All of it built.") + "</span>";
  if (value > 0 && fullCost > 0) text += `<span class="cost-line">Adds about ${n(fmtCredits(value))} Cr/h, pays for itself in ${fmtHours(fullCost / value)}.</span>`;
  $("chain-cost").innerHTML = text;
}

function setTargetRate(rate) {
  state.targetRate = Math.max(1, Number(rate) || 1);
  refresh();
}

function stepTargetModules(direction) {
  const pm = chainPerModule(W[state.selected]);
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

  // one block per recipe; race variants (Teladi, Terran, ...) after the main one
  const methods = Object.keys(w.recipes).sort((a, b) => (a === w.mainMethod ? -1 : b === w.mainMethod ? 1 : a.localeCompare(b)));
  const inputs = methods.map((method) => {
    const r = w.recipes[method];
    const title = methods.length === 1 ? "Inputs" : method === w.mainMethod ? "Standard recipe" : `${METHOD_LABEL[method] || method} recipe`;
    const yieldNote = method === w.mainMethod ? "" : `<p class="quiet-note recipe-note">${r.amount} per ${fmtTime(r.time)} cycle</p>`;
    const body = r.inputs.length
      ? `<div class="cols-head"><span>Ware</span><span>per cycle</span><span>per hour</span></div>
         ${r.inputs.map((i) => `
          <button type="button" class="link-row" data-action="goto" data-id="${i.wareID}">
            <span class="name">${W[i.wareID].label}</span>
            <span class="num">${i.amount}</span>
            <span class="num dim">${fmtRate((i.amount * 3600) / r.time)}</span>
          </button>`).join("")}`
      : `<p class="quiet-note">${r.sunlight ? "Needs only sunlight. Output scales with the sector's sunlight." : "Needs no material inputs."}</p>`;
    return `<section class="inspector-section"><h3>${title}</h3>${yieldNote}${body}</section>`;
  }).join("");

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
    ${id !== state.selected || state.view !== "planner" ? `<div class="inspector-actions"><button type="button" class="btn" data-action="goto" data-id="${id}">Plan this chain${icon("arrow-right", 13)}</button></div>` : ""}
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

/* Production units: every built module, with the recipe it really runs and
   its efficiency. Modules read from a save keep their race recipe and the
   efficiency the game recorded (sunlight and workforce included). Anything
   the player entered by hand on top of that runs the main recipe at 100%. */
function productionUnits() {
  const imported = new Map();
  if (state.empire) {
    for (const st of state.empire.stations) {
      for (const m of st.modules) {
        if (!imported.has(m.ware)) imported.set(m.ware, []);
        imported.get(m.ware).push(m);
      }
    }
  }

  const units = [];
  for (const [id, count] of state.moduleCounts) {
    const w = W[id];
    if (!perModule(w)) continue;
    let left = count;
    for (const m of imported.get(id) || []) {
      if (left <= 0) break;
      const n = Math.min(left, m.count);
      units.push({ ware: id, method: m.method, count: n, efficiency: m.efficiency });
      left -= n;
    }
    if (left > 0) units.push({ ware: id, method: w.mainMethod, count: left, efficiency: 1 });
  }
  return units;
}

// per hour: what a group of modules makes, what it uses, and the value it adds
function unitFlows(u) {
  const w = W[u.ware];
  const r = w.recipes[u.method] || w.recipes[w.mainMethod];
  const cyclesPerHour = (3600 / r.time) * u.count;
  const made = r.amount * cyclesPerHour * u.efficiency;
  const uses = r.inputs.map((i) => ({ ware: i.wareID, amount: i.amount * cyclesPerHour }));
  const value = made * w.price.avg - uses.reduce((sum, i) => sum + i.amount * W[i.ware].price.avg, 0);
  return { made, uses, value };
}

// Estimated value added per hour at average prices: everything made is
// worth its average price, every input costs its average price.
function empireProfit() {
  let value = productionUnits().reduce((sum, u) => sum + unitFlows(u).value, 0);
  for (const [ware, n] of empireUpkeep()) value -= n * W[ware].price.avg;
  return value;
}

// food and medicine your workers eat per hour, across every station read
// from a save (stations without habitats have no workers to feed)
function empireUpkeep() {
  const total = new Map();
  if (state.empire) {
    for (const st of state.empire.stations) {
      for (const u of st.upkeep || []) total.set(u.ware, (total.get(u.ware) || 0) + u.amount);
    }
  }
  return total;
}

function levelFor(profit) {
  let i = 0;
  while (i + 1 < LEVELS.length && profit >= LEVELS[i + 1].min) i++;
  return { index: i, level: LEVELS[i], next: LEVELS[i + 1] || null };
}

function computeBalance() {
  const supply = new Map();
  const demand = new Map();

  for (const u of productionUnits()) {
    const f = unitFlows(u);
    supply.set(u.ware, (supply.get(u.ware) || 0) + f.made);
    for (const i of f.uses) demand.set(i.ware, (demand.get(i.ware) || 0) + i.amount);
  }
  for (const [ware, n] of empireUpkeep()) demand.set(ware, (demand.get(ware) || 0) + n);

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
    .map((w) => {
      const missing = [...allTransitiveInputs(w.id)].filter((id) => !isBuilt(id));
      // one module of it, plus one of each missing input that is built (not mined)
      const cost = moduleCost(w.id, w.mainMethod) +
        missing.filter((id) => !W[id].isMined).reduce((s, id) => s + moduleCost(id, W[id].mainMethod), 0);
      const value = perModule(w) ? moduleValue(w.id) : 0;
      return { id: w.id, missing, cost, value };
    })
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
  const madeByWare = new Map();
  for (const u of productionUnits()) madeByWare.set(u.ware, (madeByWare.get(u.ware) || 0) + unitFlows(u).made);

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
        const made = madeByWare.get(id) || 0;
        const count = getCount(id);
        return `<div class="net-row is-built">
          <button type="button" class="net-name" data-action="goto" data-id="${id}" data-fk="net:${id}:name">${W[id].label}</button>
          <span class="stepper is-small">
            <button type="button" data-action="dec" data-id="${id}" data-fk="net:${id}:dec" aria-label="One module less">${icon("minus", 12)}</button>
            <input type="number" class="net-count" min="0" step="1" value="${count}" data-id="${id}" data-fk="net:${id}:count" aria-label="Modules of ${W[id].label} built">
            <button type="button" data-action="inc" data-id="${id}" data-fk="net:${id}:inc" aria-label="One module more">${icon("plus", 12)}</button>
          </span>
          <span class="num dim" title="Total output per hour">${made ? fmtRate(made) + "/h" : "no rate"}</span>
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
        let sub = ready ? "Every input is covered" : "Still needs " + r.missing.map((id) => W[id].label).join(", ");
        if (r.cost) sub += `. About ${fmtCredits(r.cost)} Cr to start${r.value > 0 ? `, one module adds ${fmtCredits(r.value)} Cr/h` : ""}`;
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
  state.empire = null;
  state.plan = {};
  savePlan();
  saveCounts();
  saveEmpire();
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

  document.querySelectorAll(".segmented button[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.filter = btn.dataset.filter;
      applyFilter();
      saveUI();
    });
  });

  // target controls
  els.targetModules.addEventListener("change", () => {
    const pm = chainPerModule(W[state.selected]);
    setTargetRate((Number(els.targetModules.value) || 1) * pm);
  });
  els.targetRate.addEventListener("change", () => setTargetRate(els.targetRate.value));
  els.targetDec.addEventListener("click", () => stepTargetModules(-1));
  els.targetInc.addEventListener("click", () => stepTargetModules(1));
  els.targetMatch.addEventListener("click", () => {
    setTargetRate(chainPerModule(W[state.selected]) * getCount(state.selected));
  });

  // chain options: switching recipe or sunlight keeps the root's module count
  const keepModules = (change) => {
    const before = chainPerModule(W[state.selected]);
    const modules = before ? state.targetRate / before : 0;
    change();
    const after = chainPerModule(W[state.selected]);
    if (modules && after) state.targetRate = modules * after;
    refresh();
  };
  $("chain-race").addEventListener("change", (e) => keepModules(() => (state.chainRace = e.target.value)));
  $("chain-sun").addEventListener("change", (e) => keepModules(() => {
    state.chainSector = e.target.value;
    state.chainSunlight = e.target.value && SECTORS[e.target.value] ? SECTORS[e.target.value].sunlight : 1;
  }));

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
    } else if (action === "goto") {
      state.view = "planner";
      selectWare(id);
    }
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
      // the Empire view has no ware list: "/" filters stations there
      const field = state.view === "empire" ? $("station-filter") : els.search;
      if (state.view === "empire" && state.empireTab !== "stations") setEmpireTab("stations");
      field.focus();
      field.select();
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
  loadEmpire();
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
  bindEmpireEvents();
  loadEmpireExtras();

  if (ui && ui.selected && W[ui.selected]) selectWare(ui.selected, { rate: Number(ui.targetRate) });
  else refresh();
}

