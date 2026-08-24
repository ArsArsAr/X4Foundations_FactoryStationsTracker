"use strict";

/* ---------------------------------------------------------------------
   X4 Factories Planner
   Data model (data/wares.json): { [wareID]: {
     id, label, category, price:{min,avg,max}, volume,
     cycleTime (sec/cycle), batchSize (units produced/cycle), tier,
     inputs: [ {wareID, amount} ]   // amount consumed per production cycle
   }}
--------------------------------------------------------------------- */

const state = {
  wares: null,          // loaded data, keyed by id
  selected: null,        // currently selected root wareID
  targetRate: 100,        // units/hour desired output of the selected ware
  moduleCounts: new Map(), // wareID -> number of production modules the player has built (persisted to localStorage)
};

const STORAGE_KEY = "x4-factories-planner:module-counts";

function getCount(id) {
  return state.moduleCounts.get(id) || 0;
}

function isBuilt(id) {
  return getCount(id) > 0;
}

// localStorage can throw (private browsing, disabled storage, some file://
// security modes) — persistence degrades gracefully to session-only rather
// than crashing the app if that happens.
function loadModuleCounts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    for (const [id, count] of Object.entries(obj)) {
      if (state.wares[id] && Number(count) > 0) state.moduleCounts.set(id, Math.floor(Number(count)));
    }
  } catch (e) {
    console.warn("Could not load saved module counts:", e);
  }
}

function saveModuleCounts() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(state.moduleCounts)));
  } catch (e) {
    console.warn("Could not save module counts:", e);
  }
}

function clearAllData() {
  state.moduleCounts.clear();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn("Could not clear saved module counts:", e);
  }
  document.querySelectorAll(".module-count").forEach((inp) => {
    if (!inp.disabled) inp.value = "";
  });
  document.querySelectorAll(".built-toggle").forEach((cb) => {
    if (!cb.disabled) cb.checked = false;
  });
  renderFactoriesDrawer();
  if (state.selected) renderChain(state.selected);
}

const TIER_LABELS = { 0: "Raw Materials", 1: "Tier 1", 2: "Tier 2", 3: "Tier 3", 4: "Tier 4+" };

// Authored SVG icons (one consistent stroke weight) — no unicode glyphs standing in for icons.
const ICONS = {
  chevron: `<svg viewBox="0 0 10 10" width="10" height="10" fill="none"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  close: `<svg viewBox="0 0 12 12" width="12" height="12" fill="none"><path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  check: `<svg viewBox="0 0 9 9" width="9" height="9" fill="none"><path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

// Makes a mouse-clickable element keyboard-operable: focusable, announced as
// a button, and Enter/Space triggers the same click handler.
function makeFocusable(el) {
  el.tabIndex = 0;
  el.setAttribute("role", "button");
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      el.click();
    }
  });
  return el;
}

function tierDot(tier) {
  return `<span class="tier-dot" style="background:var(--tier${Math.min(tier, 3)})"></span>`;
}

const els = {
  wareList: document.getElementById("ware-list"),
  search: document.getElementById("search"),
  chainScroll: document.getElementById("chain-scroll"),
  chainColumns: document.getElementById("chain-columns"),
  chainLines: document.getElementById("chain-lines"),
  emptyState: document.getElementById("empty-state"),
  details: document.getElementById("details"),
  detailsContent: document.getElementById("details-content"),
  detailsClose: document.getElementById("details-close"),
  targetRate: document.getElementById("target-rate"),
  target1module: document.getElementById("target-1module"),
  factoriesDrawer: document.getElementById("factories-drawer"),
  factoriesToggle: document.getElementById("factories-toggle"),
  builtCount: document.getElementById("built-count"),
  builtList: document.getElementById("built-list"),
  clearData: document.getElementById("clear-data"),
  bottleneckList: document.getElementById("bottleneck-list"),
  suggestList: document.getElementById("suggest-list"),
};

init();

function init() {
  state.wares = WARES_DATA;
  loadModuleCounts();

  buildSidebar();

  els.search.addEventListener("input", () => filterSidebar(els.search.value));
  els.detailsClose.addEventListener("click", () => els.details.classList.add("hidden"));
  els.targetRate.addEventListener("change", () => {
    state.targetRate = Math.max(1, Number(els.targetRate.value) || 1);
    if (state.selected) renderChain(state.selected);
  });
  els.target1module.addEventListener("click", () => {
    if (!state.selected) return;
    const w = state.wares[state.selected];
    const perModule = (w.batchSize * 3600) / w.cycleTime;
    els.targetRate.value = Math.round(perModule);
    state.targetRate = Math.round(perModule);
    renderChain(state.selected);
  });

  window.addEventListener("resize", () => {
    if (state.selected) drawConnectors();
  });

  els.factoriesToggle.addEventListener("click", () => {
    els.factoriesDrawer.classList.toggle("collapsed");
  });

  els.clearData.addEventListener("click", () => {
    if (!state.moduleCounts.size) return;
    if (confirm(`Clear all ${state.moduleCounts.size} saved module count(s)? This can't be undone.`)) {
      clearAllData();
    }
  });

  renderFactoriesDrawer();
}

