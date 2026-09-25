#!/usr/bin/env node
/**
 * Train Erazer's icon recogniser from Lucide (ISC) and Material Symbols
 * (Apache-2.0) and write ../../ErazerIconWeights.rgr.
 *
 *   cd tools/icons && npm install && npm run train
 *   node train.mjs --check shot.png x,y,w,h,#rrggbb ...   # score boxes of a real screenshot
 *
 * Each concept is drawn from Lucide's outline icons (stroke width varied,
 * a third of them filled), from Material Symbols (outlined, rounded and
 * sharp, plain and -fill, weight varied) and from the older Material Icons
 * (filled, outlined, round, sharp), with resvg at random sizes and colours. Lucide alone does not know an app's solid icons: a filled
 * Material bell has its clapper cut out of the fill, a filled outline has
 * nothing cut out, and the bell came back "home".
 * The input is prep.mjs's 24×24 inkiness map followed by its hand-made shape
 * features (4×4 fill, symmetry, centre of gravity, lines, bands, pieces,
 * holes, stroke thickness, aspect); the net is 576 + NF → HID → classes,
 * ReLU, softmax, trained with Adam. Weights are stored as 12-bit integers,
 * two characters each, with one scale per layer.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";
import { fullInput, N, NF } from "./prep.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ICONS = path.join(HERE, "node_modules/lucide-static/icons");
const MATERIAL = path.join(HERE, "node_modules/@material-symbols/svg-400");
// the older Material Icons (a wider house with eaves, a rounder bell)
const CLASSIC = path.join(HERE, "node_modules/@material-design-icons/svg");
const OUT = path.resolve(HERE, "../../ErazerIconWeights.rgr");

// concept -> Material Symbols drawn for it
export const MATERIAL_NAMES = {
  home: ["home"], settings: ["settings"], user: ["person", "account_circle"], users: ["group"],
  "user-plus": ["person_add"], bell: ["notifications"], menu: ["menu"], search: ["search"],
  heart: ["favorite"], star: ["star"], cart: ["shopping_cart"], bag: ["shopping_bag"],
  chart: ["bar_chart", "analytics", "insert_chart"], "chart-line": ["show_chart", "trending_up", "monitoring"],
  "chart-pie": ["pie_chart"], mail: ["mail"], message: ["chat", "chat_bubble"], phone: ["call"],
  calendar: ["calendar_month", "calendar_today"], clock: ["schedule"], camera: ["photo_camera"], image: ["image"],
  plus: ["add"], minus: ["remove"], close: ["close"], check: ["check"], "check-circle": ["check_circle"],
  checkbox: ["check_box"], square: ["check_box_outline_blank"], circle: ["radio_button_unchecked"],
  trash: ["delete"], edit: ["edit"], share: ["share"], download: ["download"], upload: ["upload"],
  lock: ["lock", "lock_open"], eye: ["visibility"], "eye-off": ["visibility_off"], "log-out": ["logout"],
  "log-in": ["login"], "arrow-left": ["arrow_back"], "arrow-right": ["arrow_forward"], "arrow-up": ["arrow_upward"],
  "arrow-down": ["arrow_downward"], "chevron-left": ["chevron_left"], "chevron-right": ["chevron_right"],
  "chevron-down": ["keyboard_arrow_down"], "chevron-up": ["keyboard_arrow_up"], more: ["more_horiz"],
  "more-vertical": ["more_vert"], filter: ["filter_alt"], sliders: ["tune"], info: ["info"],
  alert: ["error", "warning"], help: ["help"], "map-pin": ["location_on"], globe: ["public"], wifi: ["wifi"],
  battery: ["battery_full"], bluetooth: ["bluetooth"], volume: ["volume_up"], mic: ["mic"], play: ["play_arrow"],
  pause: ["pause"], "skip-forward": ["skip_next"], music: ["music_note"], bookmark: ["bookmark"], tag: ["sell"],
  package: ["package_2", "inventory_2", "deployed_code"], clipboard: ["assignment", "assignment_turned_in"],
  list: ["list", "checklist"], file: ["description", "draft"], folder: ["folder"], receipt: ["receipt", "receipt_long"],
  "credit-card": ["credit_card"], wallet: ["account_balance_wallet"], dollar: ["attach_money", "payments"],
  gift: ["redeem"], truck: ["local_shipping"], car: ["directions_car"], send: ["send"], paperclip: ["attach_file"],
  link: ["link"], refresh: ["refresh", "sync"], sun: ["light_mode"], moon: ["dark_mode"], cloud: ["cloud"],
  grid: ["grid_view", "dashboard", "apps"], copy: ["content_copy"], "external-link": ["open_in_new"],
  "thumbs-up": ["thumb_up"], flag: ["flag"], compass: ["explore"], building: ["apartment", "store", "storefront"],
  "qr-code": ["qr_code"],
};

// concept -> Lucide icons drawn for it
export const CONCEPTS = {
  home: ["house"], settings: ["settings", "cog"], user: ["user", "user-round", "circle-user"],
  users: ["users"], "user-plus": ["user-plus"], bell: ["bell"], menu: ["menu"], search: ["search"],
  heart: ["heart"], star: ["star"], cart: ["shopping-cart"], bag: ["shopping-bag"],
  chart: ["chart-column", "chart-bar", "chart-no-axes-column"], "chart-line": ["chart-line", "trending-up"],
  "chart-pie": ["chart-pie"], mail: ["mail"], message: ["message-circle", "message-square"],
  phone: ["phone"], calendar: ["calendar"], clock: ["clock"], camera: ["camera"], image: ["image"],
  plus: ["plus"], minus: ["minus"], close: ["x"], check: ["check"], "check-circle": ["circle-check"],
  checkbox: ["square-check"], square: ["square"], circle: ["circle"], trash: ["trash-2", "trash"],
  edit: ["pencil", "pen-line"], share: ["share-2", "share"], download: ["download"], upload: ["upload"],
  lock: ["lock", "lock-open"], eye: ["eye"], "eye-off": ["eye-off"], "log-out": ["log-out"], "log-in": ["log-in"],
  "arrow-left": ["arrow-left"], "arrow-right": ["arrow-right"], "arrow-up": ["arrow-up"], "arrow-down": ["arrow-down"],
  "chevron-left": ["chevron-left"], "chevron-right": ["chevron-right"], "chevron-down": ["chevron-down"],
  "chevron-up": ["chevron-up"], more: ["ellipsis"], "more-vertical": ["ellipsis-vertical"], filter: ["filter"],
  sliders: ["sliders-horizontal"], info: ["info"], alert: ["circle-alert", "triangle-alert"], help: ["circle-help"],
  "map-pin": ["map-pin"], globe: ["globe"], wifi: ["wifi"], battery: ["battery"], bluetooth: ["bluetooth"],
  volume: ["volume-2"], mic: ["mic"], play: ["play"], pause: ["pause"], "skip-forward": ["skip-forward"],
  music: ["music"], bookmark: ["bookmark"], tag: ["tag"], package: ["package", "box"],
  clipboard: ["clipboard-check", "clipboard-list"], list: ["list", "list-checks"], file: ["file", "file-text"],
  folder: ["folder"], receipt: ["receipt"], "credit-card": ["credit-card"], wallet: ["wallet"],
  dollar: ["dollar-sign"], gift: ["gift"], truck: ["truck"], car: ["car"], send: ["send"],
  paperclip: ["paperclip"], link: ["link"], refresh: ["refresh-cw", "rotate-ccw"], sun: ["sun"], moon: ["moon"],
  cloud: ["cloud"], grid: ["grid-2x2", "layout-grid", "layout-dashboard"], copy: ["copy"],
  "external-link": ["external-link"], "thumbs-up": ["thumbs-up"], flag: ["flag"], compass: ["compass"],
  building: ["building-2", "store"], "qr-code": ["qr-code"],
};

const argv = process.argv.slice(2);
const HID = 192;
const PER_ICON = 300;
const EPOCHS = 30;

// ---- deterministic randomness -------------------------------------------
let seed = 20260925;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
const hex = (r, g, b) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");

function colours() {
  // ink and background far enough apart to be an icon on a screen
  for (;;) {
    const dark = rnd() < 0.3;
    const bgc = dark ? [rnd() * 60, rnd() * 60, rnd() * 70] : [200 + rnd() * 55, 200 + rnd() * 55, 200 + rnd() * 55];
    const ink = [rnd() * 255, rnd() * 255, rnd() * 255];
    const d = (ink[0] - bgc[0]) ** 2 + (ink[1] - bgc[1]) ** 2 + (ink[2] - bgc[2]) ** 2;
    if (d > 110 * 110) return { ink: ink.map(Math.floor), bg: bgc.map(Math.floor) };
  }
}

const svgCache = new Map();
function lucide(name) {
  if (!svgCache.has(name)) {
    const raw = fs.readFileSync(path.join(ICONS, name + ".svg"), "utf8").replace(/<!--.*?-->/s, "");
    svgCache.set(name, raw.slice(raw.indexOf(">", raw.indexOf("<svg")) + 1, raw.lastIndexOf("</svg>")));
  }
  return svgCache.get(name);
}

const materialCache = new Map();
let lastMaterialFill = false;
function material(name) {
  // the older set half of the time, when it has the icon
  if (rnd() < 0.5) {
    const cstyle = pick(["filled", "filled", "outlined", "round", "sharp"]);
    const cf = path.join(CLASSIC, cstyle, name + ".svg");
    if (fs.existsSync(cf)) {
      if (!materialCache.has(cf)) {
        const raw = fs.readFileSync(cf, "utf8");
        const ds = [...raw.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
        materialCache.set(cf, { ds, classic: true });
      }
      lastMaterialFill = cstyle === "filled" || cstyle === "round" || cstyle === "sharp";
      return materialCache.get(cf);
    }
  }
  // style and fill picked per sample; the path is all a symbol has
  const style = pick(["outlined", "outlined", "rounded", "sharp"]);
  const fill = rnd() < 0.5;
  const file = path.join(MATERIAL, style, name + (fill ? "-fill" : "") + ".svg");
  const f = fs.existsSync(file) ? file : path.join(MATERIAL, "outlined", name + ".svg");
  lastMaterialFill = fill && f === file;
  if (!materialCache.has(f)) {
    const raw = fs.readFileSync(f, "utf8");
    materialCache.set(f, { ds: [...raw.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]), classic: false });
  }
  return materialCache.get(f);
}

const RENDER = { font: { loadSystemFonts: false } };

function render(svg, ink, bg) {
  const png = new Resvg(svg, RENDER).render();
  return boxAndInput(png.pixels, png.width, png.height, ink, bg);
}

// Draw `inner` (24×24 user units) at `size` px with a margin, return the
// inkiness map of its tight box, as Erazer's region pass would box it.
function sample(inner, { stroke = 2, filled = false } = {}) {
  const size = 14 + Math.floor(rnd() * 42);
  const { ink, bg } = colours();
  const canvas = Math.ceil(size * 32 / 24);
  const fill = filled ? hex(...ink) : "none";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="-4 -4 32 32">` +
    `<rect x="-4" y="-4" width="32" height="32" fill="${hex(...bg)}"/>` +
    `<g fill="${fill}" stroke="${hex(...ink)}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${inner}</g></svg>`;
  return render(svg, ink, bg);
}

// A Material symbol (960-unit box at y -960..0) or an older Material icon
// (24-unit box), weight varied with a stroke of the ink colour on its
// outline.
function sampleMaterial({ ds, classic }) {
  const size = 14 + Math.floor(rnd() * 42);
  const { ink, bg } = colours();
  const canvas = Math.ceil(size * 32 / 24);
  const weight = pick([0, 0, 0, 16, 32]);
  const paths = ds.map((d) => `<path d="${d}"/>`).join("");
  const svg =
    (classic
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="-4 -4 32 32">` +
        `<rect x="-4" y="-4" width="32" height="32" fill="${hex(...bg)}"/>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="-160 -1120 1280 1280">` +
        `<rect x="-160" y="-1120" width="1280" height="1280" fill="${hex(...bg)}"/>`) +
    `<g fill="${hex(...ink)}"${weight ? ` stroke="${hex(...ink)}" stroke-width="${classic ? weight / 40 : weight}"` : ""}>${paths}</g></svg>`;
  return render(svg, ink, bg);
}

function boxAndInput(px, W, H, ink, bg) {
  const dr = ink[0] - bg[0], dg = ink[1] - bg[1], db = ink[2] - bg[2];
  const dd = dr * dr + dg * dg + db * db;
  const thr = 0.35 + rnd() * 0.3;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const t = ((px[o] - bg[0]) * dr + (px[o + 1] - bg[1]) * dg + (px[o + 2] - bg[2]) * db) / dd;
      if (t >= thr) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  // Erazer boxes an icon's largest connected piece (a bell without its
  // clapper), so some samples are boxed that way too
  if (rnd() < 0.3) {
    const big = largestPiece(px, W, H, bg, dr, dg, db, dd, thr);
    if (big) [x0, y0, x1, y1] = big;
  }
  // a box off by a pixel, as a region grow may leave it
  const j = () => Math.floor(rnd() * 3) - 1;
  const x = Math.max(1, x0 + j()), y = Math.max(1, y0 + j());
  const w = Math.min(W - 1 - x, x1 - x + 1 + j()), h = Math.min(H - 1 - y, y1 - y + 1 + j());
  if (w < 3 || h < 3) return null;
  return fullInput(px, W, H, x, y, w, h, ink[0], ink[1], ink[2]);
}

function largestPiece(px, W, H, bg, dr, dg, db, dd, thr) {
  const inkAt = (i) => ((px[i * 4] - bg[0]) * dr + (px[i * 4 + 1] - bg[1]) * dg + (px[i * 4 + 2] - bg[2]) * db) / dd >= thr;
  const seen = new Uint8Array(W * H);
  let best = null, bestN = 0;
  for (let s = 0; s < W * H; s++) {
    if (seen[s] || !inkAt(s)) continue;
    let n = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const p = stack.pop();
      const x = p % W, y = (p - x) / W;
      n++;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const q = ny * W + nx;
          if (!seen[q] && inkAt(q)) { seen[q] = 1; stack.push(q); }
        }
      }
    }
    if (n > bestN) { bestN = n; best = [x0, y0, x1, y1]; }
  }
  return best;
}

// Shapes that are not icons: bars, blobs, swatches.
// No random polygons: a filled blob is what a solid icon looks like, and
// with them in "none" the filled Material home came back "none".
function noneShape() {
  const k = pick([0, 1, 2, 4]);
  if (k === 0) { const w = 4 + rnd() * 20, h = 2 + rnd() * 20; return `<rect x="${12 - w / 2}" y="${12 - h / 2}" width="${w}" height="${h}" rx="${rnd() * 4}" fill="currentColor" stroke="none"/>`.replace(/currentColor/g, "INK"); }
  if (k === 1) return `<circle cx="12" cy="12" r="${3 + rnd() * 9}" fill="INK" stroke="none"/>`;
  if (k === 2) return `<rect x="1" y="${10 + rnd() * 3}" width="22" height="${1 + rnd() * 3}" rx="1" fill="INK" stroke="none"/>`;
  if (k === 3) { let d = "M12 12"; for (let i = 0; i < 6; i++) d += ` L${2 + rnd() * 20} ${2 + rnd() * 20}`; return `<path d="${d}Z" fill="INK" stroke="none"/>`; }
  return `<rect x="2" y="2" width="20" height="20" rx="${rnd() * 10}" fill="INK" stroke="none"/>`;
}

function build(perIcon) {
  const names = Object.keys(CONCEPTS).concat(["none"]);
  const xs = [], ys = [], tags = [];
  names.forEach((c, ci) => {
    const srcs = CONCEPTS[c];
    const count = perIcon;
    for (let i = 0; i < count; i++) {
      let inp;
      let tag = "lucide";
      if (srcs && (i % 2 === 1) && MATERIAL_NAMES[c]) {
        const ds = material(pick(MATERIAL_NAMES[c]));
        tag = lastMaterialFill ? "material-fill" : "material";
        inp = sampleMaterial(ds);
      } else if (srcs) {
        inp = sample(lucide(pick(srcs)), { stroke: pick([1.5, 2, 2, 2.5, 3]), filled: rnd() < 0.33 });
      } else {
        const { ink } = colours();
        inp = sample(noneShape().replace(/INK/g, hex(...ink)));
      }
      if (!srcs) tag = "none";
      if (inp) { xs.push(inp); ys.push(ci); tags.push(tag); }
    }
  });
  return { names, xs, ys, tags };
}

// ---- the net --------------------------------------------------------------
const IN = N * N + NF;
function makeNet(C) {
  const init = (n, fan) => Float32Array.from({ length: n }, () => (rnd() * 2 - 1) * Math.sqrt(6 / fan));
  return { C, w1: init(IN * HID, IN + HID), b1: new Float32Array(HID), w2: init(HID * C, HID + C), b2: new Float32Array(C) };
}

function forward(net, x, h, p) {
  for (let j = 0; j < HID; j++) {
    let s = net.b1[j];
    const row = j * IN;
    for (let i = 0; i < IN; i++) s += net.w1[row + i] * x[i];
    h[j] = s > 0 ? s : 0;
  }
  let mx = -Infinity;
  for (let c = 0; c < net.C; c++) {
    let s = net.b2[c];
    const row = c * HID;
    for (let j = 0; j < HID; j++) s += net.w2[row + j] * h[j];
    p[c] = s;
    if (s > mx) mx = s;
  }
  let z = 0;
  for (let c = 0; c < net.C; c++) { p[c] = Math.exp(p[c] - mx); z += p[c]; }
  for (let c = 0; c < net.C; c++) p[c] /= z;
}

function train(net, xs, ys, epochs) {
  const params = ["w1", "b1", "w2", "b2"];
  const g = {}, m = {}, v = {};
  for (const k of params) { g[k] = new Float32Array(net[k].length); m[k] = new Float32Array(net[k].length); v[k] = new Float32Array(net[k].length); }
  const h = new Float32Array(HID), p = new Float32Array(net.C), dh = new Float32Array(HID);
  const order = xs.map((_, i) => i);
  let t = 0;
  const B = 32;
  for (let ep = 0; ep < epochs; ep++) {
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const lr = 0.001 * (ep < epochs * 0.7 ? 1 : 0.2);
    let loss = 0;
    for (let s = 0; s < order.length; s += B) {
      for (const k of params) g[k].fill(0);
      const end = Math.min(order.length, s + B);
      for (let q = s; q < end; q++) {
        const x = xs[order[q]], y = ys[order[q]];
        forward(net, x, h, p);
        loss -= Math.log(p[y] + 1e-9);
        dh.fill(0);
        for (let c = 0; c < net.C; c++) {
          const d = p[c] - (c === y ? 1 : 0);
          g.b2[c] += d;
          const row = c * HID;
          for (let j = 0; j < HID; j++) { g.w2[row + j] += d * h[j]; dh[j] += d * net.w2[row + j]; }
        }
        for (let j = 0; j < HID; j++) {
          if (h[j] <= 0) continue;
          const d = dh[j];
          g.b1[j] += d;
          const row = j * IN;
          for (let i = 0; i < IN; i++) if (x[i] !== 0) g.w1[row + i] += d * x[i];
        }
      }
      t++;
      const n = end - s;
      for (const k of params) {
        const W = net[k], G = g[k], M = m[k], V = v[k];
        const c1 = 1 - 0.9 ** t, c2 = 1 - 0.999 ** t;
        for (let i = 0; i < W.length; i++) {
          const gi = G[i] / n + (k[0] === "w" ? 1e-4 * W[i] : 0);
          M[i] = 0.9 * M[i] + 0.1 * gi;
          V[i] = 0.999 * V[i] + 0.001 * gi * gi;
          W[i] -= lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8);
        }
      }
    }
    process.stdout.write(`epoch ${ep + 1}/${epochs} loss ${(loss / order.length).toFixed(4)}\n`);
  }
}

function accuracy(net, xs, ys, tags) {
  const h = new Float32Array(HID), p = new Float32Array(net.C);
  let ok = 0;
  const by = {};
  for (let i = 0; i < xs.length; i++) {
    forward(net, xs[i], h, p);
    let best = 0;
    for (let c = 1; c < net.C; c++) if (p[c] > p[best]) best = c;
    const hit = best === ys[i];
    if (hit) ok++;
    if (tags) {
      by[tags[i]] = by[tags[i]] || [0, 0];
      by[tags[i]][0] += hit ? 1 : 0;
      by[tags[i]][1]++;
    }
  }
  const parts = Object.entries(by).map(([k, [a, n]]) => `${k} ${(100 * a / n).toFixed(1)}%`);
  return (100 * ok / xs.length).toFixed(1) + "%" + (parts.length ? " (" + parts.join(", ") + ")" : "");
}

// ---- 12-bit storage -------------------------------------------------------
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function quantize(arr) {
  let mx = 0;
  for (const a of arr) mx = Math.max(mx, Math.abs(a));
  const scale = mx / 2047 || 1;
  let s = "";
  const back = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const q = Math.max(-2047, Math.min(2047, Math.round(arr[i] / scale)));
    back[i] = q * scale;
    const u = q + 2048;
    s += ALPHA[u >> 6] + ALPHA[u & 63];
  }
  return { s, scale, back };
}

function writeRgr(net, names) {
  const parts = ["w1", "b1", "w2", "b2"].map((k) => [k, quantize(net[k])]);
  const q = { ...net };
  for (const [k, r] of parts) q[k] = r.back;
  const chunk = (s) => s.match(/.{1,4000}/g).map((c) => `        push out "${c}"`).join("\n");
  const src = `; GENERATED by tools/icons/train.mjs — do not edit.
;
; Weights of Erazer's icon recogniser, trained on icons from Lucide
; (https://lucide.dev, ISC License, Copyright (c) for portions of Lucide are
; held by Cole Bemis 2013-2022 as part of Feather (MIT); all other copyright
; (c) Lucide Contributors 2022), Material Symbols and Material Icons
; (https://github.com/google/material-design-icons, Apache License 2.0,
; Copyright Google LLC). Each weight is a 12-bit integer written as
; two characters of ErazerIconWeights.alphabet(), times its layer's scale.

class ErazerIconWeights {
    sfn inputSide:int () {
        return ${N}
    }

    sfn features:int () {
        return ${NF}
    }

    sfn hidden:int () {
        return ${HID}
    }

    sfn alphabet:string () {
        return "${ALPHA}"
    }

    sfn names:[string] () {
        def out:[string]
${names.map((n) => `        push out "${n}"`).join("\n")}
        return out
    }

${parts.map(([k, r]) => `    sfn ${k}Scale:double () {
        return ${r.scale.toPrecision(9)}
    }

    sfn ${k}Text:[string] () {
        def out:[string]
${chunk(r.s)}
        return out
    }
`).join("\n")}}
`;
  fs.writeFileSync(OUT, src);
  return q;
}

// ---- real screenshot boxes -----------------------------------------------
function check(file, specs, net, names) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const h = new Float32Array(HID), p = new Float32Array(net.C);
  for (const spec of specs) {
    const [x, y, w, hh, col] = spec.split(",");
    const c = parseInt(col.replace("#", ""), 16);
    const inp = fullInput(png.data, png.width, png.height, +x, +y, +w, +hh, c >> 16, (c >> 8) & 255, c & 255);
    if (!inp) { console.log(spec, "no contrast"); continue; }
    forward(net, inp, h, p);
    const top = [...p].map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 3);
    console.log(spec.padEnd(28), top.map(([v, i]) => `${names[i]} ${(v * 100).toFixed(0)}%`).join("  "));
  }
}

function loadNet() {
  // read the weights back from the generated .rgr (the stored, quantized ones)
  const src = fs.readFileSync(OUT, "utf8");
  const names = [...src.matchAll(/sfn names[\s\S]*?return out/g)][0][0].match(/push out "([^"]+)"/g).map((s) => s.slice(10, -1));
  const net = { C: names.length };
  for (const k of ["w1", "b1", "w2", "b2"]) {
    const scale = +src.match(new RegExp(`sfn ${k}Scale:double \\(\\) \\{\\s*return ([^\\s]+)`))[1];
    const body = src.match(new RegExp(`sfn ${k}Text[\\s\\S]*?return out`))[0];
    const text = [...body.matchAll(/push out "([^"]*)"/g)].map((m) => m[1]).join("");
    const arr = new Float32Array(text.length / 2);
    for (let i = 0; i < arr.length; i++) arr[i] = ((ALPHA.indexOf(text[2 * i]) << 6) + ALPHA.indexOf(text[2 * i + 1]) - 2048) * scale;
    net[k] = arr;
  }
  return { net, names };
}

if (argv[0] === "--check") {
  const { net, names } = loadNet();
  check(argv[1], argv.slice(2), net, names);
} else {
  const t0 = Date.now();
  const tr = build(PER_ICON);
  const te = build(20);
  console.log(`${tr.names.length} classes, ${tr.xs.length} training / ${te.xs.length} held-out samples (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  const net = makeNet(tr.names.length);
  train(net, tr.xs, tr.ys, EPOCHS);
  console.log(`held-out accuracy ${accuracy(net, te.xs, te.ys, te.tags)}`);
  const q = writeRgr(net, tr.names);
  console.log(`quantized held-out accuracy ${accuracy(q, te.xs, te.ys, te.tags)}`);
  console.log("wrote " + path.relative(process.cwd(), OUT) + ` (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
}
