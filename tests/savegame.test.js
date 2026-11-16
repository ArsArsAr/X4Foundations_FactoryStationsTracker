"use strict";
/* The save reader against a small hand-written save that has every element
   the app reads, in the one-element-per-line layout X4 writes. */

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { scanChunks } = require(path.resolve(__dirname, "..", "savegame.js"));

const SAVE = `<?xml version="1.0" encoding="UTF-8"?>
<savegame>
<info>
<save name="Test &amp; save" date="1790000000"/>
<game id="X4" version="900" build="1" time="7200"/>
</info>
<traderules>
<traderule id="1" owner="player" name="Only mine &amp; co" factions="player" allow="1"/>
<traderule id="2" owner="player" name="No pirates" factions="scaleplate yaki" allow="0"/>
</traderules>
<factions>
<faction id="argon">
<traderules>
<traderule type="buy" traderule="1"/>
</traderules>
</faction>
<faction id="player">
<traderules>
<traderule type="sell" traderule="2"/>
</traderules>
</faction>
</factions>
<universe>
<component class="galaxy" macro="xu_ep2_universe_macro" id="[0x1]">
<component class="sector" macro="cluster_01_sector001_macro" id="[0x3]">
<component class="station" macro="station_gen_factory_base_01_macro" name="Hub &amp; Co" code="AAA-111" owner="player" id="[0x10]">
<component class="production" macro="prod_gen_hullparts_macro" id="[0x11]">
<production state="waitingforresources">
<queue ware="hullparts">
<shortage>
<ware ware="energycells" amount="5"/>
</shortage>
</queue>
</production>
<efficiency product="0.8"/>
</component>
<component class="production" macro="prod_gen_energycells_macro" state="construction" id="[0x12]">
</component>
<component class="production" macro="prod_gen_graphene_macro" id="[0x15]">
<production start="1" end="2" item="0" paused="1" state="choosingitem">
<efficiency product="1"/>
<queue ware="graphene" method="default">
<overflow>
<ware ware="graphene" amount="7"/>
</overflow>
</queue>
</production>
</component>
<component class="buildprocessor" macro="buildprocessor_macro" id="[0x19]">
</component>
<component class="habitation" macro="hab_arg_s_01_macro" id="[0x13]"/>
<component class="storage" macro="storage_arg_m_container_01_macro" id="[0x14]">
<cargo>
<ware ware="energycells" amount="100"/>
</cargo>
</component>
<economylog cargo="1" offer="2"/>
<trade id="[0x5]" seller="[0x10]" ware="hullparts" price="20000" amount="10" desired="0" flags="x"/>
<prices>
<override>
<ware ware="hullparts" buy="0" sell="250"/>
</override>
</prices>
<traderules>
<wares>
<ware ware="graphene" sell="1"/>
<ware ware="energycells" buy="-1"/>
</wares>
</traderules>
<workforces lasttime="1">
<workforce race="teladi" amount="60">
</workforce>
</workforces>
<component class="ship_m" macro="ship_arg_m_miner_solid_01_a_macro" code="MIN-001" owner="player" id="[0x20]">
<orders>
<order id="[0x2]" default="1" order="MiningRoutine">
</order>
</orders>
<component class="storage" macro="storage_arg_m_miner_solid_01_a_macro" id="[0x21]">
<cargo>
<ware ware="ore" amount="999"/>
</cargo>
</component>
</component>
</component>
<component class="station" macro="station_arg_tradestation_01_macro" code="NPC-001" owner="argon" id="[0x30]">
<traderules buy="-3" sell="-3" supplies="-3"/>
<trade id="[0x6]" buyer="[0x30]" ware="hullparts" price="21000" amount="50" desired="50" flags=""/>
<trade id="[0x7]" seller="[0x30]" ware="hullparts" price="19000" amount="40" flags=""/>
<trade id="[0x8]" seller="[0x30]" ware="hullparts" price="100" amount="40" flags="virtual"/>
</component>
<component class="station" macro="station_xen_01_macro" code="XEN-001" owner="xenon" id="[0x40]">
<trade id="[0x9]" buyer="[0x40]" ware="hullparts" price="99999" amount="5" flags=""/>
</component>
</component>
</component>
</universe>
<blueprints>
<blueprint ware="module_gen_prod_hullparts_01"/>
<blueprint ware="ship_arg_m_trans_container_01_a"/>
</blueprints>
<missions>
<offer id="9" actor="[0x50]" name="Help Trade Operation" description="A guild job" faction="teladi" type="trade" level="easy">
<briefing>
<mission name="Identify Profitable Regions" description="" faction="teladi" type="trade" reward="81280" rewardtext="High Energy Catalyst" index="1"/>
</briefing>
</offer>
<mission id="100" time="3600" name="Boarding Operation" description="Lend aid.[\\012]Target: Okinawa" faction="player" type="fight" abortable="0">
<briefing>
<objective step="1" type="destroy" text="Turrets"/>
<objective step="2" type="protect" text="Boarding Pods"/>
<objective step="3" type="custom" name="Damage" text="Hull to 80%" active="1"/>
<objective step="4" type="protect" text="Okinawa">
<targets>
<target id="[0x60]"/>
</targets>
</objective>
</briefing>
<objective step="3" type="custom" name="Damage" text="Hull to 80%">
</objective>
</mission>
<mission id="200" time="3600" name="A Pirate's Life" description="Story" faction="{20203,3001}" type="plot">
<thread>
<mission id="201"/>
</thread>
</mission>
<mission id="201" time="3600" name="High-Tech Hold-Up" description="Sub" faction="{20203,3001}" type="plot">
<briefing>
<objective step="1" type="talkto" text="Ace" active="1">
</objective>
</briefing>
<thread id="200"/>
</mission>
</missions>
<logbook>
<entry time="100" category="missions" title="Shields Down!" text="Mission accepted." faction="{20203,201}"/>
<entry time="200" category="missions" title="Shields Down!" text="Mission completed." faction="{20203,201}"/>
<entry time="300" category="news" title="Not a mission" text="x"/>
</logbook>
<stats>
<stat id="missions_accepted" value="16"/>
<stat id="missions_completed" value="15"/>
</stats>
<economylog>
<entries>
<log time="3600" type="trade" owner="[0x10]" ware="water" v="5"/>
<log time="3600" type="trade" ware="ore" buyer="[0x10]" seller="[0x20]" price="5000" v="100"/>
</entries>
</economylog>
</savegame>
`;

