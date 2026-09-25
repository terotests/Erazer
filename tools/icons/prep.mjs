/**
 * The recogniser's input, computed the same way ErazerIcons.rgr computes it.
 * Change one, change the other.
 *
 * rgba: Uint8Array/Buffer, W×H×4. Box x,y,w,h in pixels; ink = the node's
 * colour. Returns Float32Array(24*24) of "inkiness" in 0..1, or null when
 * ink and background cannot be told apart.
 */
export const N = 24;
export const FIT = 20;

export function iconInput(rgba, W, H, x, y, w, h, ir, ig, ib) {
  // background: mean of the 1px ring just outside the box
  let br = 0, bg = 0, bb = 0, cnt = 0;
  const ring = (px, py) => {
    if (px < 0 || py < 0 || px >= W || py >= H) return;
    const o = (py * W + px) * 4;
    br += rgba[o]; bg += rgba[o + 1]; bb += rgba[o + 2]; cnt++;
  };
  for (let px = x - 1; px <= x + w; px++) { ring(px, y - 1); ring(px, y + h); }
  for (let py = y; py < y + h; py++) { ring(x - 1, py); ring(x + w, py); }
  if (cnt === 0) return null;
  br = Math.floor(br / cnt); bg = Math.floor(bg / cnt); bb = Math.floor(bb / cnt);
  const dr = ir - br, dg = ig - bg, db = ib - bb;
  const dd = dr * dr + dg * dg + db * db;
  if (dd < 400) return null;
  const out = new Float32Array(N * N);
  const big = Math.max(w, h);
  // source pixels per target pixel, and the source point of target (0,0)
  const s = big / FIT;
  const ox = x + w / 2 - (N / 2) * s;
  const oy = y + h / 2 - (N / 2) * s;
  for (let v = 0; v < N; v++) {
    for (let u = 0; u < N; u++) {
      let acc = 0;
      for (let j = 0; j < 3; j++) {
        for (let i = 0; i < 3; i++) {
          const sx = Math.floor(ox + (u + (i + 0.5) / 3) * s);
          const sy = Math.floor(oy + (v + (j + 0.5) / 3) * s);
          if (sx >= x && sy >= y && sx < x + w && sy < y + h && sx < W && sy < H) {
            const o = (sy * W + sx) * 4;
            let t = ((rgba[o] - br) * dr + (rgba[o + 1] - bg) * dg + (rgba[o + 2] - bb) * db) / dd;
            if (t < 0) t = 0;
            if (t > 1) t = 1;
            acc += t;
          }
        }
      }
      out[v * N + u] = acc / 9;
    }
  }
  return out;
}

/**
 * Hand-made shape features of a 24×24 map (ErazerIcons.features mirrors
 * this). Every value is in 0..1. `aspect` is w / (w + h) of the source box,
 * which the fitted map no longer shows.
 */
export const NF = 31;

export function iconFeatures(m, aspect) {
  const f = [];
  const on = (x, y) => x >= 0 && y >= 0 && x < N && y < N && m[y * N + x] >= 0.5;
  // 1. 4×4 grid over the 20×20 fit area (cells of 5): share of ink
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      let s = 0;
      for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) s += m[(2 + gy * 5 + y) * N + 2 + gx * 5 + x];
      f.push(s / 25);
    }
  }
  // 2. mirror symmetry, left-right and top-bottom
  let dh = 0, sh = 0, dv = 0, sv = 0, tot = 0, mx = 0, my = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const a = m[y * N + x];
      const b = m[y * N + (N - 1 - x)];
      const c = m[(N - 1 - y) * N + x];
      dh += Math.abs(a - b); sh += a + b;
      dv += Math.abs(a - c); sv += a + c;
      tot += a; mx += a * x; my += a * y;
    }
  }
  f.push(sh > 0 ? 1 - dh / sh : 0);
  f.push(sv > 0 ? 1 - dv / sv : 0);
  // 3. centre of gravity and spread
  const cx = tot > 0 ? mx / tot : 11.5, cy = tot > 0 ? my / tot : 11.5;
  let vx = 0, vy = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const a = m[y * N + x]; vx += a * (x - cx) ** 2; vy += a * (y - cy) ** 2; }
  f.push(cx / (N - 1), cy / (N - 1));
  f.push(tot > 0 ? Math.min(1, Math.sqrt(vx / tot) / 8) : 0, tot > 0 ? Math.min(1, Math.sqrt(vy / tot) / 8) : 0);
  // 4, 5. straight lines: a run of 8+ ink cells; touching rows are one line
  const lines = (horiz) => {
    let count = 0, prev = false;
    for (let a = 0; a < N; a++) {
      let run = 0, best = 0;
      for (let b = 0; b < N; b++) {
        if (horiz ? on(b, a) : on(a, b)) { run++; if (run > best) best = run; } else run = 0;
      }
      const has = best >= 8;
      if (has && !prev) count++;
      prev = has;
    }
    return Math.min(count, 6) / 6;
  };
  f.push(lines(true), lines(false));
  // 6, 7. bands of ink split by empty rows / empty columns
  const bands = (horiz) => {
    let count = 0, prev = false;
    for (let a = 0; a < N; a++) {
      let any = false;
      for (let b = 0; b < N && !any; b++) any = horiz ? on(b, a) : on(a, b);
      if (any && !prev) count++;
      prev = any;
    }
    return Math.min(count, 6) / 6;
  };
  f.push(bands(true), bands(false));
  // aspect of the source box, total ink
  f.push(aspect, tot / (N * N));
  // pieces of ink, and holes: background regions that do not reach the edge
  const seen = new Uint8Array(N * N);
  let pieces = 0, holes = 0;
  for (let s = 0; s < N * N; s++) {
    if (seen[s]) continue;
    const ink = m[s] >= 0.5;
    let edge = false;
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const p = stack.pop();
      const x = p % N, y = (p - x) / N;
      if (x === 0 || y === 0 || x === N - 1 || y === N - 1) edge = true;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const q = ny * N + nx;
        if (!seen[q] && (m[q] >= 0.5) === ink) { seen[q] = 1; stack.push(q); }
      }
    }
    if (ink) pieces++;
    else if (!edge) holes++;
  }
  f.push(Math.min(pieces, 6) / 6, Math.min(holes, 4) / 4);
  // stroke thickness: ink cells per ink cell on the outline
  let area = 0, rim = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!on(x, y)) continue;
      area++;
      if (!on(x + 1, y) || !on(x - 1, y) || !on(x, y + 1) || !on(x, y - 1)) rim++;
    }
  }
  f.push(rim > 0 ? Math.min(1, area / rim / 4) : 0);
  return f;
}

/** The whole input: the 24×24 map followed by the features. */
export function fullInput(rgba, W, H, x, y, w, h, ir, ig, ib) {
  const m = iconInput(rgba, W, H, x, y, w, h, ir, ig, ib);
  if (!m) return null;
  const out = new Float32Array(N * N + NF);
  out.set(m);
  out.set(iconFeatures(m, w / (w + h)), N * N);
  return out;
}
