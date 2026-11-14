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