async function scan(text) {
  // feed it in awkward chunks so lines split across chunk borders
  const chunks = [];
  for (let i = 0; i < text.length; i += 37) chunks.push(text.slice(i, i + 37));
  return scanChunks(chunks);
}

test("reads the player station and its modules", async () => {
  const { stations } = await scan(SAVE);
  assert.equal(stations.length, 1);
  const st = stations[0];
  assert.equal(st.name, "Hub & Co");
  assert.equal(st.code, "AAA-111");
  assert.equal(st.id, "[0x10]");
  assert.equal(st.sector, "cluster_01_sector001_macro");
  assert.equal(st.modules.length, 3);
  const [hull, cells] = st.modules;
  assert.deepEqual(
    { macro: hull.macro, state: hull.state, efficiency: hull.efficiency, built: hull.built, shortage: hull.shortage },
    { macro: "prod_gen_hullparts_macro", state: "waitingforresources", efficiency: 0.8, built: true, shortage: { energycells: 5 } },
  );
  assert.equal(cells.built, false, "a module under construction is not built");
});

test("reads stock, offers, manual prices, workers and ship building", async () => {
  const st = (await scan(SAVE)).stations[0];
  assert.deepEqual(st.cargo, { energycells: 100 }, "cargo in a docked ship's hold is not station stock");
  assert.deepEqual(st.offers, [{ side: "sell", ware: "hullparts", price: 200, amount: 10, desired: 0 }]);
  assert.deepEqual(st.overrides, { hullparts: { buy: 0, sell: 250 } });
  assert.equal(st.workforce, 60);
  assert.deepEqual(st.workforceByRace, { teladi: 60 });
  assert.deepEqual(st.habitats, ["hab_arg_s_01_macro"]);
  assert.deepEqual(st.storage, ["storage_arg_m_container_01_macro"]);
  assert.equal(st.buildProcessors, 1);
});

test("a station's own <economylog/> tag does not swallow the rest of the station", async () => {
  // regression: the self-closing summary tag was taken for the big log
  const st = (await scan(SAVE)).stations[0];
  assert.equal(st.workforce, 60, "lines after the tag are still read");
});

test("reads player ships with their standing order", async () => {
  const { ships } = await scan(SAVE);
  assert.deepEqual(ships, [{ id: "[0x20]", macro: "ship_arg_m_miner_solid_01_a_macro", code: "MIN-001", name: null, order: "MiningRoutine" }]);
});

