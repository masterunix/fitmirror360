import { createAvatar } from "/js/avatar.js";
import { toast } from "/js/main.js";

const $ = (s, r = document) => r.querySelector(s);
const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const CHART = {
  chest: [84, 90, 96, 104, 112, 120],
  waist: [68, 74, 80, 88, 96, 104],
  hips: [90, 96, 102, 108, 116, 124],
};
// built-in design ease per garment type (cm added to the size chart)
const EASE = {
  top: { chest: 6, waist: 8, hips: 6 },
  dress: { chest: 4, waist: 5, hips: 8 },
  outer: { chest: 12, waist: 14, hips: 12 },
  bottoms: { chest: 0, waist: 2, hips: 4 },
};
const ZONES = { top: ["chest", "waist", "hips", "length"], dress: ["chest", "waist", "hips", "length"], outer: ["chest", "waist", "shoulders", "length"], bottoms: ["waist", "hips", "thigh", "length"] };
const FIT = { slim: [0, 5], regular: [3, 9], relaxed: [8, 16] };
const LABEL = { chest: "Chest", waist: "Waist", hips: "Hips", length: "Length", shoulders: "Shoulders", thigh: "Thigh" };
const TYPE_NAME = { top: "Top", dress: "Dress", outer: "Outerwear", bottoms: "Bottoms" };
const STYLE = {
  top: ["Straight-leg jeans", "White sneakers", "Light denim jacket"],
  dress: ["Block heels", "Cropped cardigan", "Small shoulder bag"],
  outer: ["Plain white tee", "Dark slim trousers", "Chelsea boots"],
  bottoms: ["Tucked-in shirt", "Loafers", "Simple leather belt"],
};

const SAMPLES = [
  { name: "Signature Tee", type: "top", color: "#e3152b" },
  { name: "Midnight Blazer", type: "outer", color: "#2b2b31" },
  { name: "Ivory Slip Dress", type: "dress", color: "#ece2d3" },
  { name: "Indigo Jeans", type: "bottoms", color: "#34507c" },
  { name: "Olive Field Jacket", type: "outer", color: "#5b6440" },
  { name: "Blush Knit", type: "top", color: "#e7a3a7" },
];

const FIELDS = [
  { k: "height", label: "Height", min: 140, max: 210 },
  { k: "chest", label: "Chest", min: 70, max: 150 },
  { k: "waist", label: "Waist", min: 55, max: 150 },
  { k: "hips", label: "Hips", min: 75, max: 160 },
  { k: "shoulder", label: "Shoulder", min: 34, max: 56 },
  { k: "inseam", label: "Inseam", min: 60, max: 95 },
];

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const state = {
  body: load("fm.body", { height: 170, chest: 92, waist: 76, hips: 98, shoulder: 42, inseam: 78 }),
  unit: load("fm.unit", "cm"),
  fit: "regular",
  garment: { ...SAMPLES[0], image: null },
  size: "M",
  userPickedSize: false,
};

// ---------- 3D ----------
const stage = $("#stage");
let av;
try {
  av = createAvatar(stage, { interactive: true, zoom: true, autoRotate: true, rotateSpeed: 1.4 });
} catch (e) {
  console.error(e);
}

