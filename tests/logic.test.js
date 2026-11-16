"use strict";
/* The app's maths, run on the real code and the real game data. */

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers");

const app = loadApp();
const { get } = app;
const W = get("WARES_DATA");
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);

test("credit formatting drops trailing zeros and keeps the sign", () => {
  const fmt = get("fmtCredits");
  assert.equal(fmt(21834112), "21.8M");
  assert.equal(fmt(50000), "50k");
  assert.equal(fmt(7.5e9), "7.5B");
  assert.equal(fmt(-1500), "-1.5k");
  assert.equal(fmt(1e12), "1T");
});

test("empire levels: level 10 is a billion per hour, level 20 a trillion", () => {
  const levelFor = get("levelFor");
  assert.equal(levelFor(0).index, 0);
  assert.equal(levelFor(999e6).index, 8);
  assert.equal(levelFor(1e9).index, 9);
  assert.equal(levelFor(1e12).index, 19);
  assert.equal(levelFor(1e15).next, null);
});

test("chain maths: every input rate follows from the target", () => {
  const state = get("state");
  state.chainRace = "default";
  state.chainSunlight = 1;
  const chain = get("computeChain")("hullparts", 1000);
  const r = W.hullparts.recipes[W.hullparts.mainMethod];
  const cycles = 1000 / r.amount;
  for (const i of r.inputs) {
    const edge = chain.edges.find((e) => e.from === i.wareID && e.to === "hullparts");
    close(edge.flow, cycles * i.amount, `${i.wareID} into hull parts`);
  }
  // a shared input (energy cells) gets the sum of all its consumers
  const intoCells = chain.edges.filter((e) => e.from === "energycells").reduce((s, e) => s + e.flow, 0);
  close(chain.nodes.energycells.rate, intoCells, "energy cells total");
  for (const n of Object.values(chain.nodes)) {
    if (n.perModule) assert.equal(n.modules, Math.ceil(n.rate / n.perModule - 1e-9), `${n.id} modules`);
  }
});

test("chain maths: race recipes and sunlight change the chain", () => {
  const state = get("state");
  state.chainRace = "teladi";
  const teladi = get("computeChain")("hullparts", 1000);
  assert.ok(teladi.nodes.teladianium, "Teladi hull parts use teladianium");
  assert.ok(!teladi.nodes.refinedmetals, "and no refined metals");
  state.chainRace = "default";
  state.chainSunlight = 0.5;
  const pm = get("chainPerModule")(W.energycells);
  state.chainSunlight = 1;
  close(pm * 2, get("chainPerModule")(W.energycells), "half the sunlight, half the cells");
});

test("unnamed stations are labelled by what they make", () => {
  const label = get("stationLabel");
  assert.equal(label({ name: "Mine", code: "X" }), "Mine");
  assert.equal(label({ code: "ABC-123", modules: [{ ware: "hullparts", count: 2 }, { ware: "energycells", count: 5 }] }), "ABC-123 (Energy Cells, Hull Parts)");
  assert.equal(label({ code: "ABC-123", modules: [] }), "Station ABC-123");
});

test("workers eat by race, and employed workers eat more than idle ones", () => {
  const upkeep = get("workforceUpkeep");
  const busy = Object.fromEntries(upkeep({ argon: 200 }, 200).map((u) => [u.ware, u.amount]));
  close(busy.foodrations, 450, "200 busy Argon eat 450 food rations an hour");
  close(busy.medicalsupplies, 270, "and use 270 medical supplies");
  const idle = Object.fromEntries(upkeep({ argon: 200 }, 0).map((u) => [u.ware, u.amount]));
  close(idle.foodrations, 300, "idle workers eat two thirds");
  assert.equal(upkeep({}, 100).length, 0, "no workers, nothing to feed");
});