test("builds the NPC market without virtual offers or hostile owners", async () => {
  const { market } = await scan(SAVE);
  assert.deepEqual(market.hullparts.buy, [[210, 50, "cluster_01_sector001_macro", "argon"]]);
  assert.deepEqual(market.hullparts.sell, [[190, 40, "cluster_01_sector001_macro", "argon"]]);
});

test("reads completed trades from the economy log and the save header", async () => {
  const { trades, info, log } = await scan(SAVE);
  assert.deepEqual(trades, [[3600, "ore", "[0x10]", "[0x20]", 50, 100]]);
  assert.equal(info.name, "Test & save");
  assert.equal(info.time, "7200");
  assert.equal(log.end, 3600);
});

test("reads missions: steps, the current step, story threads and offers", async () => {
  const { missions } = await scan(SAVE);
  assert.equal(missions.active.length, 3);
  const boarding = missions.active[0];
  assert.equal(boarding.name, "Boarding Operation");
  assert.equal(boarding.description, "Lend aid.\nTarget: Okinawa", "X4 line breaks become real ones");
  assert.deepEqual(boarding.objectives.map((o) => o.step), [1, 2, 3, 4]);
  assert.equal(boarding.current, 3, "the objective after the briefing is the current step");
  assert.deepEqual(missions.active[1].thread, ["201"], "a story lists its open sub-missions");
  assert.equal(missions.active[2].parent, "200", "and a sub-mission points back to its story");
  assert.equal(missions.offers.length, 1);
  assert.deepEqual(missions.offers[0].subs.map((x) => x.name), ["Identify Profitable Regions"]);
  assert.equal(missions.offers[0].subs[0].reward, 81280);
});

test("reads the mission logbook and mission stats", async () => {
  const { missions } = await scan(SAVE);
  assert.deepEqual(missions.log.map((e) => e.text), ["Mission accepted.", "Mission completed."], "only mission entries");
  assert.deepEqual(missions.stats, { missions_accepted: 16, missions_completed: 15 });
});

test("reads the player's blueprints", async () => {
  const { blueprints } = await scan(SAVE);
  assert.deepEqual(blueprints, ["module_gen_prod_hullparts_01", "ship_arg_m_trans_container_01_a"]);
});

test("a crafted save cannot use built-in property names as wares or station codes", async () => {
  const evil = SAVE
    .replace('code="AAA-111"', 'code="constructor"')
    .replace('<ware ware="energycells" amount="100"/>', '<ware ware="energycells" amount="100"/>\n<ware ware="__proto__" amount="5"/>')
    .replace('<blueprint ware="module_gen_prod_hullparts_01"/>', '<blueprint ware="module_gen_prod_hullparts_01"/>\n<blueprint ware="__proto__"/>');
  const { stations, blueprints } = await scan(evil);
  assert.equal(stations[0].code, null, "an unsafe station code is dropped");
  assert.deepEqual(Object.keys(stations[0].cargo), ["energycells"], "an unsafe ware is skipped");
  assert.ok(!blueprints.includes("__proto__"));
  assert.equal(({}).amount, undefined, "nothing leaked onto every object");
});

test("reads modules that are idle because their output has no room, and paused ones", async () => {
  const st = (await scan(SAVE)).stations[0];
  const graphene = st.modules.find((m) => m.macro === "prod_gen_graphene_macro");
  assert.equal(graphene.overflow, true, "overflow means its output storage is full");
  assert.equal(graphene.paused, true);
  assert.equal(st.modules[0].overflow, false);
  assert.deepEqual(st.cargo, { energycells: 100 }, "the overflow ware is not stock");
});

test("reads trade rules: definitions, the player's defaults and per-ware station rules", async () => {
  const { tradeRules, stations } = await scan(SAVE);
  assert.deepEqual({ ...tradeRules.rules[1] }, { name: "Only mine & co", factions: ["player"], whitelist: true });
  assert.equal(tradeRules.rules[2].whitelist, false);
  assert.deepEqual(tradeRules.defaults, { sell: 2 }, "another faction's defaults are not the player's");
  const t = stations[0].tradeRules;
  assert.deepEqual({ ...t.wares.graphene }, { buy: null, sell: 1 });
  assert.deepEqual({ ...t.wares.energycells }, { buy: -1, sell: null });
  assert.equal(t.buy, null, "an NPC station's rule is not read into yours");
});