/* ---------------------------------------------------------------------
   Sidebar
--------------------------------------------------------------------- */

function buildSidebar() {
  const byTier = {};
  for (const w of Object.values(state.wares)) {
    (byTier[w.tier] ??= []).push(w);
  }

  els.wareList.innerHTML = "";
  Object.keys(byTier)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((tier) => {
      const items = byTier[tier].sort((a, b) => a.label.localeCompare(b.label));

      const cat = document.createElement("div");
      cat.className = "category";
      cat.dataset.tier = tier;

      const head = document.createElement("div");
      head.className = "category-head";
      head.innerHTML = `<span class="dot" style="background:var(--tier${Math.min(tier, 3)})"></span>
        <span>${TIER_LABELS[tier] ?? "Tier " + tier}</span>
        <span class="chevron">${ICONS.chevron}</span>`;
      head.addEventListener("click", () => cat.classList.toggle("collapsed"));
      makeFocusable(head);

      const list = document.createElement("div");
      list.className = "category-items";

      for (const w of items) {
        const item = document.createElement("div");
        item.className = "ware-item";
        item.dataset.id = w.id;

        const toggle = document.createElement("input");
        toggle.type = "checkbox";
        toggle.className = "built-toggle";

        const count = document.createElement("input");
        count.type = "number";
        count.className = "module-count";
        count.min = "0";
        count.step = "1";

        toggle.checked = isBuilt(w.id);
        toggle.addEventListener("click", (e) => e.stopPropagation());

        if (w.tier === 0) {
          // raw materials are mined, not built as a counted module — the
          // checkbox just confirms "I have a source for this" so it stops
          // showing up as an untracked bottleneck; there's no quantity to enter.
          toggle.title = "I mine/source this — hide it from bottlenecks";
          toggle.addEventListener("change", () => setModuleCount(w.id, toggle.checked ? 1 : 0));

          count.disabled = true;
          count.placeholder = "–";
          count.title = "Mined, not built as a module — no quantity tracked";
        } else {
          toggle.title = "I produce this ware";
          // checking with no quantity entered defaults to 1 module; unchecking clears it
          toggle.addEventListener("change", () => setModuleCount(w.id, toggle.checked ? getCount(w.id) || 1 : 0));

          count.value = getCount(w.id) || "";
          count.placeholder = "qty";
          count.title = "Exact number of modules (optional — defaults to 1 once checked)";
          count.addEventListener("click", (e) => e.stopPropagation());
          count.addEventListener("change", () => setModuleCount(w.id, count.value));
        }

        const name = document.createElement("span");
        name.className = "ware-item-label";
        name.textContent = w.label;
        name.addEventListener("click", () => selectWare(w.id));
        makeFocusable(name);

        const price = document.createElement("span");
        price.className = "ware-item-price";
        price.textContent = formatPrice(w.price.avg);

        item.appendChild(toggle);
        item.appendChild(count);
        item.appendChild(name);
        item.appendChild(price);
        list.appendChild(item);
      }

      cat.appendChild(head);
      cat.appendChild(list);
      els.wareList.appendChild(cat);
    });
}

function filterSidebar(query) {
  const q = query.trim().toLowerCase();
  document.querySelectorAll(".ware-item").forEach((el) => {
    const match = !q || el.textContent.toLowerCase().includes(q);
    el.style.display = match ? "" : "none";
  });
  document.querySelectorAll(".category").forEach((cat) => {
    const anyVisible = [...cat.querySelectorAll(".ware-item")].some((el) => el.style.display !== "none");
    cat.style.display = anyVisible ? "" : "none";
    if (q) cat.classList.remove("collapsed");
  });
}