test("ship roles come from the standing order, not the hull", () => {
  const role = get("shipRole");
  const raw = get("rawHaul");
  const minerHull = "ship_arg_m_miner_solid_01_a_macro";
  assert.equal(role({ macro: minerHull, order: "MiningRoutine" }), "miner");
  assert.equal(role({ macro: minerHull, order: "TradeRoutine" }), "trader", "a mining hull set to trade hauls raw wares");
  assert.equal(raw({ macro: minerHull, order: "TradeRoutine" }), "solid");
  assert.equal(raw({ macro: "ship_arg_m_miner_liquid_01_a_macro", order: "TradeRoutine" }), "liquid");
  assert.equal(raw({ macro: minerHull, order: "MiningRoutine" }), null);
  assert.equal(role({ macro: minerHull, order: null }), "miner", "no order: fall back to the hull");
  assert.equal(role({ macro: "ship_arg_l_trans_container_01_a_macro", order: "TradeRoutine" }), "trader");
});

// a miner fills a hub, a mining hull set to trade hauls it on to a factory
function haulWorld() {
  const result = {
    stations: [{ id: "[hub]" }, { id: "[fac]" }],
    ships: [
      { id: "[miner]", macro: "ship_arg_m_miner_solid_01_a_macro", code: "MIN", order: "MiningRoutine" },
      { id: "[hauler]", macro: "ship_arg_m_miner_solid_01_a_macro", code: "HAU", order: "TradeRoutine" },
      { id: "[freighter]", macro: "ship_arg_l_trans_container_01_a_macro", code: "FRE", order: "TradeRoutine" },
    ],
    trades: [
      [0, "ore", "[hub]", "[miner]", 50, 100], // mined, delivered to the hub
      [600, "ore", "[hauler]", "[hub]", 52, 100], // hauler loads at the hub
      [1200, "ore", "[fac]", "[hauler]", 55, 100], // and delivers to the factory
      [1800, "hullparts", "[npc]", "[fac]", 200, 10], // factory sells to an NPC
      [2400, "energycells", "[freighter]", "[npc]", 10, 50], // freighter buys from an NPC
      [3000, "energycells", "[fac]", "[freighter]", 12, 50], // and sells to the factory
    ],
    info: { time: "3600" },
    log: { start: 0, end: 3600 },
  };
  const converted = [{ id: "HUB" }, { id: "FAC" }];
  return { result, converted };
}

test("mining is counted once, even when raw wares are hauled on by mining hulls", () => {
  // regression: the hub-to-factory leg on a mining hull was counted as mining too
  const { result, converted } = haulWorld();
  const flows = get("summariseFlows")(result, converted);
  close(flows.hours, 1, "one hour of log");
  close(flows.wares.ore.mined, 100, "only the real miner's delivery is mining");
  assert.equal(flows.wares.ore.miners, 1);
  assert.deepEqual({ ...flows.minerCount }, { solid: 1, liquid: 0, haulSolid: 1, haulLiquid: 0 });
});

test("routes follow each ship from where it loaded to where it delivered", () => {
  const { result, converted } = haulWorld();
  const flows = get("summariseFlows")(result, converted);
  const route = (from, to, ware) => flows.routes.find((r) => r.from === from && r.to === to && r.ware === ware);
  close(route("mined", "HUB", "ore").perHour, 100, "miner to hub");
  close(route("HUB", "FAC", "ore").perHour, 100, "hub to factory");
  close(route("npc", "FAC", "energycells").perHour, 50, "an NPC purchase traced to the station it fed");
  close(route("FAC", "npc", "hullparts").perHour, 10, "a direct sale");
  assert.ok(!flows.routes.some((r) => r.from === r.to), "no route goes back where it came from");
});

test("actual earnings count only trades with NPCs for the empire", () => {
  const { result, converted } = haulWorld();
  const a = get("summariseFlows")(result, converted).actual;
  close(a.revenue, 2000, "10 hull parts sold at 200");
  close(a.cost, 500, "50 energy cells bought at 10");
  close(a.stations.FAC.sold, 2000, "the factory's books");
  close(a.stations.FAC.bought, 100 * 55 + 50 * 12, "including what it paid your own ships");
  close(a.stations.HUB.sold, 100 * 52, "the hub sold to its hauler");
});

