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

const METHOD_LABEL = Object.assign(Object.create(null), {
  teladi: "Teladi", terran: "Terran", boron: "Boron", paranid: "Paranid",
  split: "Split", argon: "Argon", recycling: "Recycling",
});

const FACTION_LABEL = Object.assign(Object.create(null), {
  argon: "Argon Federation", antigone: "Antigone Republic", hatikvah: "Hatikvah Free League",
  teladi: "Teladi Company", ministry: "Ministry of Finance", paranid: "Godrealm of the Paranid",
  holyorder: "Holy Order", trinity: "Trinity", alliance: "Alliance of the Word",
  split: "Zyarth Patriarchy", freesplit: "Free Families", fallensplit: "Fallen Families",
  court: "Court of Curbs", terran: "Terran Protectorate", pioneers: "Segaris Pioneers",
  boron: "Queendom of Boron", scaleplate: "Scale Plate Pact", buccaneers: "Duke's Buccaneers",
  loanshark: "Vigor Syndicate", yaki: "Yaki", scavenger: "Riptide Rakers",
});

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
  estimate: "What your modules make per hour, minus their inputs and their workers' food, everything at the game's average prices. Assumes every module runs (idle and stalled ones too) and everything sells.",
  actual: "Credits that really changed hands with NPC stations in the save's trade log, per hour. Trades between your own stations and ships are left out: that money stays in your empire. Stock that piles up or runs down is not counted.",
  stationactual: "This station's own books from the trade log, per hour: what it sold minus what it bought, at the real prices, including trades with your own ships.",
  fleettrades: "Trades this ship made in the save's trade log (loading and delivering both count).",
  hubin: "Units per hour delivered to this hub: by your miners, your traders, or bought from NPCs.",
  hubout: "Units per hour that left this hub: to your stations or sold to NPCs.",
  hublasts: "How long the stock lasts if more keeps going out than coming in.",
  hubprices: "The hub's own buy and sell offer for this ware.",
  owntraders: "Ships set to trade whose home is this station (the station they traded with most in the log). Ore and gas can only be hauled by mining ships set to trade, so those are counted here too.",
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
// what the trade log says really happened, per hour (null for old empires)
function actualProfit() {
  const a = state.empire && state.empire.flows && state.empire.flows.actual;
  return a ? a.revenue - a.cost : null;
}

function stationActual(st) {
  const a = state.empire.flows && state.empire.flows.actual;
  if (!a) return null;
  const x = a.stations[st.id];
  return x ? x.sold - x.bought : 0;
}

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

// Why a ware cannot leave a station whose modules are idle with full
// storage: follows the trade log to whoever collects it. Built only from
// routes, offers and storage, so it fits any layout: a central hub, ships
// assigned per station, or plain NPC trade. null when there is nothing
// specific to say.
function idleOutlet(st, ware) {
  const e = state.empire;
  const routes = (e.flows && e.flows.routes) || [];
  const label = W[ware].label;
  const takers = new Map();
  for (const r of routes) {
    if (r.from === st.id && r.ware === ware && stationById(r.to)) takers.set(r.to, (takers.get(r.to) || 0) + r.perHour);
  }
  let hub = [...takers.keys()].map(stationById).find((h) => h && isHub(h));
  if (!hub) hub = e.stations.find((h) => h !== st && h.offers && h.offers[ware] && h.offers[ware].buy && isHub(h));
  if (hub) {
    const name = stationLabel(hub);
    const type = W[ware].storageType.toLowerCase();
    const fill = storageFill(hub).find((f) => f.type === type);
    const offer = (hub.offers || {})[ware] || {};
    const carried = takers.get(hub.id) || 0;
    if (fill && fill.fill >= STORAGE_WARN) {
      const sellsOpen = offer.sell && (wareAccess(hub, ware, "sell") || {}).kind !== "internal";
      const npc = e.market && e.market[ware] && e.market[ware].buy;
      return `${name} collects it, but its ${type} storage is ${fmtPercent(Math.min(1, fill.fill))} full, so it cannot take more. ${sellsOpen
        ? `It sells ${label} at ${fmtPrice(Math.round(offer.sell.price))}${npc ? ` and NPC buyers pay about ${fmtPrice(Math.round(npc.med))}` : ""}. Selling faster there frees the room, or add ${type} storage to the hub.`
        : `Free room there: sell more from the hub, ship more out, or add ${type} storage.`}`;
    }
    if (!offer.buy) return `${name} runs your logistics but has no buy offer for ${label} right now, so its ships do not collect it. Add one at the hub (your faction only is fine).`;
    if (!(offer.buy.amount > 0)) {
      // the offer is there but wants nothing more: the hub holds as much as it is set to
      return `${name} already holds as much ${label} as it is set to keep (${Math.round((hub.cargo || {})[ware] || 0).toLocaleString("en-US")} in stock), so its ships stop collecting. Raise the hub's stock limit for ${label}, or sell more of it from the hub.`;
    }
    const home = (e.flows.homes || {})[hub.id];
    const w = W[ware];
    const crew = !home ? 0 : w.isMined ? (w.storageType === "Solid" ? home.haulSolid : home.haulLiquid) : home.traders - home.haulSolid - home.haulLiquid;
    const kind = w.isMined ? (w.storageType === "Solid" ? "solid mining ships set to trade" : "gas mining ships set to trade") : "freighters";
    return carried
      ? `${name}'s ships take about ${fmtRate(carried)} per hour from here, which does not keep up. ${crew ? `It has ${crew} ${kind}; assign more to it.` : `Assign ${kind} to it.`}`
      : `${name} buys ${label}, but none of its ships collected it from here in the trade log. Assign ${kind} to ${name}.`;
  }
  if (takers.size) {
    const total = [...takers.values()].reduce((s, v) => s + v, 0);
    return `Your ships take about ${fmtRate(total)} per hour from here to ${stationNames([...takers.keys()].map(stationById))}, which does not keep up. Assign more traders, or sell the rest to NPCs.`;
  }
  return null;
}

// Wares locked to your own ships with nowhere to go: no station of yours
// uses them and none sells them on to NPCs. Usually a rule set on one
// station too many, such as the hub that was meant to sell.
function deadEnds() {
  const e = state.empire;
  const nets = new Map(e.stations.map((st) => [st, stationNet(st)]));
  const has = (st, ware) => (nets.get(st).get(ware) || 0) > 1e-6 || ((st.cargo || {})[ware] || 0) > 0 || !!((st.offers || {})[ware] || {}).sell;
  const out = [];
  for (const ware of Object.keys(W)) {
    const holders = [], openSellers = [];
    let used = false;
    for (const st of e.stations) {
      if ((nets.get(st).get(ware) || 0) < -1e-6 || (st.buildsShips && ((st.offers || {})[ware] || {}).buy)) used = true;
      if (!has(st, ware)) continue;
      if ((wareAccess(st, ware, "sell") || {}).kind === "internal") holders.push(st);
      else openSellers.push(st);
    }
    if (!holders.length || used || openSellers.length) continue;
    const value = holders.reduce((s, st) => s + Math.max(0, nets.get(st).get(ware) || 0), 0) * W[ware].price.avg;
    out.push({ ware, holders, value });
  }
  return out.sort((a, b) => b.value - a.value);
}