function selectWare(id) {
  state.selected = id;
  document.querySelectorAll(".ware-item").forEach((el) => el.classList.toggle("active", el.dataset.id === id));

  const w = state.wares[id];
  if (w.batchSize && w.cycleTime) {
    const perModule = (w.batchSize * 3600) / w.cycleTime;
    state.targetRate = Math.round(perModule);
    els.targetRate.value = state.targetRate;
    els.targetRate.disabled = false;
    els.target1module.disabled = false;
  } else {
    // raw material root: nothing is "produced" per module, so target rate
    // is just a plain demand figure — leave whatever the user last set.
    els.targetRate.value = state.targetRate;
    els.targetRate.disabled = false;
    els.target1module.disabled = true;
  }

  renderChain(id);
  showDetails(id);
}

/* ---------------------------------------------------------------------
   Chain rate computation

   Given a target output rate (units/hour) for the root ware, walk the
   dependency graph and compute, for every ware involved, the combined
   production rate required to satisfy every consumer *within the chain*,
   plus how many production modules that implies.
--------------------------------------------------------------------- */

function computeChain(rootID, targetRate) {
  const wares = state.wares;

  // collect full set of wares involved (root + all transitive inputs)
  const involved = new Set();
  (function collect(id) {
    if (involved.has(id)) return;
    involved.add(id);
    for (const inp of wares[id].inputs) collect(inp.wareID);
  })(rootID);

  // process from highest tier -> lowest, accumulating demand rate
  const byTierDesc = [...involved].sort((a, b) => wares[b].tier - wares[a].tier);
  const rate = new Map();
  rate.set(rootID, targetRate);

  for (const id of byTierDesc) {
    const w = wares[id];
    const r = rate.get(id);
    if (!r) continue;
    if (!w.batchSize || !w.cycleTime) continue; // raw material, nothing to expand
    const cyclesPerHour = r / w.batchSize;
    for (const inp of w.inputs) {
      rate.set(inp.wareID, (rate.get(inp.wareID) || 0) + cyclesPerHour * inp.amount);
    }
  }

  const nodes = {};
  for (const id of involved) {
    const w = wares[id];
    const r = rate.get(id) || 0;
    const perModule = w.batchSize && w.cycleTime ? (w.batchSize * 3600) / w.cycleTime : 0;
    nodes[id] = {
      id,
      rate: r,
      modules: perModule ? Math.ceil(r / perModule) : null,
      perModule,
    };
  }
  return nodes;
}

/* ---------------------------------------------------------------------
   My Factories: session-only "already built" list + next-build suggestions

   Suggestion metric: for every ware not yet marked built, walk its full
   transitive input chain (down to raw materials) and count how many of
   those wares are *not* in the built set. Lower = fewer new resource
   chains you'd have to stand up to add that ware. Raw materials count
   as missing too if you don't already have that raw's chain covered.
--------------------------------------------------------------------- */

function allTransitiveInputs(id) {
  const wares = state.wares;
  const set = new Set();
  (function walk(cur) {
    for (const inp of wares[cur].inputs) {
      if (!set.has(inp.wareID)) {
        set.add(inp.wareID);
        walk(inp.wareID);
      }
    }
  })(id);
  return set;
}

function setModuleCount(id, rawValue) {
  const count = Math.max(0, Math.floor(Number(rawValue) || 0));
  if (count > 0) state.moduleCounts.set(id, count);
  else state.moduleCounts.delete(id);

  const item = document.querySelector(`.ware-item[data-id="${id}"]`);
  if (item) {
    const numInput = item.querySelector(".module-count");
    const toggle = item.querySelector(".built-toggle");
    if (numInput) numInput.value = count || "";
    if (toggle) toggle.checked = count > 0;
  }

  saveModuleCounts();
  renderFactoriesDrawer();

  // node badges / suggestion ranking / bottlenecks all depend on module counts
  if (state.selected) renderChain(state.selected);
}

function renderFactoriesDrawer() {
  els.builtCount.textContent = `(${state.moduleCounts.size})`;
  renderBuiltList();
  renderBottlenecks();
  renderSuggestions();
}