// ---------- fit engine ----------
function evaluate(sizeIdx) {
  const g = state.garment.type;
  const b = state.body;
  const [lo, hi] = FIT[state.fit];
  const mid = (lo + hi) / 2;
  const out = {};
  for (const z of ZONES[g]) {
    let ease, range = [lo, hi], unit = "cm";
    if (z === "length") {
      if (g === "bottoms") ease = 76 + sizeIdx * 1.5 - b.inseam;
      else ease = (g === "dress" ? 0 : 0) + (166 + sizeIdx * 3.2) - b.height;
      // length: positive = runs long; ideal band ±4
      const s = ease < -6 ? ["Runs short", "bad"] : ease < -3 ? ["Slightly short", "warn"] : ease > 8 ? ["Runs long", "warn"] : ["Ideal length", "ok"];
      out[z] = { ease, status: s[0], tone: s[1], pos: clamp(52 + ease * 3.2, 4, 96), delta: `${fmtSigned(ease)} vs. ideal` };
      continue;
    }
    if (z === "shoulders") {
      ease = 40 + sizeIdx * 2 + 3 - b.shoulder;
      range = [0, 4];
    } else if (z === "thigh") {
      ease = (CHART.hips[sizeIdx] + 4) * 0.6 - b.hips * 0.58;
      range = [1, 6];
    } else {
      ease = CHART[z][sizeIdx] + EASE[g][z] - b[z];
    }
    const [a, c] = range;
    const m = (a + c) / 2;
    let status, tone;
    if (ease < -1) [status, tone] = ["Too tight", "bad"];
    else if (ease < a) [status, tone] = ["Snug", "warn"];
    else if (ease <= c) [status, tone] = ["True to fit", "ok"];
    else if (ease <= c + 6) [status, tone] = ["Relaxed", "warn"];
    else [status, tone] = ["Loose", "bad"];
    out[z] = { ease, status, tone, pos: clamp(52 + (ease - m) * 2.6, 4, 96), delta: `${fmtSigned(ease)} ${unit} ease` };
    void mid;
  }
  return out;
}

function score(sizeIdx) {
  const r = evaluate(sizeIdx);
  let s = 0;
  for (const [z, v] of Object.entries(r)) {
    const w = z === "length" ? 0.4 : 1;
    s += w * ({ ok: 0, warn: 1, bad: 3 }[v.tone] + Math.abs(v.pos - 52) / 30);
    if (v.status === "Too tight") s += 2;
  }
  return s;
}

function recommend() {
  let best = 0, bestS = Infinity;
  SIZES.forEach((_, i) => { const s = score(i); if (s < bestS) { bestS = s; best = i; } });
  return { idx: best, conf: Math.round(clamp(98 - bestS * 4.5, 71, 98)) };
}

function factors(sizeIdx) {
  const g = state.garment.type;
  const b = state.body;
  const f = {};
  for (const z of ["chest", "waist", "hips"]) {
    f[z] = clamp((CHART[z][sizeIdx] + EASE[g][z]) / b[z], 0.97, 1.4);
  }
  if (g === "bottoms") f.chest = 1;
  return f;
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmtSigned = (v) => {
  const val = state.unit === "in" ? v / 2.54 : v;
  const r = Math.round(val * 10) / 10;
  return (r > 0 ? "+" : r < 0 ? "−" : "±") + Math.abs(r) + (state.unit === "in" ? " in" : "");
};

// ---------- render ----------
const sizesEl = $("#sizes");
SIZES.forEach((s) => {
  const b = document.createElement("button");
  b.textContent = s;
  b.dataset.v = s;
  b.addEventListener("click", () => { state.size = s; state.userPickedSize = true; update(); });
  sizesEl.appendChild(b);
});

function renderReport() {
  const rec = recommend();
  const recSize = SIZES[rec.idx];
  if (!state.userPickedSize) state.size = recSize;
  const idx = SIZES.indexOf(state.size);
  const r = evaluate(idx);

  sizesEl.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("on", b.dataset.v === state.size);
    b.classList.toggle("rec", b.dataset.v === recSize);
  });

  $("#recSize").textContent = recSize;
  $("#recText").textContent = state.size === recSize ? `Size ${recSize} fits you best` : `We recommend ${recSize} (viewing ${state.size})`;
  $("#recSub").textContent = `${state.garment.name} · ${TYPE_NAME[state.garment.type]} · ${state.fit} fit · from the brand's size chart`;
  $("#confRing").style.setProperty("--v", rec.conf);
  $("#confVal").textContent = rec.conf + "%";
  $("#shopBtn").textContent = `Buy size ${state.size}`;
  const ideas = STYLE[state.garment.type];
  $("#styleIdeas").innerHTML = ideas.map((i) => `<span>${i}</span>`).join("");

  $("#zones").innerHTML = Object.entries(r).map(([z, v]) => `
    <div class="zone">
      <small>${LABEL[z]}</small>
      <b class="status-${v.tone}">${v.status}</b>
      <div class="meter"><i style="left:${v.pos}%"></i></div>
      <span class="delta">${v.delta}</span>
    </div>`).join("");

  return idx;
}

