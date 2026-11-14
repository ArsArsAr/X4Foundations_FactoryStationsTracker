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
  assert.equal(st.modules.length, 2);
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
