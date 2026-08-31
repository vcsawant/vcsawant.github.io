# vcsawant.com

Personal site of Viren Sawant — Astro static shell, two React Three Fiber islands, deployed
to Cloudflare Workers static assets. Built to load fast for recruiters on phones (often
inside LinkedIn's in-app browser) while demonstrating front-end capability through its own
execution.

**Production:** https://vcsawant-site.vcsawant-github-io.workers.dev
(custom domain pending — see `docs/PLAN.md` Task 3.5)

## Architecture

```
static HTML (Astro, server-rendered)      React islands (WebGL, lazy)
┌────────────────────────────────┐        ┌──────────────────────────────┐
│ hero text (LCP), cards, chips, │  CustomEvents (src/lib/events.ts)     │
│ SVG graph fallback, footer     │◄──────►│ skill-graph island           │
│                                │        │   (client:visible)           │
│ filter-projects.ts owns filter │        │ hero island (client:idle)    │
│ state; graph-mode.ts swaps     │        │   particles + fluid cursor   │
│ SVG ↔ canvas                   │        └──────────────────────────────┘
└────────────────────────────────┘
```

- **Content is server-rendered, always.** JavaScript and WebGL are enhancements. With JS
  disabled the full site is legible; with WebGL unavailable (including LinkedIn's Android
  webview, which is blocklisted) a build-time SVG of the real graph layout renders instead.
- **Islands talk to the page only via `CustomEvent`s** declared in `src/lib/events.ts`
  (`vs:skill-select`, `vs:graph-ready`). Chips, Escape, canvas taps, and card filtering all
  stay in sync through that single channel.
- **Capability tiers** (`src/lib/webgl.ts`): `full` (bloom postprocessing, 25k hero
  particles), `lite` (small screens / few cores: no bloom, 8k particles), `none` (SVG/static
  hero). `prefers-reduced-motion` always gets the static rendering and never downloads GSAP
  or the 900 KB morph-target binary.
- **The skill graph** derives from the content collections (`src/lib/graph.ts`), gets a
  deterministic build-time 3D force layout (`src/islands/skill-graph/sim-core.ts`,
  d3-force-3d, seeded), renders as one InstancedMesh + one LineSegments, and reorganizes
  around a tapped node via a Web Worker streaming position batches.
- **The hero** morphs 25k particles between a chess knight, "VS", and a graph wireframe —
  entirely in the vertex shader — while a 128² fluid field (pointer/touch input) displaces
  them. The sim sleeps to zero cost when input decays.
- **Motion**: CSS scroll-driven animations (`view()`/`scroll()`) own the reveals and
  progress bar, double-gated behind `@supports` and reduced-motion; GSAP (lazy, idle-loaded)
  owns the hero parallax. Astro view transitions morph card titles into project pages.
- **Render discipline**: `dpr` capped at 1.5, `frameloop="demand"`, RAF loops run only while
  the canvas is on-screen and the tab visible (`src/islands/use-render-gate.ts`).

## Local development

```bash
npm install
npm run dev          # dev server
npm run build        # static build into dist/ (rnd routes pruned postbuild)
npm run serve        # serve dist/ like production (incl. 404 semantics)
```

Checks (all enforced in CI):

```bash
npx astro check      # types
npm run lint         # eslint
npm run format:check # prettier
npx vitest run       # unit tests
npx playwright test  # e2e: no-JS, reduced-motion, no-WebGL, keyboard, axe, interactions
npm run budgets      # gzip bundle budgets (every chunk must be claimed)
npm run lh           # lighthouse assertions (perf/a11y/CLS)
node scripts/generate-fallbacks.mjs  # regenerate WebM/poster fallbacks from the live scenes
```

## Editing content

Content lives in collections (`src/content.config.ts`):

- **Projects**: one markdown file per project in `src/content/projects/` — frontmatter
  drives the cards, graph, and detail pages; `stack:` entries must reference skill ids.
- **Skills**: `src/data/skills.json` (id, label, category, weight 1–5 → node size).
- **Identity links**: `src/lib/site.ts` — links render only when set, so placeholders can
  never ship as broken hrefs. Outstanding copy is tracked in `CONTENT-TODO.md`.

Adding a project or skill automatically updates the cards, chips, SVG fallback, and the 3D
graph (layout recomputes at build).

## Deploying

Merge to `main` → GitHub Actions deploys via Wrangler to Cloudflare Workers static assets.
PRs get preview URLs commented automatically. `main` is branch-protected on the `check`
workflow. Manual escape hatch: `npm run build && npx wrangler deploy`.

Headers (`public/_headers`): immutable caching for hashed assets and fonts, nosniff,
referrer and permissions policies.

## Bundle budgets (gzip, enforced)

| Chunk                     | Budget | Actual (2026-08-31) |
| ------------------------- | ------ | ------------------- |
| three + react-three-fiber | 293 KB | 227 KB              |
| react-dom client          | 64 KB  | 55 KB               |
| gsap motion (lazy)        | 49 KB  | 43 KB               |
| bloom (lazy, full tier)   | 59 KB  | 22 KB               |
| layout worker             | 15 KB  | 9 KB                |
| page scripts total        | 24 KB  | 7 KB                |

`scripts/check-bundle.mjs` fails CI if any chunk exceeds its category budget — or if a chunk
over 40 KB isn't claimed by a category, so renames can't dodge budgets.

## Provenance

Rebuilt 2026-08 from a 2019 Gatsby site (recoverable at git tag `archive/gatsby-2018`).
Plan and acceptance criteria: `docs/PLAN.md` + `docs/SPEC.md`. R&D reports for the shaders,
force layout, and fallbacks: `docs/rnd/`. Phase audits: `docs/audits/`. Display face:
Gambetta (Fontshare Free Font License, `public/fonts/GAMBETTA-LICENSE.txt`).
