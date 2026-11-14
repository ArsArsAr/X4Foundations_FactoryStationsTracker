"use strict";

/* ---------------------------------------------------------------------
   Empire view: everything read from a save.

   Overview  level, earnings, what needs attention, earnings over saves
   Stations  every station, its modules, stock and a what-if plan
   Prices    the player's trade prices next to the NPC market in the save
   Rewards   the level ladder and achievements

   Loaded after app.js and uses its state, helpers and refresh().
--------------------------------------------------------------------- */

const PROGRESS_KEY = "x4-factories-planner:progress";
const PLAN_KEY = "x4-factories-planner:plan";
const HISTORY_KEY = "x4-factories-planner:history";

const METHOD_LABEL = {
  teladi: "Teladi", terran: "Terran", boron: "Boron", paranid: "Paranid",
  split: "Split", argon: "Argon", recycling: "Recycling",
};

const FACTION_LABEL = {
  argon: "Argon Federation", antigone: "Antigone Republic", hatikvah: "Hatikvah Free League",
  teladi: "Teladi Company", ministry: "Ministry of Finance", paranid: "Godrealm of the Paranid",
  holyorder: "Holy Order", trinity: "Trinity", alliance: "Alliance of the Word",
  split: "Zyarth Patriarchy", freesplit: "Free Families", fallensplit: "Fallen Families",
  court: "Court of Curbs", terran: "Terran Protectorate", pioneers: "Segaris Pioneers",
  boron: "Queendom of Boron", scaleplate: "Scale Plate Pact", buccaneers: "Duke's Buccaneers",
  loanshark: "Vigor Syndicate", yaki: "Yaki", scavenger: "Riptide Rakers",
};

const STALL_STATES = new Set(["waitingforresources"]);
const RUNWAY_WARN_HOURS = 4;
const STORAGE_WARN = 0.9;

/* Achievements: a second set of badges for milestones. Once earned they
   stay earned, even if the empire later shrinks. */
const ACHIEVEMENTS = [
  { id: "first-brick", icon: "cube", name: "First Brick", text: "Run your first production module.", test: (c) => c.modules >= 1 },
  { id: "landlord", icon: "house", name: "Landlord", text: "Own a station with living quarters.", test: (c) => c.habitats >= 1 },
  { id: "small-business", icon: "storefront", name: "Small Business", text: "Own 10 stations.", test: (c) => c.stations >= 10 },
  { id: "conglomerate", icon: "city", name: "Conglomerate", text: "Own 25 stations.", test: (c) => c.stations >= 25 },
  { id: "assembly-line", icon: "gear-six", name: "Assembly Line", text: "Run 50 production modules.", test: (c) => c.modules >= 50 },
  { id: "industrial-park", icon: "factory", name: "Industrial Park", text: "Run 150 production modules.", test: (c) => c.modules >= 150 },
  { id: "megafactory", icon: "lightning", name: "Megafactory", text: "Run 400 production modules.", test: (c) => c.modules >= 400 },
  { id: "sunbather", icon: "sun", name: "Sunbather", text: "Run 50 Energy Cell modules.", test: (c) => c.solar >= 50 },
  { id: "cosmopolitan", icon: "globe-hemisphere-west", name: "Cosmopolitan", text: "Use three different race recipes.", test: (c) => c.races >= 3 },
  { id: "perfect-balance", icon: "scales", name: "Perfect Balance", text: "Run 20 or more modules with no shortfalls.", test: (c) => c.modules >= 20 && !c.shortfalls },
  { id: "prospector", icon: "hammer", name: "Prospector", text: "Source ore, silicon, ice, hydrogen, helium and methane.", test: (c) => c.minerals >= 6 },
  { id: "cash-cow", icon: "piggy-bank", name: "Cash Cow", text: "Have one station add 5M Cr per hour.", test: (c) => c.bestStation >= 5e6 },
  { id: "full-house", icon: "users-three", name: "Full House", text: "Fully staff a station's production.", test: (c) => c.fullyStaffed },
  { id: "millionaire", icon: "coins", name: "Millionaire", text: "Add 1M Cr per hour across your empire.", test: (c) => c.profit >= 1e6 },
  { id: "billionaire", icon: "diamond", name: "Billionaire", text: "Add 1B Cr per hour across your empire.", test: (c) => c.profit >= 1e9 },
];
const BASE_MINERALS = ["ore", "silicon", "ice", "hydrogen", "helium", "methane"];

// highest level ever reached and achievements ever earned (null = never recorded)
const progress = { highest: null, achievements: null };
let history = []; // earnings per loaded save, oldest first
let celebrationQueue = null;

/* ---------------------------------------------------------------------
   Small helpers
--------------------------------------------------------------------- */

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function badgeHTML(index, size) {
  return X4Badges.badgeSVG(index, size, `Level ${index + 1}: ${LEVELS[index].name}`);
}

function factionLabel(id) {
  return FACTION_LABEL[id] || (id ? id.charAt(0).toUpperCase() + id.slice(1) : "Unknown");
}

// a column label with its definition on hover
const TERMS = {
  average: "Value added per hour at the game's average prices: what the station makes, minus its inputs and what its workers eat.",
  own: "Value added per hour at this station's own trade prices from the save. Stations that only feed your other stations can look low here.",
  workforce: "Workers living at the station, against the workers its modules need for full speed.",
  modules: "Production modules built at the station.",
  efficiency: "Output compared with the recipe, including sunlight and the workforce bonus.",
  makes: "Units made per hour by this group of modules.",
  value: "Output value minus input cost per hour, at average prices.",
  needed: "What your stations use per hour with every module running, plus what their workers eat.",
  miners: "What your mining ships delivered per hour, from the trade log in the save.",
  bought: "Bought from NPC stations per hour, and the average price paid.",
  covered: "Your miners plus purchases, as a share of what is needed.",
  wanted: "Units NPC stations are asking to buy right now, and the typical price they pay.",
  forsale: "Units NPC stations are offering for sale right now.",
  onemodule: "What one module adds per hour at local prices: output at the typical NPC buying price, minus inputs at the typical NPC selling price.",
  payback: "Build cost of one module divided by what it adds per hour.",
  yourprice: "Your stations' trade offer for this ware, averaged over the stations that trade it.",
};

function term(label, key) {
  return `<span class="term" title="${escapeHTML(TERMS[key])}">${label}</span>`;
}

function fmtCr(n) {
  return `${fmtCredits(n)} Cr`;
}