test("own-price earnings leave trades between your own stations out", () => {
  const state = get("state");
  state.empire = {
    stations: [
      { id: "A", modules: [{ ware: "energycells", method: "default", count: 1, efficiency: 1 }], offers: { energycells: { sell: { price: 10 } } }, overrides: {} },
      { id: "B", modules: [], offers: { energycells: { buy: { price: 30 } } }, overrides: {}, upkeep: [{ ware: "energycells", amount: 100 }] },
    ],
  };
  const made = get("perModule")(W.energycells);
  // B uses 100 of A's cells: only the surplus leaves the empire, at A's price
  close(get("empireOwnProfit")(), (made - 100) * 10, "net surplus at the selling price");
  state.empire = null;
});

test("mission progress counts finished steps and half of the current one", () => {
  const progress = get("missionProgress");
  const steps = [1, 2, 3, 4].map((step) => ({ step, active: step === 3 }));
  const p = progress({ objectives: steps, current: 3 });
  assert.equal(p.current, 3);
  assert.equal(p.total, 4);
  assert.equal(p.done, 2);
  close(p.fraction, 2.5 / 4, "two done and one under way");
  assert.equal(progress({ objectives: steps, current: null }).current, 3, "falls back to the active flag");
  assert.equal(progress({ objectives: [], current: null }), null, "a story with no steps of its own");
});

test("mission history keeps the last state of each mission", () => {
  const history = get("missionHistory")({
    active: [{ name: "Still Going" }],
    log: [
      { time: 1, title: "Shields Down!", text: "Mission accepted." },
      { time: 2, title: "Shields Down!", text: "Mission completed." },
      { time: 3, title: "Still Going", text: "Mission accepted." },
      { time: 4, title: "Defenders of Sol", text: "The threat is subdued." },
      { time: 5, title: "Gave Up", text: "Mission aborted." },
    ],
  });
  assert.deepEqual([...history.map((h) => `${h.title}:${h.status}`)], ["Gave Up:aborted", "Defenders of Sol:chapter", "Shields Down!:completed"],
    "newest first; an accepted mission that is still active is not listed as done");
});

test("text from a save is escaped before it reaches the page", () => {
  const evil = "<img src=x onerror=alert(1)>";
  const esc = get("escapeHTML");
  assert.equal(esc(evil), "&lt;img src=x onerror=alert(1)&gt;");
  assert.equal(esc(`a"b'c&d`), "a&quot;b&#39;c&amp;d");
  const html = get("missionCard")({
    id: evil, name: evil, description: evil, faction: evil, type: evil, caption: evil, reward: 0, rewardtext: evil,
    age: 1, objectives: [{ step: 1, type: evil, text: evil, name: evil, active: true }], current: 1, thread: [], parent: null,
  });
  assert.ok(!html.includes("<img"), "no raw markup in a mission card");
});

test("lookup tables have no built-in properties for a save to reach", () => {
  for (const name of ["WARES_DATA", "MODULE_MACROS", "SECTORS", "STORAGE", "HABITATS"]) {
    assert.equal(get(name).toString, undefined, `${name}.toString`);
    assert.equal(get(name).constructor, undefined, `${name}.constructor`);
  }
  assert.equal(get("factionLabel")("constructor"), "Constructor", "an unknown faction is just capitalised");
});

