#!/usr/bin/env node
/*
 * generate-fallbacks.mjs — non-WebGL fallback assets for the two WebGL scenes.
 *
 * Produces public/fallback/{hero,graph}.{webm,avif,jpg}:
 *   - seamless looping VP9 WebM (<= 1.5 MB, >= 720p, 6-15 s, no audio)
 *   - poster AVIF (<= 60 KB) + JPEG fallback (<= 120 KB)
 *
 * Usage:
 *   node scripts/generate-fallbacks.mjs [--scene hero|graph] [--keep-frames]
 *   (builds dist/ first if missing; serves it itself on :4531)
 *
 * Requires: Playwright chromium (npx playwright install chromium) + ffmpeg on PATH.
 *
 * How it works
 * ------------
 * 1. Serves dist/ on 127.0.0.1:4531 and launches headless Chromium with
 *    Playwright's fake clock (page.clock) installed BEFORE navigation:
 *    Date / performance.now / rAF / rIC are all virtual, so clock.runFor()
 *    advances the scenes deterministically and screenshots become
 *    exact-timestamp frames regardless of rasterizer speed.
 * 2. HERO: the scene honors `?heroT0=<ms>` (read-only capture hook in
 *    HeroScene.tsx) pinning its animation clock to performance.now() - heroT0.
 *    With heroT0=0 the morph phase IS the virtual clock, so capture starts on
 *    an exact 15000 ms cycle boundary. The morph cycle is perfectly 15 s
 *    periodic; only the low-amplitude uTime swirl/idle drift is not. We
 *    capture 15 s + XFADE_S of overhang and crossfade the overhang onto the
 *    head (ffmpeg xfade) — both sides of the blend share the same morph phase,
 *    so the fade only has to hide the tiny drift residual, during the knight
 *    dwell where amplitude is minimal.
 * 3. GRAPH: rotation drifts monotonically (~0.05 rad/s), so a crossfade would
 *    ghost two rotations. Instead: capture GRAPH_FWD_S forward and loop via
 *    ping-pong (forward + time-reversed, junction/end frames deduplicated).
 *    At this drift speed the turnaround reads as a gentle sway and frame N
 *    flows back into frame 0 exactly — a mathematically perfect seam.
 * 4. ffmpeg encodes VP9 two-pass CRF, stepping CRF up until the size budget is
 *    met; posters via libsvtav1 (AVIF) and mjpeg (JPEG), same budget loop.
 */
/* global window, document, performance -- page.evaluate callbacks run in the browser */
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import http from 'node:http';
import { extname, join, normalize } from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'public', 'fallback');
const WORK = join(ROOT, '.fallback-frames');
const PORT = 4531;
const BASE = `http://127.0.0.1:${PORT}`;

const FPS = 24;

// hero: one full morph cycle (3 * (2600 + 2400) ms) + crossfade overhang
const HERO_CYCLE_MS = 15000;
const XFADE_S = 1.25;
const HERO_LOOP_FRAMES = (HERO_CYCLE_MS / 1000) * FPS; // 360
const HERO_FADE_FRAMES = XFADE_S * FPS; // 30

// graph: forward segment; loop is ~2x this via ping-pong
const GRAPH_FWD_S = 6.25;

// poster frame indices (from capture start)
const HERO_POSTER_FRAME = Math.round((1300 / 1000) * FPS); // mid-dwell, knight resolved
const GRAPH_POSTER_FRAME = 0; // resting constellation

const argScene = process.argv.includes('--scene')
  ? process.argv[process.argv.indexOf('--scene') + 1]
  : null;
const keepFrames = process.argv.includes('--keep-frames');

/* ---------------------------------------------------------------- utilities */

function ff(args) {
  const full = ['-hide_banner', '-loglevel', 'error', '-y', ...args];
  console.log(`$ ffmpeg ${full.join(' ')}`);
  execFileSync('ffmpeg', full, { stdio: ['ignore', 'inherit', 'inherit'] });
}

const kb = (p) => statSync(p).size / 1024;
const frame = (dir, i) => join(dir, `f${String(i).padStart(4, '0')}.png`);

/* ------------------------------------------------- static server for dist/ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.bin': 'application/octet-stream',
  '.ico': 'image/x-icon',
};

function serveDist() {
  const server = http.createServer((req, res) => {
    let path = normalize(decodeURIComponent(new URL(req.url, BASE).pathname));
    if (path.endsWith('/')) path += 'index.html';
    let file = join(DIST, path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

/* ----------------------------------------------------------------- capture */