function update({ rebuild = true } = {}) {
  const idx = renderReport();
  if (av && rebuild) {
    av.setBody(state.body);
    av.setGarment({ type: state.garment.type, color: state.garment.color, factors: factors(idx) });
  }
  $("#garmentMeta").textContent = state.garment.name;
}

// ---------- measurements ----------
const measureEl = $("#measure");
const toDisp = (cm) => (state.unit === "in" ? Math.round((cm / 2.54) * 10) / 10 : Math.round(cm));
const fromDisp = (v) => (state.unit === "in" ? v * 2.54 : v);

function renderMeasure() {
  measureEl.innerHTML = FIELDS.map((f) => `
    <div class="m-row">
      <label for="r-${f.k}">${f.label}</label>
      <input type="range" id="r-${f.k}" data-k="${f.k}" min="${f.min}" max="${f.max}" step="0.5" value="${state.body[f.k]}" aria-label="${f.label}" />
      <div class="unit-input"><input type="number" inputmode="decimal" data-k="${f.k}" value="${toDisp(state.body[f.k])}" aria-label="${f.label} value" /><span>${state.unit}</span></div>
    </div>`).join("");
  measureEl.querySelectorAll("input[type=range]").forEach(paintRange);
}
function paintRange(r) {
  r.style.setProperty("--p", ((r.value - r.min) / (r.max - r.min)) * 100 + "%");
}
let rafPending = false;
function scheduleUpdate() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => { rafPending = false; update(); save("fm.body", state.body); });
}
measureEl.addEventListener("input", (e) => {
  const t = e.target;
  const k = t.dataset.k;
  const f = FIELDS.find((x) => x.k === k);
  if (!f) return;
  if (t.type === "range") {
    state.body[k] = +t.value;
    paintRange(t);
    measureEl.querySelector(`input[type=number][data-k=${k}]`).value = toDisp(+t.value);
  } else {
    const v = parseFloat(t.value);
    if (isNaN(v)) return;
    const cm = clamp(fromDisp(v), f.min, f.max);
    state.body[k] = cm;
    const r = measureEl.querySelector(`input[type=range][data-k=${k}]`);
    r.value = cm;
    paintRange(r);
  }
  scheduleUpdate();
});
measureEl.addEventListener("change", (e) => {
  if (e.target.type === "number") e.target.value = toDisp(state.body[e.target.dataset.k]);
});

function seg(id, onPick) {
  const el = $(id);
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    el.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    onPick(b.dataset.v);
  });
  return el;
}
const setSeg = (id, v) => $(id).querySelectorAll("button").forEach((x) => x.classList.toggle("on", x.dataset.v === v));

seg("#unitSeg", (v) => { state.unit = v; save("fm.unit", v); renderMeasure(); renderReport(); });
seg("#fitSeg", (v) => { state.fit = v; state.userPickedSize = false; update(); });
seg("#typeSeg", (v) => { state.garment.type = v; state.userPickedSize = false; update(); });

// ---------- garment: samples + upload ----------
const samplesEl = $("#samples");
SAMPLES.forEach((s, i) => {
  const b = document.createElement("button");
  b.className = "sample" + (i === 0 ? " on" : "");
  b.style.background = s.color;
  b.title = `${s.name} (${TYPE_NAME[s.type]})`;
  b.setAttribute("aria-label", b.title);
  b.addEventListener("click", () => {
    samplesEl.querySelectorAll(".sample").forEach((x) => x.classList.toggle("on", x === b));
    $("#dropzone").classList.remove("has-file");
    state.garment = { ...s, image: null };
    setSeg("#typeSeg", s.type);
    state.userPickedSize = false;
    generate();
  });
  samplesEl.appendChild(b);
});