test("a trader's buy-from-NPC, sell-to-NPC run is trading, not your stations' supply", () => {
  const { result, converted } = haulWorld();
  result.ships.push({ id: "[arb]", macro: "ship_arg_l_trans_container_01_a_macro", code: "ARB", order: "TradeRoutine" });
  result.trades.push([3100, "hullparts", "[arb]", "[npc1]", 150, 40]); // buys from one NPC
  result.trades.push([3200, "hullparts", "[npc2]", "[arb]", 210, 40]); // sells to another
  const flows = get("summariseFlows")(result, converted);
  close(flows.wares.hullparts.sold, 10, "only the factory's own sale counts as sold");
  close(flows.wares.hullparts.bought, 0, "nothing was bought for a station");
  close(flows.wares.energycells.bought, 50, "the freighter's purchase did feed the factory");
  close(flows.actual.revenue, 2000 + 40 * 210, "the trader's sale is still real money");
});

test("miner rates are measured per ship size from your own ships", () => {
  const result = {
    stations: [{ id: "[hub]" }],
    ships: [
      { id: "[m1]", macro: "ship_arg_m_miner_solid_01_a_macro", order: "MiningRoutine" },
      { id: "[m2]", macro: "ship_arg_m_miner_solid_01_a_macro", order: "MiningRoutine" },
      { id: "[l1]", macro: "ship_arg_l_miner_solid_01_a_macro", order: "MiningRoutine" },
      { id: "[l2]", macro: "ship_arg_l_miner_solid_01_a_macro", order: "MiningRoutine" },
    ],
    trades: [
      [0, "ore", "[hub]", "[m1]", 50, 1000],
      [600, "ore", "[hub]", "[m2]", 50, 1000],
      [1200, "ore", "[hub]", "[l1]", 50, 4000],
      [1800, "ore", "[hub]", "[l2]", 50, 4000],
    ],
    info: { time: "3600" },
    log: { start: 0, end: 3600 },
  };
  const flows = get("summariseFlows")(result, [{ id: "HUB" }]);
  const vol = W.ore.volume;
  close(flows.perMinerSize.Solid.M.rate, 1000 * vol, "an M miner: 1,000 ore an hour");
  close(flows.perMinerSize.Solid.L.rate, 4000 * vol, "an L miner: 4,000 ore an hour");
  assert.equal(flows.perMinerSize.Solid.L.miners, 2);
  const text = get("minerSizes")({ more: 10, bySize: [{ size: "L", n: 3 }, { size: "M", n: 9 }] }, true, "solid");
  assert.equal(text, "About 3 L or 9 M solid miners");
  assert.equal(get("minerSizes")({ more: 1, bySize: [] }), "about 1 more miner", "falls back to the fleet average");
});

test("trade rules are read by what they do, not by their name", () => {
  const resolve = get("resolveTradeRules");
  const access = get("wareAccess");
  const global = {
    rules: {
      5: { name: "my own stuff", factions: ["player"], whitelist: true },
      6: { name: "Restrict all factions but mine", factions: ["xenon", "khaak"], whitelist: false },
      7: { name: "friends", factions: ["player", "argon"], whitelist: true },
    },
    defaults: {},
  };
  const st = { tradeRules: resolve({ buy: null, sell: 7, wares: { graphene: { sell: 5 }, hullparts: { sell: -1 }, ore: { buy: 6 } } }, global) };
  assert.equal(access(st, "graphene", "sell").kind, "internal", "a whitelist of only you is internal, whatever its name");
  assert.equal(access(st, "ore", "buy").kind, "limited", "a blacklist is never internal, even named like one");
  assert.equal(access(st, "hullparts", "sell"), null, "-1 is no restriction for that ware");
  assert.equal(access(st, "energycells", "sell").kind, "limited", "other wares follow the station rule");
  assert.equal(access(st, "energycells", "buy"), null);
  const viaDefault = { tradeRules: resolve({ buy: -3, sell: null, wares: {} }, { rules: global.rules, defaults: { buy: 5, sell: -2 } }) };
  assert.equal(access(viaDefault, "graphene", "buy").kind, "internal", "the empire default applies when the station has none");
  assert.equal(access(viaDefault, "graphene", "sell"), null);
});