const EPOCH = new Date('2026-01-01T00:00:00Z');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openScene(page, { url, mountedWhen, beforePump }) {
  await page.clock.install({ time: EPOCH });
  await page.goto(url, { waitUntil: 'networkidle' });
  // CRITICAL: an installed clock still FLOWS with real time until pauseAt.
  // Without this, real screenshot latency (~100-300 ms/frame) silently
  // advances the scene between runFor steps and wrecks phase alignment.
  await page.clock.pauseAt(new Date(EPOCH.getTime() + 120_000));
  if (beforePump) await beforePump();
  // With a paused clock, client:idle / client:visible hydration and the
  // scenes' own frames only progress via runFor: pump until the scene reports
  // in (the short real sleep lets module fetches resolve between steps).
  for (let i = 0; ; i++) {
    if (await page.evaluate(mountedWhen)) break;
    if (i >= 300) throw new Error(`scene never mounted: ${url}`);
    await page.clock.runFor(100);
    await sleep(10);
  }
  await page.clock.runFor(500); // let the render gate + first frames settle
}

/** Viewport-relative, even-sized clip box for an element. */
async function clipFor(page, selector) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  return {
    x: Math.ceil(box.x),
    y: Math.ceil(box.y),
    width: Math.floor(box.width / 2) * 2,
    height: Math.floor(box.height / 2) * 2,
  };
}

/**
 * Screenshot `count` frames at FPS on the virtual clock. runFor takes integer
 * ms, so we advance to round(i * 1000/FPS) each step — cumulative error < 1 ms
 * over the whole capture (a naive fixed 42 ms step would drift 120 ms/cycle
 * and break the hero's phase alignment).
 */
async function captureFrames(page, clip, dir, count, label) {
  mkdirSync(dir, { recursive: true });
  let acc = 0;
  for (let i = 0; i < count; i++) {
    await page.screenshot({ path: frame(dir, i), clip, animations: 'allow' });
    const next = Math.round(((i + 1) * 1000) / FPS);
    await page.clock.runFor(next - acc);
    acc = next;
    if (i % 60 === 0) console.log(`  ${label}: frame ${i}/${count}`);
  }
}

async function captureHero(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await openScene(page, {
    url: `${BASE}/?heroT0=0`,
    mountedWhen: () => (window.__heroDebug?.frames ?? 0) > 0,
  });
  // the fallback replaces only the canvas layer: hide the text/CTA overlay
  await page.addStyleTag({ content: '.hero-copy { visibility: hidden !important; }' });

  // align to the next 15000 ms cycle boundary (morph phase == performance.now)
  const now = await page.evaluate(() => performance.now());
  await page.clock.runFor(Math.round(HERO_CYCLE_MS - (now % HERO_CYCLE_MS)));
  console.log(`hero: capture starts at virtual t=${await page.evaluate(() => performance.now())}`);

  const dir = join(WORK, 'hero');
  await captureFrames(
    page,
    await clipFor(page, '[data-hero-canvas]'),
    dir,
    HERO_LOOP_FRAMES + HERO_FADE_FRAMES,
    'hero',
  );
  await page.close();
  return dir;
}

async function captureGraph(browser) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  await openScene(page, {
    url: `${BASE}/#skills`,
    // the anchor navigation does not reliably scroll under a fake clock, and
    // the island is client:visible — scroll explicitly so its IO fires
    beforePump: () =>
      page.evaluate(() =>
        document.querySelector('.graph-box')?.scrollIntoView({ block: 'center' }),
      ),
    mountedWhen: () =>
      window.__graphDebug?.mode === 'webgl' && (window.__graphDebug?.rotationY ?? 0) > 0,
  });
  // capture the canvas layer only: the SVG fallback is already faded out in
  // webgl mode; drop the box chrome (the <video> will live inside the box)
  await page.addStyleTag({
    content: '.graph-box { border: none !important; border-radius: 0 !important; }',
  });
  await page.locator('.graph-box').scrollIntoViewIfNeeded();
  await page.clock.runFor(1500); // settle after scroll/selection sync

  const dir = join(WORK, 'graph');
  await captureFrames(
    page,
    await clipFor(page, '.graph-box'),
    dir,
    Math.round(GRAPH_FWD_S * FPS),
    'graph',
  );
  await page.close();
  return dir;
}

/* ---------------------------------------------------------------- encoding */