function renderBuiltList() {
  const wares = state.wares;
  const ids = [...state.moduleCounts.keys()].sort((a, b) => wares[a].label.localeCompare(wares[b].label));

  if (!ids.length) {
    els.builtList.innerHTML = `<div class="drawer-empty">Enter module counts in the left list to add them here.</div>`;
    return;
  }

  els.builtList.innerHTML = ids.map((id) => `
    <div class="chip" data-id="${id}">
      <span>${wares[id].label} <span class="chip-count">&times;${getCount(id)}</span></span>
      <button title="Remove" aria-label="Remove ${wares[id].label} from built list">${ICONS.close}</button>
    </div>
  `).join("");

  els.builtList.querySelectorAll(".chip button").forEach((btn) => {
    btn.addEventListener("click", () => setModuleCount(btn.closest(".chip").dataset.id, 0));
  });
  els.builtList.querySelectorAll(".chip span").forEach((span) => {
    span.addEventListener("click", () => selectWare(span.closest(".chip").dataset.id));
    makeFocusable(span);
  });
}

/* ---------------------------------------------------------------------
   Bottlenecks: given the modules the player has actually built, find
   every ware where the built consumers demand more than the built
   producers supply — starved production lines and modules missing
   outright (supply = 0). Raw materials are mining, not a counted
   module in this data model, so they're excluded from supply/demand
   accounting the same way the chain view treats them.
--------------------------------------------------------------------- */

function computeBottlenecks() {
  const wares = state.wares;
  const supply = new Map();
  const demand = new Map();

  for (const [id, count] of state.moduleCounts) {
    const w = wares[id];
    if (!w.batchSize || !w.cycleTime) continue;
    const cyclesPerHour = (3600 / w.cycleTime) * count;
    supply.set(id, (supply.get(id) || 0) + cyclesPerHour * w.batchSize);
    for (const inp of w.inputs) {
      demand.set(inp.wareID, (demand.get(inp.wareID) || 0) + cyclesPerHour * inp.amount);
    }
  }

  const results = [];
  for (const [id, dem] of demand) {
    const w = wares[id];
    const sup = supply.get(id) || 0;
    if (dem <= sup) continue;
    // raw materials have no trackable production rate — checking their box
    // is the player's own word that they have a source, so trust it instead
    // of always flagging them as a deficit.
    if ((!w.batchSize || !w.cycleTime) && isBuilt(id)) continue;
    const perModule = w.batchSize && w.cycleTime ? (w.batchSize * 3600) / w.cycleTime : null;
    results.push({
      id,
      demand: dem,
      supply: sup,
      deficit: dem - sup,
      isRaw: !perModule,
      modulesNeeded: perModule ? Math.ceil((dem - sup) / perModule) : null,
    });
  }

  return results.sort((a, b) => {
    if (a.supply === 0 !== (b.supply === 0)) return a.supply === 0 ? -1 : 1;
    return b.deficit - a.deficit;
  });
}

function renderBottlenecks() {
  const wares = state.wares;
  const results = computeBottlenecks();

  if (!state.moduleCounts.size) {
    els.bottleneckList.innerHTML = `<div class="drawer-empty">Enter module counts on the left to see what's starved.</div>`;
    return;
  }
  if (!results.length) {
    els.bottleneckList.innerHTML = `<div class="drawer-empty">Balanced &mdash; every built module gets enough input.</div>`;
    return;
  }

  els.bottleneckList.innerHTML = results.slice(0, 10).map((r, i) => {
    const w = wares[r.id];
    const missing = r.supply === 0;
    const detail = r.isRaw
      ? `Need ${formatRate(r.demand)}/hr &mdash; mining not tracked here`
      : missing
        ? `Need ${formatRate(r.demand)}/hr, producing none`
        : `Producing ${formatRate(r.supply)}/hr, need ${formatRate(r.demand)}/hr`;
    const badge = r.modulesNeeded ? `+${r.modulesNeeded} module${r.modulesNeeded === 1 ? "" : "s"}` : "untracked";
    return `
      <div class="suggest-item bottleneck-item" data-id="${r.id}">
        <div class="suggest-rank">${i + 1}</div>
        <div class="suggest-main">
          <div class="suggest-name">${w.label}</div>
          <div class="suggest-missing-list">${detail}</div>
        </div>
        <div class="suggest-badge ${missing ? "missing" : ""}">${badge}</div>
      </div>
    `;
  }).join("");

  els.bottleneckList.querySelectorAll(".bottleneck-item").forEach((row) => {
    row.addEventListener("click", () => selectWare(row.dataset.id));
    makeFocusable(row);
  });
}