function analyseImage(img) {
  const c = document.createElement("canvas");
  const N = 72;
  c.width = c.height = N;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, N, N);
  const d = ctx.getImageData(0, 0, N, N).data;
  // background = average of border pixels; ignore anything close to it
  let br = 0, bg = 0, bb = 0, bn = 0;
  for (let i = 0; i < N; i++) for (const [x, y] of [[i, 0], [i, N - 1], [0, i], [N - 1, i]]) {
    const o = (y * N + x) * 4; br += d[o]; bg += d[o + 1]; bb += d[o + 2]; bn++;
  }
  br /= bn; bg /= bn; bb /= bn;
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const o = (y * N + x) * 4;
    if (d[o + 3] < 128) continue;
    const dist = Math.abs(d[o] - br) + Math.abs(d[o + 1] - bg) + Math.abs(d[o + 2] - bb);
    if (dist < 60) continue;
    const wc = 1 - Math.abs(x / N - 0.5) - Math.abs(y / N - 0.5); // centre weighted
    r += d[o] * wc; g += d[o + 1] * wc; b += d[o + 2] * wc; n += wc;
  }
  if (n < 1) { r = br; g = bg; b = bb; n = 1; }
  const hex = "#" + [r / n, g / n, b / n].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const ratio = img.naturalHeight / img.naturalWidth;
  // thumbnail
  const t = document.createElement("canvas");
  t.width = 120; t.height = 120;
  const tc = t.getContext("2d");
  const s = Math.max(120 / img.naturalWidth, 120 / img.naturalHeight);
  tc.drawImage(img, (120 - img.naturalWidth * s) / 2, (120 - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
  return { hex, ratio, thumb: t.toDataURL("image/jpeg", 0.8) };
}

function guessType(name, ratio) {
  const n = name.toLowerCase();
  if (/(jean|trouser|pant|short|skirt|legging|chino|jogger)/.test(n)) return "bottoms";
  if (/(dress|gown|frock)/.test(n)) return "dress";
  if (/(jacket|coat|blazer|hoodie|parka|outer|cardigan)/.test(n)) return "outer";
  if (ratio > 1.45) return "dress";
  return "top";
}

function prettyName(file) {
  const base = file.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!base || /^(img|image|photo|dsc|screenshot)/i.test(base)) return "Your garment";
  return base.length > 26 ? base.slice(0, 24) + "…" : base.replace(/\b\w/g, (c) => c.toUpperCase());
}

function handleFile(file) {
  if (!file || !file.type.startsWith("image/")) { toast("Please choose an image file (JPG, PNG or WEBP)."); return; }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const a = analyseImage(img);
    const type = guessType(file.name, a.ratio);
    state.garment = { name: prettyName(file.name), type, color: a.hex, image: a.thumb };
    state.userPickedSize = false;
    $("#dzImg").src = url;
    $("#dzName").textContent = file.name;
    $("#dzSwatch").style.background = a.hex;
    $("#dzInfo").textContent = `${TYPE_NAME[type]} detected · ${a.hex.toUpperCase()}`;
    $("#dropzone").classList.add("has-file");
    samplesEl.querySelectorAll(".sample").forEach((x) => x.classList.remove("on"));
    setSeg("#typeSeg", type);
    generate();
  };
  img.src = url;
}
$("#fileInput").addEventListener("change", (e) => handleFile(e.target.files[0]));
const dz = $("#dropzone");
["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("drag"); }));
["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("drag"); }));
dz.addEventListener("drop", (e) => handleFile(e.dataTransfer.files[0]));

// ---------- generate ----------
let generating = false;
function generate() {
  if (generating) return;
  generating = true;
  const ov = $("#genOverlay");
  const steps = [...$("#genSteps").children];
  const bar = $("#genBar");
  const status = $("#stageStatus");
  steps.forEach((s) => s.className = "");
  bar.style.width = "0%";
  ov.classList.add("show");
  status.classList.remove("ready");
  $("#stageStatusText").textContent = "Generating…";
  if (window.innerWidth < 1000) stage.scrollIntoView({ behavior: "smooth", block: "center" });
  let i = 0;
  const tick = () => {
    if (i > 0) steps[i - 1].className = "done";
    if (i < steps.length) {
      steps[i].className = "active";
      bar.style.width = ((i + 1) / steps.length) * 100 + "%";
      i++;
      setTimeout(tick, 620 + Math.random() * 260);
    } else {
      update();
      av?.pulse();
      av?.view("front");
      setTimeout(() => {
        ov.classList.remove("show");
        status.classList.add("ready");
        $("#stageStatusText").textContent = "Try-on ready";
        generating = false;
        setTimeout(() => av?.setAutoRotate(spinOn), 900);
      }, 250);
    }
  };
  tick();
}
$("#generate").addEventListener("click", generate);

// ---------- viewer tools ----------
let spinOn = true;
document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => {
  av?.view(b.dataset.view);
  spinOn = false;
  $("#spinBtn").classList.remove("on");
  $("#spinBtn").setAttribute("aria-pressed", "false");
}));
$("#spinBtn").addEventListener("click", (e) => {
  spinOn = !spinOn;
  av?.setAutoRotate(spinOn);
  e.currentTarget.classList.toggle("on", spinOn);
  e.currentTarget.setAttribute("aria-pressed", String(spinOn));
});
let scan = true;
$("#scanBtn").addEventListener("click", (e) => {
  scan = !scan;
  av?.setScan(scan);
  e.currentTarget.classList.toggle("on", scan);
  e.currentTarget.setAttribute("aria-pressed", String(scan));
});

