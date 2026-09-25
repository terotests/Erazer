#!/usr/bin/env node
/**
 * Does the Ranger recogniser see what the trainer saw? Loads the built page
 * bundle (erazer.js) and compares ErazerIcons.fullInput with prep.mjs's
 * fullInput, value by value, on boxes of a real screenshot.
 *
 *   node parity.mjs path/to/erazer.js shot.png x,y,w,h,#rrggbb ...
 */
import fs from "node:fs";
import vm from "node:vm";
import { PNG } from "pngjs";
import { fullInput } from "./prep.mjs";

const [bundle, file, ...specs] = process.argv.slice(2);
const ctx = { console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(bundle, "utf8"), ctx);
const png = PNG.sync.read(fs.readFileSync(file));
const img = new ctx.ImageBuffer();
img.init(png.width, png.height);
new Uint8Array(img.pixels).set(png.data);
const net = ctx.ErazerIcons.shared();
let worst = 0;
for (const spec of specs) {
  const [x, y, w, h, col] = spec.split(",");
  const c = parseInt(col.replace("#", ""), 16);
  const a = fullInput(png.data, png.width, png.height, +x, +y, +w, +h, c >> 16, (c >> 8) & 255, c & 255);
  const b = net.fullInput(img, +x, +y, +w, +h, c >> 16, (c >> 8) & 255, c & 255);
  if (!a || a.length !== b.length) { console.log(spec, "length", a && a.length, b.length); worst = Infinity; continue; }
  let d = 0, at = -1;
  for (let i = 0; i < a.length; i++) { const e = Math.abs(a[i] - b[i]); if (e > d) { d = e; at = i; } }
  const g = net.classify(img, +x, +y, +w, +h, c >> 16, (c >> 8) & 255, c & 255);
  console.log(spec.padEnd(28), `max diff ${d.toExponential(2)} at ${at}`, `→ ${g.name} ${(g.confidence * 100).toFixed(0)}%`);
  worst = Math.max(worst, d);
}
process.exit(worst < 1e-4 ? 0 : 1);