function computeSuggestions() {
  const wares = state.wares;
  const candidates = Object.values(wares).filter((w) => w.tier > 0 && !isBuilt(w.id));

  return candidates
    .map((w) => {
      const allInputs = allTransitiveInputs(w.id);
      const missing = [...allInputs].filter((id) => !isBuilt(id));
      return { id: w.id, missing };
    })
    .sort((a, b) => {
      if (a.missing.length !== b.missing.length) return a.missing.length - b.missing.length;
      return wares[a.id].label.localeCompare(wares[b.id].label);
    });
}

function renderSuggestions() {
  const ranked = computeSuggestions().slice(0, 8);
  const wares = state.wares;

  if (!ranked.length) {
    els.suggestList.innerHTML = `<div class="drawer-empty">Nothing left to suggest &mdash; every ware is marked built.</div>`;
    return;
  }

  els.suggestList.innerHTML = ranked.map((r, i) => {
    const w = wares[r.id];
    const ready = r.missing.length === 0;
    const missingNames = r.missing.map((id) => wares[id].label).join(", ");
    return `
      <div class="suggest-item" data-id="${r.id}">
        <div class="suggest-rank">${i + 1}</div>
        <div class="suggest-main">
          <div class="suggest-name">${w.label} <span style="color:var(--text-dim); font-weight:400;">&middot; avg ${formatPrice(w.price.avg)}</span></div>
          <div class="suggest-missing-list">${ready ? "You already produce everything this needs" : "Needs: " + missingNames}</div>
        </div>
        <div class="suggest-badge ${ready ? "ready" : ""}">${ready ? "ready now" : r.missing.length + " missing"}</div>
      </div>
    `;
  }).join("");

  els.suggestList.querySelectorAll(".suggest-item").forEach((row) => {
    row.addEventListener("click", () => selectWare(row.dataset.id));
    makeFocusable(row);
  });
}

/* ---------------------------------------------------------------------
   Rendering
--------------------------------------------------------------------- */

function renderChain(rootID) {
  const wares = state.wares;
  const nodes = computeChain(rootID, state.targetRate);
  const involved = Object.keys(nodes);

  els.emptyState.classList.add("hidden");
  els.chainScroll.classList.add("visible");
  els.chainColumns.innerHTML = "";

  const byTier = {};
  for (const id of involved) (byTier[wares[id].tier] ??= []).push(id);

  const tiers = Object.keys(byTier).map(Number).sort((a, b) => a - b);

  for (const tier of tiers) {
    const col = document.createElement("div");
    col.className = "chain-col";

    const label = document.createElement("div");
    label.className = "chain-col-label";
    label.textContent = TIER_LABELS[tier] ?? "Tier " + tier;
    col.appendChild(label);

    const ids = byTier[tier].sort((a, b) => wares[b].id === rootID ? 1 : wares[a].label.localeCompare(wares[b].label));

    for (const id of ids) {
      col.appendChild(buildNodeEl(id, nodes[id], id === rootID));
    }
    els.chainColumns.appendChild(col);
  }

  // setTimeout (not rAF) so this still fires promptly even if the tab is
  // backgrounded/not currently compositing frames.
  setTimeout(drawConnectors, 0);
}

function buildNodeEl(id, nodeData, isRoot) {
  const w = state.wares[id];
  const el = document.createElement("div");
  el.className = "node" + (isRoot ? " root" : "");
  el.dataset.id = id;
  el.dataset.tier = w.tier;

  const rateTxt = formatRate(nodeData.rate);
  const stats = [`<span><b>${rateTxt}</b> /hr needed</span>`];
  if (w.cycleTime) {
    stats.push(`<span>${w.batchSize} units / ${formatTime(w.cycleTime)} cycle</span>`);
  } else {
    stats.push(`<span>Mined / harvested</span>`);
  }
  stats.push(`<span>avg <b>${formatPrice(w.price.avg)}</b>/unit</span>`);
  stats.push(`<span>${w.storageType} storage</span>`);

  const wareIsBuilt = isBuilt(id);

  el.innerHTML = `
    ${wareIsBuilt ? `<div class="node-built-badge" title="Already built">${ICONS.check}</div>` : ""}
    <div class="node-name">${tierDot(w.tier)}<span>${w.label}</span></div>
    <div class="node-stats">${stats.map((s) => `<div>${s}</div>`).join("")}</div>
    ${nodeData.modules != null ? `<div class="node-modules">${nodeData.modules} module${nodeData.modules === 1 ? "" : "s"}</div>` : ""}
  `;

  el.addEventListener("click", () => showDetails(id));
  makeFocusable(el);
  return el;
}