function median(sorted) {
  if (!sorted.length) return 0;
  const m = sorted.length >> 1;
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

function readJSON(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch (e) {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* not fatal */
  }
}

/* ---------------------------------------------------------------------
   Station economics: what each station makes and uses, priced either at
   average prices or at the station's own trade prices.
--------------------------------------------------------------------- */

// net units per hour by ware: positive = surplus to sell, negative = to
// buy in. Includes the food and medicine the station's workers eat.
function stationNet(st, modules = st.modules) {
  const net = new Map();
  for (const m of modules) {
    const f = unitFlows(m);
    net.set(m.ware, (net.get(m.ware) || 0) + f.made);
    for (const i of f.uses) net.set(i.ware, (net.get(i.ware) || 0) - i.amount);
  }
  for (const u of st.upkeep || []) net.set(u.ware, (net.get(u.ware) || 0) - u.amount);
  return net;
}

// The price a station trades a ware at: its live trade offer, else a
// price the player set by hand, else the average price.
function ownPrice(st, ware, side) {
  const o = st.offers && st.offers[ware] && st.offers[ware][side];
  if (o && o.price > 0) return { price: o.price, source: "offer" };
  const ov = st.overrides && st.overrides[ware];
  if (ov && ov[side] > 0) return { price: ov[side], source: "manual" };
  return { price: W[ware].price.avg, source: "average" };
}

function stationValue(st, mode = "avg", modules = st.modules) {
  let value = 0;
  for (const [ware, n] of stationNet(st, modules)) {
    if (Math.abs(n) < 1e-9) continue;
    const price = mode === "own" ? ownPrice(st, ware, n > 0 ? "sell" : "buy").price : W[ware].price.avg;
    value += n * price;
  }
  return value;
}

// Empire-wide at own prices. Wares your stations pass to each other are
// money moving between your own pockets, so only the empire's net surplus
// is sold (at your stations' mean sell price) and only its net shortfall
// is bought (at their mean buy price).
function empireOwnProfit() {
  const e = state.empire;
  if (!e) return 0;
  const net = new Map();
  const prices = { sell: new Map(), buy: new Map() };
  for (const st of e.stations) {
    for (const [w, n] of stationNet(st)) {
      net.set(w, (net.get(w) || 0) + n);
      for (const side of ["sell", "buy"]) {
        const p = ownPrice(st, w, side);
        if (p.source === "average") continue;
        const cur = prices[side].get(w) || [0, 0];
        prices[side].set(w, [cur[0] + p.price, cur[1] + 1]);
      }
    }
  }
  let value = 0;
  for (const [w, n] of net) {
    if (Math.abs(n) < 1e-9) continue;
    const p = prices[n > 0 ? "sell" : "buy"].get(w);
    value += n * (p ? p[0] / p[1] : W[w].price.avg);
  }
  return value;
}

function moduleTotal(st) {
  return st.modules.reduce((a, m) => a + m.count, 0);
}

// hours of stock left for each input the station runs short of on its own
function stationRunway(st, net = stationNet(st)) {
  const out = [];
  for (const [ware, n] of net) {
    if (n >= -1e-6) continue;
    const stock = (st.cargo && st.cargo[ware]) || 0;
    out.push({ ware, perHour: -n, stock, hours: stock / -n });
  }
  return out.sort((a, b) => a.hours - b.hours);
}

// how full each kind of storage is, counting the wares the app knows
function storageFill(st) {
  const cap = st.storageCap || {};
  const used = {};
  for (const [ware, n] of Object.entries(st.cargo || {})) {
    const w = W[ware];
    if (!w) continue;
    const type = w.storageType.toLowerCase();
    used[type] = (used[type] || 0) + n * w.volume;
  }
  return Object.entries(cap)
    .filter(([, c]) => c > 0)
    .map(([type, c]) => ({ type, cap: c, used: used[type] || 0, fill: (used[type] || 0) / c }))
    .sort((a, b) => b.fill - a.fill);
}

// Extra value per hour if the station had every worker its modules want.
// X4 scales a module's output by up to (1 + work bonus) with full staff.
function workforceGain(st) {
  if (!st.workforceNeed) return 0;
  const ratio = Math.min(1, st.workforce / st.workforceNeed);
  if (ratio >= 0.999) return 0;
  let gain = 0;
  for (const m of st.modules) {
    const w = W[m.ware];
    const r = w.recipes[m.method] || w.recipes[w.mainMethod];
    if (!r.work) continue;
    const made = unitFlows(m).made;
    gain += made * ((1 + r.work) / (1 + r.work * ratio) - 1) * w.price.avg;
  }
  // the extra workers have to be fed (employed workers, standard diet)
  const diet = (WORKFORCE.default || {}).busy || [];
  const perWorker = diet.reduce((s, i) => s + (W[i.wareID] ? i.amount * W[i.wareID].price.avg : 0), 0);
  return Math.max(0, gain - (st.workforceNeed - Math.min(st.workforce, st.workforceNeed)) * perWorker);
}

/* ---------------------------------------------------------------------
   Needs attention
--------------------------------------------------------------------- */

function attentionIssues() {
  const e = state.empire;
  if (!e) return [];
  const issues = [];

  for (const st of e.stations) {
    const stalledWares = new Set();

    for (const m of st.modules) {
      if (!m.stalled) continue;
      const short = (m.short || []).filter((id) => W[id]);
      short.forEach((id) => stalledWares.add(id));
      issues.push({
        sev: 3, st, kind: "stalled", short, stalled: m.stalled, module: m.ware,
        title: `${m.stalled} of ${m.count} ${W[m.ware].label} ${plural(m.count, "module")} stalled`,
        sub: short.length ? `Waiting for ${short.map((id) => W[id].label).join(", ")}` : "Waiting for inputs",
        weight: m.stalled * Math.max(0, moduleValue(m.ware, m.method, m.efficiency)),
      });
    }

    if (st.cargo) {
      for (const r of stationRunway(st)) {
        if (r.hours >= RUNWAY_WARN_HOURS || stalledWares.has(r.ware)) continue;
        issues.push({
          sev: 2, st, kind: "runway", ware: r.ware, hours: r.hours,
          title: r.stock ? `${W[r.ware].label} runs out in ${fmtHours(r.hours)}` : `No ${W[r.ware].label} in stock`,
          sub: `Uses ${fmtRate(r.perHour)} per hour, ${Math.round(r.stock).toLocaleString("en-US")} in stock`,
          weight: r.perHour * W[r.ware].price.avg,
        });
      }
      for (const s of storageFill(st)) {
        if (s.fill < STORAGE_WARN) continue;
        issues.push({
          sev: 2, st, kind: "storage",
          title: `${s.type.charAt(0).toUpperCase() + s.type.slice(1)} storage ${fmtPercent(Math.min(1, s.fill))} full`,
          sub: "Production stops when it is full. Sell more, or add storage.",
          weight: s.fill,
        });
      }
    }

    if (st.workforceNeed && st.workforce < st.workforceNeed * 0.9) {
      const gain = workforceGain(st);
      const housing = st.habitatCapacity < st.workforceNeed
        ? `Housing fits ${st.habitatCapacity.toLocaleString("en-US")}, so add habitats. `
        : "";
      issues.push({
        sev: 1, st, kind: "workforce", gain,
        title: `Workforce at ${fmtPercent(st.workforce / st.workforceNeed)}`,
        sub: `${st.workforce.toLocaleString("en-US")} of ${st.workforceNeed.toLocaleString("en-US")} workers. ${housing}${gain > 0 ? `Full staff adds about ${fmtCr(gain)} per hour.` : ""}`.trim(),
        weight: gain,
      });
    }
  }

  if (e.flows) {
    for (const r of miningRows()) {
      if (r.cover >= 0.95 || !r.need) continue;
      issues.push({
        sev: r.stalled ? 3 : 2, st: null, kind: "mining", tab: "supply", ware: r.ware,
        title: `${W[r.ware].label} supply covers ${fmtPercent(r.cover)} of what you use`,
        sub: `${r.stalled ? `${r.stalled} ${plural(r.stalled, "module")} stalled waiting for it. ` : ""}${r.more ? `About ${r.more} more ${plural(r.more, "miner")} would close the gap.` : ""}`.trim(),
        weight: 1e12 * (1 - r.cover), // ahead of single stalls: this is usually their cause
      });
    }
    for (const r of internalRows()) {
      if (r.gain < 50e3) continue;
      issues.push({
        sev: 1, st: null, kind: "internal", tab: "supply", ware: r.ware, gain: r.gain,
        title: `You sell ${W[r.ware].label} to NPCs and buy it back`,
        sub: `Supplying your own stations first keeps about ${fmtCr(r.gain)} per hour.`,
        weight: r.gain,
      });
    }
  }

  return issues.sort((a, b) => b.sev - a.sev || b.weight - a.weight);
}

const ISSUE_ICON = { stalled: "warning", runway: "clock", storage: "warning", workforce: "trend-up", mining: "warning", internal: "trend-up" };

const SEV_LABEL = { 3: "Urgent", 2: "Soon", 1: "Worth a look" };

// One entry per cause instead of one per symptom: a supply shortage takes
// in the stalls it causes, low stock and full storage group by ware.
function attentionGroups() {
  const issues = attentionIssues();
  const groups = new Map();
  const add = (key, base) => {
    if (!groups.has(key)) groups.set(key, { key, items: [], weight: 0, sub: "", ...base });
    return groups.get(key);
  };
  for (const i of issues) {
    if (i.kind !== "mining") continue;
    const g = add(`ware:${i.ware}`, { sev: i.sev, kind: "mining", ware: i.ware, title: i.title, sub: i.sub, tab: "supply" });
    g.weight += i.weight;
  }
  for (const i of issues) {
    if (i.kind === "stalled") {
      const cause = i.short.find((w) => groups.has(`ware:${w}`)) || i.short[0] || "inputs";
      const g = add(`ware:${cause}`, { sev: 3, kind: "stalled", ware: cause });
      g.items.push(i);
      g.weight += i.weight;
      g.sev = Math.max(g.sev, 3);
    } else if (i.kind === "runway") {
      // low stock of a ware that already has a cause above belongs to that cause
      const g = groups.get(`ware:${i.ware}`) || add("runway", { sev: 2, kind: "runway" });
      g.items.push(i);
    } else if (i.kind === "storage") {
      add("storage", { sev: 2, kind: "storage" }).items.push(i);
    } else if (i.kind === "workforce") {
      add("workforce", { sev: 1, kind: "workforce" }).items.push(i);
    } else if (i.kind === "internal") {
      add("internal", { sev: 1, kind: "internal", tab: "supply" }).items.push(i);
    }
  }

  for (const g of groups.values()) {
    const stations = new Set(g.items.filter((i) => i.st).map((i) => i.st.id)).size;
    const stalledStations = new Set(g.items.filter((i) => i.kind === "stalled").map((i) => i.st.id)).size;
    const stalledAt = `${stalledStations} ${plural(stalledStations, "station")}`;
    const at = `${stations} ${plural(stations, "station")}`;
    const label = W[g.ware] ? W[g.ware].label : "inputs";
    if (g.kind === "mining") {
      if (stalledStations) g.sub = g.sub.replace(/stalled waiting for it\./, `stalled at ${stalledAt}.`);
    } else if (g.kind === "stalled") {
      const n = g.items.reduce((s, i) => s + (i.stalled || 0), 0);
      g.title = `Short of ${label}`;
      g.sub = `${n} ${plural(n, "module")} stalled at ${stalledAt}.`;
    } else if (g.kind === "runway") {
      const wares = new Set(g.items.map((i) => i.ware));
      g.title = `Low stock of ${wares.size} ${plural(wares.size, "ware")} at ${at}`;
      g.sub = `Stock that runs out within ${RUNWAY_WARN_HOURS} hours: ${[...wares].slice(0, 3).map((w) => W[w].label).join(", ")}${wares.size > 3 ? " and more" : ""}.`;
      g.weight = g.items.reduce((s, i) => s + i.weight, 0);
      g.items.sort((a, b) => a.hours - b.hours);
    } else if (g.kind === "storage") {
      g.title = `Storage nearly full at ${at}`;
      g.sub = "Production stops when storage is full. Sell more, or add storage.";
    } else if (g.kind === "workforce") {
      const gain = g.items.reduce((s, i) => s + (i.gain || 0), 0);
      g.title = `${at} short of workers`;
      g.sub = gain > 0 ? `Full staff would add about ${fmtCr(gain)} per hour.` : "Add habitats so the modules get their workforce bonus.";
      g.weight = gain;
    } else if (g.kind === "internal") {
      const gain = g.items.reduce((s, i) => s + i.gain, 0);
      g.title = `${g.items.length} ${plural(g.items.length, "ware")} sold to NPCs and bought back`;
      g.sub = `Supplying your own stations first keeps about ${fmtCr(gain)} per hour.`;
      g.weight = gain;
    }
  }
  return [...groups.values()].sort((a, b) => b.sev - a.sev || b.weight - a.weight);
}

function renderAttention() {
  const box = $("attention-list");
  const e = state.empire;
  if (!e) {
    box.innerHTML = `<p class="quiet-note">Load a save to check every station for stalled modules, low stock, full storage and missing workers.</p>`;
    return;
  }
  if (!e.stations.some((st) => st.storageCap)) {
    box.innerHTML = `<p class="quiet-note">Load your save again to check stock, storage and workers. This empire was read by an older version.</p>`;
    return;
  }
  const groups = attentionGroups();
  if (!groups.length) {
    box.innerHTML = `<p class="quiet-note all-good">${icon("check", 13)}Nothing needs attention. Every module has what it needs.</p>`;
    return;
  }
  const LIMIT = 5;
  const shown = state.attentionAll ? groups : groups.slice(0, LIMIT);
  const open = state.openGroups || new Set();
  const head = (g) => `
    <span class="issue-icon">${icon(ISSUE_ICON[g.kind], 14)}</span>
    <span class="issue-text">
      <span class="issue-title"><span class="sr-only">${SEV_LABEL[g.sev]}: </span>${escapeHTML(g.title)}</span>
      <span class="issue-sub">${escapeHTML(g.sub)}</span>
    </span>`;
  const item = (i) => i.st
    ? `<li><button type="button" class="issue-item" data-action="open-station" data-id="${escapeHTML(i.st.id)}"><span class="issue-item-st">${escapeHTML(stationLabel(i.st))}</span><span>${escapeHTML(i.title)}</span></button></li>`
    : `<li><button type="button" class="issue-item" data-action="open-tab" data-id="supply"><span class="issue-item-st">${escapeHTML(i.title.replace(/^You sell /, "").replace(/ to NPCs and buy it back$/, ""))}</span><span>${escapeHTML(i.sub)}</span></button></li>`;
  box.innerHTML = `<ul class="issues">${shown.map((g) => {
    if (!g.items.length) {
      return `<li><button type="button" class="issue sev-${g.sev}" data-action="open-tab" data-id="${g.tab}">${head(g)}<span class="issue-go">${icon("arrow-right", 12)}</span></button></li>`;
    }
    return `<li><details class="issue-group" data-key="${escapeHTML(g.key)}"${open.has(g.key) ? " open" : ""}>
      <summary class="issue sev-${g.sev}">${head(g)}<span class="issue-count num" title="${g.items.length} ${g.items.length === 1 ? "entry" : "entries"}">${g.items.length}</span></summary>
      <ul class="issue-items">${g.items.map(item).join("")}
        ${g.tab ? `<li><button type="button" class="issue-item is-link" data-action="open-tab" data-id="${g.tab}">Open the Supply tab${icon("arrow-right", 11)}</button></li>` : ""}
      </ul>
    </details></li>`;
  }).join("")}</ul>
    ${groups.length > LIMIT ? `<button type="button" class="btn is-small is-ghost" data-action="toggle-attention">${state.attentionAll ? "Show fewer" : `Show ${groups.length - LIMIT} more`}</button>` : ""}`;
}

/* ---------------------------------------------------------------------
   Views, tabs, rank
--------------------------------------------------------------------- */

function setView(view) {
  state.view = view;
  refresh();
}

function setEmpireTab(tab) {
  state.empireTab = tab;
  refresh();
  els.empireView.scrollTop = 0;
}

function renderView() {
  const empire = state.view === "empire";
  els.chainView.hidden = empire;
  els.empireView.hidden = !empire;
  document.querySelectorAll(".view-switch button").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.view === state.view));
  });
  document.querySelectorAll("#empire-view .tabs button[data-tab]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.tab === state.empireTab));
  });
  $("app").dataset.view = state.view;
  renderSaveAge();
  document.querySelectorAll("#empire-view .tab-panel").forEach((p) => {
    p.hidden = p.dataset.panel !== state.empireTab;
  });
}

function renderRank() {
  const profit = empireProfit();
  const { index, level } = levelFor(profit);
  const hasData = state.moduleCounts.size > 0;
  els.rankChip.hidden = !hasData;
  if (hasData) {
    els.rankChip.innerHTML = `${badgeHTML(index, 30)}<span class="rank-chip-num num">${index + 1}</span><span class="rank-chip-name">${level.name}</span>`;
    els.rankChip.title = `Level ${index + 1}: ${level.name}, about ${fmtCredits(profit)} Cr per hour. Click for details.`;
  }
  checkProgress(hasData ? index : 0);
}

// the highest level the player may see: reached now, or reached before
function revealedLevel(current) {
  return Math.max(current, progress.highest || 0);
}

