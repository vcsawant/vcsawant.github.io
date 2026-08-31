# Phase 6 Audit — Motion Layer (Performance & Accessibility)

Black-box audit of the built site (`dist/`, served at `127.0.0.1:4517`). Implementation docs were
not consulted. Tools: Lighthouse 12 (simulated mobile), Playwright/Chromium (CDP CPU throttling,
axe-core), direct dist CSS/JS inspection. Date: 2026-08-30.

## Pass/fail summary

| # | Check | Result | Key numbers |
|---|-------|--------|-------------|
| 1 | Lighthouse mobile: perf >= 0.90 | **FAIL** | Performance **0.63** |
| 1 | Lighthouse mobile: CLS <= 0.1 | PASS | CLS **0** (pin/reveals cause no shift) |
| 1 | Lighthouse mobile: LCP element is text | PASS | `p.positioning` (hero paragraph) |
| 1 | Lighthouse mobile: TBT | PASS | 160 ms |
| 2 | Scroll jank @ 6x CPU throttle | PASS | 0/739 frames > 16.7 ms, 0 long tasks |
| 3a | Reduced motion: no gsap/motion chunk loads | PASS | 0 motion-related requests (16 total) |
| 3b | Reduced motion: `getAnimations()` empty at rest + scrolling | PASS | [] in both states |
| 3c | Reduced motion: all content visible | PASS | all probes opacity 1 / visible |
| 4 | `animation-timeline` rules guarded by `@supports` + reduced-motion | PASS | single block, double-guarded |
| 4 | No content hidden in base styles | PASS | hiding lives only in keyframes (0% frames) |
| 4* | CSS scroll-driven animations actually function | **FAIL** | minifier emits invalid shorthand; 0 animations ever created |
| 5 | Desktop pin: no horizontal scroll | PASS | scrollWidth - clientWidth = 0 at 7 scroll positions |
| 5 | Desktop pin: no overlap glitches | **FAIL** | pinned heading buried behind all 3 cards (368x97 px overlap each) |
| 6 | View transitions: card -> detail -> back, no console errors | PASS | 0 errors (warnings only) |
| 6 | Reading-progress bar works after navigation | **FAIL** | scaleX stays 0 at page bottom — bar never works, even on first load |
| 6 | Chips still filter after navigation | PASS | non-matching cards -> opacity 0.15 + `aria-hidden`, `aria-pressed` toggles |
| 7 | Tab order intact after motion has run | PASS | skip-link -> nav -> CTAs -> cards -> chips -> footer, no traps |
| 7 | axe serious/critical after full scroll | PASS | **0** violations (of any impact) |
| 8 | JS disabled: everything visible | PASS | 9/9 content probes visible, incl. SVG skill graph fallback |

`4*` is a functional discovery made during the CSS inspection; the guard structure itself is correct.

## Evidence

### 1. Lighthouse mobile (simulated throttling)

Performance **0.63** | FCP 4,372 ms | LCP 7,804 ms | TBT 160 ms | CLS 0 | SI 4,372 ms | TTI 11,812 ms

- LCP element is the hero paragraph `main#main > section.hero > div.wrap > p.positioning` — text,
  present in initial HTML. LCP phase breakdown: TTFB 451 ms (6%), **render delay 7,353 ms (94%)**.
- CLS 0: the pin (`pinSpacing:false` + fixed heading) and reveal keyframes produce no layout shift.
- Main weight drivers (total 2,151 KiB): `morph-targets.bin` 900 KiB, `use-render-gate.*.js`
  883 KiB (491 KiB unused — three.js), `client.*.js` 181 KiB (90 KiB unused),
  `motion.*.js` 113 KiB (57 KiB unused — GSAP + ScrollTrigger). Unused JS total: 623 KiB.
- The motion chunk is idle-loaded (`requestIdleCallback`, 3 s timeout) behind a
  `prefers-reduced-motion: no-preference` matchMedia gate, so it is not render-blocking; the low
  score is dominated by overall JS/asset weight plus the long LCP render delay, not by the motion
  layer specifically.

### 2. Full-page scroll under CPU throttle (CDP `Emulation.setCPUThrottlingRate`, motion active, 1400x900)

Programmatic 6 s scroll down-and-up over the full document, rAF frame deltas + PerformanceObserver longtasks:

