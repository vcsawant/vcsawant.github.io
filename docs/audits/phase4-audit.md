# Phase 4 Audit — Performance and Accessibility

Black-box audit of the built site (`npm ci && npm run build`, `dist/` served at `http://127.0.0.1:4291/`).
Auditor had no implementation context; findings are based only on observed behavior of the served build.
Date: 2026-08-30. Tools: Lighthouse 12 (mobile, simulated throttling), Playwright + headless Chromium,
CDP `Emulation.setCPUThrottlingRate`, `@axe-core/playwright` 4.13.0.

## Pass/fail summary

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | Lighthouse mobile | **PASS** | Performance score **1.00** (target >= 0.90). LCP **1652 ms**, LCP element is text: `p.positioning` in the hero (`main#main > section.hero > div.wrap > p.positioning`) — not a canvas. CLS **0**. TBT **0 ms**. FCP 1277 ms, Speed Index 1277 ms. Lighthouse accessibility score 1.00. |
| 2 | Frame cost @ 6x CPU throttle | **PASS (with caveats)** | Long tasks > 50 ms: **1** total (53 ms, during full-page scroll — graph island mount). Zero long tasks during canvas drag and during chip-triggered reorganization. Frames > 16.8 ms — scroll: 99/326 (worst 52 ms, p95 23.7 ms, median 8.6 ms); canvas drag: 222/271 (worst 32 ms, median 21.7 ms); chip reorganization (~1.2 s window): 53/69 (worst 33.9 ms, median 21.5 ms). Under 6x throttle the graph interactions settle at ~30–45 fps but no frame ever exceeded 52 ms and the main thread is never blocked > 53 ms. |
| 3 | Canvas lifecycle (pause when hidden/offscreen) | **PASS** | `window.__graphDebug.rotationY` deltas over 1.0–1.2 s windows: visible **+0.0514**; tab hidden (visibilitychange to `hidden`) **0.0000**; restored **+0.0511**; canvas scrolled out of view **0.0000** (canvas stays mounted, delta over 1.2 s = 0); scrolled back into view **+0.0616**. Rendering stops in both cases and resumes correctly. |
| 4 | prefers-reduced-motion: reduce | **PASS** | With `reducedMotion: 'reduce'`, after scrolling the graph section into view for 2.5 s: `document.querySelectorAll('canvas').length === 0` (WebGL canvas never mounts), static SVG (`svg[data-graph-static]`) present and visible. `document.getAnimations().length === 0`; no scroll-linked animation observed. |
| 5 | JavaScript disabled | **PASS** | With JS off: `h1` "Viren Sawant" visible; **3/3** project cards visible; **8/8** skill chips visible; static SVG graph visible; skills listing present; footer visible; 0 canvases; no hidden sections; body text length 1740 chars. All content navigable as plain links/text. |
| 6 | WebGL disabled (`--disable-webgl --disable-webgl2`) | **PASS** | `getContext('webgl'/'webgl2')` returns null; **0 canvases mounted** anywhere on the page; static SVG fallback visible; **0 console errors/warnings**; full-page screenshot shows no black/blank rectangle — the graph section renders the SVG. |
| 7 | Keyboard-only + axe | **PASS** | Fresh-load tab order: skip link ("Skip to content" → `#main`) → nav (home, Work, Skills) → hero CTAs (See the work, Get in touch) → 3 project card links → 8 skill chip buttons → 3 footer links → out. Every stop has visible focus (`outline: solid 2px` under `:focus-visible`). Enter on a chip sets `aria-pressed="true"` and filters cards (non-matching cards get `.is-filtered`, `aria-hidden="true"`, `inert` — their links are correctly unfocusable, opacity 0.16); Escape clears (0 pressed chips, 3 cards visible). WebGL canvas wrapper is `aria-hidden="true"` and the canvas is not in the tab order; skill info remains reachable via chips + SVG `aria-label` + the screen-reader listing. axe violations (serious/critical): `/` **0**, `/` with a filter active **0**, `/projects/bughouse/` **0**. |
| 8 | Animation hygiene | **PASS** | All transitions in `dist/_astro/*.css`: `border-color`, `color`, `opacity`, `transform` only. No `@keyframes`. No layout-triggering property (width/height/top/left/right/bottom/margin/padding/flex-basis/font-size) is animated. |

### Measurement notes

- Check 2 frame data was captured in-page (rAF timestamp deltas + `PerformanceObserver` `longtask` entries) with CDP CPU throttling at 6x, viewport 1280x900. Threshold for "frame > 16 ms" was 16.8 ms.
- Check 3 "blur" was verified by overriding `document.visibilityState`/`document.hidden` and dispatching `visibilitychange` (headless Chromium keeps background tabs "visible", so a real tab-switch cannot be simulated); the page demonstrably listens to `visibilitychange` and halts rotation. Offscreen pause was verified with a real scroll.

## Findings (ranked)

1. **Medium — Placeholder `{{TODO: ...}}` copy ships in the production build, including the LCP element.**
   Observed on `/`: the hero positioning line (the LCP element) reads `{{TODO: real positioning line from Viren...}}`; the about blurb, one project card title ("`{{TODO: company}} Marketing Site`" — also a graph node label and a keyboard-focusable link name), three project card summaries, and the contact pitch are all `{{TODO}}` placeholders. Not a performance or a11y defect, but it is user-visible on every audited page and pollutes link names/labels announced to assistive tech. Where: hero, `.about`, `.project-card` titles/summaries, skill-graph node label, footer.

2. **Medium — Graph interactions run at ~30–45 fps under 6x CPU throttle.**
   During canvas drag, 222 of 271 frames (82%) exceeded 16.8 ms (median 21.7 ms, worst 32 ms); during tap-to-focus reorganization, 53 of 69 frames (median 21.5 ms, worst 33.9 ms). No long tasks — input stays responsive and nothing blocks > 53 ms — but on low-end mobile hardware the graph animation itself will visibly drop below 60 fps. Where: skill-graph WebGL canvas on `/`.

3. **Low — One 53 ms long task and a 52 ms frame during throttled full-page scroll.**
   Occurs when the graph island mounts as the skills section scrolls into view (99/326 scroll frames > 16.8 ms overall, but median 8.6 ms; the rest of the page scrolls cleanly). A one-off cost, just over the 50 ms long-task threshold at 6x throttle. Where: skill-graph island mount on `/`.

4. **Info — Everything else is clean.**
   Lighthouse 1.00 perf / 1.00 a11y with text LCP and zero CLS; canvas pauses when hidden and offscreen and resumes; reduced-motion, no-JS, and no-WebGL paths all degrade to the static SVG + full HTML content with zero console errors; complete keyboard path with visible focus, correct `aria-pressed`/`inert` filtering, Escape-to-clear; 0 axe violations on both audited pages; no layout-property animations in the shipped CSS.