function renderEmpire() {
  if (state.view !== "empire") return;
  const tab = state.empireTab;
  if (tab === "overview") renderOverview();
  else if (tab === "stations") renderStationsTab();
  else if (tab === "supply") renderSupply();
  else if (tab === "prices") {
    renderOpportunities();
    renderPrices();
  }
  else if (tab === "rewards") renderRewards();
}

function renderOverview() {
  const profit = empireProfit();
  const { index, level, next } = levelFor(profit);

  els.rankBadge.innerHTML = badgeHTML(index, 124);
  els.rankLevel.textContent = `Level ${index + 1} of ${LEVELS.length}`;
  els.rankName.textContent = level.name;
  els.rankFlavor.textContent = level.flavor;
  els.rankProfit.textContent = fmtCredits(Math.max(0, profit));

  const own = state.empire && state.empire.stations.some((st) => st.offers) ? empireOwnProfit() : null;
  els.rankDay.innerHTML = profit > 0
    ? `About ${fmtCredits(profit * 24)} Cr per in-game day at average prices.` +
      (own !== null ? `<br>At your own trade prices: <strong class="num">${fmtCredits(own)}</strong> Cr per hour.` : "")
    : "Track some production modules to start earning a rank.";

  if (next) {
    const span = next.min - level.min;
    const done = Math.min(1, Math.max(0, (profit - level.min) / span));
    const seen = index + 1 <= revealedLevel(index);
    els.rankNext.innerHTML = `
      <div class="rank-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(done * 100)}" aria-label="Progress to level ${index + 2}"><span style="transform:scaleX(${done})"></span></div>
      <p>${fmtCredits(next.min - profit)} Cr per hour more to ${seen ? `reach <strong>${next.name}</strong>` : `unlock level ${index + 2}. What it is stays a surprise.`}</p>`;
  } else {
    els.rankNext.innerHTML = `<p>Top level. There is nowhere left to go but sideways.</p>`;
  }

  document.querySelector(".rank-share").hidden = !(profit > 0);
  renderEmpireSource();
  renderAttention();
  renderHistory();
}

// how old the loaded save is; a stale save means stale numbers everywhere
function renderSaveAge() {
  const el = $("save-age");
  const e = state.empire;
  if (!e || !e.savedAt) {
    el.hidden = true;
    return;
  }
  const days = (Date.now() / 1000 - e.savedAt) / 86400;
  const when = new Date(e.savedAt * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const age = days < 1 / 24 ? "just now" : days < 1 ? `${Math.max(1, Math.round(days * 24))} h ago` : `${Math.round(days)} ${plural(Math.round(days), "day")} ago`;
  el.hidden = false;
  el.classList.toggle("is-stale", days > 1);
  el.innerHTML = days > 1
    ? `${icon("warning", 12)}<span>Save from ${when}, ${age}.</span><button type="button" class="link-btn" data-action="load-save">Load a newer one</button>`
    : `<span>Save from ${when}, ${age}</span>`;
}

/* One-click reloads: remember the save folder (where the browser allows it)
   and load its newest file. The folder handle lives in IndexedDB. */
const canPickFolder = typeof window.showDirectoryPicker === "function";
let saveFolder = null;

function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("x4-factories-planner", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const tx = req.result.transaction("kv", mode);
      const r = fn(tx.objectStore("kv"));
      tx.oncomplete = () => resolve(r && r.result);
      tx.onerror = () => reject(tx.error);
    };
  });
}

async function restoreSaveFolder() {
  if (!canPickFolder) return;
  try {
    saveFolder = (await idb("readonly", (s) => s.get("saveFolder"))) || null;
  } catch (e) {
    saveFolder = null;
  }
  updateLoadButton();
  if (state.view === "empire") renderEmpireSource();
}

function updateLoadButton() {
  els.loadSave.title = saveFolder
    ? `Load the newest save from your "${saveFolder.name}" folder`
    : "Read your stations and modules from an X4 save file";
}

async function chooseSaveFolder() {
  try {
    const handle = await window.showDirectoryPicker({ id: "x4-saves", mode: "read" });
    saveFolder = handle;
    try {
      await idb("readwrite", (s) => s.put(handle, "saveFolder"));
    } catch (e) {
      /* works for this session only */
    }
    updateLoadButton();
    await loadNewestSave();
  } catch (e) {
    if (e && e.name !== "AbortError") setStatus("Could not open that folder. Pick a save file instead.");
  }
}

async function loadNewestSave() {
  if (!saveFolder) {
    els.saveFile.click();
    return;
  }
  try {
    let perm = await saveFolder.queryPermission({ mode: "read" });
    if (perm !== "granted") perm = await saveFolder.requestPermission({ mode: "read" });
    if (perm !== "granted") {
      setStatus("Reading the save folder was not allowed. Pick a file instead.");
      return;
    }
    let newest = null;
    for await (const [name, handle] of saveFolder.entries()) {
      if (handle.kind !== "file" || !/\.xml(\.gz)?$/i.test(name)) continue;
      const file = await handle.getFile();
      if (!newest || file.lastModified > newest.lastModified) newest = file;
    }
    if (!newest) {
      setStatus(`No save files in "${saveFolder.name}". Choose the folder that holds quicksave.xml.gz.`);
      return;
    }
    importSave(newest);
  } catch (e) {
    console.error(e);
    setStatus("Could not read the save folder. Pick a file instead.");
  }
}

async function forgetSaveFolder() {
  saveFolder = null;
  try {
    await idb("readwrite", (s) => s.delete("saveFolder"));
  } catch (e) {
    /* nothing stored */
  }
  updateLoadButton();
  renderEmpireSource();
}

function loadButtons(primary) {
  const cls = primary ? "btn is-primary" : "btn";
  if (saveFolder) {
    return `<button type="button" class="${cls}" data-action="load-newest" title="From your &quot;${escapeHTML(saveFolder.name)}&quot; folder">${icon("folder-open")}Load newest save</button>
      <button type="button" class="btn" data-action="load-file">Pick a file</button>`;
  }
  return `<button type="button" class="${cls}" data-action="load-file">${icon("folder-open")}${primary ? "Load save" : "Load newer save"}</button>
    ${canPickFolder ? `<button type="button" class="btn" data-action="choose-folder" title="Remember your save folder, then load its newest save with one click">Use my save folder</button>` : ""}`;
}