// a tiny empire: a graphene factory, optionally a hub and a consumer
function miniEmpire({ factoryRule = null, hub = null, consumer = false, routes = [] } = {}) {
  const resolve = get("resolveTradeRules");
  const rules = { rules: { 1: { name: "anything at all", factions: ["player"], whitelist: true } }, defaults: {} };
  const mk = (id, name, modules, extra = {}) => ({
    id, name, code: id, modules, storage: [], storageCap: { container: 1e6 }, cargo: {}, offers: {}, upkeep: [],
    tradeRules: resolve(extra.rules || {}, rules), ...extra,
  });
  const graphene = { ware: "graphene", method: W.graphene.mainMethod, count: 4, efficiency: 1, stalled: 0, idle: 4, paused: 0, short: [] };
  const stations = [mk("FAC", "Graphene Factory", [graphene], { rules: factoryRule ? { wares: { graphene: { sell: factoryRule } } } : {} })];
  if (hub) stations.push(mk("HUB", "Depot", [], { storage: ["a", "b", "c"], offers: { graphene: hub.offers || {} }, rules: hub.rules || {} }));
  if (consumer) {
    const uses = Object.keys(W).find((id) => W[id].recipes[W[id].mainMethod].inputs.some((i) => i.wareID === "graphene"));
    stations.push(mk("USE", "User", [{ ware: uses, method: W[uses].mainMethod, count: 2, efficiency: 1, stalled: 0, idle: 0, paused: 0, short: [] }]));
  }
  const state = get("state");
  state.empire = { stations, market: {}, flows: { routes, homes: { HUB: { traders: 3, haulSolid: 0, haulLiquid: 0 } } } };
  return stations;
}

test("idle advice with no hub and no rules keeps the general advice", () => {
  const [fac] = miniEmpire();
  assert.equal(get("idleOutlet")(fac, "graphene"), null);
  assert.equal(get("deadEnds")().length, 0, "nothing is locked, so nothing is a dead end");
});

test("idle advice follows the ware to a hub and names what is wrong there", () => {
  const route = [{ from: "FAC", to: "HUB", ware: "graphene", perHour: 100 }];
  let [fac] = miniEmpire({ hub: { offers: { buy: { price: 1, amount: 0 }, sell: { price: 2 } } }, routes: route });
  assert.match(get("idleOutlet")(fac, "graphene"), /Depot already holds as much Graphene as it is set to keep/);
  [fac] = miniEmpire({ hub: { offers: { buy: { price: 1, amount: 500 } } }, routes: route });
  assert.match(get("idleOutlet")(fac, "graphene"), /Depot's ships take about .* It has 3 freighters/);
  [fac] = miniEmpire({ hub: { offers: { buy: { price: 1, amount: 500 } } }, routes: [{ from: "HUB", to: "npc", ware: "graphene", perHour: 50 }] });
  assert.match(get("idleOutlet")(fac, "graphene"), /none of its ships collected it/);
  [fac] = miniEmpire({ hub: { offers: {} }, routes: route });
  assert.match(get("idleOutlet")(fac, "graphene"), /no buy offer for Graphene/);
});

test("a ware locked to your ships is a dead end only when nothing of yours uses or sells it", () => {
  miniEmpire({ factoryRule: 1 });
  assert.equal(get("deadEnds")().map((d) => d.ware).join(), "graphene");
  miniEmpire({ factoryRule: 1, consumer: true });
  assert.equal(get("deadEnds")().length, 0, "one of your stations uses it");
  miniEmpire({ factoryRule: 1, hub: { offers: { sell: { price: 2 } } } });
  assert.equal(get("deadEnds")().length, 0, "the hub sells it on to NPCs");
  miniEmpire({ factoryRule: 1, hub: { offers: { sell: { price: 2 } }, rules: { sell: 1 } } });
  assert.equal(get("deadEnds")()[0].holders.map((s) => s.id).join(), "FAC,HUB", "the hub locked too: nowhere to go");
});
