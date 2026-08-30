#!/usr/bin/env node
/**
 * generate-morph-targets.mjs
 *
 * Generates packed morph-target positions for the R&D particle field spike.
 * Pure Node stdlib — no canvas, no deps. Re-runnable and deterministic
 * (seeded PRNG), so the committed binary can always be regenerated:
 *
 *   node scripts/rnd/generate-morph-targets.mjs
 *
 * Output: public/morph-targets.bin
 *
 * BINARY FORMAT (little-endian)
 * -----------------------------
 *   offset 0   uint32  magic      0x4D525048  ("HPRM" LE, i.e. bytes "HPRM" -> "MRPH" as u32)
 *   offset 4   uint32  version    1
 *   offset 8   uint32  count      N particles per target (25000)
 *   offset 12  uint32  targets    3
 *   offset 16  float32[count*3]   target 0: chess knight silhouette   (xyz interleaved)
 *   offset 16 + count*12          target 1: "VS" initials
 *   offset 16 + count*24          target 2: abstract graph wireframe
 *
 * All targets are centered at the origin and normalized so the largest
 * dimension spans ~2.0 world units (fits [-1, 1]).
 *
 * ASSET PROVENANCE
 * ----------------
 * The chess-knight silhouette below is an ORIGINAL polygon authored by hand
 * for this script (vertex list in KNIGHT_POLY, drawn in a 0..100 y-up space).
 * It is not traced from any third-party asset — no external license applies.
 * The "V" glyph is an original polygon; the "S" glyph is an original
 * two-arc centerline expanded to a thick stroke. The graph is procedural.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const COUNT = 25000; // max tier; component stride-samples down to ~8k
const TARGETS = 3;
const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'public',
  'morph-targets.bin',
);

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — determinism keeps the binary reproducible.
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
function pointInPolygon(x, y, poly) {
  // even-odd ray casting
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonBBox(polys) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const poly of polys) {
    for (const [x, y] of poly) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY, maxX, maxY };
}

function polygonArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  }
  return Math.abs(a) / 2;
}

/** Rejection-sample `n` points inside a polygon; returns [x,y] pairs. */
function samplePolygon(poly, n, rand) {
  const { minX, minY, maxX, maxY } = polygonBBox([poly]);
  const pts = [];
  let guard = 0;
  while (pts.length < n && guard < n * 400) {
    guard++;
    const x = minX + rand() * (maxX - minX);
    const y = minY + rand() * (maxY - minY);
    if (pointInPolygon(x, y, poly)) pts.push([x, y]);
  }
  if (pts.length < n) throw new Error('polygon sampling starved');
  return pts;
}

/** Center 2D points at origin, scale longest axis to `span`, add thin z slab. */
function normalizeTo3D(pts2d, rand, { span = 2.0, depth = 0.1 } = {}) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of pts2d) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const s = span / Math.max(maxX - minX, maxY - minY);
  const out = new Float32Array(pts2d.length * 3);
  for (let i = 0; i < pts2d.length; i++) {
    out[i * 3 + 0] = (pts2d[i][0] - cx) * s;
    out[i * 3 + 1] = (pts2d[i][1] - cy) * s;
    // thin gaussian-ish slab so the shape has a little parallax
    out[i * 3 + 2] = (rand() + rand() - 1) * depth;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Target 0 — chess knight silhouette (original hand-authored polygon, y-up)
// ---------------------------------------------------------------------------
// Profile faces left: plinth base, broad neck on the right, muzzle projecting
// left, jaw notch, two ears. Drawn in a 0..100 unit box.
const KNIGHT_POLY = [
  // base / plinth
  [22, 0],
  [82, 0],
  [84, 6],
  [78, 10],
  [76, 14],
  // back of neck sweeping up
  [79, 26],
  [80, 40],
  [78, 52],
  [73, 64],
  [66, 74],
  [58, 81],
  // ears
  [59, 88],
  [54, 96],
  [49, 87],
  [46, 93],
  [41, 84],
  // forehead down to nose
  [33, 79],
  [24, 72],
  [15, 66],
  [9, 61],
  // nose / lip
  [7, 56],
  [10, 52],
  [16, 51],
  // mouth notch and jaw
  [21, 52],
  [26, 54],
  [28, 50],
  [23, 45],
  [19, 41],
  // throat / chest sweeping back down to base
  [24, 37],
  [31, 34],
  [36, 29],
  [38, 22],
  [36, 14],
  [30, 10],
  [24, 6],
];

function genKnight(rand) {
  const pts = samplePolygon(KNIGHT_POLY, COUNT, rand);
  return normalizeTo3D(pts, rand, { span: 1.9, depth: 0.09 });
}

// ---------------------------------------------------------------------------
// Target 1 — initials "VS" (original glyph geometry, y-up)
// ---------------------------------------------------------------------------
const V_POLY = [
  [0, 100],
  [17, 100],
  [35, 32],
  [53, 100],
  [70, 100],
  [45, 0],
  [25, 0],
];

/** "S" centerline: two circular arcs (top CCW, bottom CW), stroked thick. */
function sCenterline() {
  const pts = [];
  const STEPS = 48;
  // top arc: center (40,72) r 20, from 25deg CCW to 270deg
  for (let i = 0; i <= STEPS; i++) {
    const a = (25 + (245 * i) / STEPS) * (Math.PI / 180);
    pts.push([40 + 20 * Math.cos(a), 72 + 20 * Math.sin(a)]);
  }
  // bottom arc: center (40,32) r 20, from 90deg CW to -155deg
  for (let i = 1; i <= STEPS; i++) {
    const a = (90 - (245 * i) / STEPS) * (Math.PI / 180);
    pts.push([40 + 20 * Math.cos(a), 32 + 20 * Math.sin(a)]);
  }
  return pts;
}

function genInitials(rand) {
  const S_OFFSET_X = 84; // gap between glyphs
  const STROKE_W = 15;
  const center = sCenterline();
  // cumulative segment lengths for uniform arc-length sampling
  const cum = [0];
  for (let i = 1; i < center.length; i++) {
    const dx = center[i][0] - center[i - 1][0];
    const dy = center[i][1] - center[i - 1][1];
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  const sLen = cum[cum.length - 1];
  const vArea = polygonArea(V_POLY);
  const sArea = sLen * STROKE_W;
  const nV = Math.round((COUNT * vArea) / (vArea + sArea));
  const nS = COUNT - nV;

  const pts = samplePolygon(V_POLY, nV, rand);
  for (let k = 0; k < nS; k++) {
    // uniform along arc length
    const d = rand() * sLen;
    let i = 1;
    while (cum[i] < d) i++;
    const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1]);
    const x = center[i - 1][0] + (center[i][0] - center[i - 1][0]) * t;
    const y = center[i - 1][1] + (center[i][1] - center[i - 1][1]) * t;
    // unit normal of segment
    let nx = -(center[i][1] - center[i - 1][1]);
    let ny = center[i][0] - center[i - 1][0];
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const off = (rand() - 0.5) * STROKE_W;
    pts.push([x + nx * off + S_OFFSET_X, y + ny * off]);
  }
  return normalizeTo3D(pts, rand, { span: 2.2, depth: 0.09 });
}

