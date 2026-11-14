"use strict";

/* ---------------------------------------------------------------------
   Reads player-owned stations, and a market snapshot of everyone else's
   trade offers, out of an X4: Foundations save file.

   Saves are gzipped XML, often 500 MB to 1 GB once unpacked, so they are
   never loaded whole. The file is decompressed as a stream and scanned
   line by line: X4 writes one XML element per line, which makes a small
   state machine over component open/close tags enough.

   Works in the browser (File from an <input>) and in Node (for tests).
--------------------------------------------------------------------- */

(function (root) {
  // owners whose trade offers are not a market the player can use
  const HOSTILE_OWNERS = new Set(["xenon", "khaak", "ownerless", "player"]);

  const attr = (line, name) => {
    const m = line.match(new RegExp(`\\s${name}="([^"]*)"`));
    return m ? m[1] : null;
  };

  // A save is a file anyone can edit. Values the app uses as object keys
  // (ware, station code, race, ids) must never be JavaScript's built-in
  // property names, or a crafted save could tamper with every object.
  const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
  const key = (line, name) => {
    const v = attr(line, name);
    return v === null || UNSAFE_KEYS.has(v) ? null : v;
  };

  const unescapeXml = (s) =>
    s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

  // mission texts also carry X4's own line breaks, written as [\012]
  const text = (s) => (s ? unescapeXml(s).replace(/\[\\012\]/g, "\n").trim() : "");

  function createScanner() {
    const stack = [];      // open components: { cls, macro, station, npc, module, storage, ship }
    const stations = [];   // player stations
    const ships = [];      // player ships: { id, macro, code, name }
    const trades = [];     // economy log: [time, ware, buyerID, sellerID, price Cr, amount]
    const eco = { inLog: false, start: Infinity, end: 0 };
    // missions: what is in progress, what is on offer, and the logbook of what was done
    const missions = { active: [], offers: [], log: [], stats: {} };
    const mis = { inBlock: false, mission: null, offer: null, briefing: false, thread: false };
    const blueprints = []; // ware IDs the player owns a blueprint for
    let inBlueprints = false;
    const market = {};     // ware -> { buy: [[price, amount, sector, owner]], sell: [...] }
    let current = null;    // nearest station entry (player or NPC) on the stack
    let sector = null;     // nearest sector macro on the stack
    let inShip = false;    // nearest ship sits between us and the station
    let block = null;      // "cargo" | "shortage" | "override" while inside one
    const saveInfo = {};

    function recompute() {
      current = null;
      sector = null;
      inShip = false;
      let shipSeen = false;
      for (let i = stack.length - 1; i >= 0; i--) {
        const e = stack[i];
        if (e.ship && !current) shipSeen = true;
        if (!current && (e.station || e.npc)) {
          current = e;
          inShip = shipSeen;
        }
        if (!sector && e.cls === "sector") sector = e.macro;
        if (current && sector) break;
      }
    }

    const top = () => stack[stack.length - 1];

    function addMarket(side, ware, price, amount, owner) {
      if (!market[ware]) market[ware] = { buy: [], sell: [] };
      market[ware][side].push([price, amount, sector, owner]);
    }

    function line(raw) {
      const s = raw.trim();
      if (!s) return;

      if (s.startsWith("<component ")) {
        const cls = attr(s, "class") || "";
        const macro = (attr(s, "macro") || "").toLowerCase();
        const selfClosing = s.endsWith("/>");
        const entry = { cls, macro, ship: cls.startsWith("ship_") };
        if (entry.ship && attr(s, "owner") === "player") {
          const name = attr(s, "name");
          entry.playerShip = { id: attr(s, "id"), macro, code: key(s, "code"), name: name ? unescapeXml(name) : null, order: null };
          ships.push(entry.playerShip);
        }

        if (cls === "station") {
          const owner = attr(s, "owner");
          if (owner === "player") {
            const name = attr(s, "name");
            entry.station = {
              name: name ? unescapeXml(name) : null,
              id: attr(s, "id"),
              code: key(s, "code"),
              macro,
              sector,
              underConstruction: attr(s, "state") === "construction",
              modules: [],      // { macro, efficiency, built, state, shortage }
              habitats: [],     // habitat macros
              storage: [],      // storage macros
              workforce: 0,
              workforceByRace: {}, // race -> workers
              buildProcessors: 0,  // ship building (wharf, shipyard, equipment dock)
              cargo: {},        // ware -> amount in stock
              offers: [],       // { side, ware, price, amount, desired } price in Cr
              overrides: {},    // ware -> { buy, sell } manual prices in Cr
            };
            stations.push(entry.station);
          } else {
            entry.npc = { owner };
          }
        } else if (current && current.station && !inShip) {
          const st = current.station;
          if (cls === "production") {
            entry.module = { macro, efficiency: null, built: attr(s, "state") !== "construction", state: null, shortage: null };
            st.modules.push(entry.module);
          } else if (cls === "buildprocessor") {
            st.buildProcessors++;
          } else if (cls === "habitation") {
            st.habitats.push(macro);
          } else if (cls === "storage") {
            entry.storage = true;
            st.storage.push(macro);
          }
        }

        if (!selfClosing) {
          stack.push(entry);
          recompute();
        }
        return;
      }

      if (s.startsWith("</component>")) {
        stack.pop();
        block = null;
        recompute();
        return;
      }

      // the economy log: every completed trade of the last game day or so
      // (stations also carry a self-closing <economylog .../> summary tag)
      if (s.startsWith("<economylog") && !s.endsWith("/>")) {
        eco.inLog = true;
        return;
      }
      if (eco.inLog) {
        if (s.startsWith("</economylog")) eco.inLog = false;
        else if (s.startsWith("<log ")) {
          const t = Number(attr(s, "time"));
          if (t < eco.start) eco.start = t;
          if (t > eco.end) eco.end = t;
          if (s.includes(' type="trade"') && s.includes(" buyer=") && s.includes(" seller=")) {
            const ware = key(s, "ware");
            if (ware) trades.push([t, ware, attr(s, "buyer"), attr(s, "seller"), Number(attr(s, "price")) / 100, Number(attr(s, "v")) || 0]);
          }
        }
        return;
      }

      // the player's missions: active ones, story threads and open offers
      if (s === "<missions>") {
        mis.inBlock = true;
        return;
      }
      if (mis.inBlock) {
        missionLine(s);
        return;
      }
      // the player's blueprints: one <blueprint ware="..."/> line each
      if (s === "<blueprints>") {
        inBlueprints = true;
        return;
      }
      if (inBlueprints) {
        if (s === "</blueprints>") inBlueprints = false;
        else if (s.startsWith("<blueprint ")) {
          const ware = key(s, "ware");
          if (ware) blueprints.push(ware);
        }
        return;
      }
      if (s.startsWith("<entry ") && s.includes(' category="missions"')) {
        missions.log.push({ time: Number(attr(s, "time")) || 0, title: text(attr(s, "title")), text: text(attr(s, "text")), faction: attr(s, "faction") });
        return;
      }
      if (s.startsWith('<stat id="missions_')) {
        missions.stats[attr(s, "id")] = Number(attr(s, "value")) || 0;
        return;
      }

      // a player ship's standing order says what it does (mining, trading...)
      if (s.startsWith("<order ") && s.includes('default="1"')) {
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].ship) {
            if (stack[i].playerShip && !stack[i].playerShip.order) stack[i].playerShip.order = attr(s, "order");
            break;
          }
        }
      }

      if (!current) {
        if (s.startsWith("<info ") || s.startsWith("<save ") || s.startsWith("<game ")) {
          for (const k of ["name", "date", "version", "build", "original", "time"]) {
            const v = attr(s, k);
            if (v && !saveInfo[k]) saveInfo[k] = s.startsWith("<save ") && k === "name" ? unescapeXml(v) : v;
          }
        }
        return;
      }

      // trade offers: a station's own buy and sell orders (price in hundredths)
      if (s.startsWith("<trade ") && !inShip) {
        const ware = key(s, "ware");
        const price = Number(attr(s, "price"));
        if (!ware || !Number.isFinite(price)) return;
        const side = s.includes(" buyer=") ? "buy" : s.includes(" seller=") ? "sell" : null;
        if (!side) return;
        const amount = Number(attr(s, "amount")) || 0;
        if (current.station) {
          current.station.offers.push({ side, ware, price: price / 100, amount, desired: Number(attr(s, "desired")) || 0 });
        } else {
          const flags = attr(s, "flags") || "";
          if (!flags.includes("virtual") && !flags.includes("shady") && !HOSTILE_OWNERS.has(current.npc.owner)) {
            addMarket(side, ware, price / 100, amount, current.npc.owner);
          }
        }
        return;
      }

      if (!current.station || inShip) return;
      const st = current.station;

      if (s === "<cargo>") {
        if (top() && top().storage) block = "cargo";
      } else if (s === "</cargo>" || s === "</shortage>" || s === "</override>") {
        block = null;
      } else if (s === "<shortage>") {
        if (top() && top().module) block = "shortage";
      } else if (s === "<override>") {
        block = "override";
      } else if (s.startsWith("<ware ")) {
        const ware = key(s, "ware");
        if (!ware) return; // missing or unsafe ware name
        if (block === "cargo") {
          const n = Number(attr(s, "amount")) || 0;
          if (n) st.cargo[ware] = (st.cargo[ware] || 0) + n;
        } else if (block === "shortage") {
          const m = top().module;
          m.shortage = m.shortage || {};
          m.shortage[ware] = Number(attr(s, "amount")) || 0;
        } else if (block === "override") {
          const buy = Number(attr(s, "buy"));
          const sell = Number(attr(s, "sell"));
          st.overrides[ware] = { buy: Number.isFinite(buy) ? buy : null, sell: Number.isFinite(sell) ? sell : null };
        }
      } else if (s.startsWith("<production ") && top() && top().module) {
        top().module.state = attr(s, "state");
      } else if (s.startsWith("<efficiency ")) {
        const t = top();
        if (t && t.module && t.module.efficiency === null) {
          const v = Number(attr(s, "product"));
          if (Number.isFinite(v)) t.module.efficiency = v;
        }
      } else if (s.startsWith("<workforce ")) {
        const n = Number(attr(s, "amount"));
        if (Number.isFinite(n)) {
          st.workforce += n;
          const race = key(s, "race") || "argon";
          st.workforceByRace[race] = (st.workforceByRace[race] || 0) + n;
        }
      }
    }

    function missionLine(s) {
      if (s === "</missions>") {
        mis.inBlock = false;
        return;
      }
      if (s.startsWith("<offer ")) {
        mis.offer = {
          id: attr(s, "id"), name: text(attr(s, "name")), description: text(attr(s, "description")),
          faction: attr(s, "faction"), type: attr(s, "type"), level: attr(s, "level"),
          reward: Number(attr(s, "reward")) || 0, rewardtext: text(attr(s, "rewardtext")), objectives: [], subs: [],
        };
        missions.offers.push(mis.offer);
        if (s.endsWith("/>")) mis.offer = null;
      } else if (s === "</offer>") {
        mis.offer = null;
      } else if (s.startsWith("<mission ")) {
        const id = attr(s, "id");
        if (mis.offer && !id) {
          // a guild offer lists the missions it is made of
          mis.offer.subs.push({ name: text(attr(s, "name")), type: attr(s, "type"), reward: Number(attr(s, "reward")) || 0, rewardtext: text(attr(s, "rewardtext")) });
        } else if (mis.thread && mis.mission) {
          if (id) mis.mission.thread.push(id);
        } else if (id && attr(s, "name") !== null) {
          mis.mission = {
            id, time: Number(attr(s, "time")) || 0, name: text(attr(s, "name")), description: text(attr(s, "description")),
            faction: attr(s, "faction"), type: attr(s, "type"), caption: text(attr(s, "caption")),
            reward: Number(attr(s, "reward")) || 0, rewardtext: text(attr(s, "rewardtext")),
            alert: attr(s, "alert"), associated: attr(s, "associated"),
            objectives: [], current: null, thread: [], parent: null,
          };
          missions.active.push(mis.mission);
          if (s.endsWith("/>")) mis.mission = null;
        }
      } else if (s === "</mission>") {
        mis.mission = null;
        mis.briefing = false;
      } else if (s === "<briefing>") {
        mis.briefing = true;
      } else if (s === "</briefing>") {
        mis.briefing = false;
      } else if (s === "<thread>") {
        mis.thread = true;
      } else if (s === "</thread>") {
        mis.thread = false;
      } else if (s.startsWith("<thread ") && mis.mission) {
        mis.mission.parent = attr(s, "id");
      } else if (s.startsWith("<objective ")) {
        const target = mis.mission || mis.offer;
        if (!target) return;
        const step = Number(attr(s, "step")) || 0;
        if (mis.briefing) {
          target.objectives.push({ step, type: attr(s, "type"), text: text(attr(s, "text")), name: text(attr(s, "name")), active: attr(s, "active") === "1" });
        } else if (mis.mission) {
          // the objective after the briefing is the one the player is on
          mis.mission.current = step;
        }
      }
    }

    return {
      line,
      result: () => ({
        stations, market, ships, trades, missions, blueprints, info: saveInfo,
        log: { start: Number.isFinite(eco.start) ? eco.start : null, end: eco.end || null },
      }),
    };
  }

  // Feed an async iterable of text chunks; returns { stations, market, ships, trades, log, info }.
  async function scanChunks(chunks, onProgress) {
    const scanner = createScanner();
    let rest = "";
    for await (const chunk of chunks) {
      const text = rest + chunk;
      let start = 0;
      let nl;
      while ((nl = text.indexOf("\n", start)) !== -1) {
        scanner.line(text.slice(start, nl));
        start = nl + 1;
      }
      rest = text.slice(start);
      if (onProgress) onProgress();
    }
    if (rest) scanner.line(rest);
    return scanner.result();
  }

  // Browser: read a File (gzipped or plain XML) as a stream of text chunks.
  async function readFile(file, onProgress) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("This browser cannot unpack save files. Use a current Chrome, Edge or Firefox.");
    }
    const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    const gzipped = head[0] === 0x1f && head[1] === 0x8b;

    let readBytes = 0;
    const counter = new TransformStream({
      transform(chunk, controller) {
        readBytes += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });

    let stream = file.stream().pipeThrough(counter);
    if (gzipped) stream = stream.pipeThrough(new DecompressionStream("gzip"));
    stream = stream.pipeThrough(new TextDecoderStream());

    const reader = stream.getReader();
    const chunks = {
      async *[Symbol.asyncIterator]() {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return;
          yield value;
        }
      },
    };
    return scanChunks(chunks, () => onProgress && onProgress(readBytes / file.size));
  }

  const api = { scanChunks, readFile, createScanner };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.X4Save = api;
})(typeof window !== "undefined" ? window : globalThis);