// ---------- actions ----------
$("#shopBtn").addEventListener("click", () => toast(`Taking you to the brand's store with size ${state.size} selected.`));
$("#shareBtn").addEventListener("click", async () => {
  const url = location.origin + "/studio";
  try {
    if (navigator.share) await navigator.share({ title: "My FitMirror 360 look", text: `${state.garment.name} in ${state.size}. See the fit before you buy it.`, url });
    else { await navigator.clipboard.writeText(url); toast("Link copied to clipboard."); }
  } catch {}
});

let looks = load("fm.looks", []);
function renderLooks() {
  const list = $("#savedList");
  $("#savedCount").textContent = `${looks.length} look${looks.length === 1 ? "" : "s"}`;
  if (!looks.length) {
    list.innerHTML = `<p class="saved-empty">Save looks here to compare sizes and styles before you buy.</p>`;
    return;
  }
  list.innerHTML = looks.map((l, i) => `
    <div class="saved-item" data-i="${i}" tabindex="0" role="button" aria-label="Load ${l.name}">
      <button class="rm" data-rm="${i}" aria-label="Remove look"><svg class="icon-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" style="width:12px;height:12px"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      <div class="sw" style="background:${l.color}">${l.image ? `<img src="${l.image}" alt="" />` : ""}</div>
      <b>${escapeHtml(l.name)}</b>
      <small>Size ${l.size} · ${TYPE_NAME[l.type]}</small>
    </div>`).join("");
}
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
$("#saveBtn").addEventListener("click", () => {
  looks.unshift({ name: state.garment.name, type: state.garment.type, color: state.garment.color, image: state.garment.image, size: state.size, fit: state.fit });
  looks = looks.slice(0, 12);
  save("fm.looks", looks);
  renderLooks();
  toast("Look saved to My looks.");
});
$("#savedList").addEventListener("click", (e) => {
  const rm = e.target.closest("[data-rm]");
  if (rm) {
    e.stopPropagation();
    looks.splice(+rm.dataset.rm, 1);
    save("fm.looks", looks);
    renderLooks();
    return;
  }
  const item = e.target.closest(".saved-item");
  if (!item) return;
  const l = looks[+item.dataset.i];
  state.garment = { name: l.name, type: l.type, color: l.color, image: l.image };
  state.size = l.size;
  state.userPickedSize = true;
  state.fit = l.fit || "regular";
  setSeg("#typeSeg", l.type);
  setSeg("#fitSeg", state.fit);
  update();
  stage.scrollIntoView({ behavior: "smooth", block: "center" });
});

// ---------- init ----------
setSeg("#unitSeg", state.unit);
renderMeasure();
renderLooks();
update();