| Throttle | Frames | > 16.7 ms | > 33.4 ms | Max frame | Avg frame | Long tasks > 50 ms |
|----------|--------|-----------|-----------|-----------|-----------|--------------------|
| 6x | 739 | **0** | 0 | 15.2 ms | 8.13 ms | **0** |
| 1x | 791 | 0 | 0 | 15.1 ms | 7.59 ms | 0 |

The GSAP scrub/pin work is effectively free at 6x throttle. (Caveat: the CSS scroll-driven reveals
were inert — see finding 1 — so this measures GSAP + WebGL scenes only.)

### 3. Reduced-motion emulation (`reducedMotion: 'reduce'`)

- Network: 16 requests total, **zero** matching `/motion|gsap/` after a 4.5 s wait (past the
  idle-load window). The loader script (`index.astro_astro_type_script_index_2_lang.*.js`) only
  dynamic-imports `motion.*.js` when `matchMedia('(prefers-reduced-motion: no-preference)')` matches.
- `document.getAnimations()` = `[]` at rest and sampled every frame during a 3 s scripted scroll.
- Content: all probes (`[data-project]` x3, `.site-footer .wrap`, `.positioning`, `h1`,
  `.section-heading` x2) at opacity 1 / visible / transform none. The `.scroll-progress` bar stays
  `scaleX(0)` — acceptable (decorative indicator).

### 4. CSS inspection (dist/_astro/Base.CTdeoNk9.css)

Guard structure is correct — the only `animation-timeline` usage is:

```css
@media (prefers-reduced-motion:no-preference){
  @supports (animation-timeline:view()){
    @keyframes rise-in{0%{opacity:.001;transform:translateY(26px)}}
    [data-project],.site-footer .wrap{animation:linear both rise-in view();animation-range:entry 5% entry 55%}
    @keyframes bar-grow{0%{transform:scaleX(0)}to{transform:scaleX(1)}}
    .scroll-progress{animation:linear both bar-grow scroll(root)}
  }
}
```

Base states are never hidden: reveal hiding exists only in the `0%` keyframes, so non-supporting
browsers, reduced-motion users, and no-JS visitors all get fully visible content. The only
`opacity:0` base rule in dist CSS is `.graph-box.is-webgl .graph-svg` — gated on a JS-applied class
(SVG fallback swap), not motion.

**However, the shipped shorthand is invalid.** Per the current spec, `animation-timeline` cannot be
set via the `animation` shorthand; Chrome rejects the whole declaration. Verified in-browser:

- `el.style.cssText = 'animation:linear both bar-grow scroll(root)'` -> `style.animation === ""` (rejected)
- equivalent longhands -> `animationTimeline === "scroll(root)"` (accepted)
- Live page (motion allowed, `CSS.supports('animation-timeline: view()')` = true):
  card `getAnimations()` = 0, computed `animation-name: none`, `animation-timeline: auto`;
  `document.getAnimations()` = 0.

The source (`src/styles/global.css:139-153`) correctly uses `animation: rise-in linear both;` plus a
separate `animation-timeline:` longhand — the CSS minifier in the build pipeline merges them into
the invalid shorthand. Net effect: **no scroll reveal and no scroll progress bar ship at all.**
Failure mode is safe (content visible) but two features are dead code.

### 5. Desktop 1400x900 — pinned heading

- Horizontal scroll: `scrollWidth - clientWidth = 0` on both `html` and `body` at scrollY 0, 572,
  872, 1072, 1372, 1772, 2172. PASS.
- Overlap: **FAIL.** During and after the pin range, the `.work .section-heading` box
  (1152x97, position:fixed while pinned) sits *behind* the three opaque project cards — each card
  overlaps it by ~368x97 px. Visually the heading text is unreadable; a stray glyph fragment of the
  large serif title pokes through the column gap between cards 1 and 2, and a sliver of the yellow
  eyebrow shows at the left card edge. `pinSpacing:false` lets the card grid slide up over the
  heading (heading z-index auto, cards opaque `rgb(23,32,27)`), leaving a ~260 px empty band above
  the cards where the heading presumably should read.
- Screenshots: `check5-pin-y880.png`, `check5-pin-y950.png`, `check5-pin-scroll1072.png`,
  `check5-pin-scroll1772.png` (session scratchpad
  `/private/tmp/claude-501/-Users-viren-workspace-vcsawant-github-io/3278bc56-bd13-490f-9490-4e24e7540872/scratchpad/`).

