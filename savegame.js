"use strict";

/* ---------------------------------------------------------------------
   Reads player-owned stations out of an X4: Foundations save file.

   Saves are gzipped XML, often 500 MB to 1 GB once unpacked, so they are
   never loaded whole. The file is decompressed as a stream and scanned
   line by line: X4 writes one XML element per line, which makes a small
   state machine over component open/close tags enough.

   Works in the browser (File from an <input>) and in Node (for tests).
--------------------------------------------------------------------- */

(function (root) {
  const MODULE_CLASSES = new Set(["production", "habitation"]);

  const attr = (line, name) => {
    const m = line.match(new RegExp(`\\s${name}="([^"]*)"`));
    return m ? m[1] : null;
  };

  const unescapeXml = (s) =>
    s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

  function createScanner() {
    const stack = [];     // open components: { cls, macro, station, module, ship }
    const stations = [];
    let current = null;   // nearest player station on the stack
    let sector = null;    // nearest sector macro on the stack
    let saveInfo = {};

    function recompute() {
      current = null;
      sector = null;
      for (let i = stack.length - 1; i >= 0; i--) {
        const e = stack[i];
        if (!current && e.station) current = e;
        if (!sector && e.cls === "sector") sector = e.macro;
        if (current && sector) break;
      }
    }

    // inside a ship (e.g. a docked miner), not the station itself
    function insideShip() {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].station) return false;
        if (stack[i].ship) return true;
      }
      return false;
    }

    function line(raw) {
      const s = raw.trim();
      if (!s) return;

      if (s.startsWith("<component ")) {
        const cls = attr(s, "class") || "";
        const macro = (attr(s, "macro") || "").toLowerCase();
        const selfClosing = s.endsWith("/>");
        const entry = { cls, macro, ship: cls.startsWith("ship_") };

        if (cls === "station" && attr(s, "owner") === "player") {
          const name = attr(s, "name");
          entry.station = {
            name: name ? unescapeXml(name) : null,
            code: attr(s, "code"),
            macro,
            sector: null,
            underConstruction: attr(s, "state") === "construction",
            modules: [],          // { macro, efficiency, built }
            habitats: 0,
            workforce: 0,
          };
          stations.push(entry.station);
        } else if (current && MODULE_CLASSES.has(cls) && !insideShip()) {
          const station = current.station;
          if (cls === "production") {
            entry.module = { macro, efficiency: null, built: attr(s, "state") !== "construction" };
            station.modules.push(entry.module);
          } else {
            station.habitats++;
          }
        }

        if (!selfClosing) {
          stack.push(entry);
          if (entry.station) entry.station.sector = sector;
          recompute();
        } else if (entry.station) {
          entry.station.sector = sector;
        }
        return;
      }

      if (s.startsWith("</component>")) {
        stack.pop();
        recompute();
        return;
      }

      if (!current) {
        if (s.startsWith("<info ") || s.startsWith("<save ") || s.startsWith("<game ")) {
          for (const k of ["name", "date", "version", "build", "original"]) {
            const v = attr(s, k);
            if (v && !saveInfo[k]) saveInfo[k] = s.startsWith("<save ") && k === "name" ? unescapeXml(v) : v;
          }
        }
        return;
      }

      if (s.startsWith("<efficiency ")) {
        const top = stack[stack.length - 1];
        if (top && top.module && top.module.efficiency === null) {
          const v = Number(attr(s, "product"));
          if (Number.isFinite(v)) top.module.efficiency = v;
        }
      } else if (s.startsWith("<workforce ") && !insideShip()) {
        const n = Number(attr(s, "amount"));
        if (Number.isFinite(n)) current.station.workforce += n;
      }
    }

    return { line, result: () => ({ stations, info: saveInfo }) };
  }

  // Feed an async iterable of text chunks; returns { stations, info }.
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