// ---------------------------------------------------------------------------
// Target 2 — abstract graph wireframe (procedural clusters + edge lines)
// ---------------------------------------------------------------------------
function genGraph(rand) {
  const NODES = 9;
  const nodes = [];
  for (let i = 0; i < NODES; i++) {
    // nodes scattered in a flattened ellipsoid
    const theta = rand() * Math.PI * 2;
    const r = 0.45 + rand() * 0.55;
    nodes.push([Math.cos(theta) * r * 1.05, Math.sin(theta) * r * 0.8, (rand() - 0.5) * 0.55]);
  }
  // connect each node to its 2 nearest neighbours (dedup edges)
  const edgeSet = new Set();
  const edges = [];
  for (let i = 0; i < NODES; i++) {
    const d = nodes
      .map((p, j) => [j, Math.hypot(p[0] - nodes[i][0], p[1] - nodes[i][1], p[2] - nodes[i][2])])
      .filter(([j]) => j !== i)
      .sort((a, b) => a[1] - b[1]);
    for (const [j] of d.slice(0, 2)) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push([i, j]);
      }
    }
  }

  const out = new Float32Array(COUNT * 3);
  const nCluster = Math.floor(COUNT * 0.72);
  const gauss = () => (rand() + rand() + rand() + rand() - 2) * 0.5; // approx N(0, 0.29)
  for (let k = 0; k < nCluster; k++) {
    const n = nodes[k % NODES];
    const spread = 0.13 + (k % NODES) * 0.008; // slightly varied cluster sizes
    out[k * 3 + 0] = n[0] + gauss() * spread;
    out[k * 3 + 1] = n[1] + gauss() * spread;
    out[k * 3 + 2] = n[2] + gauss() * spread;
  }
  // faint connecting lines: sparse jittered points along edges
  for (let k = nCluster; k < COUNT; k++) {
    const [i, j] = edges[k % edges.length];
    const t = rand();
    const jit = 0.012;
    out[k * 3 + 0] = nodes[i][0] + (nodes[j][0] - nodes[i][0]) * t + (rand() - 0.5) * jit;
    out[k * 3 + 1] = nodes[i][1] + (nodes[j][1] - nodes[i][1]) * t + (rand() - 0.5) * jit;
    out[k * 3 + 2] = nodes[i][2] + (nodes[j][2] - nodes[i][2]) * t + (rand() - 0.5) * jit;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Shuffle correspondence + pack
// ---------------------------------------------------------------------------
/** Shuffle particle order within a target so morph correspondence is chaotic
 *  (particles fly across the shape instead of nearest-blob mapping). */
function shuffled(arr, rand) {
  const n = arr.length / 3;
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const out = new Float32Array(arr.length);
  for (let i = 0; i < n; i++) {
    out[i * 3] = arr[idx[i] * 3];
    out[i * 3 + 1] = arr[idx[i] * 3 + 1];
    out[i * 3 + 2] = arr[idx[i] * 3 + 2];
  }
  return out;
}

const knight = shuffled(genKnight(mulberry32(101)), mulberry32(7));
const initials = shuffled(genInitials(mulberry32(202)), mulberry32(11));
const graph = shuffled(genGraph(mulberry32(303)), mulberry32(13));

const HEADER_BYTES = 16;
const buf = Buffer.alloc(HEADER_BYTES + TARGETS * COUNT * 3 * 4);
buf.writeUInt32LE(0x4d525048, 0); // magic "MRPH"-ish tag
buf.writeUInt32LE(1, 4); // version
buf.writeUInt32LE(COUNT, 8); // particles per target
buf.writeUInt32LE(TARGETS, 12); // number of targets

let off = HEADER_BYTES;
for (const target of [knight, initials, graph]) {
  buf.set(Buffer.from(target.buffer, target.byteOffset, target.byteLength), off);
  off += target.byteLength;
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, buf);
console.log(`wrote ${OUT}: ${buf.length} bytes (${COUNT} particles x ${TARGETS} targets)`);
