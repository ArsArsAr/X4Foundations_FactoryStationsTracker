"use strict";
/* Loads the app's own scripts into a sandbox with a stub page, so the real
   functions can be tested in Node without a browser. Nothing is mocked
   except the DOM, storage and timers the scripts touch while loading. */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

class FakeElement {
  constructor() {
    this.style = {};
    this.dataset = {};
    this.innerHTML = "";
    this.textContent = "";
    this.hidden = false;
    this.value = "";
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  }
  addEventListener() {}
  setAttribute() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  appendChild() {}
  append() {}
  focus() {}
  getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
}

function loadApp() {
  const store = new Map();
  const ctx = {
    console,
    setTimeout: () => 0,
    clearTimeout: () => {},
    performance: { now: () => 0 },
    navigator: {},
    matchMedia: () => ({ matches: false }),
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    document: {
      getElementById: () => new FakeElement(),
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => new FakeElement(),
      addEventListener() {},
      body: new FakeElement(),
      activeElement: null,
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const file of ["data/wares.js", "savegame.js", "badges.js", "app.js", "empire.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), ctx, { filename: file });
  }
  // top-level const/let live in the sandbox's script scope: reach them by name
  const get = (expr) => vm.runInContext(expr, ctx);
  return { ctx, get };
}

module.exports = { loadApp, ROOT };