// 1460 KiB keeps the file under 1.5 MB in BOTH readings (1.5e6 B and 1.5 MiB)
function encodeVp9({ inputs, filter, out, budgetKb = 1460, crfStart = 40 }) {
  for (let crf = crfStart; crf <= 63; crf += 2) {
    for (const pass of [1, 2]) {
      ff([
        ...inputs,
        '-filter_complex',
        filter,
        '-map',
        '[v]',
        '-c:v',
        'libvpx-vp9',
        '-b:v',
        '0',
        '-crf',
        String(crf),
        '-row-mt',
        '1',
        '-pix_fmt',
        'yuv420p',
        '-an',
        '-pass',
        String(pass),
        '-passlogfile',
        join(WORK, 'vp9log'),
        ...(pass === 1 ? ['-f', 'null', '/dev/null'] : [out]),
      ]);
    }
    if (kb(out) <= budgetKb) return crf;
    console.log(`  ${out}: ${kb(out).toFixed(0)} KB > ${budgetKb} KB, retry crf ${crf + 2}`);
  }
  throw new Error(`could not fit ${out} into ${budgetKb} KB`);
}

function encodeStills(png, base, vf) {
  for (let crf = 30; crf <= 63; crf += 6) {
    ff([
      '-i',
      png,
      '-vf',
      vf,
      '-frames:v',
      '1',
      '-pix_fmt',
      'yuv420p',
      '-c:v',
      'libsvtav1',
      '-crf',
      String(crf),
      '-preset',
      '4',
      '-f',
      'avif',
      `${base}.avif`,
    ]);
    if (kb(`${base}.avif`) <= 60) break;
  }
  for (let q = 5; q <= 31; q += 3) {
    ff(['-i', png, '-vf', vf, '-frames:v', '1', '-c:v', 'mjpeg', '-q:v', String(q), `${base}.jpg`]);
    if (kb(`${base}.jpg`) <= 120) break;
  }
}

/* -------------------------------------------------------------------- main */

async function main() {
  if (!existsSync(DIST)) {
    console.log('dist/ missing — running npm run build');
    execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
  }
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); // fail fast if absent
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  mkdirSync(OUT, { recursive: true });

  const server = await serveDist();
  const browser = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--hide-scrollbars', '--force-color-profile=srgb'],
  });

  try {
    if (argScene !== 'graph') {
      const dir = await captureHero(browser);
      // input 0: the 30 overhang frames (cycle end — same morph phase as the
      // head); input 1: the 360-frame cycle. xfade blends 0 -> 1 over XFADE_S,
      // then the rest of the cycle follows untouched. Loop point: frame 359
      // (capture f0359) wraps to frame 0 (capture f0360) — consecutive
      // captured frames, hence seamless.
      const crf = encodeVp9({
        inputs: [
          '-framerate',
          String(FPS),
          '-start_number',
          String(HERO_LOOP_FRAMES),
          '-i',
          join(dir, 'f%04d.png'),
          '-framerate',
          String(FPS),
          '-start_number',
          '0',
          '-i',
          join(dir, 'f%04d.png'),
        ],
        filter:
          `[0:v]crop=1280:720,setpts=PTS-STARTPTS[a];` +
          `[1:v]crop=1280:720,trim=end_frame=${HERO_LOOP_FRAMES},setpts=PTS-STARTPTS[b];` +
          `[a][b]xfade=transition=fade:duration=${XFADE_S}:offset=0[v]`,
        out: join(OUT, 'hero.webm'),
      });
      console.log(`hero.webm: ${kb(join(OUT, 'hero.webm')).toFixed(0)} KB (crf ${crf})`);
      encodeStills(frame(dir, HERO_POSTER_FRAME), join(OUT, 'hero'), 'crop=1280:720');
    }

    if (argScene !== 'hero') {
      const dir = await captureGraph(browser);
      const n = Math.round(GRAPH_FWD_S * FPS);
      // ping-pong: forward (f0..fN-1) + reversed interior (fN-2..f1); dropping
      // the reversed copy's first and last frames avoids doubled frames at the
      // turnaround and at the loop point.
      const crf = encodeVp9({
        inputs: ['-framerate', String(FPS), '-start_number', '0', '-i', join(dir, 'f%04d.png')],
        filter:
          `[0:v]scale=-2:720,split[f][g];` +
          `[g]reverse,trim=start_frame=1:end_frame=${n - 1},setpts=PTS-STARTPTS[r];` +
          `[f][r]concat=n=2:v=1[v]`,
        out: join(OUT, 'graph.webm'),
      });
      console.log(`graph.webm: ${kb(join(OUT, 'graph.webm')).toFixed(0)} KB (crf ${crf})`);
      encodeStills(frame(dir, GRAPH_POSTER_FRAME), join(OUT, 'graph'), 'scale=-2:720');
    }
  } finally {
    await browser.close();
    server.close();
    if (!keepFrames) rmSync(WORK, { recursive: true, force: true });
  }

  for (const f of ['hero.webm', 'hero.avif', 'hero.jpg', 'graph.webm', 'graph.avif', 'graph.jpg']) {
    const p = join(OUT, f);
    if (existsSync(p)) console.log(`${f}\t${kb(p).toFixed(1)} KB`);
  }
  console.log('done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