function renderEmpireSource() {
  if (state.importing) {
    const pct = Math.round(state.importing.progress * 100);
    els.empireSource.innerHTML = `
      <div class="source-text">
        <h2>Reading ${escapeHTML(state.importing.fileName)}</h2>
        <p class="quiet-note">Unpacking and scanning on this computer. Large saves take a little while.</p>
      </div>
      <div class="load-progress"><div class="rank-bar"><span style="transform:scaleX(${state.importing.progress})"></span></div><span class="num">${pct}%</span></div>`;
    return;
  }

  const e = state.empire;
  if (!e) {
    els.empireSource.innerHTML = `
      <div class="source-text">
        <h2>Load your empire from a save</h2>
        <p>X4 keeps saves in <code>Documents\\Egosoft\\X4\\&lt;number&gt;\\save</code>. Pick the newest one, for example <code>quicksave.xml.gz</code>. It is read on this computer and never uploaded.</p>
        <p class="quiet-note">Your stations, modules, race recipes, sunlight, workforce, stock and trade prices come straight from the save. Built counts you entered by hand are replaced.${canPickFolder ? " With your save folder chosen once, later loads take one click." : ""}</p>
      </div>
      <div class="source-actions">${loadButtons(true)}</div>`;
    return;
  }

  const total = e.stations.reduce((s, st) => s + moduleTotal(st), 0);
  const when = e.savedAt ? new Date(e.savedAt * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "unknown date";
  els.empireSource.innerHTML = `
    <div class="source-text">
      <h2>${e.saveName ? `From "${escapeHTML(e.saveName)}"` : "From your save"}</h2>
      <p class="quiet-note">Saved ${when}. ${e.stations.length} ${plural(e.stations.length, "station")}, ${total} production ${plural(total, "module")}${e.skipped ? `, ${e.skipped} other ${plural(e.skipped, "module")} skipped` : ""}.</p>
      ${saveFolder ? `<p class="quiet-note">Save folder: <strong>${escapeHTML(saveFolder.name)}</strong>. <button type="button" class="link-btn" data-action="forget-folder">Forget folder</button></p>` : ""}
    </div>
    <div class="source-actions">
      ${loadButtons(false)}
      <button type="button" class="btn" data-action="forget-save" title="Keep your built counts, drop the station details">Forget save</button>
    </div>`;
}

/* ---------------------------------------------------------------------
   Earnings over saves
--------------------------------------------------------------------- */

function recordHistory() {
  const e = state.empire;
  if (!e) return;
  const entry = {
    savedAt: e.savedAt || Math.round(Date.now() / 1000),
    saveName: e.saveName || "",
    profit: Math.round(empireProfit()),
    ownProfit: Math.round(empireOwnProfit()),
    modules: e.stations.reduce((s, st) => s + moduleTotal(st), 0),
    stations: e.stations.length,
  };
  history = history.filter((h) => h.savedAt !== entry.savedAt);
  history.push(entry);
  history.sort((a, b) => a.savedAt - b.savedAt);
  if (history.length > 200) history = history.slice(-200);
  writeJSON(HISTORY_KEY, history);
}

function renderHistory() {
  const box = $("history");
  if (!history.length) {
    box.innerHTML = `<p class="quiet-note">Each save you load adds a point here, so you can watch your empire grow.</p>`;
    return;
  }
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  const date = (h) => new Date(h.savedAt * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" });

  let delta = "";
  if (prev) {
    const d = last.profit - prev.profit;
    delta = `<p class="history-delta ${d >= 0 ? "is-ok" : "is-short"}"><span class="num">${d >= 0 ? "+" : ""}${fmtCredits(d)}</span> Cr per hour since the save before (${date(prev)})</p>`;
  }

  if (history.length < 2) {
    box.innerHTML = `
      <p class="history-now"><span class="num">${fmtCredits(last.profit)}</span> Cr per hour on ${date(last)}</p>
      <p class="quiet-note">Load a newer save after playing a while and this turns into a chart.</p>`;
    return;
  }

  const W_ = 560, H = 150, padL = 8, padR = 8, padT = 12, padB = 22;
  const t0 = history[0].savedAt, t1 = last.savedAt;
  const max = Math.max(...history.map((h) => h.profit), 1) * 1.12;
  const x = (h, i) => padL + (t1 > t0 ? (h.savedAt - t0) / (t1 - t0) : i / (history.length - 1)) * (W_ - padL - padR);
  const y = (v) => padT + (1 - Math.max(0, v) / max) * (H - padT - padB);
  const pts = history.map((h, i) => [x(h, i), y(h.profit)]);
  const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
  const area = `${line}L${pts[pts.length - 1][0].toFixed(1)},${H - padB}L${pts[0][0].toFixed(1)},${H - padB}Z`;

  box.innerHTML = `
    ${delta}
    <svg class="history-chart" viewBox="0 0 ${W_} ${H}" role="img" aria-label="Estimated earnings per hour over ${history.length} saves">
      <line x1="${padL}" x2="${W_ - padR}" y1="${H - padB}" y2="${H - padB}" class="axis"/>
      <path d="${area}" class="area"/>
      <path d="${line}" class="line" vector-effect="non-scaling-stroke"/>
      ${pts.map(([px, py], i) => `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.5" class="dot"><title>${date(history[i])}: ${fmtCredits(history[i].profit)} Cr per hour, ${history[i].modules} modules</title></circle>`).join("")}
    </svg>
    <div class="history-axis"><span>${date(history[0])}</span><span>peak ${fmtCredits(Math.max(...history.map((h) => h.profit)))} Cr/h</span><span>${date(last)}</span></div>`;
}

/* ---------------------------------------------------------------------
   Stations tab, with the what-if plan
--------------------------------------------------------------------- */

function stationById(id) {
  return state.empire ? state.empire.stations.find((st) => st.id === id) : null;
}

// a station's modules with the plan applied
function plannedModules(st) {
  const plan = state.plan[st.id];
  if (!plan) return st.modules;
  const out = st.modules.map((m) => ({ ...m, count: Math.max(0, m.count + (plan[`${m.ware}|${m.method}`] || 0)) }));
  for (const [key, delta] of Object.entries(plan)) {
    const [ware, method] = key.split("|");
    if (delta > 0 && !st.modules.some((m) => m.ware === ware && m.method === method)) {
      const r = W[ware].recipes[method];
      out.push({ ware, method, count: delta, efficiency: r.sunlight ? st.sunlight : 1, planned: true });
    }
  }
  return out.filter((m) => m.count > 0);
}

function changePlan(stId, key, step) {
  const st = stationById(stId);
  if (!st) return;
  const plan = state.plan[stId] || {};
  const base = (st.modules.find((m) => `${m.ware}|${m.method}` === key) || { count: 0 }).count;
  const next = Math.max(-base, (plan[key] || 0) + step);
  if (next) plan[key] = next;
  else delete plan[key];
  if (Object.keys(plan).length) state.plan[stId] = plan;
  else delete state.plan[stId];
  savePlan();
  refresh();
}

function savePlan() {
  writeJSON(PLAN_KEY, state.plan);
}

function empireNetFrom(modulesOf) {
  const net = new Map();
  for (const st of state.empire.stations) {
    for (const [w, n] of stationNet(st, modulesOf(st))) net.set(w, (net.get(w) || 0) + n);
  }
  return net;
}

function planSummary() {
  const ids = Object.keys(state.plan).filter((id) => stationById(id));
  if (!ids.length) return null;
  let added = 0, removed = 0, cost = 0, delta = 0;
  for (const id of ids) {
    const st = stationById(id);
    for (const [key, d] of Object.entries(state.plan[id])) {
      const [ware, method] = key.split("|");
      if (d > 0) {
        added += d;
        cost += d * moduleCost(ware, method);
      } else removed -= d;
    }
    delta += stationValue(st, "avg", plannedModules(st)) - stationValue(st, "avg");
  }
  const before = empireNetFrom((st) => st.modules);
  const after = empireNetFrom(plannedModules);
  const shortfalls = [...after]
    .filter(([w, n]) => W[w] && !W[w].isMined && n < -1e-6 && n < (before.get(w) || 0) - 1e-6)
    .map(([w, n]) => ({ ware: w, net: n, change: n - (before.get(w) || 0) }))
    .sort((a, b) => a.change - b.change);
  const profit = empireProfit();
  return { stations: ids.length, added, removed, cost, delta, shortfalls, levelNow: levelFor(profit).index, levelThen: levelFor(profit + delta).index };
}

function renderPlanBar() {
  const bar = $("plan-bar");
  const p = planSummary();
  bar.hidden = !p;
  if (!p) return;
  const changes = [p.added ? `+${p.added}` : "", p.removed ? `-${p.removed}` : ""].filter(Boolean).join(" ");
  const payback = p.delta > 0 && p.cost > 0 ? `, pays for itself in ${fmtHours(p.cost / p.delta)}` : "";
  let levelText = "";
  if (p.levelThen > p.levelNow) {
    levelText = p.levelThen + 1 <= revealedLevel(p.levelNow)
      ? `Reaches level ${p.levelThen + 1}, ${LEVELS[p.levelThen].name}.`
      : `Reaches level ${p.levelThen + 1}. Build it to find out what it is.`;
  } else if (p.levelThen < p.levelNow) levelText = `Drops you to level ${p.levelThen + 1}.`;
  const shortText = p.shortfalls.length
    ? `New shortfalls: ${p.shortfalls.slice(0, 4).map((s) => `${W[s.ware].label} <span class="num is-short">${fmtRate(s.net)}/h</span>`).join(", ")}${p.shortfalls.length > 4 ? ` and ${p.shortfalls.length - 4} more` : ""}.`
    : "No new shortfalls.";
  bar.innerHTML = `
    <div class="plan-text">
      <h2>What-if plan</h2>
      <p><strong class="num">${changes}</strong> ${plural(p.added + p.removed, "module")} at ${p.stations} ${plural(p.stations, "station")}.
        <strong class="num ${p.delta >= 0 ? "is-ok" : "is-short"}">${p.delta >= 0 ? "+" : ""}${fmtCredits(p.delta)}</strong> Cr per hour,
        costs about <strong class="num">${fmtCredits(p.cost)}</strong> Cr${payback}. ${levelText}</p>
      <p class="plan-short">${shortText}</p>
    </div>
    <button type="button" class="btn" data-action="clear-plan">Clear plan</button>`;
}

function renderStationsTab() {
  renderPlanBar();
  const e = state.empire;
  if (!e) {
    els.stationsNote.textContent = "";
    els.stationList.innerHTML = `<p class="quiet-note">Load a save to see every station you own, what it makes and roughly what it earns.</p>`;
    return;
  }

  const hasOwn = e.stations.some((st) => st.offers);
  const issueCount = new Map();
  for (const i of attentionIssues()) if (i.st) issueCount.set(i.st.id, (issueCount.get(i.st.id) || 0) + 1);

  const sort = state.stationSort || { key: "avg", dir: -1 };
  const q = (state.stationFilter || "").trim().toLowerCase();
  const sortValue = {
    name: (r) => stationLabel(r.st).toLowerCase(),
    sector: (r) => r.st.sectorName.toLowerCase(),
    modules: (r) => r.modules,
    workforce: (r) => r.st.workforce || 0,
    avg: (r) => r.profit,
    own: (r) => (r.own === null ? -Infinity : r.own),
    issues: (r) => issueCount.get(r.st.id) || 0,
  }[sort.key];
  const rows = e.stations
    .map((st) => ({ st, profit: stationValue(st), own: hasOwn ? stationValue(st, "own") : null, modules: moduleTotal(st) }))
    .filter((r) => !q || [stationLabel(r.st), r.st.sectorName, ...r.st.modules.map((m) => W[m.ware].label)].some((t) => t.toLowerCase().includes(q)))
    .sort((a, b) => {
      const x = sortValue(a), y = sortValue(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir || b.profit - a.profit;
    });

  const head = (key, label) => {
    const active = sort.key === key;
    return `<button type="button" class="sort-btn${active ? " is-active" : ""}${active && sort.dir > 0 ? " is-asc" : ""}" data-action="sort-stations" data-id="${key}" aria-label="Sort by ${key}${active ? (sort.dir > 0 ? ", ascending" : ", descending") : ""}">${label}${active ? icon("caret-down", 10) : ""}</button>`;
  };
  els.stationsNote.textContent = `${rows.length === e.stations.length ? `${rows.length} ${plural(rows.length, "station")}` : `${rows.length} of ${e.stations.length} stations`}. Click a column to sort, a station to open it, and the plus and minus on a module to plan changes.`;
  els.stationList.innerHTML = `
    <div class="st-row st-head"><span></span><span>${head("name", "Station")}</span><span>${head("sector", "Sector")}</span><span>${head("modules", term("Modules", "modules"))}</span><span>${head("workforce", term("Workforce", "workforce"))}</span><span>${head("avg", term("Average", "average"))}</span><span>${head("own", term("Own prices", "own"))}</span></div>
    ${rows.length ? "" : `<p class="quiet-note st-empty">No station matches "${escapeHTML(state.stationFilter.trim())}".</p>`}
    ${rows.map(({ st, profit, own, modules }) => {
      const open = state.openStation === st.id;
      const issues = issueCount.get(st.id) || 0;
      const planned = state.plan[st.id] ? `<span class="tag is-plain">planned</span>` : "";
      const wf = st.workforceNeed ? `${st.workforce.toLocaleString("en-US")} / ${st.workforceNeed.toLocaleString("en-US")}` : st.workforce ? st.workforce.toLocaleString("en-US") : "none";
      const val = (v) => modules ? `<span class="num ${v > 0 ? "is-ok" : v < 0 ? "is-short" : "dim"}">${fmtCredits(v)}</span>` : `<span class="num dim">none</span>`;
      return `
      <div class="st-item${open ? " is-open" : ""}" data-station="${escapeHTML(st.id)}">
        <button type="button" class="st-row" data-action="toggle-station" data-id="${escapeHTML(st.id)}" aria-expanded="${open}">
          <span class="st-caret">${icon("caret-right", 12)}</span>
          <span class="st-name">${escapeHTML(stationLabel(st))}${st.underConstruction ? ` <span class="tag is-plain">building</span>` : ""}${issues ? ` <span class="tag is-short" title="${issues} ${plural(issues, "issue")} in Needs attention">${issues}</span>` : ""}${planned}</span>
          <span class="st-sector" title="Sunlight ${fmtPercent(st.sunlight)}">${escapeHTML(st.sectorName)}</span>
          <span class="num">${modules || "none"}</span>
          <span class="num dim">${wf}</span>
          ${val(profit)}
          ${own === null ? `<span class="num dim">reload</span>` : val(own)}
        </button>
        ${open ? stationDetail(st) : ""}
      </div>`;
    }).join("")}`;
}

function stationDetail(st) {
  const plan = state.plan[st.id] || {};
  const modules = plannedModules(st);
  const groups = [...st.modules, ...modules.filter((m) => m.planned)]
    .map((m) => {
      const key = `${m.ware}|${m.method}`;
      const delta = plan[key] || 0;
      const after = m.planned ? m : { ...m, count: Math.max(0, m.count + delta) };
      return { m, key, delta: m.planned ? m.count : delta, base: m.planned ? 0 : m.count, f: unitFlows(after) };
    })
    .sort((a, b) => b.f.value - a.f.value);

  const addable = Object.values(W)
    .filter((w) => !w.isMined && perModule(w))
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((w) => `<option value="${w.id}|${w.mainMethod}">${w.label}</option>`).join("");

  const moduleRows = groups.length
    ? groups.map(({ m, key, delta, base, f }) => `
      <div class="mod-row${m.stalled ? " is-stalled" : ""}">
        <button type="button" class="net-name" data-action="inspect" data-id="${m.ware}">${W[m.ware].label}${METHOD_LABEL[m.method] ? ` <span class="method">${METHOD_LABEL[m.method]}</span>` : ""}${m.stalled ? ` <span class="tag is-short" title="Waiting for ${(m.short || []).filter((id) => W[id]).map((id) => W[id].label).join(", ") || "inputs"}">${m.stalled} stalled</span>` : ""}</button>
        <span class="plan-step">
          <button type="button" class="icon-btn" data-action="plan" data-id="${escapeHTML(st.id)}" data-key="${key}" data-step="-1" aria-label="Plan one ${W[m.ware].label} module less">${icon("minus", 11)}</button>
          <span class="num">${base + delta}${delta ? `<span class="plan-delta ${delta > 0 ? "is-ok" : "is-short"}">${delta > 0 ? "+" : ""}${delta}</span>` : ""}</span>
          <button type="button" class="icon-btn" data-action="plan" data-id="${escapeHTML(st.id)}" data-key="${key}" data-step="1" aria-label="Plan one ${W[m.ware].label} module more">${icon("plus", 11)}</button>
        </span>
        <span class="num dim" title="Includes sunlight and the workforce bonus">${fmtPercent(m.efficiency)}</span>
        <span class="num">${fmtRate(f.made)}/h</span>
        <span class="num ${f.value >= 0 ? "is-ok" : "is-short"}">${fmtCredits(f.value)}</span>
      </div>`).join("")
    : `<p class="quiet-note">No production modules. Docks, storage, defence or trade only.</p>`;

  const net = stationNet(st, modules);
  const runway = new Map(stationRunway(st, net).map((r) => [r.ware, r]));
  const inbound = [...net].filter(([, v]) => v < -1e-6).sort((a, b) => a[1] - b[1]);
  const outbound = [...net].filter(([, v]) => v > 1e-6).sort((a, b) => b[1] - a[1]);
  const stock = (id) => (st.cargo && st.cargo[id]) || 0;
  const flowRow = ([id, v], inbound) => {
    const r = runway.get(id);
    let extra = "";
    if (st.cargo) {
      extra = inbound && r
        ? `<span class="num ${r.hours < RUNWAY_WARN_HOURS ? "is-short" : "dim"}" title="${Math.round(r.stock).toLocaleString("en-US")} in stock">${r.stock ? fmtHours(r.hours) : "empty"}</span>`
        : `<span class="num dim" title="In stock">${Math.round(stock(id)).toLocaleString("en-US")}</span>`;
    }
    return `<button type="button" class="link-row flow-row" data-action="inspect" data-id="${id}"><span class="name">${W[id].label}</span><span class="num">${fmtRate(Math.abs(v))}/h</span>${extra}</button>`;
  };
  const flowList = (list, inb) => list.length ? list.map((x) => flowRow(x, inb)).join("") : `<p class="quiet-note">Nothing.</p>`;

  const fills = st.storageCap ? storageFill(st) : [];
  const storage = fills.length
    ? `<section><h3>Storage</h3>${fills.map((s) => `
        <div class="fill-row"><span>${s.type.charAt(0).toUpperCase() + s.type.slice(1)}</span>
          <span class="rank-bar${s.fill >= STORAGE_WARN ? " is-full" : ""}"><span style="transform:scaleX(${Math.min(1, s.fill)})"></span></span>
          <span class="num dim">${fmtPercent(Math.min(1, s.fill))}</span></div>`).join("")}</section>`
    : "";

  return `
    <div class="st-detail">
      <div class="st-modules">
        <div class="mod-row mod-head"><span>Module</span><span>Count</span><span>${term("Efficiency", "efficiency")}</span><span>${term("Makes", "makes")}</span><span>${term("Value", "value")}</span></div>
        ${moduleRows}
        <label class="select-field plan-add"><span>Plan a new module</span>
          <select data-action="plan-add" data-id="${escapeHTML(st.id)}"><option value="">Choose a ware</option>${addable}</select>
        </label>
      </div>
      <div class="st-flows">
        <section><h3>Ships in${st.cargo ? `<span class="flow-head">per hour, stock lasts</span>` : ""}</h3>${flowList(inbound, true)}</section>
        <section><h3>Ships out${st.cargo ? `<span class="flow-head">per hour, in stock</span>` : ""}</h3>${flowList(outbound, false)}</section>
        ${storage}
      </div>
    </div>`;
}

function openStation(id) {
  state.empireTab = "stations";
  state.openStation = id;
  refresh();
  const el = document.querySelector(`.st-item[data-station="${CSS.escape(id)}"]`);
  if (el) el.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

/* ---------------------------------------------------------------------
   Prices: the player's trade prices against the NPC market in the save
--------------------------------------------------------------------- */

function priceAdvice() {
  const e = state.empire;
  const market = e.market;
  const sold = new Map(), bought = new Map();
  for (const st of e.stations) {
    for (const [w, n] of stationNet(st)) {
      if (n > 0) sold.set(w, (sold.get(w) || 0) + n);
      else bought.set(w, (bought.get(w) || 0) - n);
    }
  }
  // the player's price per ware: mean over stations that trade it
  const mine = { sell: new Map(), buy: new Map() };
  for (const st of e.stations) {
    for (const [ware, sides] of Object.entries(st.offers || {})) {
      if (!W[ware]) continue;
      for (const side of ["sell", "buy"]) {
        const o = sides[side];
        if (!o || !(o.price > 0)) continue;
        const cur = mine[side].get(ware) || { sum: 0, n: 0, stations: [] };
        cur.sum += o.price;
        cur.n++;
        cur.stations.push(stationLabel(st));
        mine[side].set(ware, cur);
      }
    }
  }

  const rows = [];
  for (const side of ["sell", "buy"]) {
    for (const [ware, m] of mine[side]) {
      const own = m.sum / m.n;
      const mk = market[ware] || {};
      const rivals = side === "sell" ? mk.sell : mk.buy;   // others doing the same
      const partners = side === "sell" ? mk.buy : mk.sell; // the other side of the trade
      const perHour = (side === "sell" ? sold : bought).get(ware) || 0;
      const row = { side, ware, own, rivals, partners, perHour, stations: m.stations, kind: "ok", effect: 0, target: null };
      const w = W[ware];

      if (side === "sell") {
        if (rivals && own < rivals.best * 0.98) {
          row.kind = "raise";
          row.target = Math.min(rivals.best, w.price.max);
          row.text = `You undercut every NPC seller. Up to ${fmtPrice(Math.round(row.target))} keeps you the cheapest.`;
          row.effect = (row.target - own) * perHour;
        } else if (rivals && own > rivals.med * 1.02) {
          row.kind = "lower";
          row.target = rivals.med;
          row.text = `Pricier than most NPC sellers, so traders buy elsewhere first. Try about ${fmtPrice(Math.round(rivals.med))}.`;
        } else if (!rivals && partners && own < partners.med * 0.98) {
          row.kind = "raise";
          row.target = Math.min(partners.med, w.price.max);
          row.text = `No NPC sells it, and buyers pay about ${fmtPrice(Math.round(partners.med))}. Room to ask more.`;
          row.effect = (row.target - own) * perHour;
        } else if (!partners) {
          row.kind = "none";
          row.text = "No NPC station wants this right now.";
        } else {
          row.text = "In line with the market.";
        }
      } else {
        if (rivals && own > rivals.best * 1.02) {
          row.kind = "lower";
          row.target = Math.max(rivals.best, w.price.min);
          row.text = `You outbid every NPC buyer. ${fmtPrice(Math.round(row.target))} still puts you first in line.`;
          row.effect = (own - row.target) * perHour;
        } else if (rivals && own < rivals.med * 0.98) {
          row.kind = "raise";
          row.target = rivals.med;
          row.text = `Lower than most NPC buyers, so traders sell elsewhere first. Try about ${fmtPrice(Math.round(rivals.med))}.`;
        } else if (!rivals && partners && own > partners.med * 1.02) {
          row.kind = "lower";
          row.target = Math.max(partners.med, w.price.min);
          row.text = `No NPC competes for it, and sellers ask about ${fmtPrice(Math.round(partners.med))}. You can offer less.`;
          row.effect = (own - row.target) * perHour;
        } else if (!partners) {
          row.kind = "none";
          row.text = "No NPC station sells this right now.";
        } else {
          row.text = "In line with the market.";
        }
      }
      rows.push(row);
    }
  }
  return rows;
}

function renderPrices() {
  const note = $("prices-note");
  const box = $("price-list");
  const e = state.empire;
  if (!e) {
    note.textContent = "";
    box.innerHTML = `<p class="quiet-note">Load a save to compare your stations' trade prices with every NPC buyer and seller in your universe.</p>`;
    return;
  }
  if (!e.market) {
    note.textContent = "";
    box.innerHTML = `<p class="quiet-note">Load your save again to compare prices. This empire was read by an older version that did not keep the market.</p>`;
    return;
  }

  const rows = priceAdvice();
  const gain = rows.reduce((s, r) => s + r.effect, 0);
  note.innerHTML = `Your prices from the save, against what NPC stations in your universe offer right now. Every economy is different, so this uses yours, not wiki averages.
    It is a snapshot: prices move with stock, and stations on automatic pricing adjust by themselves.${gain > 0 ? ` Following the tips below is worth about <strong class="num is-ok">${fmtCredits(gain)}</strong> Cr per hour at today's volumes.` : ""}`;

  const section = (side, title, empty) => {
    const list = rows.filter((r) => r.side === side).sort((a, b) => b.effect - a.effect || (a.kind === "ok") - (b.kind === "ok") || W[a.ware].label.localeCompare(W[b.ware].label));
    if (!list.length) return `<section class="price-section"><h3>${title}</h3><p class="quiet-note">${empty}</p></section>`;
    const fmtSide = (s, label) => s
      ? `<span class="num">${fmtPrice(Math.round(s.best))}</span><span class="price-sub">${label} ${fmtPrice(Math.round(s.med))}, ${s.n} ${plural(s.n, "station")}</span>`
      : `<span class="num dim">none</span>`;
    return `<section class="price-section">
      <h3>${title}</h3>
      <div class="price-row price-head"><span>Ware</span><span>${term("Your price", "yourprice")}</span><span>${side === "sell" ? "Cheapest NPC seller" : "Highest NPC buyer"}</span><span>${side === "sell" ? "Highest NPC buyer" : "Cheapest NPC seller"}</span><span class="price-advice">Suggestion</span><span>Gain per hour</span></div>
      ${list.map((r) => {
        const best = r.rivals;
        const other = r.partners;
        return `<div class="price-row is-${r.kind}">
          <button type="button" class="net-name" data-action="inspect" data-id="${r.ware}" title="${escapeHTML(r.stations.join(", "))}">${W[r.ware].label}</button>
          <span><span class="num">${fmtPrice(Math.round(r.own))}</span><span class="price-sub">${r.stations.length} ${plural(r.stations.length, "station")}${r.perHour ? `, ${fmtRate(r.perHour)}/h` : ""}</span></span>
          <span>${fmtSide(best, "typical")}${best && best.sector ? `<span class="price-sub" title="${escapeHTML(factionLabel(best.owner))}">${escapeHTML(best.sector)}</span>` : ""}</span>
          <span>${fmtSide(other, "typical")}</span>
          <span class="price-advice">${r.kind === "raise" || r.kind === "lower" ? `<span class="tag ${r.effect > 0 ? "is-ok" : "is-plain"}">${r.kind}</span>` : ""}${escapeHTML(r.text)}</span>
          <span class="num ${r.effect > 0 ? "is-ok" : "dim"}">${r.effect > 0 ? "+" + fmtCredits(r.effect) + " Cr" : ""}</span>
        </div>`;
      }).join("")}
    </section>`;
  };

  box.innerHTML = section("sell", "What you sell", "None of your stations has a sell offer in this save.") +
    section("buy", "What you buy", "None of your stations has a buy offer in this save.");
}

/* ---------------------------------------------------------------------
   Supply: mining coverage and wares bought and sold at the same time.

   Both come from the save's economy log, which holds every trade the
   player's stations and ships made over roughly the last game day. Trades
   between your own stations and ships are not money-making, so the
   comparison is made across the whole empire: what your miners brought
   in, what you bought from NPCs and what you sold to them.
--------------------------------------------------------------------- */

// condensed at import: per ware, units and credits per hour
function summariseFlows(result, converted) {
  const { trades, ships, info, log } = result;
  if (!trades || !trades.length) return null;
  const stationIds = new Map();
  result.stations.forEach((s, i) => { if (s.id) stationIds.set(s.id, converted[i].id); });
  const shipById = new Map(ships.map((s) => [s.id, s]));
  const kind = (id) => stationIds.has(id) ? "station" : shipById.has(id) ? (shipById.get(id).macro.includes("_miner_") ? "miner" : "ship") : "npc";

  let start = Infinity;
  for (const t of trades) if (t[0] < start) start = t[0];
  const end = Number(info.time) || log.end;
  const hours = (end - start) / 3600;
  if (!(hours >= 1)) return null;

  const acc = {};
  const byType = {}; // storage type -> { volume, miners } so a miner's time across wares counts once
  const get = (w) => acc[w] || (acc[w] = { mined: 0, miners: new Set(), bought: 0, boughtCr: 0, sold: 0, soldCr: 0 });
  for (const [, ware, buyer, seller, price, v] of trades) {
    if (!W[ware] || !v) continue;
    const b = kind(buyer);
    const s = kind(seller);
    const f = get(ware);
    if (s === "miner" && b !== "npc") {
      f.mined += v;
      f.miners.add(seller);
      const t = W[ware].storageType;
      byType[t] = byType[t] || { volume: 0, miners: new Set() };
      byType[t].volume += v * W[ware].volume;
      byType[t].miners.add(seller);
    } else if (s === "npc" && b !== "npc") {
      f.bought += v;
      f.boughtCr += v * price;
    } else if (b === "npc" && s !== "npc") {
      f.sold += v;
      f.soldCr += v * price;
    }
  }

  const wares = {};
  for (const [w, f] of Object.entries(acc)) {
    wares[w] = {
      mined: f.mined / hours,
      miners: f.miners.size,
      bought: f.bought / hours,
      buyPrice: f.bought ? f.boughtCr / f.bought : null,
      sold: f.sold / hours,
      sellPrice: f.sold ? f.soldCr / f.sold : null,
    };
  }
  const minerCount = { solid: 0, liquid: 0 };
  for (const s of ships) {
    if (!s.macro.includes("_miner_")) continue;
    if (s.macro.includes("_liquid_")) minerCount.liquid++;
    else minerCount.solid++;
  }
  const perMiner = {}; // storage type -> volume one miner brings in per hour
  for (const [t, x] of Object.entries(byType)) perMiner[t] = x.volume / hours / x.miners.size;
  return { hours, wares, minerCount, perMiner };
}

// empire-wide units per hour your stations use (modules at full speed, plus workers)
function empireNeed() {
  const need = new Map();
  for (const st of state.empire.stations) {
    for (const [w, n] of stationNet(st)) need.set(w, (need.get(w) || 0) + n);
  }
  return need;
}

function miningRows() {
  const e = state.empire;
  const flows = e.flows.wares;
  const net = empireNeed();
  const stalledFor = new Map();
  const stalledAt = new Map();
  for (const st of e.stations) {
    for (const m of st.modules) {
      if (!m.stalled) continue;
      for (const w of m.short || []) {
        stalledFor.set(w, (stalledFor.get(w) || 0) + m.stalled);
        if (!stalledAt.has(w)) stalledAt.set(w, new Set());
        stalledAt.get(w).add(st);
      }
    }
  }
  // what one miner of the right type brings in per hour if it mined only this
  const perMinerVolume = e.flows.perMiner || {};

  return Object.values(W)
    .filter((w) => w.isMined)
    .map((w) => {
      const f = flows[w.id] || { mined: 0, miners: 0, bought: 0, buyPrice: null };
      const need = Math.max(0, -(net.get(w.id) || 0));
      const perMiner = perMinerVolume[w.storageType] && w.volume ? perMinerVolume[w.storageType] / w.volume : 0;
      const gap = Math.max(0, need - f.mined - f.bought);
      const ownGap = Math.max(0, need - f.mined);
      return {
        ware: w.id, need, mined: f.mined, miners: f.miners, bought: f.bought, buyPrice: f.buyPrice,
        cover: need ? Math.min(1, (f.mined + f.bought) / need) : 1,
        perMiner, stalled: stalledFor.get(w.id) || 0, stalledAt: [...(stalledAt.get(w.id) || [])],
        more: perMiner && gap > 0 ? Math.ceil(gap / perMiner) : 0,
        moreToStopBuying: perMiner && ownGap > 0 ? Math.ceil(ownGap / perMiner) : 0,
      };
    })
    .filter((r) => r.need > 0 || r.mined > 0 || r.bought > 0)
    .sort((a, b) => a.cover - b.cover || b.need - a.need);
}

// wares the empire sells to NPCs while also buying them from NPCs
function internalRows() {
  const e = state.empire;
  const rows = [];
  const surplus = new Map();
  const deficit = new Map();
  for (const st of e.stations) {
    for (const [w, n] of stationNet(st)) {
      const map = n > 0 ? surplus : deficit;
      if (Math.abs(n) < 1e-6) continue;
      if (!map.has(w)) map.set(w, []);
      map.get(w).push({ st, n: Math.abs(n) });
    }
  }
  for (const [w, f] of Object.entries(e.flows.wares)) {
    if (!(f.bought > 0 && f.sold > 0)) continue;
    const keep = Math.min(f.bought, f.sold);
    const gain = keep * Math.max(0, f.buyPrice - f.sellPrice);
    rows.push({
      ware: w, keep, gain, bought: f.bought, buyPrice: f.buyPrice, sold: f.sold, sellPrice: f.sellPrice,
      makers: (surplus.get(w) || []).sort((a, b) => b.n - a.n).map((x) => x.st),
      users: (deficit.get(w) || []).sort((a, b) => b.n - a.n).map((x) => x.st),
    });
  }
  return rows.sort((a, b) => b.gain - a.gain);
}

function stationNames(list, max = 3) {
  if (!list.length) return "";
  const names = list.slice(0, max).map((st) => escapeHTML(stationLabel(st)));
  return names.join(", ") + (list.length > max ? ` and ${list.length - max} more` : "");
}

function renderSupply() {
  const note = $("supply-note");
  const mining = $("mining-list");
  const internal = $("internal-list");
  const e = state.empire;
  if (!e || !e.flows) {
    note.textContent = "";
    const msg = !e
      ? "Load a save to see how well your miners keep up and where you buy and sell the same ware."
      : "Load your save again to see supply. This empire was read by an older version that did not keep the trade log.";
    mining.innerHTML = `<p class="quiet-note">${msg}</p>`;
    internal.innerHTML = "";
    return;
  }
  const f = e.flows;
  note.innerHTML = `From the trade log in your save: the last <strong class="num">${Math.round(f.hours)}</strong> game hours.
    "Needed" is what your stations use with every module running, plus what their workers eat. You own ${f.minerCount.solid} solid and ${f.minerCount.liquid} gas ${plural(f.minerCount.liquid, "miner")}; most switch between wares.
    Extra miners are counted at what one of yours brings in per hour when it mines only that ware.`;

  const rows = miningRows();
  mining.innerHTML = rows.length
    ? `<div class="sup-row sup-head"><span>Ware</span><span>${term("Needed", "needed")}</span><span>${term("Your miners", "miners")}</span><span>${term("Bought", "bought")}</span><span>${term("Covered", "covered")}</span><span>What to do</span></div>
      ${rows.map((r) => {
        let advice;
        if (r.more) advice = `<span class="tag is-short">+${r.more}</span> About ${r.more} more ${plural(r.more, "miner")} to cover the shortfall.`;
        else if (r.moreToStopBuying && r.bought > 0) advice = `Covered, partly by buying. ${r.moreToStopBuying} more ${plural(r.moreToStopBuying, "miner")} would stop the buying.`;
        else if (r.need) advice = "Covered.";
        else advice = "Nothing uses it right now.";
        if (r.stalled) advice += ` <span class="sup-stalled">${r.stalled} ${plural(r.stalled, "module")} stalled waiting for it, at ${stationNames(r.stalledAt)}.</span>`;
        return `<div class="sup-row${r.more ? " is-short" : ""}">
          <button type="button" class="net-name" data-action="inspect" data-id="${r.ware}">${W[r.ware].label}</button>
          <span class="num">${fmtRate(r.need)}/h</span>
          <span><span class="num">${fmtRate(r.mined)}/h</span><span class="price-sub">${r.miners} ${plural(r.miners, "miner")} worked it</span></span>
          <span><span class="num ${r.bought ? "" : "dim"}">${fmtRate(r.bought)}/h</span>${r.buyPrice ? `<span class="price-sub">at ${fmtPrice(Math.round(r.buyPrice))}</span>` : ""}</span>
          <span class="sup-cover"><span class="rank-bar${r.cover < 0.999 ? " is-full" : ""}"><span style="transform:scaleX(${r.cover})"></span></span><span class="num">${fmtPercent(r.cover)}</span></span>
          <span class="sup-advice">${advice}</span>
        </div>`;
      }).join("")}`
    : `<p class="quiet-note">None of your stations uses mined wares.</p>`;

  const inRows = internalRows();
  internal.innerHTML = inRows.length
    ? `<p class="quiet-note sup-intro">Your empire sells these to NPCs and buys them back from NPCs in the same period. Feeding your own stations first keeps the difference.</p>
      ${inRows.map((r) => `
        <div class="int-row">
          <div class="int-main">
            <button type="button" class="net-name" data-action="inspect" data-id="${r.ware}">${W[r.ware].label}</button>
            <p>Sold <span class="num">${fmtRate(r.sold)}/h</span> at ${fmtPrice(Math.round(r.sellPrice))}, bought <span class="num">${fmtRate(r.bought)}/h</span> at ${fmtPrice(Math.round(r.buyPrice))}.</p>
            <p class="int-stations">${r.makers.length ? `Made at ${stationNames(r.makers)}.` : ""} ${r.users.length ? `Used at ${stationNames(r.users)}.` : ""}</p>
          </div>
          <div class="int-gain">
            <span class="num ${r.gain > 0 ? "is-ok" : "dim"}">${r.gain > 0 ? "+" + fmtCredits(r.gain) + " Cr/h" : "no gain"}</span>
            <span class="price-sub">keeping ${fmtRate(r.keep)}/h in house</span>
          </div>
        </div>`).join("")}
      <p class="quiet-note sup-intro">In game: give the buying stations a trade rule that prefers your own faction, or assign the producing station's traders to supply them.</p>`
    : `<p class="quiet-note">Nothing. You never sell a ware to NPCs while buying the same ware from them.</p>`;
}

/* ---------------------------------------------------------------------
   Market opportunities: what NPC stations in this universe want more of
   than anyone offers, and what one module of it would earn at local prices.
--------------------------------------------------------------------- */

function opportunityRows() {
  const market = state.empire.market;
  const flows = state.empire.flows ? state.empire.flows.wares : {};
  // a ware counts as covered if you make it, tick it, or your miners bring it in
  const have = (id) => isBuilt(id) || (flows[id] && flows[id].mined > 0);
  const localBuy = (id) => (market[id] && market[id].sell ? market[id].sell.med : W[id].price.avg);
  const rows = [];
  for (const w of Object.values(W)) {
    const pm = perModule(w);
    const mk = market[w.id];
    if (!pm || !mk || !mk.buy) continue;
    const r = w.recipes[w.mainMethod];
    const cycles = 3600 / r.time;
    const inputCost = r.inputs.reduce((s, i) => s + i.amount * cycles * localBuy(i.wareID), 0);
    const value = pm * mk.buy.med - inputCost;
    const offered = mk.sell ? mk.sell.amount : 0;
    const open = mk.buy.amount - offered;
    const cost = moduleCost(w.id, w.mainMethod);
    rows.push({
      ware: w.id, value, wanted: mk.buy.amount, buyers: mk.buy.n, offered, open,
      hoursOfOutput: open / pm, price: mk.buy.med, cost,
      payback: value > 0 && cost ? cost / value : null,
      missing: r.inputs.map((i) => i.wareID).filter((id) => !have(id)),
      made: isBuilt(w.id),
    });
  }
  // worth it: demand outstrips supply by at least half a day of one module's output
  return rows.filter((r) => r.value > 0 && r.hoursOfOutput >= 12).sort((a, b) => b.value - a.value);
}

function renderOpportunities() {
  const note = $("opps-note");
  const box = $("opps-list");
  const e = state.empire;
  if (!e || !e.market) {
    note.textContent = "";
    box.innerHTML = `<p class="quiet-note">${e ? "Load your save again to see what your market wants." : "Load a save to see which wares NPC stations in your universe are short of."}</p>`;
    return;
  }
  const rows = opportunityRows().slice(0, 12);
  note.textContent = "Wares NPC stations want more of than anyone has for sale right now, ranked by what one module earns at the prices in your universe: output at the typical NPC buying price, inputs at the typical NPC selling price.";
  box.innerHTML = rows.length
    ? `<div class="opp-row opp-head"><span>Ware</span><span>${term("NPCs want", "wanted")}</span><span>${term("For sale", "forsale")}</span><span>${term("One module", "onemodule")}</span><span>Inputs</span><span>${term("Pays back", "payback")}</span></div>
      ${rows.map((r) => `
        <div class="opp-row">
          <span class="opp-name"><button type="button" class="net-name" data-action="inspect" data-id="${r.ware}">${W[r.ware].label}</button>${r.made ? `<span class="tag is-plain">you make it</span>` : ""}</span>
          <span><span class="num">${Math.round(r.wanted).toLocaleString("en-US")}</span><span class="price-sub">${r.buyers} ${plural(r.buyers, "buyer")}, about ${fmtPrice(Math.round(r.price))}</span></span>
          <span class="num dim">${Math.round(r.offered).toLocaleString("en-US")}</span>
          <span class="num is-ok">+${fmtCredits(r.value)} Cr/h</span>
          <span class="opp-missing">${r.missing.length ? `Inputs you do not make yet: ${r.missing.map((id) => W[id].label).join(", ")}` : `<span class="dim">You already have every input.</span>`}</span>
          <span><span class="num">${r.payback ? fmtHours(r.payback) : "?"}</span><span class="price-sub">${fmtCredits(r.cost)} Cr</span></span>
        </div>`).join("")}`
    : `<p class="quiet-note">No ware is short in your universe right now. NPC supply covers every buy order.</p>`;
}

/* ---------------------------------------------------------------------
   Rewards: level ladder and achievements
--------------------------------------------------------------------- */

function achievementContext() {
  const stations = state.empire ? state.empire.stations : [];
  const modules = [...state.moduleCounts].filter(([id]) => !W[id].isMined).reduce((s, [, n]) => s + n, 0);
  const races = new Set();
  for (const st of stations) for (const m of st.modules) if (m.method !== "default") races.add(m.method);
  const stocked = new Set();
  for (const st of stations) for (const w of Object.keys(st.cargo || {})) stocked.add(w);
  return {
    stations: stations.length,
    habitats: stations.filter((st) => st.habitatCapacity > 0 || (st.habitats || []).length).length,
    modules,
    solar: getCount("energycells"),
    races: races.size,
    shortfalls: computeBalance().filter((r) => r.short).length,
    minerals: BASE_MINERALS.filter((id) => isBuilt(id) || stocked.has(id)).length,
    bestStation: Math.max(0, ...stations.map((st) => stationValue(st))),
    fullyStaffed: stations.some((st) => st.workforceNeed > 0 && st.workforce >= st.workforceNeed),
    profit: empireProfit(),
  };
}

function earnedAchievements() {
  const c = achievementContext();
  return ACHIEVEMENTS.filter((a) => a.test(c)).map((a) => a.id);
}

function renderRewards() {
  const { index } = levelFor(empireProfit());
  const shown = revealedLevel(index);
  els.levelLadder.innerHTML = LEVELS.map((lvl, i) => {
    const locked = i > shown;
    const cls = i === index ? "is-current" : i < index ? "is-reached" : locked ? "is-locked" : "is-seen";
    return `<li class="${cls}"${i === index ? ' aria-current="step"' : ""}>
      ${locked ? X4Badges.lockedSVG(58, `Level ${i + 1}, not reached yet`) : badgeHTML(i, 58)}
      <span class="ladder-num">Level ${i + 1}</span>
      <span class="ladder-name">${locked ? "???" : lvl.name}</span>
      <span class="ladder-min num">${i === 0 ? "start" : fmtCredits(lvl.min) + "/h"}</span>
    </li>`;
  }).join("");

  const earned = new Set(progress.achievements || []);
  for (const id of earnedAchievements()) earned.add(id);
  $("ach-count").textContent = `${earned.size} of ${ACHIEVEMENTS.length} earned`;
  $("achievement-list").innerHTML = ACHIEVEMENTS.map((a) => {
    const got = earned.has(a.id);
    return `<li class="${got ? "is-earned" : "is-locked"}">
      ${X4Badges.achievementSVG(a.icon, 48, got, a.name)}
      <span class="ach-text"><span class="ach-name">${a.name}</span><span class="ach-desc">${a.text}</span></span>
    </li>`;
  }).join("");
}

/* ---------------------------------------------------------------------
   Level-up and achievement celebration
--------------------------------------------------------------------- */

function saveProgress() {
  writeJSON(PROGRESS_KEY, progress);
}

// called on every refresh; pops the celebration when something new happens
function checkProgress(levelIndex) {
  if (state.importing || progress.highest === null) return;
  const earned = earnedAchievements();
  const fresh = earned.filter((id) => !progress.achievements.includes(id));
  const levelUp = state.moduleCounts.size > 0 && levelIndex > progress.highest;
  if (!levelUp && !fresh.length) return;

  if (levelUp) progress.highest = levelIndex;
  progress.achievements.push(...fresh);
  saveProgress();

  const q = celebrationQueue || { level: null, achievements: [] };
  if (levelUp) q.level = levelIndex;
  q.achievements.push(...fresh);
  celebrationQueue = q;
  // after the current render settles
  setTimeout(showCelebration, 0);
}

function showCelebration() {
  const q = celebrationQueue;
  if (!q || !$("modal").hidden) return;
  celebrationQueue = null;
  const achs = q.achievements.map((id) => ACHIEVEMENTS.find((a) => a.id === id)).filter(Boolean);

  let head;
  if (q.level !== null) {
    const lvl = LEVELS[q.level];
    head = `
      <div class="celebrate-badge">${badgeHTML(q.level, 168)}</div>
      <p class="rank-level">Level ${q.level + 1} unlocked</p>
      <h2 id="modal-title">${lvl.name}</h2>
      <p class="celebrate-flavor">${lvl.flavor}</p>`;
  } else {
    head = `<h2 id="modal-title">${achs.length === 1 ? "Achievement earned" : `${achs.length} achievements earned`}</h2>`;
  }
  const list = achs.length
    ? `<ul class="celebrate-achs">${achs.map((a) => `<li>${X4Badges.achievementSVG(a.icon, 44, true, a.name)}<span><strong>${a.name}</strong><span>${a.text}</span></span></li>`).join("")}</ul>`
    : "";
  openModal(`
    <div class="celebrate${q.level !== null ? " has-level" : ""}">
      ${head}
      ${q.level !== null && achs.length ? `<p class="celebrate-also">Also earned</p>` : ""}
      ${list}
      <div class="modal-actions">
        ${q.level !== null ? `<button type="button" class="btn" data-action="share">${icon("image")}Share card</button>` : ""}
        <button type="button" class="btn is-primary" data-action="close-modal">Nice</button>
      </div>
    </div>`);
}

/* ---------------------------------------------------------------------
   Modal
--------------------------------------------------------------------- */

let modalReturnFocus = null;

function openModal(html) {
  const modal = $("modal");
  $("modal-content").innerHTML = html;
  modalReturnFocus = document.activeElement;
  modal.hidden = false;
  const card = modal.querySelector(".modal-card");
  (card.querySelector(".btn.is-primary") || card).focus();
}

function closeModal() {
  const modal = $("modal");
  if (modal.hidden) return;
  modal.hidden = true;
  $("modal-content").innerHTML = "";
  if (modalReturnFocus && modalReturnFocus.isConnected) modalReturnFocus.focus();
  modalReturnFocus = null;
  if (celebrationQueue) setTimeout(showCelebration, 0);
}

/* ---------------------------------------------------------------------
   Share card: a PNG of the badge, level, earnings and top stations
--------------------------------------------------------------------- */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function drawShareCard(withBadge) {
  const profit = empireProfit();
  const { index, level } = levelFor(profit);
  const tier = X4Badges.tierOf(index);
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 630;
  const g = c.getContext("2d");
  try {
    await Promise.all([document.fonts.load("700 40px 'Red Hat Text'"), document.fonts.load("500 40px 'Red Hat Mono'")]);
  } catch (e) {
    /* fall back to system fonts */
  }
  const ui = "'Red Hat Text', 'Segoe UI', sans-serif";
  const mono = "'Red Hat Mono', Consolas, monospace";

  // background
  g.fillStyle = "#0d0f11";
  g.fillRect(0, 0, 1200, 630);
  const glow = g.createRadialGradient(250, 300, 20, 250, 300, 420);
  glow.addColorStop(0, tier.mid + "33");
  glow.addColorStop(1, "#0d0f1100");
  g.fillStyle = glow;
  g.fillRect(0, 0, 1200, 630);
  g.strokeStyle = "#252a30";
  g.lineWidth = 2;
  g.strokeRect(1, 1, 1198, 628);

  if (withBadge) {
    const svg = X4Badges.badgeSVG(index, 340, "");
    const img = await loadImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
    g.drawImage(img, 80, 140, 340, 315);
  }

  g.textBaseline = "alphabetic";
  g.fillStyle = "#8b949e";
  g.font = `500 26px ${ui}`;
  g.fillText(`Level ${index + 1} of ${LEVELS.length}`, 480, 150);
  g.fillStyle = "#e7eaed";
  let size = 64;
  g.font = `700 ${size}px ${ui}`;
  while (g.measureText(level.name).width > 660 && size > 36) {
    size -= 2;
    g.font = `700 ${size}px ${ui}`;
  }
  g.fillText(level.name, 480, 150 + size + 8);

  const y0 = 150 + size + 80;
  g.fillStyle = "#4fcab9";
  g.font = `500 56px ${mono}`;
  const big = fmtCredits(Math.max(0, profit));
  g.fillText(big, 480, y0);
  const bw = g.measureText(big).width;
  g.fillStyle = "#8b949e";
  g.font = `500 24px ${ui}`;
  g.fillText("Cr per hour", 480 + bw + 14, y0);

  const e = state.empire;
  const modules = [...state.moduleCounts].filter(([id]) => !W[id].isMined).reduce((s, [, n]) => s + n, 0);
  g.fillStyle = "#a9b1ba";
  g.font = `400 24px ${ui}`;
  g.fillText(`${e ? `${e.stations.length} ${plural(e.stations.length, "station")}, ` : ""}${modules} production ${plural(modules, "module")}`, 480, y0 + 44);

  if (e && e.stations.length) {
    const top = e.stations.map((st) => ({ st, v: stationValue(st) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 3);
    let y = y0 + 100;
    if (top.length) {
      g.fillStyle = "#6e7781";
      g.font = `600 18px ${ui}`;
      g.fillText("TOP STATIONS", 480, y);
      y += 34;
      for (const { st, v } of top) {
        g.fillStyle = "#e7eaed";
        g.font = `500 22px ${ui}`;
        let name = stationLabel(st);
        while (g.measureText(name).width > 470 && name.length > 4) name = name.slice(0, -2);
        if (name !== stationLabel(st)) name = name.trimEnd() + "...";
        g.fillText(name, 480, y);
        g.fillStyle = "#4fcab9";
        g.font = `500 22px ${mono}`;
        const t = `${fmtCredits(v)}/h`;
        g.fillText(t, 1120 - g.measureText(t).width, y);
        y += 34;
      }
    }
  }

  g.fillStyle = "#6e7781";
  g.font = `500 18px ${ui}`;
  g.fillText("X4 Factories Planner", 80, 590);
  const note = "Estimated value added, average prices";
  g.fillText(note, 1120 - g.measureText(note).width, 590);
  return c;
}

async function openShareCard() {
  let canvas;
  let url;
  try {
    canvas = await drawShareCard(true);
    url = canvas.toDataURL("image/png"); // throws if the badge image tainted the canvas
  } catch (e) {
    canvas = await drawShareCard(false);
    url = canvas.toDataURL("image/png");
  }
  const canCopy = !!(navigator.clipboard && window.ClipboardItem);
  openModal(`
    <div class="share">
      <h2 id="modal-title">Share card</h2>
      <p class="quiet-note">For Reddit, Discord or wherever you brag. Made on this computer, nothing is uploaded.</p>
      <img class="share-preview" src="${url}" alt="Share card: level ${levelFor(empireProfit()).index + 1}, ${escapeHTML(levelFor(empireProfit()).level.name)}" width="600" height="315">
      <div class="modal-actions">
        <button type="button" class="btn" data-action="close-modal">Close</button>
        ${canCopy ? `<button type="button" class="btn" data-action="copy-card">Copy image</button>` : ""}
        <a class="btn is-primary" href="${url}" download="x4-empire-level-${levelFor(empireProfit()).index + 1}.png">${icon("download-simple")}Download PNG</a>
      </div>
    </div>`);
  $("modal-content").querySelector("[data-action=copy-card]")?.addEventListener("click", async (ev) => {
    const btn = ev.currentTarget;
    try {
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      btn.textContent = "Copied";
    } catch (e) {
      btn.textContent = "Copy blocked, use Download";
    }
  });
}

/* ---------------------------------------------------------------------
   Save import
--------------------------------------------------------------------- */

function convertStation(s, i, counter) {
  const sector = SECTORS[s.sector] || null;
  const groups = new Map();
  let workforceNeed = 0;
  for (const m of s.modules) {
    const mapped = MODULE_MACROS[m.macro];
    if (!m.built || !mapped) {
      counter.skipped++;
      continue;
    }
    workforceNeed += mapped.workforce || 0;
    const recipe = W[mapped.ware].recipes[mapped.method];
    // modules idle when the game saved store no efficiency; assume
    // sunlight for solar and 100% for everything else
    const eff = m.efficiency != null ? m.efficiency : recipe.sunlight ? (sector ? sector.sunlight : 1) : 1;
    const key = `${mapped.ware}|${mapped.method}`;
    if (!groups.has(key)) groups.set(key, { ware: mapped.ware, method: mapped.method, count: 0, effSum: 0, stalled: 0, short: new Set() });
    const g = groups.get(key);
    g.count++;
    g.effSum += eff;
    if (STALL_STATES.has(m.state)) {
      g.stalled++;
      for (const w of Object.keys(m.shortage || {})) g.short.add(w);
    }
  }

  const storageCap = {};
  for (const macro of s.storage || []) {
    const def = STORAGE[macro];
    if (def) storageCap[def.type] = (storageCap[def.type] || 0) + def.capacity;
  }

  // one offer per ware and side: mean price, summed amounts
  const offers = {};
  for (const o of s.offers || []) {
    if (!W[o.ware]) continue;
    const slot = (offers[o.ware] = offers[o.ware] || {});
    const cur = slot[o.side] || { price: 0, n: 0, amount: 0, desired: 0 };
    cur.price = (cur.price * cur.n + o.price) / (cur.n + 1);
    cur.n++;
    cur.amount += o.amount;
    cur.desired += o.desired;
    slot[o.side] = cur;
  }
  const overrides = {};
  for (const [w, v] of Object.entries(s.overrides || {})) {
    if (W[w] && (v.buy > 0 || v.sell > 0)) overrides[w] = { buy: v.buy > 0 ? v.buy : null, sell: v.sell > 0 ? v.sell : null };
  }
  const cargo = {};
  for (const [w, n] of Object.entries(s.cargo || {})) if (n > 0) cargo[w] = n;
  const workforceByRace = s.workforceByRace || {};

  return {
    id: s.code || `station-${i}`,
    name: s.name,
    code: s.code,
    sectorName: sector ? sector.name : "Unknown sector",
    sunlight: sector ? sector.sunlight : 1,
    workforce: s.workforce,
    workforceNeed,
    workforceByRace,
    upkeep: workforceUpkeep(workforceByRace, workforceNeed),
    habitats: s.habitats,
    habitatCapacity: (s.habitats || []).reduce((a, h) => a + ((HABITATS[h] || {}).capacity || 0), 0),
    underConstruction: s.underConstruction,
    storageCap,
    cargo,
    offers,
    overrides,
    modules: [...groups.values()].map((g) => ({
      ware: g.ware, method: g.method, count: g.count, efficiency: g.effSum / g.count,
      stalled: g.stalled, short: [...g.short],
    })),
  };
}

// What a station's workers eat per hour. Workers with a job (up to what the
// modules need) eat more than idle ones; each race has its own diet.
function workforceUpkeep(byRace, need) {
  const total = Object.values(byRace).reduce((a, n) => a + n, 0);
  if (!total) return [];
  const busy = Math.min(1, need / total);
  const out = new Map();
  for (const [race, n] of Object.entries(byRace)) {
    const diet = WORKFORCE[race] || WORKFORCE.default;
    if (!diet) continue;
    for (const [kind, share] of [["busy", busy], ["idle", 1 - busy]]) {
      for (const i of diet[kind] || []) {
        if (W[i.wareID]) out.set(i.wareID, (out.get(i.wareID) || 0) + n * share * i.amount);
      }
    }
  }
  return [...out].map(([ware, amount]) => ({ ware, amount }));
}

function summariseMarket(market) {
  const out = {};
  for (const [ware, sides] of Object.entries(market || {})) {
    if (!W[ware]) continue;
    const summary = (list, wantHigh) => {
      const live = list.filter((o) => o[1] > 0 && o[0] > 0);
      if (!live.length) return null;
      const prices = live.map((o) => o[0]).sort((a, b) => a - b);
      const best = live.reduce((b, o) => (wantHigh ? o[0] > b[0] : o[0] < b[0]) ? o : b);
      return {
        best: best[0],
        med: median(prices),
        n: live.length,
        amount: live.reduce((s, o) => s + o[1], 0),
        sector: SECTORS[best[2]] ? SECTORS[best[2]].name : "",
        owner: best[3],
      };
    };
    // buyers: the highest price is the best to sell to; sellers: the lowest
    out[ware] = { buy: summary(sides.buy, true), sell: summary(sides.sell, false) };
  }
  return out;
}

async function importSave(file) {
  if (state.importing) return;
  state.importing = { progress: 0, fileName: file.name };
  state.view = "empire";
  state.empireTab = "overview";
  refresh();

  let lastPaint = 0;
  const onProgress = (p) => {
    state.importing.progress = p;
    const now = performance.now();
    if (now - lastPaint > 120) {
      lastPaint = now;
      renderEmpireSource();
    }
  };

  let ok = false;
  try {
    const result = await X4Save.readFile(file, onProgress);
    const { stations, market, info } = result;
    if (!stations.length && !info.version) {
      throw new Error("it does not look like an X4 save file");
    }

    const counter = { skipped: 0 };
    const converted = stations.map((s, i) => convertStation(s, i, counter));

    // built counts now come from the save; "I have a source" ticks on mined wares stay
    for (const id of [...state.moduleCounts.keys()]) if (!W[id].isMined) state.moduleCounts.delete(id);
    for (const st of converted) for (const m of st.modules) state.moduleCounts.set(m.ware, getCount(m.ware) + m.count);

    state.empire = {
      saveName: info.name || file.name,
      savedAt: Number(info.date) || null,
      importedAt: Date.now(),
      skipped: counter.skipped,
      stations: converted,
      market: summariseMarket(market),
      flows: summariseFlows(result, converted),
    };
    state.openStation = null;
    state.plan = {};
    savePlan();
    saveCounts();
    saveEmpire();
    recordHistory();
    ok = true;

    const total = converted.reduce((s, st) => s + moduleTotal(st), 0);
    setStatus(`Loaded ${converted.length} ${plural(converted.length, "station")} and ${total} production ${plural(total, "module")}.`);
  } catch (e) {
    console.error(e);
    setStatus(`Could not read that save: ${e.message || e}.`);
  } finally {
    state.importing = null;
    refresh();
  }
  return ok;
}

/* ---------------------------------------------------------------------
   Wiring
--------------------------------------------------------------------- */

function loadEmpireExtras() {
  const h = readJSON(HISTORY_KEY);
  history = Array.isArray(h) ? h.filter((x) => x && Number.isFinite(x.savedAt) && Number.isFinite(x.profit)) : [];

  const p = readJSON(PROGRESS_KEY);
  if (p && Number.isFinite(p.highest) && Array.isArray(p.achievements)) {
    progress.highest = p.highest;
    progress.achievements = p.achievements.filter((id) => ACHIEVEMENTS.some((a) => a.id === id));
  } else {
    // first run of this version: take what is already there as the
    // starting point, so existing players are not flooded with pop-ups
    const hasData = state.moduleCounts.size > 0;
    progress.highest = hasData ? levelFor(empireProfit()).index : 0;
    progress.achievements = hasData ? earnedAchievements() : [];
    saveProgress();
  }
  if (!history.length && state.empire) recordHistory();

  const plan = readJSON(PLAN_KEY);
  if (plan && typeof plan === "object" && state.empire) {
    for (const [id, changes] of Object.entries(plan)) {
      if (stationById(id) && changes && typeof changes === "object") state.plan[id] = changes;
    }
  }
  restoreSaveFolder();
}

function bindEmpireEvents() {
  document.querySelectorAll(".view-switch button").forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });
  document.querySelectorAll("#empire-view .tabs button[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => setEmpireTab(btn.dataset.tab));
  });
  els.rankChip.addEventListener("click", () => {
    state.view = "empire";
    setEmpireTab("overview");
  });
  els.loadSave.addEventListener("click", () => loadNewestSave());
  $("station-filter").addEventListener("input", (e) => {
    state.stationFilter = e.target.value;
    renderStationsTab();
  });
  // remember which attention groups are open across re-renders ("toggle" does not bubble)
  els.empireView.addEventListener("toggle", (e) => {
    const d = e.target;
    if (!d.matches || !d.matches("details.issue-group")) return;
    state.openGroups = state.openGroups || new Set();
    if (d.open) state.openGroups.add(d.dataset.key);
    else state.openGroups.delete(d.dataset.key);
  }, true);
  // 1 to 5 switch Empire tabs
  const TAB_KEYS = ["overview", "stations", "supply", "prices", "rewards"];
  document.addEventListener("keydown", (e) => {
    if (state.view !== "empire" || !$("modal").hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
    const n = Number(e.key);
    if (n >= 1 && n <= TAB_KEYS.length) setEmpireTab(TAB_KEYS[n - 1]);
  });
  els.saveFile.addEventListener("change", () => {
    if (els.saveFile.files[0]) importSave(els.saveFile.files[0]);
    els.saveFile.value = "";
  });

  els.empireView.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || btn.tagName === "SELECT") return;
    const { action, id } = btn.dataset;
    if (action === "load-save") loadNewestSave();
    else if (action === "load-file") els.saveFile.click();
    else if (action === "load-newest") loadNewestSave();
    else if (action === "choose-folder") chooseSaveFolder();
    else if (action === "forget-folder") forgetSaveFolder();
    else if (action === "sort-stations") {
      const cur = state.stationSort || { key: "avg", dir: -1 };
      const textual = id === "name" || id === "sector";
      state.stationSort = cur.key === id ? { key: id, dir: -cur.dir } : { key: id, dir: textual ? 1 : -1 };
      renderStationsTab();
    } else if (action === "forget-save") {
      state.empire = null;
      state.openStation = null;
      state.plan = {};
      savePlan();
      saveEmpire();
      refresh();
      setStatus("Station details dropped. Your built counts are kept.");
    } else if (action === "toggle-station") {
      state.openStation = state.openStation === id ? null : id;
      renderStationsTab();
    } else if (action === "open-station") openStation(id);
    else if (action === "open-tab") setEmpireTab(id);
    else if (action === "plan-ware") {
      state.view = "planner";
      selectWare(id);
    }
    else if (action === "toggle-attention") {
      state.attentionAll = !state.attentionAll;
      renderAttention();
    } else if (action === "plan") changePlan(id, btn.dataset.key, Number(btn.dataset.step));
    else if (action === "clear-plan") {
      state.plan = {};
      savePlan();
      refresh();
    } else if (action === "share") openShareCard();
    else if (action === "inspect") inspect(id);
  });
  els.empireView.addEventListener("change", (e) => {
    if (e.target.matches("select[data-action=plan-add]") && e.target.value) {
      changePlan(e.target.dataset.id, e.target.value, 1);
    }
  });

  // modal: close button, backdrop, Esc; Tab stays inside the dialog
  const modal = $("modal");
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "close-modal") closeModal();
    else if (btn.dataset.action === "share") {
      closeModal();
      openShareCard();
    }
  });
  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeModal();
    } else if (e.key === "Tab") {
      const f = [...modal.querySelectorAll("button, a[href], [tabindex]:not([tabindex='-1'])")].filter((x) => !x.hidden);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
}