### 6. View transitions

- `/` -> click card -> `/projects/bughouse/` (h1 "Multiplayer Bughouse Chess") -> browser back -> `/`. Works.
- Console: **0 errors**. Warnings: `THREE.Clock: This module has been deprecated` x3 (once per
  navigation — suggests the hero scene re-instantiates on every swap) and Chromium
  `GPU stall due to ReadPixels` performance warnings.
- Progress bar after back-nav: scaleX 0 at top **and 0 at page bottom** — broken. Same on a fresh
  load with no navigation, so this is the invalid-shorthand bug (finding 1), not a
  view-transition-lifecycle bug.
- GSAP survives navigation: after back-nav, `.hero-copy` scrubs (transform `translateY(-53px)`,
  opacity 0.44 at scrollY 500 vs identity/1 at top) — the `astro:before-swap` teardown +
  `astro:page-load` re-init path works.
- Chips after back-nav: clicking "Elixir" sets `aria-pressed="true"`, non-matching cards get
  `.is-filtered`, opacity 0.15 and `aria-hidden="true"`; toggling restores. Works.

### 7. Keyboard + axe (after scrolling to bottom and back, motion active)

- Tab order (21 stops): skip-link -> brand -> Work -> Skills -> hero CTAs (See the work, Get in
  touch) -> 3 project card links -> 8 skill chip buttons -> footer (email, GitHub, source) -> body.
  Logical, matches DOM/visual order, no focus traps, skip link is first.
- axe-core on `/` after the full scroll cycle: **0 violations** (serious/critical: 0; total: 0).

### 8. JS disabled

All 9 content probes visible at full height: h1, hero paragraph, 3 project cards,
2 section headings, footer, and the `.skill-graph` SVG fallback (544 px tall). Because reveal
hiding lives only in keyframes (and those animations are currently inert anyway), nothing depends
on JS to become visible. Screenshots: `check8-nojs-top.png`, `check8-nojs-bottom.png`.

## Ranked findings

1. **[High] The CSS scroll-driven layer does not ship — minifier emits invalid `animation` shorthand.**
   `dist/_astro/Base.CTdeoNk9.css` contains `animation:linear both rise-in view()` and
   `animation:linear both bar-grow scroll(root)`; Chrome rejects timelines inside the `animation`
   shorthand, so the card/footer reveals and the scroll progress bar never run in any browser
   (verified: 0 animations created, bar pinned at `scaleX(0)`). Source CSS uses correct longhands
   (`src/styles/global.css:139-153`); the build's CSS minifier merges them. Degrades safely
   (content stays visible) but two advertised features are dead in production.

2. **[High] Pinned section heading is occluded by project cards on desktop.**
   With `pinSpacing:false`, the card grid scrolls over the fixed heading; the heading is unreadable
   for its entire pinned range, with glyph fragments leaking through the grid column gaps
   (screenshot evidence above). No horizontal scroll, no CLS — purely a stacking/pin-spacing design bug.

3. **[Medium] Lighthouse mobile performance 0.63 (target >= 0.90).**
   LCP 7.8 s with 94% render delay on a text element; FCP 4.4 s; 623 KiB unused JS
   (three.js chunk 883 KiB / 491 KiB unused; GSAP motion chunk 113 KiB / 57 KiB unused) and a
   900 KiB `morph-targets.bin` in a 2.15 MiB page. TBT (160 ms) and CLS (0) are healthy, and the
   motion chunk is idle-loaded — the drag predominantly comes from overall asset weight, but the
   motion chunk adds 113 KiB for scrub effects that GSAP-lite or CSS could cover.

4. **[Low] Hero scene appears to re-instantiate on every view transition.**
   `THREE.Clock` deprecation warning logs once per navigation (3x over a nav cycle), plus repeated
   `GPU stall due to ReadPixels` warnings — worth checking scene teardown/reuse across
   `astro:before-swap` to avoid accumulating GPU work on long browse sessions.

5. **[Info] Reduced-motion and no-JS behavior is exemplary.**
   Media-gated dynamic import keeps GSAP off the wire entirely for reduced-motion users;
   `getAnimations()` is empty while scrolling; all content is visible with JS off; axe is clean
   and tab order intact after motion runs.