function attentionIssues() {
  const e = state.empire;
  if (!e) return [];
  const issues = [];

  for (const st of e.stations) {
    const stalledWares = new Set();

    for (const m of st.modules) {
      if (!m.idle) continue;
      issues.push({
        sev: 3, st, kind: "full", ware: m.ware, idle: m.idle,
        title: `${m.idle} of ${m.count} ${W[m.ware].label} ${plural(m.count, "module")} idle, no room for output`,
        sub: `Its storage for ${W[m.ware].label} is full`,
        weight: m.idle * Math.max(0, moduleValue(m.ware, m.method, m.efficiency)),
      });
    }

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
        sub: `${r.stalled ? `${r.stalled} ${plural(r.stalled, "module")} stalled waiting for it. ` : ""}${r.more ? `${minerSizes(r, true)} would close the gap.` : ""}`.trim(),
        weight: 1e12 * (1 - r.cover), // ahead of single stalls: this is usually their cause
      });
    }
    for (const p of fleetProblems() || []) {
      if (p.sev < 2) continue;
      issues.push({ sev: 2, st: null, kind: "fleet", tab: "logistics", title: `${p.label}: ${p.text}`, sub: p.fix, weight: 1 });
    }
    for (const r of minerRebalance()) {
      issues.push({ sev: 2, st: null, kind: "fleet", tab: "logistics", title: `${r.n} ${plural(r.n, "miner")} on ${W[r.from].label} could move to ${W[r.to].label}`, sub: `${W[r.from].label} is ${fmtPercent(r.fromCover)} covered, ${W[r.to].label} ${fmtPercent(r.toCover)}.`, weight: 1e6 });
    }
    if (e.flows.routes) {
      for (const st of e.stations.filter(isHub)) {
        for (const a of hubReport(st).advice.filter((x) => x.sev === 3)) {
          issues.push({ sev: 3, st, kind: "hub", tab: "logistics", title: a.text, sub: a.fix, weight: 1e11 });
        }
      }
    }
    for (const d of deadEnds()) {
      issues.push({
        sev: 2, st: null, kind: "deadend", ware: d.ware, holders: d.holders,
        title: `${W[d.ware].label} can only go to your own stations, and none of them use it`,
        sub: `A trade rule lets only your ships take it at ${stationNames(d.holders)}, no station of yours uses it, and none sells it to NPCs, so it can only pile up. Open the rule for it where it should be sold (often your hub), or build something that uses it. If you are stockpiling it on purpose, ignore this.`,
        weight: d.value,
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

const ISSUE_ICON = { deadend: "warning", full: "warning", fleet: "clock", hub: "warning", stalled: "warning", runway: "clock", storage: "warning", workforce: "trend-up", mining: "warning", internal: "trend-up" };

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
    } else if (i.kind === "deadend") {
      const g = add(`deadend:${i.ware}`, { sev: 2, kind: "deadend", ware: i.ware, title: i.title, sub: i.sub });
      g.weight += i.weight;
      for (const st of i.holders) g.items.push({ st, title: `Only your ships may take ${W[i.ware].label} here` });
    } else if (i.kind === "internal") {
      add("internal", { sev: 1, kind: "internal", tab: "supply" }).items.push(i);
    } else if (i.kind === "fleet") {
      const g = add("fleet", { sev: 2, kind: "fleet", tab: "logistics" });
      g.items.push(i);
      g.weight += i.weight;
    } else if (i.kind === "hub") {
      const g = add("hub", { sev: 3, kind: "hub", tab: "logistics" });
      g.items.push(i);
      g.weight += i.weight;
    }
  }
  // idle makers: if the same ware has stations waiting for it, it is a
  // distribution problem (it piles up in one place, missing in another)
  for (const i of issues) {
    if (i.kind !== "full") continue;
    const waiting = groups.get(`ware:${i.ware}`);
    if (waiting && waiting.kind === "stalled") {
      waiting.items.push(i);
      waiting.weight += i.weight;
      waiting.misplaced = true;
    } else {
      const g = add(`full:${i.ware}`, { sev: 3, kind: "full", ware: i.ware });
      g.items.push(i);
      g.weight += i.weight;
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
      if (g.misplaced) {
        const idle = g.items.reduce((s, i) => s + (i.idle || 0), 0);
        const makers = [...new Set(g.items.filter((i) => i.kind === "full").map((i) => stationLabel(i.st)))];
        g.title = `${label} piles up where it is made and is missing where it is needed`;
        g.sub = `${idle} ${plural(idle, "module")} idle with full storage at ${makers.slice(0, 2).join(", ")}${makers.length > 2 ? " and more" : ""}, while ${n} ${plural(n, "module")} wait for it at ${stalledAt}. Move it with traders or through a hub.`;
      } else {
        g.title = `Short of ${label}`;
        g.sub = `${n} ${plural(n, "module")} stalled at ${stalledAt}.`;
      }
    } else if (g.kind === "full") {
      const idle = g.items.reduce((s, i) => s + i.idle, 0);
      const makers = [...new Set(g.items.map((i) => stationLabel(i.st)))];
      g.title = `${idle} ${label} ${plural(idle, "module")} idle: no room for output`;
      const where = `${makers.slice(0, 2).join(", ")}${makers.length > 2 ? " and more" : ""}`;
      const internalOnly = g.items.every((i) => i.st && (wareAccess(i.st, g.ware, "sell") || {}).kind === "internal");
      const biggest = g.items.filter((i) => i.st).sort((a, b) => b.idle - a.idle)[0];
      const why = biggest ? idleOutlet(biggest.st, g.ware) : null;
      g.sub = `Storage for ${label} is full at ${where}. ${why || (internalOnly
        ? "A trade rule lets only your own ships buy it there, so it waits for your stations that use it: give it more of your traders, add a station that uses it, or more storage space."
        : "Sell more (a lower price, or an offer open to everyone), move it out with traders, or give it more storage space.")}`;
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
    } else if (g.kind === "fleet") {
      const n = g.items.length;
      g.title = `${n} ship ${n === 1 ? "issue" : "issues"}: idle, stuck or on the wrong ware`;
      g.sub = "Ships you already own that could be moving wares or mining what you are short of.";
    } else if (g.kind === "hub") {
      g.title = `${stations === 1 ? "A hub holds" : `${stations} hubs hold`} wares your factories are waiting for`;
      g.sub = "The wares are mined or bought, they just do not reach the factories. More traders on the hub fix it.";
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
    : `<li><button type="button" class="issue-item" data-action="open-tab" data-id="${i.tab || "supply"}"><span class="issue-item-st">${escapeHTML(i.title.replace(/^You sell /, "").replace(/ to NPCs and buy it back$/, ""))}</span><span>${escapeHTML(i.sub)}</span></button></li>`;
  box.innerHTML = `<ul class="issues">${shown.map((g) => {
    if (!g.items.length) {
      return `<li><button type="button" class="issue sev-${g.sev}" data-action="open-tab" data-id="${g.tab}">${head(g)}<span class="issue-go">${icon("arrow-right", 12)}</span></button></li>`;
    }
    return `<li><details class="issue-group" data-key="${escapeHTML(g.key)}"${open.has(g.key) ? " open" : ""}>
      <summary class="issue sev-${g.sev}">${head(g)}<span class="issue-count num" title="${g.items.length} ${g.items.length === 1 ? "entry" : "entries"}">${g.items.length}</span></summary>
      <ul class="issue-items">${g.items.map(item).join("")}
        ${g.tab ? `<li><button type="button" class="issue-item is-link" data-action="open-tab" data-id="${g.tab}">Open the ${g.tab === "logistics" ? "Logistics" : "Supply"} tab${icon("arrow-right", 11)}</button></li>` : ""}
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
  else if (tab === "logistics") renderLogistics();
  else if (tab === "missions") renderMissions();
  else if (tab === "blueprints") renderBlueprints();
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
  const own = state.empire && state.empire.stations.some((st) => st.offers) ? empireOwnProfit() : null;
  const actual = actualProfit();
  const a = actual !== null ? state.empire.flows.actual : null;
  $("rank-dual").innerHTML = `
    <div class="fig">
      <span class="fig-label"><span class="term" title="${escapeHTML(TERMS.estimate)}">Estimated</span></span>
      <span class="fig-num num">${fmtCredits(Math.max(0, profit))}</span>
      <span class="fig-unit">Cr per hour at average prices</span>
    </div>
    ${a ? `<div class="fig">
      <span class="fig-label"><span class="term" title="${escapeHTML(TERMS.actual)}">Actually earned</span></span>
      <span class="fig-num num ${actual >= 0 ? "is-ok" : "is-short"}">${actual >= 0 ? "+" : ""}${fmtCredits(actual)}</span>
      <span class="fig-unit">Cr per hour from trades, last ${Math.round(state.empire.flows.hours)} h</span>
    </div>` : ""}`;
  els.rankDay.innerHTML = profit > 0
    ? [
        own !== null ? `At your own trade prices: <strong class="num">${fmtCredits(own)}</strong> Cr per hour.` : "",
        a ? `Sold ${fmtCredits(a.revenue)}, bought ${fmtCredits(a.cost)} per hour${state.empire.stations.some((st) => st.buildsShips) ? "; ship sales at your wharfs are not in the trade log" : ""}.` : "",
        idleNote(),
        "Your level uses the estimate, so it does not jump with prices.",
      ].filter(Boolean).join("<br>")
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
  renderActionPlan();
  renderAttention();
  renderHistory();
}

// how many modules are not running right now (the estimate counts them all)
function idleNote() {
  const e = state.empire;
  if (!e) return "";
  let idle = 0, stalled = 0, paused = 0, total = 0;
  for (const st of e.stations) for (const m of st.modules) {
    total += m.count;
    idle += m.idle || 0;
    stalled += m.stalled || 0;
    paused += m.paused || 0;
  }
  const parts = [];
  if (idle) parts.push(`${idle} idle with no room for their output`);
  if (stalled) parts.push(`${stalled} waiting for inputs`);
  if (paused) parts.push(`${paused} paused`);
  return parts.length ? `Right now ${parts.join(", ")}, out of ${total} modules.` : "";
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
    actualProfit: actualProfit() === null ? null : Math.round(actualProfit()),
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
  $("station-filter").closest(".filter-field").hidden = !e || !e.stations.length;
  if (!e) {
    els.stationsNote.textContent = "";
    els.stationList.innerHTML = `<p class="quiet-note">Load a save to see every station you own, what it makes and roughly what it earns.</p>`;
    return;
  }

  if (!e.stations.length) {
    els.stationsNote.textContent = "";
    els.stationList.innerHTML = `<p class="quiet-note">This save has no stations of yours yet. Build one, then load a newer save.</p>`;
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
    shortfall: (r) => (r.st.workforceNeed || 0) - Math.min(r.st.workforce || 0, r.st.workforceNeed || 0),
    avg: (r) => r.profit,
    own: (r) => (r.own === null ? -Infinity : r.own),
    actual: (r) => (r.actual === null ? -Infinity : r.actual),
    issues: (r) => issueCount.get(r.st.id) || 0,
  }[sort.key];
  const rows = e.stations
    .map((st) => ({ st, profit: stationValue(st), own: hasOwn ? stationValue(st, "own") : null, actual: stationActual(st), modules: moduleTotal(st) }))
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
    <div class="st-row st-head"><span></span><span>${head("name", "Station")}</span><span>${head("sector", "Sector")}</span><span>${head("modules", term("Modules", "modules"))}</span><span>${head("workforce", term("Workforce", "workforce"))}</span><span>${head("avg", term("Average", "average"))}</span><span>${head("own", term("Own prices", "own"))}</span><span>${head("actual", term("Actual", "stationactual"))}</span></div>
    ${rows.length ? "" : `<p class="quiet-note st-empty">${e.stations.length ? `No station matches "${escapeHTML((state.stationFilter || "").trim())}".` : "This save has no stations of yours yet."}</p>`}
    ${rows.map(({ st, profit, own, actual, modules }) => {
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
          ${actual === null ? `<span class="num dim">reload</span>` : st.buildsShips
            ? `<span class="num dim term" title="Builds ships. Ship sales are not in the trade log, so this only shows what it spent: ${escapeHTML(fmtCredits(actual))} Cr per hour.">builds ships</span>`
            : `<span class="num ${actual > 0 ? "is-ok" : actual < 0 ? "is-short" : "dim"}">${actual ? fmtCredits(actual) : "none"}</span>`}
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
        <button type="button" class="net-name" data-action="inspect" data-id="${m.ware}">${W[m.ware].label}${METHOD_LABEL[m.method] ? ` <span class="method">${METHOD_LABEL[m.method]}</span>` : ""}${m.idle ? ` <span class="tag is-warn" title="Storage for its output is full, so it waits until some is taken away">${m.idle} idle</span>` : ""}${m.paused ? ` <span class="tag is-plain">${m.paused} paused</span>` : ""}${m.stalled ? ` <span class="tag is-short" title="Waiting for ${(m.short || []).filter((id) => W[id]).map((id) => W[id].label).join(", ") || "inputs"}">${m.stalled} stalled</span>` : ""}</button>
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
    const access = wareAccess(st, id, inbound ? "buy" : "sell");
    const ruleTag = access
      ? ` <span class="tag is-plain" title="Trade rule ${escapeHTML(`“${access.rule}”`)}: ${access.kind === "internal" ? "only your own ships trade it here" : "some factions may not trade it here"}">${access.kind === "internal" ? "yours only" : "limited"}</span>`
      : "";
    return `<button type="button" class="link-row flow-row" data-action="inspect" data-id="${id}"><span class="name">${W[id].label}${ruleTag}</span><span class="num">${fmtRate(Math.abs(v))}/h</span>${extra}</button>`;
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
        ${routesSection(st)}
      </div>
    </div>`;
}

function routesSection(st) {
  if (!state.empire.flows || !state.empire.flows.routes) return "";
  const r = stationRoutes(st);
  if (!r.from.length && !r.to.length) return "";
  const list = (items, verb) => items.length
    ? items.map((x) => `<div class="hub-flow"><span>${W[x.ware].label} ${verb} ${routeLink(x.id)}</span><span class="num dim">${fmtRate(x.perHour)}/h</span></div>`).join("")
    : `<p class="quiet-note">Nothing in the log.</p>`;
  return `<section><h3>Supplied by</h3>${list(r.from, "from")}</section><section><h3>Delivers to</h3>${list(r.to, "to")}</section>`;
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
  // offers only your own ships may take: NPC prices do not apply to them
  const internal = { sell: new Map(), buy: new Map() };
  for (const st of e.stations) {
    for (const [ware, sides] of Object.entries(st.offers || {})) {
      if (!W[ware]) continue;
      for (const side of ["sell", "buy"]) {
        const o = sides[side];
        if (!o || !(o.price > 0)) continue;
        const access = wareAccess(st, ware, side);
        const into = access && access.kind === "internal" ? internal : mine;
        const cur = into[side].get(ware) || { sum: 0, n: 0, stations: [] };
        cur.sum += o.price;
        cur.n++;
        cur.stations.push(stationLabel(st));
        if (access && access.kind === "limited") cur.limited = true;
        into[side].set(ware, cur);
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
      const flow = e.flows && e.flows.wares ? e.flows.wares[ware] : null;
      const perHour = flow ? (side === "sell" ? flow.sold : flow.bought) || 0 : (side === "sell" ? sold : bought).get(ware) || 0;
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
      if (m.limited && row.kind !== "none") row.text += " A trade rule shuts some factions out, so fewer NPCs can take it.";
      rows.push(row);
    }
    for (const [ware, m] of internal[side]) {
      if (mine[side].has(ware)) continue; // other stations trade it openly: advice above covers it
      rows.push({
        side, ware, own: m.sum / m.n, rivals: null, partners: null, perHour: 0, stations: m.stations,
        kind: "internal", effect: 0, target: null,
        text: "Only your own ships may trade it here (trade rule), so NPC prices do not apply. The price only moves credits between your stations.",
      });
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
          <span class="price-advice">${r.kind === "raise" || r.kind === "lower" ? `<span class="tag ${r.effect > 0 ? "is-ok" : "is-plain"}">${r.kind}</span>` : r.kind === "internal" ? `<span class="tag is-plain">yours only</span>` : ""}${escapeHTML(r.text)}</span>
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

// What a ship does, from its standing order rather than its hull: only
// mining-hull ships can carry ore and gas, so many of them are set to
// trade for a station and haul raw materials instead of mining.
function shipRole(ship) {
  const order = ship.order || "";
  if (/Mining/i.test(order)) return "miner";
  if (/Trade|Middleman|Supply/i.test(order)) return "trader";
  return ship.macro.includes("_miner_") ? "miner" : "trader";
}

// a trader on a mining hull hauls raw materials: "solid" or "liquid" (gas)
function rawHaul(ship) {
  if (!ship.macro.includes("_miner_") || shipRole(ship) !== "trader") return null;
  return ship.macro.includes("_liquid_") ? "liquid" : "solid";
}

// condensed at import: per ware, units and credits per hour
// why a trade-log view is empty: an old import, or a game that has not traded yet
function noLogMessage(e, what) {
  if (e.hasTradeLog === false) return `Your save's trade log is empty, so ${what} has nothing to show yet. Trade and mine for a while, then load a newer save.`;
  return `Load your save again to see ${what}. This empire was read by an older version that did not keep the trade log.`;
}

// a tab's later sections only make sense once its first one has data
function showSections(panel, on) {
  document.querySelectorAll(`.tab-panel[data-panel="${panel}"] > section.section-gap`).forEach((s) => { s.hidden = !on; });
}

// a ship's size class from its model name: ship_arg_m_miner_... -> "M"
function shipSize(macro) {
  const token = (macro || "").split("_")[2] || "";
  return /^(xs|s|m|l|xl)$/.test(token) ? token.toUpperCase() : null;
}

function summariseFlows(result, converted) {
  const { trades, ships, info, log } = result;
  if (!trades || !trades.length) return null;
  const stationIds = new Map();
  result.stations.forEach((s, i) => { if (s.id) stationIds.set(s.id, converted[i].id); });
  const shipById = new Map(ships.map((s) => [s.id, s]));
  const kind = (id) => stationIds.has(id) ? "station" : shipById.has(id) ? (shipRole(shipById.get(id)) === "miner" ? "miner" : "ship") : "npc";

  let start = Infinity;
  for (const t of trades) if (t[0] < start) start = t[0];
  const end = Number(info.time) || log.end;
  const hours = (end - start) / 3600;
  if (!(hours >= 1)) return null;

  const acc = {};
  const byType = {}; // storage type -> { volume, miners } so a miner's time across wares counts once
  const get = (w) => acc[w] || (acc[w] = { mined: 0, miners: new Set(), bought: 0, boughtCr: 0, sold: 0, soldCr: 0 });
  // real credits: per station (its own books, every trade counts) and for
  // the empire (only trades with NPCs; moving wares between your own
  // stations and ships is money changing pockets)
  const books = {};
  const book = (id) => books[id] || (books[id] = { sold: 0, bought: 0, soldNpc: 0, boughtNpc: 0 });
  let npcRevenue = 0, npcCost = 0;
  for (const [, ware, buyer, seller, price, v] of trades) {
    if (!v) continue;
    const b = kind(buyer);
    const s = kind(seller);
    const cr = v * price;
    if (s === "station") {
      const x = book(stationIds.get(seller));
      x.sold += cr;
      if (b === "npc") x.soldNpc += cr;
    }
    if (b === "station") {
      const x = book(stationIds.get(buyer));
      x.bought += cr;
      if (s === "npc") x.boughtNpc += cr;
    }
    if (b === "npc" && s !== "npc") npcRevenue += cr;
    else if (s === "npc" && b !== "npc") npcCost += cr;
    if (!W[ware]) continue;
    const f = get(ware);
    if (s === "miner" && b !== "npc") {
      f.mined += v;
      f.miners.add(seller);
      const t = W[ware].storageType;
      byType[t] = byType[t] || { volume: 0, miners: new Set(), sizes: {} };
      byType[t].volume += v * W[ware].volume;
      byType[t].miners.add(seller);
      const size = shipSize(shipById.get(seller).macro);
      if (size) {
        const z = byType[t].sizes[size] || (byType[t].sizes[size] = { volume: 0, miners: new Set() });
        z.volume += v * W[ware].volume;
        z.miners.add(seller);
      }
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
  const minerCount = { solid: 0, liquid: 0, haulSolid: 0, haulLiquid: 0 };
  for (const s of ships) {
    if (!s.macro.includes("_miner_")) continue;
    const liquid = s.macro.includes("_liquid_");
    if (shipRole(s) === "miner") minerCount[liquid ? "liquid" : "solid"]++;
    else minerCount[liquid ? "haulLiquid" : "haulSolid"]++;
  }
  const perMiner = {}; // storage type -> volume one miner brings in per hour
  const perMinerSize = {}; // storage type -> size -> { rate, miners }, from your own ships of that size
  for (const [t, x] of Object.entries(byType)) {
    perMiner[t] = x.volume / hours / x.miners.size;
    perMinerSize[t] = {};
    for (const [size, z] of Object.entries(x.sizes)) {
      perMinerSize[t][size] = { rate: z.volume / hours / z.miners.size, miners: z.miners.size };
    }
  }
  const actual = { revenue: npcRevenue / hours, cost: npcCost / hours, stations: {} };
  for (const [id, x] of Object.entries(books)) {
    actual.stations[id] = { sold: x.sold / hours, bought: x.bought / hours, soldNpc: x.soldNpc / hours, boughtNpc: x.boughtNpc / hours };
  }
  const traced = summariseRoutes(result, converted, hours, end);
  const ownStations = new Set(converted.map((c) => c.id));
  for (const w of Object.values(wares)) { w.bought = 0; w.sold = 0; }
  for (const r of traced.routes) {
    const f = wares[r.ware];
    if (!f) continue;
    if (r.from === "npc" && ownStations.has(r.to)) f.bought += r.perHour;
    else if (r.to === "npc" && ownStations.has(r.from)) f.sold += r.perHour;
  }
  return { hours, wares, minerCount, perMiner, perMinerSize, actual, ...traced };
}

// empire-wide units per hour your stations use (modules at full speed, plus workers)
function empireNeed() {
  const need = new Map();
  for (const st of state.empire.stations) {
    for (const [w, n] of stationNet(st)) need.set(w, (need.get(w) || 0) + n);
  }
  return need;
}

// "about 8 L or 20 M miners"; falls back to the fleet average when there
// are not enough ships of a size to measure
function minerSizes(r, sentence = false, kind = "") {
  const k = kind ? `${kind} ` : "";
  if (!r.bySize || !r.bySize.length) return `${sentence ? "About" : "about"} ${r.more} more ${k}${plural(r.more, "miner")}`;
  const parts = r.bySize.map((x) => `${x.n} ${x.size}`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} or ${parts[parts.length - 1]}` : parts[0];
  return `${sentence ? "About" : "about"} ${list} ${k}${plural(r.bySize[r.bySize.length - 1].n, "miner")}`;
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
  const perSize = e.flows.perMinerSize || {};
  const SIZE_ORDER = ["XL", "L", "M", "S", "XS"];

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
        // the same gap in miners of each size you run: "about 8 L or 20 M"
        bySize: gap > 0 && w.volume
          ? Object.entries(perSize[w.storageType] || {})
            .filter(([, z]) => z.miners >= 2 && z.rate > 0)
            .sort((a, b) => SIZE_ORDER.indexOf(a[0]) - SIZE_ORDER.indexOf(b[0]))
            .map(([size, z]) => ({ size, n: Math.ceil(gap / (z.rate / w.volume)), perShip: z.rate / w.volume, ships: z.miners }))
          : [],
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
      : noLogMessage(e, "Supply");
    mining.innerHTML = `<p class="quiet-note">${msg}</p>`;
    internal.innerHTML = "";
    showSections("supply", false);
    return;
  }
  showSections("supply", true);
  const f = e.flows;
  note.innerHTML = `From the trade log in your save: the last <strong class="num">${Math.round(f.hours)}</strong> game hours.
    "Needed" is what your stations use with every module running, plus what their workers eat. You have ${f.minerCount.solid} solid and ${f.minerCount.liquid} gas ${plural(f.minerCount.liquid, "miner")} mining${f.minerCount.haulSolid || f.minerCount.haulLiquid ? `, plus ${f.minerCount.haulSolid + f.minerCount.haulLiquid} mining ships set to trade, which haul ore and gas between stations and are not counted as mining` : ""}.
    Miners switch between wares.
    Extra miners are counted per ship size, at what one of your miners of that size brings in per hour when it mines only that ware.`;

  const rows = miningRows();
  mining.innerHTML = rows.length
    ? `<div class="sup-row sup-head"><span>Ware</span><span>${term("Needed", "needed")}</span><span>${term("Your miners", "miners")}</span><span>${term("Bought", "bought")}</span><span>${term("Covered", "covered")}</span><span>What to do</span></div>
      ${rows.map((r) => {
        let advice;
        if (r.more) {
          const label = r.bySize.length ? `${r.bySize.map((x) => `+${x.n} ${x.size}`).join(" or ")} ${plural(r.bySize[r.bySize.length - 1].n, "miner")}` : `+${r.more} ${plural(r.more, "miner")}`;
          const why = r.bySize.length
            ? r.bySize.map((x) => `One of your ${x.size} miners brings in about ${fmtRate(x.perShip)} ${W[r.ware].label} per hour (measured on ${x.ships} ships)`).join(". ")
            : "Counted at the average of your miners, too few of one size to measure separately";
          advice = `<span class="tag ${r.stalled ? "is-short" : "is-warn"}" title="${escapeHTML(why)}">${label}</span>`;
        }
        else if (r.moreToStopBuying && r.bought > 0) advice = `<span class="tag is-plain">covered by buying</span><span class="sup-detail">${r.moreToStopBuying} more ${plural(r.moreToStopBuying, "miner")} would end the buying</span>`;
        else if (r.need) advice = `<span class="tag is-ok">covered</span>`;
        else advice = `<span class="dim">not used</span>`;
        if (r.stalled) advice += `<span class="sup-detail" title="${escapeHTML(r.stalledAt.map(stationLabel).join(", "))}">${r.stalled} ${plural(r.stalled, "module")} stalled at ${r.stalledAt.length} ${plural(r.stalledAt.length, "station")}</span>`;
        return `<div class="sup-row${r.more ? " is-short" : ""}">
          <button type="button" class="net-name" data-action="inspect" data-id="${r.ware}">${W[r.ware].label}</button>
          <span class="num">${fmtRate(r.need)}/h</span>
          <span><span class="num">${fmtRate(r.mined)}/h</span><span class="price-sub">${r.miners} ${plural(r.miners, "miner")} worked it</span></span>
          <span><span class="num ${r.bought ? "" : "dim"}">${fmtRate(r.bought)}/h</span>${r.buyPrice ? `<span class="price-sub">at ${fmtPrice(Math.round(r.buyPrice))}</span>` : ""}</span>
          <span class="sup-cover"><span class="rank-bar${r.stalled ? " is-full" : r.cover < 0.95 ? " is-warn" : ""}"><span style="transform:scaleX(${r.cover})"></span></span><span class="num">${fmtPercent(r.cover)}</span></span>
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
   Logistics: distribution hubs and the routes between your stations.

   X4 has no special hub module: a distribution centre is a station with
   storage and little or no production, run through buy and sell offers
   and the ships that work for it. The save's trade log names the ship in
   every trade, so following each of your ships from where it loaded a
   ware to where it delivered it gives the real routes.
--------------------------------------------------------------------- */

const HUBS_KEY = "x4-factories-planner:hubs";
let hubOverrides = {}; // stationID -> true (track) | false (never)

// condensed at import from the raw trade log
function shipType(macro) {
  if (macro.includes("_miner_liquid")) return "Gas miner";
  if (macro.includes("_miner_")) return "Solid miner";
  if (macro.includes("_trans_")) return "Freighter";
  if (macro.includes("_builder_")) return "Builder";
  if (/_(scout|fighter|heavyfighter|bomber|corvette|frigate|gunboat|destroyer|carrier|battleship|resupplier)_/.test(macro)) return "Combat";
  return "Other";
}

function summariseRoutes(result, converted, hours, end) {
  const stationIds = new Map();
  result.stations.forEach((s, i) => { if (s.id) stationIds.set(s.id, converted[i].id); });
  const shipById = new Map(result.ships.map((s) => [s.id, s]));
  const node = (id) => stationIds.get(id) || "npc";
  const acc = new Map();
  const shipsAt = new Map();
  const loads = new Map();
  const addRoute = (from, to, ware, units, ship) => {
    if (from === to) return; // npc to npc, or a load that went back where it came from
    const k = `${from}|${to}|${ware}`;
    const r = acc.get(k) || { from, to, ware, units: 0, ships: new Set() };
    r.units += units;
    if (ship) r.ships.add(ship);
    acc.set(k, r);
  };
  const tradeCount = new Map(); // ship -> station -> trades, to find each ship's home
  const workedFor = (stationId, shipId) => {
    if (!stationId) return;
    if (!shipsAt.has(stationId)) shipsAt.set(stationId, new Set());
    shipsAt.get(stationId).add(shipId);
    if (!tradeCount.has(shipId)) tradeCount.set(shipId, new Map());
    const c = tradeCount.get(shipId);
    c.set(stationId, (c.get(stationId) || 0) + 1);
  };

  const sorted = [...result.trades].sort((a, b) => a[0] - b[0]);
  for (const [, ware, buyer, seller, , v] of sorted) {
    if (!W[ware] || !v) continue;
    const bShip = shipById.get(buyer);
    const sShip = shipById.get(seller);
    if (bShip && sShip) continue;
    if (bShip) {
      // a ship loads: remember where this cargo came from
      workedFor(stationIds.get(seller), buyer);
      if (!loads.has(buyer)) loads.set(buyer, new Map());
      const q = loads.get(buyer);
      if (!q.has(ware)) q.set(ware, []);
      q.get(ware).push({ from: node(seller), units: v });
    } else if (sShip) {
      // a ship delivers: match it to the loads it is carrying, oldest first
      workedFor(stationIds.get(buyer), seller);
      const to = node(buyer);
      const q = (loads.get(seller) || new Map()).get(ware) || [];
      let left = v;
      while (left > 0 && q.length) {
        const n = Math.min(q[0].units, left);
        addRoute(q[0].from, to, ware, n, seller);
        q[0].units -= n;
        left -= n;
        if (!q[0].units) q.shift();
      }
      if (left > 0) addRoute(shipRole(sShip) === "miner" ? "mined" : "unknown", to, ware, left, seller);
    } else {
      addRoute(node(seller), node(buyer), ware, v, null);
    }
  }

  const routes = [...acc.values()]
    .map((r) => ({ from: r.from, to: r.to, ware: r.ware, perHour: r.units / hours, ships: r.ships.size }))
    .filter((r) => r.perHour >= 1);
  const ships = {};
  for (const [stationId, set] of shipsAt) {
    const c = { miners: 0, traders: 0, haulSolid: 0, haulLiquid: 0 };
    for (const id of set) countShip(c, shipById.get(id));
    ships[stationId] = c;
  }
  // a ship's home: the station it traded with most (X4 keeps assignments
  // in script state, so this is read from behaviour instead)
  const homes = {};
  const homeOf = new Map();
  for (const [shipId, counts] of tradeCount) {
    const home = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    homeOf.set(shipId, home);
    countShip(homes[home] || (homes[home] = { miners: 0, traders: 0, haulSolid: 0, haulLiquid: 0 }), shipById.get(shipId));
  }
  // every transport and mining ship: what it was told to do and what it did
  const activity = new Map(); // ship -> { trades, last, mined: Map(ware -> units) }
  for (const [time, ware, buyer, seller, , v] of sorted) {
    for (const id of [buyer, seller]) {
      if (!shipById.has(id)) continue;
      const a = activity.get(id) || { trades: 0, last: 0, mined: new Map() };
      a.trades++;
      a.last = Math.max(a.last, time);
      activity.set(id, a);
    }
    const s = shipById.get(seller);
    if (s && shipRole(s) === "miner" && W[ware] && W[ware].isMined) {
      const a = activity.get(seller);
      a.mined.set(ware, (a.mined.get(ware) || 0) + v);
    }
  }
  const fleet = result.ships
    .filter((s) => ["Solid miner", "Gas miner", "Freighter", "Other"].includes(shipType(s.macro)))
    .map((s) => {
      const a = activity.get(s.id) || { trades: 0, last: 0, mined: new Map() };
      const top = [...a.mined].sort((x, y) => y[1] - x[1])[0];
      return {
        code: s.code, name: s.name, type: shipType(s.macro), size: /^(xs|s|m|l|xl)$/.test(s.macro.split("_")[2] || "") ? s.macro.split("_")[2].toUpperCase() : "",
        order: s.order || null, role: shipRole(s), raw: rawHaul(s),
        trades: a.trades, idle: a.last ? (end - a.last) / 3600 : null,
        home: homeOf.get(s.id) || null, mines: top ? top[0] : null,
      };
    });
  return { routes, ships, homes, fleet };
}

function countShip(c, ship) {
  if (shipRole(ship) === "miner") c.miners++;
  else c.traders++;
  const raw = rawHaul(ship);
  if (raw === "solid") c.haulSolid++;
  else if (raw === "liquid") c.haulLiquid++;
}

function haulText(c) {
  const parts = [];
  if (c.haulSolid) parts.push(`${c.haulSolid} solid`);
  if (c.haulLiquid) parts.push(`${c.haulLiquid} gas`);
  return parts.length ? `${parts.join(" and ")} on mining hulls` : "";
}

function routeName(id) {
  if (id === "npc") return "NPC stations";
  if (id === "mined") return "your miners";
  if (id === "unknown") return "earlier loads";
  const st = stationById(id);
  return st ? stationLabel(st) : "a station you no longer own";
}

function routeLink(id) {
  return stationById(id)
    ? `<button type="button" class="link-btn" data-action="open-station" data-id="${escapeHTML(id)}">${escapeHTML(routeName(id))}</button>`
    : escapeHTML(routeName(id));
}

function isHub(st) {
  if (st.id in hubOverrides) return hubOverrides[st.id];
  if (st.modules.length) return false;
  const routes = (state.empire.flows && state.empire.flows.routes) || [];
  if (!routes.some((r) => r.from === st.id || r.to === st.id)) return false;
  // a hub by name, or a real storage station (a dock with a module or two is not)
  return /distro|distribut|hub|depot|warehouse|logistic|storage|stock/i.test(st.name || "") || (st.storage || []).length >= 3;
}

function setHub(id, on) {
  const st = stationById(id);
  if (!st) return;
  delete hubOverrides[id];
  if (isHub(st) !== on) hubOverrides[id] = on;
  writeJSON(HUBS_KEY, hubOverrides);
  refresh();
}

// wares stalled somewhere in the empire: ware -> { modules, stations: Set }
function stalledWares() {
  const out = new Map();
  for (const st of state.empire.stations) {
    for (const m of st.modules) {
      if (!m.stalled) continue;
      for (const w of m.short || []) {
        const x = out.get(w) || { modules: 0, stations: new Set() };
        x.modules += m.stalled;
        x.stations.add(st);
        out.set(w, x);
      }
    }
  }
  return out;
}

// who can carry a ware: ore, silicon and ice need solid mining hulls,
// gases need gas mining hulls, everything else goes in freighters
function haulFix(r, home) {
  const w = W[r.ware];
  let have, kind;
  if (w.isMined && w.storageType === "Solid") { have = home.haulSolid; kind = "solid mining ships set to trade"; }
  else if (w.isMined) { have = home.haulLiquid; kind = "gas mining ships set to trade"; }
  else { have = home.traders - home.haulSolid - home.haulLiquid; kind = "freighters"; }
  if (r.out <= 0) return `Nothing leaves this hub yet. Give it a sell offer and assign ${kind} to it, or let those stations buy from it.`;
  const crew = have ? `${have} ${kind} haul from this hub` : `No ${kind} of its own haul from this hub`;
  if (r.inn > r.out * 1.05) return `${crew}, and more arrives than leaves. Assign more ${kind} to the hub.`;
  const cover = w.isMined && state.empire.flows ? (miningRows().find((m) => m.ware === r.ware) || {}).cover : null;
  return `${crew} and they keep up with what arrives, so this stock is a buffer. Extra ${kind} would draw it down for a while; the lasting fix is more ${w.isMined ? `miners${cover != null && cover < 1 ? ` (mining covers ${fmtPercent(cover)} of what you use)` : ""}` : "production"}.`;
}

function hubReport(st) {
  const routes = state.empire.flows.routes;
  const inbound = routes.filter((r) => r.to === st.id);
  const outbound = routes.filter((r) => r.from === st.id);
  const wares = new Set([...Object.keys(st.cargo || {}), ...Object.keys(st.offers || {}), ...inbound.map((r) => r.ware), ...outbound.map((r) => r.ware)]);
  const stalled = stalledWares();
  const fills = Object.fromEntries(storageFill(st).map((s) => [s.type, s]));

  const rows = [...wares].filter((w) => W[w]).map((w) => {
    const inn = inbound.filter((r) => r.ware === w).reduce((s, r) => s + r.perHour, 0);
    const out = outbound.filter((r) => r.ware === w).reduce((s, r) => s + r.perHour, 0);
    const offer = (st.offers || {})[w] || {};
    return {
      ware: w, inn, out, net: inn - out, stock: (st.cargo || {})[w] || 0,
      buy: offer.buy ? offer.buy.price : null, sell: offer.sell ? offer.sell.price : null,
      type: W[w].storageType.toLowerCase(),
    };
  }).sort((a, b) => (b.inn + b.out) - (a.inn + a.out) || b.stock - a.stock);

  // per storage type: how fast it fills or empties
  const typeNet = {};
  for (const r of rows) typeNet[r.type] = (typeNet[r.type] || 0) + r.net * W[r.ware].volume;
  const typeInfo = Object.entries(st.storageCap || {}).map(([type, cap]) => {
    const used = fills[type] ? fills[type].used : 0;
    const net = typeNet[type] || 0;
    return { type, cap, used, fill: used / cap, net, hoursToFull: net > 0 ? (cap - used) / net : null };
  }).filter((t) => t.cap > 0);

  const advice = [];
  const home = (state.empire.flows.homes || {})[st.id] || { traders: 0, haulSolid: 0, haulLiquid: 0 };
  for (const r of rows) {
    const s = stalled.get(r.ware);
    if (s && r.stock > 0) {
      advice.push({
        sev: 3,
        text: `Holds ${Math.round(r.stock).toLocaleString("en-US")} ${W[r.ware].label} while ${s.modules} ${plural(s.modules, "module")} wait for it at ${stationNames([...s.stations])}.`,
        fix: haulFix(r, home),
      });
    }
  }
  for (const t of typeInfo) {
    const label = t.type.charAt(0).toUpperCase() + t.type.slice(1);
    if (t.fill >= STORAGE_WARN) {
      advice.push({ sev: 2, text: `${label} storage is ${fmtPercent(Math.min(1, t.fill))} full.`, fix: "Deliveries stop when it is full. Ship more out, open sell offers to NPCs, or add storage." });
    } else if (t.hoursToFull !== null && t.hoursToFull < 12) {
      advice.push({ sev: 2, text: `${label} storage fills up in about ${fmtHours(t.hoursToFull)} at the current pace.`, fix: "More comes in than goes out. Assign traders out, or cap the buy offer." });
    }
  }
  const unsold = rows.filter((r) => r.stock > 0 && r.out < 1 && !r.sell).sort((a, b) => b.stock * W[b.ware].price.avg - a.stock * W[a.ware].price.avg);
  if (unsold.length) {
    const value = unsold.reduce((s, r) => s + r.stock * W[r.ware].price.avg, 0);
    advice.push({
      sev: 2,
      text: unsold.length === 1
        ? `${Math.round(unsold[0].stock).toLocaleString("en-US")} ${W[unsold[0].ware].label} in stock and no sell offer, so nothing can take it.`
        : `${unsold.length} wares sit here with no sell offer, worth about ${fmtCr(value)}: ${unsold.slice(0, 4).map((r) => W[r.ware].label).join(", ")}${unsold.length > 4 ? " and more" : ""}.`,
      fix: "Add sell offers (your faction only, if they are meant for your stations) so traders can take them out.",
    });
  }
  for (const r of rows) {
    if (r.stock > 0 && r.out < 1 && !r.sell) {
      continue;
    } else if (r.net < 0 && r.stock > 0 && r.stock / -r.net < RUNWAY_WARN_HOURS && !stalled.has(r.ware)) {
      advice.push({ sev: 1, text: `${W[r.ware].label} runs out here in about ${fmtHours(r.stock / -r.net)}.`, fix: "More goes out than comes in. Add miners or traders bringing it in, or raise the buy price." });
    }
  }
  if (!st.storageCap || !Object.keys(st.storageCap).length) {
    advice.push({ sev: 2, text: "This station has no storage modules.", fix: "A hub needs storage for every kind of ware it handles: container, solid, liquid." });
  }
  for (const r of rows) {
    if ((r.buy || r.sell) && !(st.storageCap || {})[r.type]) {
      advice.push({ sev: 2, text: `Trades ${W[r.ware].label} but has no ${r.type} storage.`, fix: `Add a ${r.type} storage module, or drop the offer.` });
    }
  }
  advice.sort((a, b) => b.sev - a.sev);

  const top = (list, key) => {
    const m = new Map();
    for (const r of list) m.set(r[key], (m.get(r[key]) || 0) + r.perHour * W[r.ware].price.avg);
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  return {
    rows, typeInfo, advice,
    sources: top(inbound, "from"), destinations: top(outbound, "to"),
    ships: (state.empire.flows.ships || {})[st.id] || { miners: 0, traders: 0 },
    home: (state.empire.flows.homes || {})[st.id] || { miners: 0, traders: 0, haulSolid: 0, haulLiquid: 0 },
  };
}

function renderLogistics() {
  const note = $("logistics-note");
  const box = $("hub-list");
  const routesBox = $("route-list");
  const e = state.empire;
  if (!e || !e.flows || !e.flows.routes) {
    note.textContent = "";
    box.innerHTML = `<p class="quiet-note">${e ? noLogMessage(e, "Logistics") : "Load a save to see your distribution hubs and what moves between your stations."}</p>`;
    routesBox.innerHTML = "";
    $("transport-list").innerHTML = "";
    $("fleet-list").innerHTML = "";
    showSections("logistics", false);
    return;
  }
  showSections("logistics", true);
  const traffic = (st) => e.flows.routes.filter((r) => r.from === st.id || r.to === st.id).reduce((s, r) => s + r.perHour * W[r.ware].price.avg, 0);
  const hubs = e.stations.filter(isHub).sort((a, b) => traffic(b) - traffic(a));
  note.innerHTML = `A distribution hub is a station that stores and passes on wares rather than making them. Routes come from following each of your ships in the trade log, from where it loaded to where it delivered, over the last <strong class="num">${Math.round(e.flows.hours)}</strong> game hours.`;

  const others = e.stations.filter((st) => !isHub(st)).sort((a, b) => stationLabel(a).localeCompare(stationLabel(b)));
  const picker = `<label class="select-field hub-add"><span>Track a station as a hub</span>
    <select data-action="hub-add"><option value="">Choose a station</option>${others.map((st) => `<option value="${escapeHTML(st.id)}">${escapeHTML(stationLabel(st))}</option>`).join("")}</select></label>`;

  renderTransport(hubs);
  renderFleet();
  box.innerHTML = (hubs.length ? hubs.map((st) => hubCard(st)).join("") : `<p class="quiet-note">No hubs found. A station with storage, no production and traffic in the trade log counts as one; you can also pick any station below.</p>`) + picker;

  const flows = e.flows.routes
    .filter((r) => stationById(r.from) && stationById(r.to))
    .sort((a, b) => b.perHour * W[b.ware].price.avg - a.perHour * W[a.ware].price.avg);
  const shown = state.routesAll ? flows : flows.slice(0, 20);
  routesBox.innerHTML = flows.length
    ? `<div class="route-row route-head"><span>From</span><span>To</span><span>Ware</span><span>Per hour</span><span>Ships</span></div>
      ${shown.map((r) => `<div class="route-row">
        <span>${routeLink(r.from)}</span>
        <span>${routeLink(r.to)}</span>
        <button type="button" class="net-name" data-action="inspect" data-id="${r.ware}">${W[r.ware].label}</button>
        <span class="num">${fmtRate(r.perHour)}</span>
        <span class="num dim">${r.ships || ""}</span>
      </div>`).join("")}
      ${flows.length > 20 ? `<button type="button" class="btn is-small is-ghost" data-action="toggle-routes">${state.routesAll ? "Show fewer" : `Show all ${flows.length}`}</button>` : ""}`
    : `<p class="quiet-note">No deliveries between your own stations in the trade log.</p>`;
}

function hubCard(st) {
  const h = hubReport(st);
  const SEV = { 3: "is-short", 2: "is-warn", 1: "is-plain" };
  const fmtFill = (t) => {
    const label = t.type.charAt(0).toUpperCase() + t.type.slice(1);
    const trend = t.net > 1 ? `filling${t.hoursToFull !== null ? `, full in ${fmtHours(t.hoursToFull)}` : ""}` : t.net < -1 ? "emptying" : "steady";
    return `<div class="fill-row"><span>${label}</span>
      <span class="rank-bar${t.fill >= STORAGE_WARN ? " is-full" : ""}"><span style="transform:scaleX(${Math.min(1, t.fill)})"></span></span>
      <span class="num dim">${fmtPercent(Math.min(1, t.fill))}</span><span class="fill-trend">${trend}</span></div>`;
  };
  const flowList = (list) => list.length
    ? list.slice(0, 6).map(([id, v]) => `<div class="hub-flow"><span>${routeLink(id)}</span><span class="num dim">${fmtCredits(v)} Cr/h</span></div>`).join("")
    : `<p class="quiet-note">Nothing in the log.</p>`;

  return `<section class="hub-card">
    <div class="hub-head">
      <div>
        <h3><button type="button" class="link-btn hub-name" data-action="open-station" data-id="${escapeHTML(st.id)}">${escapeHTML(stationLabel(st))}</button></h3>
        <p class="quiet-note">${escapeHTML(st.sectorName)}. Its own ships: ${h.home.traders} ${plural(h.home.traders, "trader")}${haulText(h.home) ? ` (${haulText(h.home)})` : ""} and ${h.home.miners} ${plural(h.home.miners, "miner")}. In the log ${h.ships.miners + h.ships.traders} ships traded with it${st.modules.length ? `; it also has ${moduleTotal(st)} production ${plural(moduleTotal(st), "module")}` : ""}.</p>
      </div>
      <button type="button" class="btn is-small is-ghost" data-action="hub-remove" data-id="${escapeHTML(st.id)}">Stop tracking</button>
    </div>
    ${h.advice.length ? `<ul class="hub-advice is-compact">${h.advice.map((a) => `<li class="sev-${a.sev}"><details><summary><span class="tag ${SEV[a.sev]}">${SEV_LABEL[a.sev]}</span><span>${escapeHTML(a.text)}</span></summary><p>${escapeHTML(a.fix)}</p></details></li>`).join("")}</ul>`
      : `<p class="quiet-note all-good">${icon("check", 13)}Running smoothly: nothing piling up, nothing your factories wait for.</p>`}
    <div class="hub-body">
      <div class="hub-wares">
        <div class="hw-row hw-head"><span>Ware</span><span>${term("In", "hubin")}</span><span>${term("Out", "hubout")}</span><span>Stock</span><span>${term("Lasts", "hublasts")}</span><span>${term("Buy / sell", "hubprices")}</span></div>
        ${h.rows.map((r) => {
          let lasts = "";
          if (r.net < -1 && r.stock > 0) lasts = `<span class="num ${r.stock / -r.net < RUNWAY_WARN_HOURS ? "is-short" : ""}">${fmtHours(r.stock / -r.net)}</span>`;
          else if (r.net < -1) lasts = `<span class="num is-short">empty</span>`;
          else if (r.net > 1) lasts = `<span class="num dim">growing</span>`;
          else lasts = `<span class="num dim">${r.stock ? "steady" : ""}</span>`;
          return `<div class="hw-row">
            <button type="button" class="net-name" data-action="inspect" data-id="${r.ware}">${W[r.ware].label}</button>
            <span class="num ${r.inn ? "" : "dim"}">${fmtRate(r.inn)}</span>
            <span class="num ${r.out ? "" : "dim"}">${fmtRate(r.out)}</span>
            <span class="num">${Math.round(r.stock).toLocaleString("en-US")}</span>
            ${lasts}
            <span class="num dim">${r.buy ? fmtPrice(Math.round(r.buy)) : "-"} / ${r.sell ? fmtPrice(Math.round(r.sell)) : "-"}</span>
          </div>`;
        }).join("")}
      </div>
      <div class="hub-side">
        ${h.typeInfo.length ? `<section><h4>Storage</h4>${h.typeInfo.map(fmtFill).join("")}</section>` : ""}
        <section><h4>Gets wares from</h4>${flowList(h.sources)}</section>
        <section><h4>Delivers to</h4>${flowList(h.destinations)}</section>
      </div>
    </div>
  </section>`;
}

// Which stations still run their own transporters although a hub already
// moves their wares: candidates for handing transport over to the hub.
function transportRows(hubs) {
  const homes = state.empire.flows.homes || {};
  const routes = state.empire.flows.routes;
  const hubIds = new Set(hubs.map((h) => h.id));
  return state.empire.stations
    .map((st) => {
      const own = homes[st.id] || { miners: 0, traders: 0 };
      const viaHub = routes.filter((r) => r.from !== r.to && ((hubIds.has(r.from) && r.from !== st.id && r.to === st.id) || (hubIds.has(r.to) && r.to !== st.id && r.from === st.id)));
      const hubNames = [...new Set(viaHub.map((r) => (hubIds.has(r.from) ? r.from : r.to)))];
      return { st, traders: own.traders, miners: own.miners, haulSolid: own.haulSolid || 0, haulLiquid: own.haulLiquid || 0, hub: hubIds.has(st.id), hubNames, hubWares: new Set(viaHub.map((r) => r.ware)).size };
    })
    .filter((r) => r.traders || r.miners || r.hubNames.length)
    .sort((a, b) => b.hub - a.hub || b.traders - a.traders);
}

function renderTransport(hubs) {
  const box = $("transport-list");
  const rows = transportRows(hubs);
  if (!rows.length) {
    box.innerHTML = `<p class="quiet-note">No ships of yours traded in the log.</p>`;
    return;
  }
  const hubTraders = rows.filter((r) => r.hub).reduce((s, r) => s + r.traders, 0);
  const ownTraders = rows.filter((r) => !r.hub).reduce((s, r) => s + r.traders, 0);
  const handover = rows.filter((r) => !r.hub && r.traders && r.hubNames.length);
  box.innerHTML = `
    <p class="quiet-note sup-intro">${hubTraders} ${plural(hubTraders, "trader")} work from your hubs and ${ownTraders} from individual stations. A ship's home is the station it traded with most in the log.${handover.length ? ` ${handover.length} ${plural(handover.length, "station")} still run their own traders although a hub already moves some of their wares.` : ""}</p>
    <div class="tr-row tr-head"><span>Station</span><span>${term("Own traders", "owntraders")}</span><span>Own miners</span><span>Served by a hub</span><span>What to do</span></div>
    ${rows.map((r) => {
      let advice = "";
      if (r.hub) advice = "";
      else if (r.traders && r.hubNames.length) advice = `Could hand its ${r.traders} ${plural(r.traders, "trader")} to ${r.hubNames.map((id) => escapeHTML(routeName(id))).join(" or ")} and let the hub handle its wares.`;
      else if (r.traders >= 3 && hubs.length) advice = "Runs its own transport. Route it through a hub to share traders.";
      else if (!r.traders && r.hubNames.length) advice = "Served by a hub.";
      return `<div class="tr-row${r.hub ? " is-hub" : ""}">
        <span>${routeLink(r.st.id)}${r.hub ? ` <span class="tag is-plain">hub</span>` : ""}</span>
        <span><span class="num ${r.traders ? "" : "dim"}">${r.traders}</span>${haulText(r) ? `<span class="price-sub">${haulText(r)}</span>` : ""}</span>
        <span class="num ${r.miners ? "" : "dim"}">${r.miners}</span>
        <span class="tr-hub">${r.hubNames.length ? `${r.hubNames.map((id) => escapeHTML(routeName(id))).join(", ")}<span class="price-sub">${r.hubWares} ${plural(r.hubWares, "ware")}</span>` : `<span class="dim">no</span>`}</span>
        <span class="sup-advice">${advice}</span>
      </div>`;
    }).join("")}`;
}

// Ships that are not pulling their weight, and what to do about each.
const ECONOMIC_ORDERS = /Trade|Mining|Middleman|Supply|Salvage/i;

function fleetProblems() {
  const f = state.empire.flows;
  if (!f || !f.fleet) return null;
  const hours = Math.round(f.hours);
  const out = [];
  for (const s of f.fleet) {
    const label = s.name || s.code;
    if (!s.order || /^(Wait|DockAndWait|MoveWait|Follow)$/.test(s.order)) {
      const fix = s.type === "Freighter" ? "Assign it to a hub or factory as a trader, or give it a trade order."
        : s.type === "Other" ? "Give it a job, or sell it."
        : "Assign it to a station as a miner, or to a hub as a raw hauler (mining ships set to trade carry ore and gas).";
      out.push({ s, label, sev: 2, kind: "idle", text: `Standing order is ${s.order ? `"${s.order}"` : "empty"}.`, fix });
    } else if (ECONOMIC_ORDERS.test(s.order) && s.trades === 0) {
      out.push({ s, label, sev: 2, kind: "stuck", text: `On ${s.order} but made no trades in the last ${hours} h.`, fix: "It may be stuck, blocked by trade rules or a blacklist, or have nothing it is allowed to carry. Check its behaviour in game." });
    } else if (ECONOMIC_ORDERS.test(s.order) && s.idle !== null && s.idle > 8) {
      out.push({ s, label, sev: 1, kind: "slow", text: `Last trade ${fmtHours(s.idle)} ago.`, fix: "Check whether it is stuck or waiting for wares it cannot get." });
    }
  }
  return out.sort((a, b) => b.sev - a.sev || (b.s.idle || 1e9) - (a.s.idle || 1e9));
}

// miners working a ware that is well covered while another of the same
// kind runs short: moving some over closes the gap without buying ships
function minerRebalance() {
  const f = state.empire.flows;
  if (!f || !f.fleet) return [];
  const rows = miningRows();
  const cover = new Map(rows.map((r) => [r.ware, r]));
  const out = [];
  for (const type of ["Solid", "Liquid"]) {
    const wares = rows.filter((r) => W[r.ware].storageType === type && r.need > 0);
    if (!wares.length) continue;
    const worst = wares.reduce((a, b) => (a.cover <= b.cover ? a : b));
    if (worst.cover >= 0.8) continue;
    const byWare = new Map();
    for (const s of f.fleet) {
      if (s.role !== "miner" || !s.mines || W[s.mines].storageType !== type || s.mines === worst.ware) continue;
      const c = cover.get(s.mines);
      if (!c || c.cover < 0.9) continue; // moving miners off a short ware only moves the shortage
      byWare.set(s.mines, (byWare.get(s.mines) || 0) + 1);
    }
    for (const [ware, n] of byWare) {
      const c = cover.get(ware);
      out.push({ from: ware, to: worst.ware, n, fromCover: c.cover, toCover: worst.cover });
    }
  }
  return out.sort((a, b) => b.n - a.n);
}

function renderFleet() {
  const box = $("fleet-list");
  const problems = fleetProblems();
  if (!problems) {
    box.innerHTML = `<p class="quiet-note">Load your save again to check your ships. This empire was read by an older version.</p>`;
    return;
  }
  const f = state.empire.flows;
  const count = (t) => f.fleet.filter((s) => s.type === t).length;
  const rebalance = minerRebalance();
  const head = `<p class="quiet-note sup-intro">${count("Freighter")} freighters, ${count("Solid miner")} solid and ${count("Gas miner")} gas mining ships. Each one's standing order is checked against what it did in the trade log.</p>`;
  const reb = rebalance.length
    ? `<ul class="hub-advice">${rebalance.map((r) => `<li class="sev-2"><span class="tag is-warn">Rebalance</span><span><strong>${r.n} ${plural(r.n, "miner")} mostly mine ${W[r.from].label} (${fmtPercent(r.fromCover)} covered) while ${W[r.to].label} is at ${fmtPercent(r.toCover)}.</strong> Moving some of them to ${W[r.to].label} closes part of the gap without buying ships.</span></li>`).join("")}</ul>`
    : "";
  if (!problems.length) {
    box.innerHTML = head + reb + `<p class="quiet-note all-good">${icon("check", 13)}Every transport and mining ship is working.</p>`;
    return;
  }
  const shown = state.fleetAll ? problems : problems.slice(0, 15);
  box.innerHTML = head + reb + `
    <div class="fl-row fl-head"><span>Ship</span><span>Order</span><span>Home</span><span>${term("Trades", "fleettrades")}</span><span>Problem</span></div>
    ${shown.map((p) => `<div class="fl-row">
      <span class="fl-ship"><span class="fl-name">${escapeHTML(p.label)}</span><span class="price-sub">${p.s.size ? escapeHTML(p.s.size) + " " : ""}${p.s.type}${p.s.raw ? ", hauls raw" : ""}</span></span>
      <span class="fl-order">${escapeHTML(p.s.order || "none")}</span>
      <span>${p.s.home ? routeLink(p.s.home) : `<span class="dim">none</span>`}</span>
      <span class="num ${p.s.trades ? "" : "dim"}">${p.s.trades}</span>
      <span class="sup-advice"><span class="tag ${p.sev === 2 ? "is-warn" : "is-plain"}">${p.kind}</span><strong>${escapeHTML(p.text)}</strong> ${escapeHTML(p.fix)}</span>
    </div>`).join("")}
    ${problems.length > 15 ? `<button type="button" class="btn is-small is-ghost" data-action="toggle-fleet">${state.fleetAll ? "Show fewer" : `Show all ${problems.length}`}</button>` : ""}`;
}

// for the Stations tab: who supplies a station and who it supplies
function stationRoutes(st) {
  const routes = (state.empire.flows && state.empire.flows.routes) || [];
  const group = (list, key) => {
    const m = new Map();
    for (const r of list) {
      const k = `${r[key]}|${r.ware}`;
      m.set(k, { id: r[key], ware: r.ware, perHour: (m.has(k) ? m.get(k).perHour : 0) + r.perHour });
    }
    return [...m.values()].sort((a, b) => b.perHour * W[b.ware].price.avg - a.perHour * W[a.ware].price.avg).slice(0, 5);
  };
  return { from: group(routes.filter((r) => r.to === st.id), "from"), to: group(routes.filter((r) => r.from === st.id), "to") };
}

/* ---------------------------------------------------------------------
   Missions: what is in progress (with how far along), station upkeep
   tasks, what is on offer, and what has been done.

   X4 stores each active mission with its list of steps and marks the one
   the player is on, so progress is by step: "step 3 of 4". It does not
   store counts inside a step (such as 12 of 21 delivered).
--------------------------------------------------------------------- */

const MISSION_TYPE = Object.assign(Object.create(null), {
  plot: "Story", fight: "Combat", destroy: "Combat", trade: "Trade", deliver: "Delivery", build: "Construction",
  find: "Search", intelligence: "Intelligence", protect: "Protection", patrol: "Patrol", escort: "Escort",
  think: "Project", talkto: "Talk", custom: "Task", tutorial: "Tutorial", upkeep: "Upkeep",
});
const LEVEL_LABEL = Object.assign(Object.create(null), { trivial: "trivial", veryeasy: "very easy", easy: "easy", medium: "medium", hard: "hard", veryhard: "very hard", impossible: "impossible" });

function missionFaction(id) {
  if (!id) return "";
  if (id.startsWith("{")) return FACTION_TEXT[id] || "";
  if (id === "player") return "";
  return factionLabel(id);
}

function missionType(type) {
  if (!type) return "";
  if (type.startsWith("upkeep")) return "Upkeep";
  return MISSION_TYPE[type] || type.charAt(0).toUpperCase() + type.slice(1);
}

// done steps, the current one and the total, from the briefing
function missionProgress(m) {
  const steps = [...m.objectives].sort((a, b) => a.step - b.step);
  if (!steps.length) return null;
  const total = steps[steps.length - 1].step || steps.length;
  const active = steps.find((o) => o.active);
  const current = m.current || (active ? active.step : steps[0].step);
  // finished steps count in full, the one in progress counts half
  return { steps, total, current, done: Math.max(0, current - 1), fraction: Math.min(1, Math.max(0, (current - 0.5) / total)) };
}

// condensed at import
function summariseMissions(raw, info, converted, result) {
  if (!raw) return null;
  const now = Number(info.time) || 0;
  const stationNames = new Map();
  result.stations.forEach((s, i) => { if (s.id) stationNames.set(s.id, converted[i]); });
  const keep = (m) => ({
    id: m.id, name: m.name, description: m.description, faction: m.faction, type: m.type, caption: m.caption,
    reward: m.reward, rewardtext: m.rewardtext, age: m.time ? (now - m.time) / 3600 : null,
    objectives: m.objectives, current: m.current, thread: m.thread, parent: m.parent,
  });
  const upkeep = new Map();
  const active = [];
  for (const m of raw.active) {
    if (String(m.type).startsWith("upkeep")) {
      // one row per kind of task: "Transfer credits to X" all go under "Transfer credits"
      const credits = m.type === "upkeep_credits";
      const key = credits ? m.name.replace(/ to .*$/, "") : m.name;
      const g = upkeep.get(key) || { name: key, type: m.type, count: 0, where: [], alert: m.alert };
      g.count++;
      const st = stationNames.get(m.associated);
      const where = credits ? m.name.replace(/^.* to /, "") : st ? stationLabel(st) : (m.objectives[0] && (m.objectives[0].text || m.objectives[0].name)) || "";
      if (where && !g.where.includes(where)) g.where.push(where);
      upkeep.set(key, g);
    } else {
      active.push(keep(m));
    }
  }
  const offers = raw.offers.map((o) => ({
    name: o.name, description: o.description, faction: o.faction, type: o.type, level: o.level,
    reward: o.reward + o.subs.reduce((s, x) => s + x.reward, 0), rewardtext: o.rewardtext, subs: o.subs,
    kind: o.type === "tutorial" ? "tutorial" : / vs\. /i.test(o.name) ? "war" : o.type === "think" ? "project" : o.subs.length ? "guild" : "offer",
  }));
  return {
    active, offers,
    upkeep: [...upkeep.values()].sort((a, b) => b.count - a.count),
    log: raw.log.map((e) => ({ ...e, ago: (now - e.time) / 3600 })),
    stats: raw.stats, gameTime: now,
  };
}

// the logbook boiled down to one line per mission, newest first
function missionHistory(mis) {
  const activeNames = new Set(mis.active.map((m) => m.name));
  const byTitle = new Map();
  for (const e of [...mis.log].sort((a, b) => a.time - b.time)) {
    let status = "chapter";
    if (e.text === "Mission completed.") status = "completed";
    else if (e.text === "Mission aborted.") status = "aborted";
    else if (e.text === "Mission failed.") status = "failed";
    else if (e.text === "Mission accepted.") status = "accepted";
    if (status === "chapter") {
      byTitle.set(`${e.title}|${e.time}`, { ...e, status });
    } else {
      byTitle.set(e.title, { ...e, status });
    }
  }
  return [...byTitle.values()]
    .filter((e) => !(e.status === "accepted" && activeNames.has(e.title)))
    .sort((a, b) => b.time - a.time);
}

function fmtAgo(hours) {
  if (hours === null || hours === undefined) return "";
  if (hours < 1) return "under an hour ago";
  return `${fmtHours(hours)} ago`;
}

function missionCard(m, children) {
  const p = missionProgress(m);
  const faction = missionFaction(m.faction);
  const meta = [missionType(m.type), faction, m.caption && m.caption !== faction ? m.caption : ""].filter(Boolean).join(", ");
  const reward = [m.reward ? `${fmtCredits(m.reward)} Cr` : "", m.rewardtext].filter(Boolean).join(" and ");
  const steps = p
    ? `<ol class="m-steps">${p.steps.map((o) => {
        const cls = o.step < p.current ? "is-done" : o.step === p.current ? "is-current" : "is-next";
        const label = [o.name, o.text].filter(Boolean).join(": ") || missionType(o.type);
        return `<li class="${cls}"><span class="m-dot">${o.step < p.current ? icon("check", 10) : ""}</span><span>${escapeHTML(label)}</span></li>`;
      }).join("")}</ol>`
    : "";
  const bar = p && p.total > 1
    ? `<div class="m-progress"><div class="rank-bar"><span style="transform:scaleX(${p.fraction})"></span></div><span class="num">Step ${p.current} of ${p.total}</span></div>`
    : !p && children && children.length
      ? `<p class="quiet-note">${children.length} ${plural(children.length, "mission")} open in this story.</p>`
      : "";
  return `<article class="m-card${children ? " is-thread" : ""}" data-mission="${escapeHTML(m.id)}">
    <div class="m-head">
      <div>
        <h3>${escapeHTML(m.name)}</h3>
        <p class="m-meta">${escapeHTML(meta)}${m.age !== null ? ` <span class="dim">accepted ${fmtAgo(m.age)}</span>` : ""}</p>
      </div>
      ${reward ? `<span class="m-reward">${escapeHTML(reward)}</span>` : ""}
    </div>
    ${bar}
    ${steps}
    ${m.description ? `<details class="m-desc"><summary>Briefing</summary><p>${escapeHTML(m.description)}</p></details>` : ""}
    ${children && children.length ? `<div class="m-children">${children.map((c) => missionCard(c)).join("")}</div>` : ""}
  </article>`;
}

function renderMissions() {
  const box = $("missions-body");
  const e = state.empire;
  if (!e || !e.missions) {
    box.innerHTML = `<p class="quiet-note">${e ? "Load your save again to see your missions. This empire was read by an older version." : "Load a save to see the missions you are on, what is on offer and what you have done."}</p>`;
    return;
  }
  const mis = e.missions;
  const byId = new Map(mis.active.map((m) => [m.id, m]));
  const children = (m) => m.thread.map((id) => byId.get(id)).filter(Boolean);
  const roots = mis.active.filter((m) => !m.parent || !byId.has(m.parent));
  const story = roots.filter((m) => m.type === "plot");
  const other = roots.filter((m) => m.type !== "plot");
  const history = missionHistory(mis);
  const done = history.filter((h) => h.status === "completed" || h.status === "chapter");
  const offers = mis.offers.filter((o) => o.kind !== "tutorial");
  const tutorials = mis.offers.filter((o) => o.kind === "tutorial");
  const completed = mis.stats.missions_completed;

  const summary = `<div class="m-summary">
    <div><span class="num">${mis.active.length}</span><span>in progress</span></div>
    <div><span class="num">${done.length}</span><span>done in your log${completed !== undefined ? `, ${completed} regular ${plural(completed, "mission")} completed in total` : ""}</span></div>
    <div><span class="num">${offers.length}</span><span>on offer</span></div>
    ${mis.upkeep.length ? `<div><span class="num">${mis.upkeep.reduce((s, g) => s + g.count, 0)}</span><span>upkeep tasks</span></div>` : ""}
  </div>`;

  const inProgress = mis.active.length
    ? (story.length ? `<h3 class="m-group">Story</h3>${story.map((m) => missionCard(m, children(m))).join("")}` : "") +
      (other.length ? `<h3 class="m-group">Other missions</h3>${other.map((m) => missionCard(m, children(m).length ? children(m) : null)).join("")}` : "")
    : `<p class="quiet-note">No missions in progress.</p>`;

  const upkeep = mis.upkeep.length
    ? `<div class="m-upkeep">${mis.upkeep.map((g) => `
        <details class="m-up"><summary><span class="m-up-name">${escapeHTML(g.name)}</span><span class="num dim">${g.count}</span></summary>
          <p class="quiet-note">${g.where.slice(0, 12).map(escapeHTML).join(", ")}${g.where.length > 12 ? ` and ${g.where.length - 12} more` : ""}</p>
        </details>`).join("")}</div>`
    : `<p class="quiet-note">Nothing to restock, hire or pay for.</p>`;

  const KIND = { offer: "Missions with a reward", guild: "Guild missions", war: "Faction war contracts", project: "Projects" };
  const offerList = Object.entries(KIND).map(([kind, title]) => {
    const list = offers.filter((o) => o.kind === kind).sort((a, b) => b.reward - a.reward);
    if (!list.length) return "";
    return `<h3 class="m-group">${title} <span class="num dim">${list.length}</span></h3>
      ${list.map((o) => `<div class="m-offer">
        <span class="m-offer-name">${escapeHTML(o.name)}${o.subs.length ? `<span class="price-sub">${o.subs.map((x) => escapeHTML(x.name)).join(", ")}</span>` : ""}</span>
        <span class="dim">${escapeHTML([missionType(o.type), missionFaction(o.faction)].filter(Boolean).join(", "))}</span>
        <span class="dim">${escapeHTML(LEVEL_LABEL[o.level] || o.level || "")}</span>
        <span class="num">${o.reward ? fmtCredits(o.reward) + " Cr" : ""}${o.rewardtext ? `<span class="price-sub">${escapeHTML(o.rewardtext)}</span>` : ""}</span>
      </div>`).join("")}`;
  }).join("") + (tutorials.length ? `<p class="quiet-note m-tut">${tutorials.length} ${plural(tutorials.length, "tutorial")} not done yet: ${tutorials.map((t) => escapeHTML(t.name.replace(/^\d+\)\s*/, ""))).join(", ")}.</p>` : "");

  const shown = state.historyAll ? history : history.slice(0, 25);
  const STATUS = { completed: ["is-ok", "done"], chapter: ["is-ok", "story"], aborted: ["is-plain", "aborted"], failed: ["is-short", "failed"], accepted: ["is-plain", "accepted"] };
  const log = history.length
    ? `<ul class="m-log">${shown.map((h) => {
        const [cls, label] = STATUS[h.status];
        const faction = missionFaction(h.faction);
        return `<li><span class="tag ${cls}">${label}</span><span class="m-log-text"><strong>${escapeHTML(h.title)}</strong>${h.status === "chapter" ? ` ${escapeHTML(h.text)}` : ""}<span class="price-sub">${escapeHTML(faction)}${faction ? ", " : ""}${fmtAgo(h.ago)}</span></span></li>`;
      }).join("")}</ul>
      ${history.length > 25 ? `<button type="button" class="btn is-small is-ghost" data-action="toggle-history">${state.historyAll ? "Show fewer" : `Show all ${history.length}`}</button>` : ""}`
    : `<p class="quiet-note">Your logbook has no missions yet.</p>`;

  box.innerHTML = `${summary}
    <section aria-labelledby="m-progress-title"><div class="stations-head"><h2 id="m-progress-title">In progress</h2></div>
      <p class="quiet-note prices-note">X4 tracks a mission by its steps, so progress is shown as the step you are on. Counts inside a step (such as 12 of 21 delivered) are not stored in the save.</p>
      ${inProgress}</section>
    <section class="section-gap" aria-labelledby="m-upkeep-title"><div class="stations-head"><h2 id="m-upkeep-title">Station and ship upkeep</h2></div>${upkeep}</section>
    <section class="section-gap" aria-labelledby="m-offers-title"><div class="stations-head"><h2 id="m-offers-title">On offer</h2></div>${offerList || `<p class="quiet-note">No offers right now.</p>`}</section>
    <section class="section-gap" aria-labelledby="m-done-title"><div class="stations-head"><h2 id="m-done-title">Done</h2></div>${log}</section>`;
}

/* ---------------------------------------------------------------------
   Action plan: the few things worth doing first, gathered from every
   tab and ranked by what they are worth per hour.
--------------------------------------------------------------------- */

function actionPlan() {
  const e = state.empire;
  if (!e) return [];
  const items = [];

  // output lost to stalls, per missing ware (a module short of two wares
  // splits its loss between them)
  const lost = new Map();
  for (const st of e.stations) {
    for (const m of st.modules) {
      if (!m.stalled) continue;
      const short = (m.short || []).filter((w) => W[w]);
      if (!short.length) continue;
      const v = (Math.max(0, moduleValue(m.ware, m.method, m.efficiency)) * m.stalled) / short.length;
      for (const w of short) lost.set(w, (lost.get(w) || 0) + v);
    }
  }

  if (e.flows) {
    for (const r of miningRows()) {
      if (!r.more) continue;
      items.push({
        impact: lost.get(r.ware) || 0,
        title: `Add ${minerSizes(r, true, W[r.ware].storageType === "Liquid" ? "gas" : "solid").replace(/^A/, "a")} for ${W[r.ware].label}`,
        why: `Supply covers ${fmtPercent(r.cover)} of what your stations use${r.stalled ? `, and ${r.stalled} ${plural(r.stalled, "module")} are stalled for it` : ""}.`,
        tab: "supply", label: "Supply",
      });
    }
  }
  const balance = computeBalance();
  // a ware with idle makers is a distribution problem, not a production one:
  // the "move it" item below covers it, so do not also suggest building more
  const hasIdle = new Set();
  for (const st of e.stations) for (const m of st.modules) if (m.idle) hasIdle.add(m.ware);
  for (const [w, v] of lost) {
    if (W[w].isMined || v <= 0 || hasIdle.has(w)) continue;
    const row = balance.find((b) => b.id === w);
    const n = row && row.modulesNeeded ? row.modulesNeeded : 0;
    items.push({
      impact: v,
      title: n ? `Build ${n} more ${W[w].label} ${plural(n, "module")}` : `Get more ${W[w].label} to your factories`,
      why: `Factories are stalled waiting for ${W[w].label}.`,
      ware: w, label: "Plan chain",
    });
  }

  // modules idle because their output has nowhere to go
  const idleByWare = new Map();
  for (const st of e.stations) {
    for (const m of st.modules) {
      if (!m.idle) continue;
      const x = idleByWare.get(m.ware) || { idle: 0, value: 0, stations: new Set(), top: null };
      if (!x.top || m.idle > x.top.idle) x.top = { st, idle: m.idle };
      x.idle += m.idle;
      x.value += m.idle * Math.max(0, moduleValue(m.ware, m.method, m.efficiency));
      x.stations.add(stationLabel(st));
      idleByWare.set(m.ware, x);
    }
  }
  const waitingFor = stalledWares();
  for (const [w, x] of idleByWare) {
    const waiting = waitingFor.get(w);
    items.push({
      impact: x.value,
      title: waiting ? `Move ${W[w].label} to the stations waiting for it` : `Free up ${W[w].label} storage so ${x.idle} idle ${plural(x.idle, "module")} can run`,
      why: waiting
        ? `${x.idle} ${plural(x.idle, "module")} idle with full storage at ${[...x.stations].slice(0, 2).join(", ")}, while ${waiting.modules} ${plural(waiting.modules, "module")} wait for it elsewhere.`
        : `Storage for it is full at ${[...x.stations].slice(0, 2).join(", ")}${x.stations.size > 2 ? " and more" : ""}. ${idleOutlet(x.top.st, w) || "Sell more, move it out, or add storage."}`,
      tab: "stations", label: "Stations",
    });
  }

  const shortStaffed = e.stations.filter((st) => st.workforceNeed && st.workforce < st.workforceNeed * 0.9);
  const staffGain = shortStaffed.reduce((s, st) => s + workforceGain(st), 0);
  if (staffGain > 0) {
    items.push({
      impact: staffGain,
      title: `Add habitats at ${shortStaffed.length} ${plural(shortStaffed.length, "station")}`,
      why: "A full workforce speeds up production; this is after feeding the extra workers.",
      tab: "stations", sort: "shortfall", label: "Stations",
    });
  }

  if (e.flows) {
    const internal = internalRows().filter((r) => r.gain > 0);
    const gain = internal.reduce((s, r) => s + r.gain, 0);
    if (gain > 0) {
      items.push({
        impact: gain,
        title: "Supply your own stations before buying from NPCs",
        why: `${internal.length} ${plural(internal.length, "ware")} sold to NPCs and bought back, ${W[internal[0].ware].label} most of all.`,
        tab: "supply", label: "Supply",
      });
    }
  }

  if (e.market) {
    const tips = priceAdvice().filter((r) => r.effect > 0).sort((a, b) => b.effect - a.effect);
    const gain = tips.reduce((s, r) => s + r.effect, 0);
    if (gain > 0) {
      items.push({
        impact: gain,
        title: `Adjust ${tips.length} trade ${plural(tips.length, "price")}`,
        why: `${W[tips[0].ware].label} first: ${tips[0].text.charAt(0).toLowerCase()}${tips[0].text.slice(1)}`,
        tab: "prices", label: "Market",
      });
    }
  }

  const ships = (fleetProblems() || []).filter((p) => p.sev >= 2);
  if (ships.length) {
    items.push({
      impact: null,
      title: `Put ${ships.length} idle or stuck ${plural(ships.length, "ship")} to work`,
      why: "Ships you already own, sitting on Wait or making no trades.",
      tab: "logistics", label: "Logistics",
    });
  }
  if (e.flows && e.flows.routes) {
    for (const st of e.stations.filter(isHub)) {
      const haul = hubReport(st).advice.find((a) => a.sev === 3 && /more arrives than leaves/.test(a.fix));
      if (haul) {
        items.push({
          impact: null,
          title: `Assign more haulers to ${stationLabel(st)}`,
          why: "More arrives at the hub than leaves it, while factories wait.",
          tab: "logistics", label: "Logistics",
        });
      }
    }
  }

  return items.sort((a, b) => (b.impact === null ? -1 : b.impact) - (a.impact === null ? -1 : a.impact));
}

function renderActionPlan() {
  const box = $("action-plan");
  const items = actionPlan();
  box.hidden = !state.empire;
  if (!state.empire) return;
  if (!items.length) {
    box.innerHTML = `<h2>Do these first</h2><p class="quiet-note all-good">${icon("check", 13)}Nothing urgent. Your empire is running well.</p>`;
    return;
  }
  const LIMIT = 5;
  const shown = items.slice(0, LIMIT);
  box.innerHTML = `
    <h2>Do these first</h2>
    <ol class="plan-list">${shown.map((it, i) => `
      <li>
        <span class="plan-rank num">${i + 1}</span>
        <span class="plan-main"><strong>${escapeHTML(it.title)}</strong><span>${escapeHTML(it.why)}</span></span>
        <span class="plan-impact num">${it.impact ? `+${fmtCredits(it.impact)} Cr/h` : ""}</span>
        <button type="button" class="btn is-small" ${it.ware ? `data-action="plan-ware" data-id="${it.ware}"` : `data-action="open-tab" data-id="${it.tab}"${it.sort ? ` data-sort="${it.sort}"` : ""}`}>${it.label}${icon("arrow-right", 11)}</button>
      </li>`).join("")}
    </ol>
    <p class="quiet-note">Gains are estimates at average prices, so they show what matters most, not exact credits.${items.length > LIMIT ? ` ${items.length - LIMIT} more in Needs attention.` : ""}</p>`;
}

/* ---------------------------------------------------------------------
   Search (Ctrl+K): jump to any tab, ware, station, mission or ship.
--------------------------------------------------------------------- */

const palette = { items: [], results: [], active: 0, returnFocus: null };

function paletteItems() {
  const items = [];
  const tabs = [["overview", "Overview"], ["stations", "Stations"], ["supply", "Supply"], ["logistics", "Logistics"], ["prices", "Market"], ["missions", "Missions"], ["blueprints", "Blueprints"], ["rewards", "Rewards"]];
  items.push({ kind: "View", label: "Planner", sub: "production chains", run: () => setView("planner") });
  for (const [id, label] of tabs) {
    items.push({ kind: "Tab", label, sub: "Empire", run: () => { state.view = "empire"; setEmpireTab(id); } });
  }
  for (const w of Object.values(W)) {
    items.push({ kind: "Ware", label: w.label, sub: w.isMined ? "mined" : TIER_LABELS[w.tier] || `Tier ${w.tier}`, run: () => { state.view = "planner"; selectWare(w.id); } });
  }
  const e = state.empire;
  if (e) {
    for (const st of e.stations) {
      items.push({ kind: "Station", label: stationLabel(st), sub: st.sectorName, run: () => { state.view = "empire"; openStation(st.id); } });
    }
    for (const m of (e.missions && e.missions.active) || []) {
      items.push({ kind: "Mission", label: m.name, sub: missionType(m.type), run: () => openMission(m.id) });
    }
    const owned = ownedBlueprints();
    if (owned) {
      for (const b of BLUEPRINTS) {
        if (b.cat === "Paint jobs" || b.cat === "Clothing") continue;
        items.push({
          kind: "Blueprint", label: b.name, sub: `${owned.has(b.id) ? "owned" : "missing"}, ${b.kind === b.cat ? b.cat : b.kind}`,
          run: () => { state.view = "empire"; state.bpShow = "all"; state.bpCat = ""; state.bpFilter = b.name; $("bp-filter").value = b.name; setEmpireTab("blueprints"); },
        });
      }
    }
    for (const s of (e.flows && e.flows.fleet) || []) {
      items.push({
        kind: "Ship", label: s.name || s.code, sub: `${s.type}${s.home ? `, works for ${routeName(s.home)}` : ""}`,
        run: () => { state.view = "empire"; if (s.home) openStation(s.home); else setEmpireTab("logistics"); },
      });
    }
  }
  return items;
}

function openMission(id) {
  state.view = "empire";
  setEmpireTab("missions");
  const card = document.querySelector(`.m-card[data-mission="${CSS.escape(id)}"]`);
  if (card) {
    card.scrollIntoView({ block: "center" });
    card.classList.add("is-found");
    setTimeout(() => card.classList.remove("is-found"), 1600);
  }
}

function searchPalette(q) {
  const query = q.trim().toLowerCase();
  if (!query) return palette.items.filter((it) => it.kind === "View" || it.kind === "Tab");
  const score = (it) => {
    const label = it.label.toLowerCase();
    if (label.startsWith(query)) return 4;
    if (label.split(/[\s(,]+/).some((w) => w.startsWith(query))) return 3;
    if (label.includes(query)) return 2;
    if ((it.sub || "").toLowerCase().includes(query)) return 1;
    return 0;
  };
  const ORDER = { View: 0, Tab: 1, Station: 2, Ware: 3, Mission: 4, Ship: 5, Blueprint: 6 };
  return palette.items
    .map((it) => ({ it, s: score(it) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || ORDER[a.it.kind] - ORDER[b.it.kind] || a.it.label.localeCompare(b.it.label))
    .slice(0, 14)
    .map((x) => x.it);
}

function renderPalette() {
  const list = $("palette-list");
  const input = $("palette-input");
  palette.results = searchPalette(input.value);
  palette.active = Math.min(palette.active, Math.max(0, palette.results.length - 1));
  list.innerHTML = palette.results.length
    ? palette.results.map((it, i) => `
      <li role="option" id="pal-${i}" aria-selected="${i === palette.active}" class="${i === palette.active ? "is-active" : ""}" data-index="${i}">
        <span class="pal-kind">${it.kind}</span>
        <span class="pal-label">${escapeHTML(it.label)}</span>
        <span class="pal-sub">${escapeHTML(it.sub || "")}</span>
      </li>`).join("")
    : `<li class="pal-empty">Nothing matches "${escapeHTML(input.value.trim())}".</li>`;
  input.setAttribute("aria-activedescendant", palette.results.length ? `pal-${palette.active}` : "");
  const active = list.querySelector(".is-active");
  if (active) active.scrollIntoView({ block: "nearest" });
}

function openPalette() {
  const box = $("palette");
  if (!box.hidden) return;
  palette.items = paletteItems();
  palette.active = 0;
  palette.returnFocus = document.activeElement;
  box.hidden = false;
  const input = $("palette-input");
  input.value = "";
  renderPalette();
  input.focus();
}

function closePalette() {
  const box = $("palette");
  if (box.hidden) return;
  box.hidden = true;
  if (palette.returnFocus && palette.returnFocus.isConnected) palette.returnFocus.focus();
}

function runPalette(i) {
  const it = palette.results[i];
  if (!it) return;
  closePalette();
  it.run();
}

function bindPalette() {
  const box = $("palette");
  const input = $("palette-input");
  $("search-open").addEventListener("click", openPalette);
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (box.hidden) openPalette();
      else closePalette();
    }
  });
  input.addEventListener("input", () => {
    palette.active = 0;
    renderPalette();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      palette.active = Math.min(palette.results.length - 1, palette.active + 1);
      renderPalette();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      palette.active = Math.max(0, palette.active - 1);
      renderPalette();
    } else if (e.key === "Enter") {
      e.preventDefault();
      runPalette(palette.active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closePalette();
    }
  });
  box.addEventListener("click", (e) => {
    if (e.target === box) return closePalette();
    const li = e.target.closest("li[data-index]");
    if (li) runPalette(Number(li.dataset.index));
  });
  box.addEventListener("mousemove", (e) => {
    const li = e.target.closest("li[data-index]");
    if (li && Number(li.dataset.index) !== palette.active) {
      palette.active = Number(li.dataset.index);
      renderPalette();
    }
  });
}

/* ---------------------------------------------------------------------
   Blueprints: what you own and what you are missing, from the game's
   full list of player blueprints, with where to buy the missing ones.
--------------------------------------------------------------------- */

const BP_CATEGORIES = ["Station modules", "Ships", "Equipment", "Equipment mods", "Paint jobs", "Clothing"];

function ownedBlueprints() {
  const e = state.empire;
  return e && e.blueprints ? new Set(e.blueprints) : null;
}

// missing production modules for wares your empire uses or is stalled for,
// ranked by how much of that ware you need per hour
function blueprintsWorthGetting(owned) {
  const e = state.empire;
  const need = new Map();
  for (const st of e.stations) {
    for (const [w, n] of stationNet(st)) need.set(w, (need.get(w) || 0) + n);
  }
  const stalled = stalledWares();
  const byWare = new Map();
  for (const b of BLUEPRINTS) {
    if (!b.makes || owned.has(b.id)) continue;
    // one race's module is enough: skip the ware if you own any module for it
    if (BLUEPRINTS.some((o) => o.makes === b.makes && owned.has(o.id))) continue;
    const short = -(need.get(b.makes) || 0);
    const s = stalled.get(b.makes);
    if (short <= 0 && !s) continue;
    const value = Math.max(0, short) * W[b.makes].price.avg + (s ? s.modules * 1e6 : 0);
    const cur = byWare.get(b.makes);
    if (!cur || b.price < cur.b.price) byWare.set(b.makes, { b, short: Math.max(0, short), stalled: s ? s.modules : 0, value });
  }
  return [...byWare.values()].sort((a, b) => b.value - a.value).slice(0, 8);
}

function renderBlueprints() {
  const summary = $("bp-summary");
  const list = $("bp-list");
  const controls = $("bp-controls");
  const owned = ownedBlueprints();
  controls.hidden = !owned;
  if (!owned) {
    summary.innerHTML = `<p class="quiet-note">${state.empire ? "Load your save again to see your blueprints. This empire was read by an older version." : "Load a save to see which blueprints you own and which you are missing."}</p>`;
    list.innerHTML = "";
    return;
  }
  const have = BLUEPRINTS.filter((b) => owned.has(b.id)).length;
  const cats = BP_CATEGORIES.map((cat) => {
    const all = BLUEPRINTS.filter((b) => b.cat === cat);
    return { cat, total: all.length, owned: all.filter((b) => owned.has(b.id)).length };
  }).filter((c) => c.total);

  const worth = state.empire.stations.length ? blueprintsWorthGetting(owned) : [];
  summary.innerHTML = `
    <div class="bp-head">
      <p class="bp-total"><span class="num">${have.toLocaleString("en-US")}</span> of ${BLUEPRINTS.length.toLocaleString("en-US")} blueprints owned <span class="dim">(${fmtPercent(have / BLUEPRINTS.length)})</span></p>
      <div class="bp-cats">${cats.map((c) => `
        <button type="button" class="bp-cat" data-action="bp-cat" data-id="${c.cat}" title="Show ${c.cat}">
          <span class="bp-cat-name">${c.cat}</span>
          <span class="num">${c.owned} / ${c.total}</span>
          <span class="rank-bar"><span style="transform:scaleX(${c.owned / c.total})"></span></span>
        </button>`).join("")}
      </div>
    </div>
    ${worth.length ? `<section class="card bp-worth">
      <h2>Worth getting</h2>
      <p class="quiet-note">Production modules you have no blueprint for, for wares your stations use and do not make enough of.</p>
      <ul class="bp-worth-list">${worth.map((x) => `
        <li>
          <span class="bp-worth-main"><strong>${escapeHTML(x.b.name)}</strong><span>${x.stalled ? `${x.stalled} of your modules stalled for ${W[x.b.makes].label}` : `you are short ${fmtRate(x.short)} ${W[x.b.makes].label} per hour`}</span></span>
          <span class="bp-sellers">${x.b.owners.length ? `Sold by ${escapeHTML(x.b.owners.slice(0, 3).map(factionLabel).join(", "))}${x.b.owners.length > 3 ? ` and ${x.b.owners.length - 3} more` : ""}` : "Not sold by any faction"}</span>
        </li>`).join("")}
      </ul>
    </section>` : ""}`;
  renderBlueprintList();
}

function renderBlueprintList() {
  const owned = ownedBlueprints();
  const list = $("bp-list");
  if (!owned) return;
  const show = state.bpShow || "missing";
  const q = (state.bpFilter || "").trim().toLowerCase();
  document.querySelectorAll("#bp-show button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.show === show)));
  const items = BLUEPRINTS.filter((b) => {
    const has = owned.has(b.id);
    if (show === "missing" && has) return false;
    if (show === "owned" && !has) return false;
    if (state.bpCat && b.cat !== state.bpCat) return false;
    if (q && ![b.name, b.kind, b.dlc || "", ...b.owners.map(factionLabel)].some((t) => t.toLowerCase().includes(q))) return false;
    return true;
  });
  if (!items.length) {
    list.innerHTML = `<p class="quiet-note">${q ? `No blueprint matches "${escapeHTML(q)}".` : show === "missing" ? "You own every blueprint here." : "No blueprints here."}</p>`;
    return;
  }
  const open = !!q || !!state.bpCat;
  list.innerHTML = (state.bpCat ? `<p class="bp-filtered">Showing ${escapeHTML(state.bpCat)} only. <button type="button" class="link-btn" data-action="bp-cat" data-id="">Show all categories</button></p>` : "") +
    BP_CATEGORIES.map((cat) => {
      const inCat = items.filter((b) => b.cat === cat);
      if (!inCat.length) return "";
      const kinds = [...new Set(inCat.map((b) => b.kind))];
      return `<details class="bp-group"${open || cat === "Station modules" ? " open" : ""}>
        <summary><span>${cat}</span><span class="num dim">${inCat.length}</span></summary>
        ${kinds.map((kind) => `
          ${kinds.length > 1 || kind !== cat ? `<h4 class="bp-kind">${escapeHTML(kind)}</h4>` : ""}
          <ul class="bp-items">${inCat.filter((b) => b.kind === kind).map((b) => {
            const has = owned.has(b.id);
            return `<li class="${has ? "is-owned" : "is-missing"}">
              <span class="bp-mark" aria-label="${has ? "Owned" : "Missing"}">${has ? icon("check", 11) : ""}</span>
              <span class="bp-text">
                <span class="bp-name" title="${escapeHTML(b.name)}">${escapeHTML(b.name)}${b.dlc ? ` <span class="tag is-plain">${escapeHTML(b.dlc)}</span>` : ""}</span>
                ${has ? "" : `<span class="bp-from" title="${escapeHTML(b.owners.map(factionLabel).join(", "))}">${b.owners.length ? `Sold by ${escapeHTML(b.owners.slice(0, 2).map(factionLabel).join(", ") + (b.owners.length > 2 ? ` and ${b.owners.length - 2} more` : ""))}` : "Not sold by any faction"}</span>`}
              </span>
            </li>`;
          }).join("")}</ul>`).join("")}
      </details>`;
    }).join("");
}

function bindBlueprints() {
  $("bp-filter").addEventListener("input", (e) => {
    state.bpFilter = e.target.value;
    renderBlueprintList();
  });
  document.querySelectorAll("#bp-show button").forEach((b) => b.addEventListener("click", () => {
    state.bpShow = b.dataset.show;
    renderBlueprintList();
  }));
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
    minerals: BASE_MINERALS.filter((id) => isSourced(id) || stocked.has(id)).length,
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
  if (state.importing || progress.highest === null || !state.checkProgress) return;
  state.checkProgress = false;
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

// Who may trade with a station, per ware and side, from the save's trade
// rules. A rule is a list of factions that are either the only ones allowed
// or the ones shut out; its name is whatever the player typed, so it is
// never looked at. "internal": only your own ships. "limited": some NPC
// factions are shut out. Wares with no restriction are left out.
function resolveTradeRules(raw, global) {
  const rules = (global && global.rules) || {};
  const defaults = (global && global.defaults) || {};
  const kindOf = (id) => {
    if (id === -1) return { kind: "open" };
    if (!(id > 0)) return null; // "use station / global setting"
    const r = rules[id];
    if (!r) return null;
    const internal = r.whitelist && r.factions.every((f) => f === "player");
    return { kind: internal ? "internal" : "limited", rule: r.name };
  };
  const t = raw || {};
  const base = {};
  for (const side of ["buy", "sell"]) base[side] = kindOf(t[side]) || kindOf(defaults[side]) || { kind: "open" };
  const out = { buy: base.buy.kind === "open" ? null : base.buy, sell: base.sell.kind === "open" ? null : base.sell, wares: {} };
  for (const [w, v] of Object.entries(t.wares || {})) {
    if (!W[w]) continue;
    const res = {};
    for (const side of ["buy", "sell"]) {
      const k = kindOf(v[side]);
      if (k) res[side] = k.kind === "open" ? null : k;
    }
    if (Object.keys(res).length) out.wares[w] = res;
  }
  return out;
}

// the trade restriction on one ware at a station: null when anyone may trade
function wareAccess(st, ware, side) {
  const t = st.tradeRules;
  if (!t) return null;
  const w = t.wares[ware];
  if (w && side in w) return w[side];
  return t[side] || null;
}

function convertStation(s, i, counter, rules) {
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
    if (!groups.has(key)) groups.set(key, { ware: mapped.ware, method: mapped.method, count: 0, effSum: 0, stalled: 0, idle: 0, paused: 0, short: new Set() });
    const g = groups.get(key);
    g.count++;
    g.effSum += eff;
    if (STALL_STATES.has(m.state)) {
      g.stalled++;
      for (const w of Object.keys(m.shortage || {})) g.short.add(w);
    } else if (m.overflow) {
      g.idle++; // made a batch and has nowhere to put it
    }
    if (m.paused) g.paused++;
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
    buildsShips: (s.buildProcessors || 0) > 0,
    upkeep: workforceUpkeep(workforceByRace, workforceNeed),
    habitats: s.habitats,
    habitatCapacity: (s.habitats || []).reduce((a, h) => a + ((HABITATS[h] || {}).capacity || 0), 0),
    underConstruction: s.underConstruction,
    storageCap,
    cargo,
    offers,
    overrides,
    tradeRules: resolveTradeRules(s.tradeRules, rules),
    modules: [...groups.values()].map((g) => ({
      ware: g.ware, method: g.method, count: g.count, efficiency: g.effSum / g.count,
      stalled: g.stalled, idle: g.idle, paused: g.paused, short: [...g.short],
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
    const converted = stations.map((s, i) => convertStation(s, i, counter, result.tradeRules));

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
      hasTradeLog: (result.trades || []).length > 0,
      flows: summariseFlows(result, converted),
      missions: summariseMissions(result.missions, info, converted, result),
      blueprints: result.blueprints || [],
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
    state.checkProgress = ok; // the refresh below may celebrate what this save reached
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

  const hubs = readJSON(HUBS_KEY);
  hubOverrides = hubs && typeof hubs === "object" ? hubs : {};

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
  bindPalette();
  bindBlueprints();
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
  const TAB_KEYS = ["overview", "stations", "supply", "logistics", "prices", "missions", "blueprints", "rewards"];
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
    else if (action === "open-tab") {
      if (btn.dataset.sort) state.stationSort = { key: btn.dataset.sort, dir: -1 };
      setEmpireTab(id);
    }
    else if (action === "plan-ware") {
      state.view = "planner";
      selectWare(id);
    }
    else if (action === "hub-remove") setHub(id, false);
    else if (action === "bp-cat") {
      state.bpCat = state.bpCat === id ? "" : id;
      renderBlueprintList();
    }
    else if (action === "toggle-history") {
      state.historyAll = !state.historyAll;
      renderMissions();
    }
    else if (action === "toggle-fleet") {
      state.fleetAll = !state.fleetAll;
      renderFleet();
    }
    else if (action === "toggle-routes") {
      state.routesAll = !state.routesAll;
      renderLogistics();
    } else if (action === "toggle-attention") {
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
    } else if (e.target.matches("select[data-action=hub-add]") && e.target.value) {
      setHub(e.target.value, true);
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