function drawConnectors() {
  const svg = els.chainLines;
  svg.innerHTML = "";
  if (!state.selected) return;

  // svg is a child of #chain-scroll, so it scrolls together with the node
  // cards inside #chain-view — plain viewport-relative rects stay in sync
  // regardless of scroll position, no manual offset math needed.
  const originRect = els.chainScroll.getBoundingClientRect();

  svg.setAttribute("width", els.chainColumns.scrollWidth + 80);
  svg.setAttribute("height", els.chainColumns.scrollHeight + 80);

  const wares = state.wares;
  const nodeEls = {};
  document.querySelectorAll(".node").forEach((el) => (nodeEls[el.dataset.id] = el));

  for (const id in nodeEls) {
    const w = wares[id];
    for (const inp of w.inputs) {
      const from = nodeEls[inp.wareID];
      const to = nodeEls[id];
      if (!from || !to) continue;

      const fromRect = from.getBoundingClientRect();
      const toRect = to.getBoundingClientRect();

      const x1 = fromRect.right - originRect.left;
      const y1 = fromRect.top - originRect.top + fromRect.height / 2;
      const x2 = toRect.left - originRect.left;
      const y2 = toRect.top - originRect.top + toRect.height / 2;

      const midX = (x1 + x2) / 2;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`);
      svg.appendChild(path);
    }
  }
}

/* ---------------------------------------------------------------------
   Details panel
--------------------------------------------------------------------- */

function showDetails(id) {
  const w = state.wares[id];
  els.details.classList.remove("hidden");

  const usedBy = Object.values(state.wares).filter((o) => o.inputs.some((i) => i.wareID === id));

  els.detailsContent.innerHTML = `
    <h2>${w.label}</h2>
    <div class="tag">${w.category} &middot; Tier ${w.tier}</div>

    <table class="detail-table">
      <tr><td>Price (min/avg/max)</td><td>${w.price.min} / ${w.price.avg} / ${w.price.max}</td></tr>
      <tr><td>Volume</td><td>${w.volume}</td></tr>
      <tr><td>Storage type</td><td>${w.storageType}</td></tr>
      ${w.cycleTime ? `<tr><td>Cycle time</td><td>${formatTime(w.cycleTime)}</td></tr>` : ""}
      ${w.batchSize ? `<tr><td>Batch size</td><td>${w.batchSize} units</td></tr>` : ""}
      ${w.cycleTime ? `<tr><td>Rate / module</td><td>${formatRate((w.batchSize * 3600) / w.cycleTime)} /hr</td></tr>` : ""}
    </table>

    ${w.inputs.length ? `
      <div class="detail-section-title">Requires per cycle</div>
      ${w.inputs.map((i) => {
        const iw = state.wares[i.wareID];
        return `<div class="input-row" data-id="${i.wareID}">
          <span class="input-row-name">${iw.label}</span>
          <span class="input-row-amt">${i.amount}</span>
        </div>`;
      }).join("")}
    ` : `<div class="detail-section-title">Raw material &mdash; mined or harvested</div>`}

    ${usedBy.length ? `
      <div class="detail-section-title" style="margin-top:16px;">Used to make</div>
      ${usedBy.map((o) => `<div class="input-row" data-id="${o.id}">
          <span class="input-row-name">${o.label}</span>
          <span class="input-row-amt"></span>
        </div>`).join("")}
    ` : ""}
  `;

  els.detailsContent.querySelectorAll(".input-row").forEach((row) => {
    row.addEventListener("click", () => selectWare(row.dataset.id));
    makeFocusable(row);
  });
}

/* ---------------------------------------------------------------------
   Formatting helpers
--------------------------------------------------------------------- */

function formatRate(n) {
  if (n >= 1000) return Math.round(n).toLocaleString();
  if (n >= 100) return n.toFixed(0);
  return n.toFixed(1);
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m && s) return `${m}m ${s}s`;
  if (m) return `${m}m`;
  return `${s}s`;
}

function formatPrice(n) {
  return n.toLocaleString() + " Cr";
}
