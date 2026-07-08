"use strict";

// Color palette keyed by asset_type; falls back to a neutral grey.
const TYPE_COLORS = {
  Prefab: "#4c9be8", Scene: "#e8734c", Material: "#e8c14c", Texture: "#57c785",
  Sprite: "#57c785", Script: "#9a7be8", Shader: "#e85c9a", AnimationClip: "#4ce8d0",
  AnimatorController: "#4ce8d0", ScriptableObject: "#c0b04c", Model: "#c77b57",
  AudioClip: "#7be8b0", Font: "#b0b0b0", Folder: "#5a6472", Other: "#7a828f",
};

const cy = cytoscape({
  container: document.getElementById("cy"),
  wheelSensitivity: 0.25,
  style: [
    {
      selector: "node",
      style: {
        "background-color": (n) => TYPE_COLORS[n.data("type")] || "#7a828f",
        label: (n) => (n.hasClass("lbl") ? n.data("label") : ""),
        color: "#cfd6e2", "font-size": 9,
        "text-valign": "bottom", "text-margin-y": 3, "text-max-width": 140,
        "text-wrap": "ellipsis", "text-background-color": "#14161a",
        "text-background-opacity": 0.7, "text-background-padding": 2,
        width: 18, height: 18,
        "border-width": (n) => (n.data("origin") === "builtin" ? 2 : n.data("origin") === "package" ? 2 : 0),
        "border-color": (n) => (n.data("origin") === "builtin" ? "#e8c14c" : "#8a93a5"),
        "border-style": (n) => (n.data("origin") === "package" ? "dashed" : "solid"),
      },
    },
    { selector: "node.root", style: { width: 30, height: 30, "border-width": 3, "border-color": "#fff", "font-size": 11 } },
    { selector: "node.selected", style: { "border-width": 3, "border-color": "#4c9be8" } },
    {
      selector: "edge",
      style: {
        width: 1, "line-color": "#3a404c", "target-arrow-color": "#3a404c",
        "target-arrow-shape": "triangle", "curve-style": "bezier", "arrow-scale": 0.8,
      },
    },
  ],
});

const $ = (id) => document.getElementById(id);
const statsEl = $("stats");

async function api(path, params) {
  const clean = {};
  for (const [k, v] of Object.entries(params || {})) if (v != null && v !== "") clean[k] = String(v);
  // Static (WASM) flavor sets window.__PROVIDER to run queries in-browser.
  if (window.__PROVIDER) return window.__PROVIDER(path, clean);
  const url = new URL(path, location.origin);
  for (const [k, v] of Object.entries(clean)) url.searchParams.set(k, v);
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw Object.assign(new Error(body.error || res.statusText), { body });
  return body;
}

function merge(elements) {
  const add = [];
  for (const n of elements.nodes) if (cy.getElementById(n.data.id).empty()) add.push({ group: "nodes", data: n.data });
  for (const e of elements.edges) if (cy.getElementById(e.data.id).empty()) add.push({ group: "edges", data: e.data });
  cy.add(add);
  return add.length;
}

const LABEL_LIMIT = 25; // above this, only show labels on root/hover/selection

function applyLabelPolicy() {
  const showAll = cy.nodes().length <= LABEL_LIMIT;
  cy.nodes().forEach((n) => {
    if (showAll || n.hasClass("root") || n.hasClass("selected")) n.addClass("lbl");
    else n.removeClass("lbl");
  });
}

function relayout() {
  const maxDist = cy.nodes().max((n) => n.data("distance") || 0).value || 1;
  cy.layout({
    name: "concentric",
    concentric: (n) => maxDist - (n.data("distance") || 0), // root (dist 0) at center
    levelWidth: () => 1,
    minNodeSpacing: 18,
    animate: false,
    padding: 30,
  }).run();
  applyLabelPolicy();
}

async function show(ref) {
  const dir = $("dir").value;
  const depth = $("depth").value || "1";
  statsEl.textContent = "loading…";
  try {
    const data = await api("/api/neighborhood", { ref, dir, depth });
    cy.elements().remove();
    merge(data);
    cy.getElementById(data.rootId).addClass("root");
    relayout();
    cy.fit(undefined, 40);
    statsEl.textContent = `${data.nodes.length} nodes · ${data.edges.length} edges · ${dir === "refs" ? "references" : "dependencies"} depth ${depth}`;
  } catch (err) {
    const cands = err.body && err.body.candidates;
    statsEl.innerHTML = `<span class="err">${err.message}${cands && cands.length ? ` — ${cands.length} matches, try a path` : ""}</span>`;
  }
}

async function expand(node) {
  try {
    const data = await api("/api/neighborhood", { ref: node.id(), dir: $("dir").value, depth: "1" });
    const added = merge(data);
    if (added) { relayout(); }
    statsEl.textContent = `${cy.nodes().length} nodes · ${cy.edges().length} edges (expanded ${node.data("label")})`;
  } catch (err) { statsEl.innerHTML = `<span class="err">${err.message}</span>`; }
}

function showPanel(node) {
  $("panel").classList.remove("hidden");
  const d = node.data();
  $("panel-body").innerHTML = `
    <h2>${d.label}</h2>
    <div class="row"><span class="k">type</span><b>${d.type}</b></div>
    <div class="row"><span class="k">origin</span><b>${d.origin}</b></div>
    <div class="row"><span class="k">distance</span><b>${d.distance}</b></div>
    <div class="row"><span class="k">path</span>${d.path}</div>
    <div class="row"><span class="k">guid</span>${d.id}</div>
    <div class="row" style="margin-top:8px"><button id="expand-btn">expand neighbors</button></div>`;
  $("expand-btn").onclick = () => expand(node);
}

cy.on("tap", "node", (e) => {
  cy.nodes().removeClass("selected");
  e.target.addClass("selected").addClass("lbl");
  showPanel(e.target);
});
cy.on("dbltap", "node", (e) => expand(e.target));
cy.on("mouseover", "node", (e) => e.target.addClass("lbl"));
cy.on("mouseout", "node", (e) => {
  if (cy.nodes().length > LABEL_LIMIT && !e.target.hasClass("root") && !e.target.hasClass("selected")) {
    e.target.removeClass("lbl");
  }
});
$("panel-close").onclick = () => $("panel").classList.add("hidden");

$("search").addEventListener("submit", (e) => {
  e.preventDefault();
  const ref = $("ref").value.trim();
  if (ref) show(ref);
});

// Load overview, then auto-render either the ?ref= URL param or a sensible
// default asset so the canvas is never empty. The static (WASM) flavor defers
// this until a database file has been loaded (window.__DEFERRED_BOOT).
async function boot() {
  try {
    const o = await api("/api/overview", {});
    statsEl.textContent = `${o.totalAssets} assets · ${o.edgeCount} edges · ${o.unresolvedCount} unresolved`;

    const q = new URLSearchParams(location.search);
    let ref = q.get("ref");
    if (q.get("dir")) $("dir").value = q.get("dir");
    if (q.get("depth")) $("depth").value = q.get("depth");

    if (!ref) {
      const prefabs = await api("/api/search", { type: "Prefab", limit: "1" });
      if (prefabs[0]) ref = prefabs[0].path;
    }
    if (ref) {
      $("ref").value = ref;
      await show(ref);
    }
  } catch (err) { statsEl.innerHTML = `<span class="err">${err.message}</span>`; }
}

window.__bootViewer = boot;
if (!window.__DEFERRED_BOOT) boot();
