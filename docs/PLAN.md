# vcsawant.com Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read `docs/SPEC.md` first — this plan implements it.

**Goal:** Replace the abandoned 2019 Gatsby site with a fast, accessible Astro site featuring a
3D skill graph, deployed to Cloudflare Workers static assets.

**Architecture:** Static Astro shell renders all content server-side; a small number of React
islands (`@react-three/fiber`) add WebGL on top — one for the skill graph, one for the hero
(particle morph + fluid cursor distortion). Islands communicate with the static page via
`CustomEvent`s, never by owning content. GSAP/ScrollTrigger handles complex motion; CSS
scroll-driven animations handle simple reveals. Everything degrades: no JS → full content,
no WebGL2 → WebM/poster, reduced motion → static graph render.

**Tech Stack:** Astro 5 (static output), TypeScript strict, React 19 + `@react-three/fiber` 9 +
three.js, `d3-force-3d` (pending Task R2 research), GSAP 3 + ScrollTrigger, vanilla CSS with
custom properties, Vitest, Playwright, Lighthouse CI, Wrangler + GitHub Actions → Cloudflare
Workers static assets.

**Spec:** `docs/SPEC.md`

---

## Open questions (answer before or during review — none block Phase 0)

1. **`vcsawant.com` may already be yours.** The old repo tracks `static/CNAME` containing
   `vcsawant.com`, so you pointed that domain at GitHub Pages circa 2019. Before registering,
   check whether it's still in an old registrar account or has lapsed. If someone else now
   holds `.com`, `.dev` is the fallback. The plan uses `vcsawant.com` throughout; substitute
   freely — nothing depends on the TLD.
2. **What should `vcsawant.github.io` serve after launch?** GitHub Pages currently serves the
   2019 build from the `master` branch. Once hosting moves to Cloudflare, the "permanent free
   fallback URL" only stays useful if we keep publishing there. Recommendation (planned as
   optional Task 3.6): CI also pushes `dist/` to a `gh-pages` branch so the fallback URL always
   mirrors production. If you decline, the stale 2019 site keeps serving — worse than a 404 for
   a recruiter. Decide: mirror, or delete `master` and let it 404.
   **Note:** either way, `master` must not be deleted before the archive tag is pushed, and the
   old GitHub Pages custom-domain setting must be removed once DNS moves to Cloudflare.
3. **Project detail pages: I added them.** The brief doesn't say whether projects get their own
   pages. I planned `/projects/[slug]` pages (three of them, generated from the content
   collection) because (a) Phase 6's "view transitions between pages" is pointless with only
   `index` + `404`, and (b) recruiters who *do* engage past 40 seconds get depth. Cheap in
   Astro. Veto if you want a strict one-pager.
4. **Analytics recommendation: Cloudflare Web Analytics** over Plausible — free, no cookies, no
   consent banner, one beacon script, and you're already living in the Cloudflare dashboard for
   the Worker. Plausible is nicer but $9/mo. Task 8.6 assumes Cloudflare; say so if you prefer
   Plausible.
5. **One technical pushback — CSS scroll-driven animations on iOS.** `animation-timeline:
   view()` shipped in Chrome long ago but landed in Safari only recently (Safari 26, late
   2025); a meaningful share of iOS recruiters won't have it for a while. The constraint is
   still sound *provided* every `view()` reveal is written enhancement-only (content fully
   visible when the property is unsupported). Phase 6 tasks are written that way —
   `@supports (animation-timeline: view())` gates every reveal. No action needed, just noting
   the plan interprets "use view()" as "use it where supported, no-op elsewhere," not "rely on
   it."
6. **"One island" is planned as two sibling islands — flagging, not hiding it.** The brief
   says "one hydrated React island." The hero effects and the skill graph live in different
   page sections, so a literal single island means one full-page fixed canvas with scissored
   viewports (drei `<View>`-style) rendering both scenes. I planned **two sibling R3F islands
   instead** (`islands/hero`, `islands/skill-graph`), sharing all lifecycle code
   (`use-render-gate`, `webgl.ts`): each pauses independently via IntersectionObserver (only
   one is ever on-screen, so only one render loop runs — better for the perf bars), and a
   context-lost crash in one can't take down the other. The spirit of the constraint — "not a
   full React app" — holds: React exists only inside these two mount points. If you meant it
   literally, say so and Phase 4/5 collapse onto a shared-canvas architecture instead.
7. **Resume PDF is from 2019.** `src/assets/Resume.pdf` in the old tree is 7 years stale. The
   archive tag preserves it; `CONTENT-TODO.md` will ask for a current one.

## Sequencing change (explicit, per the brief's invitation)

The brief says Phase 2 "ends with a live deploy" but puts the deploy pipeline in Phase 3 —
circular as written. Resolution: **the minimal deploy moves into the end of Phase 2** (Tasks
2.10–2.11: `wrangler.jsonc` + one manual `wrangler deploy` from your machine, behind the
"before first production deploy" checkpoint). Phase 3 then covers *automation*: GitHub Actions,
PR previews, custom domain, cache headers. Everything else keeps the brief's order. Rationale:
you get a URL on the internet at the earliest possible moment, and CI is built against a deploy
that's already known to work.

One more deviation: the three research subagents (R1 fluid, R2 force-layout, R3 particle morph)
are **dispatched at the start of Phase 2**, not at Phases 4/5, because they're self-contained,
touch no shared code, and their results de-risk the biggest phases while the static site is
being built. Their deliverables land in `docs/rnd/` and are consumed later.

---

## Global Constraints

Every task inherits these. Copied from `docs/SPEC.md`; a task that violates one is wrong even
if its own acceptance criteria pass.

- Astro static output. Content renders server-side; JS is an enhancement, never required for
  reading the page.
- React only inside islands via `@astrojs/react` + `@react-three/fiber`. No full React app.
- Full content legible and navigable with JavaScript disabled.
- Lighthouse mobile performance ≥ 90 with the WebGL island present. LCP is text or a static
  poster image, never a canvas.
- `prefers-reduced-motion: reduce` → no scroll-linked motion, no particle field, static render
  of the graph.
- WebGL2 feature-detected; on failure (including LinkedIn's Android webview) fall back to
  looping WebM or static poster. Never a black rectangle.
- `dpr` capped at `[1, 1.5]`; particle counts scaled down on mobile; `frameloop="demand"` when
  static; render loop paused on tab blur and off-viewport (IntersectionObserver).
- Animate transforms and opacity only. No layout-triggering properties in any animation.
- Keyboard navigable, visible focus states. Skill graph has a non-pointer path to the same
  information.
- Never invent biography/copy. Placeholders are marked `{{TODO: …}}` and tracked in
  `CONTENT-TODO.md`.
- Commits: conventional-commit style, no `Co-Authored-By` lines.
- Node ≥ 22 LTS assumed for all commands.

## Human checkpoints (HARD STOPS — do not proceed past these without Viren)

| # | When | What Viren does |
|---|------|-----------------|
| CP-1 | Now (plan written) | Reviews and approves this plan |
| CP-2 | After Phase 0 | Confirms wipe + branch rename look right on GitHub |
| CP-3 | Before Task 2.11 | Runs `wrangler login` himself; first production deploy approval |
| CP-4 | Before Task 3.2 | Creates Cloudflare API token (exact scopes listed in Task 3.2) and adds GitHub secrets |
| CP-5 | Before Task 3.5 | Registers domain, confirms zone active in his Cloudflare account |
| CP-6 | End of Phase 8 | Final launch approval |

Credential rule: Claude never runs `wrangler login`, never reads/writes token values, never
echoes secrets. Instructions only.

---

## Target repository structure

```
.github/workflows/ci.yml            # check + lint + test + build + budgets on every push/PR
.github/workflows/deploy.yml        # deploy on main, preview on PRs
astro.config.mjs
wrangler.jsonc
package.json / tsconfig.json / eslint.config.js / .prettierrc / .gitignore
public/
  _headers                          # cache headers for Workers static assets
  fonts/  favicon.svg  og.png  resume.pdf  robots.txt
  fallback/                         # WebM + poster fallbacks (Task R4 output)
src/
  content.config.ts                 # collections: skills, projects  (NOT delegated)
  data/skills.json                  # skill nodes
  content/projects/*.md             # one file per project, placeholder-marked
  layouts/Base.astro
  pages/index.astro  404.astro  projects/[slug].astro
  components/                       # .astro only: Hero, ProjectCard, SkillChips,
                                    #   GraphFallback, SectionHeading, SiteFooter, SiteNav
  islands/
    skill-graph/                    # SkillGraph.tsx, nodes.tsx, edges.tsx, drag.ts,
                                    #   layout.worker.ts, use-render-gate.ts, effects.tsx
    hero/                           # HeroScene.tsx, particles.tsx, fluid.ts, morph-targets.ts
  lib/
    graph.ts                        # pure graph derivation (collections → nodes/edges)
    webgl.ts                        # WebGL2 detection + capability tiering
    events.ts                       # typed CustomEvent names + payloads
  scripts/
    filter-projects.ts              # page-side listener: filters project cards
    motion.ts                       # GSAP/ScrollTrigger choreography (lazy-loaded)
  styles/tokens.css  global.css
scripts/check-bundle.mjs            # gzip budget enforcement
tests/
  unit/*.test.ts                    # Vitest
  e2e/*.spec.ts                     # Playwright
docs/SPEC.md  PLAN.md  rnd/  audits/
CONTENT-TODO.md
```

**Interfaces every island/page agrees on** (defined once in Task 1.4, `src/lib/events.ts`):

```ts
// Window CustomEvents — the ONLY channel between islands and the static page.
export const EV = {
  skillSelect: 'vs:skill-select',   // detail: { skillId: string | null }
  graphReady:  'vs:graph-ready',    // detail: { mode: 'webgl' | 'fallback' | 'static' }
} as const;
export interface SkillSelectDetail { skillId: string | null }
```

```ts
// src/lib/graph.ts — produced in Task 4.1, consumed by island, SVG fallback, and chips.
export interface GraphNode {
  id: string; label: string;
  kind: 'skill' | 'project';
  category: 'language' | 'framework' | 'platform' | 'practice' | 'project';
  weight: number;                    // 1–5, drives node size
}
export interface GraphEdge { source: string; target: string }
export interface GraphData { nodes: GraphNode[]; edges: GraphEdge[] }
export function buildGraph(skills: SkillEntry[], projects: ProjectEntry[]): GraphData
```

---

## Subagent delegation map

| ID | Agent | Runs | Writes to | Never touches |
|----|-------|------|-----------|---------------|
| R1 | Fluid-cursor shader R&D | start of Phase 2, parallel | `docs/rnd/fluid/`, `src/pages/rnd/fluid.astro` (test route) | app components, islands, config |
| R2 | Force-layout research | start of Phase 2, parallel | `docs/rnd/layout/` | everything else |
| R3 | Particle-morph R&D | start of Phase 2, parallel | `docs/rnd/particles/`, `src/pages/rnd/particles.astro` | app components, islands, config |
| R4 | Fallback asset generation | during Phase 7 | `public/fallback/`, `docs/rnd/fallback-report.md` | detection logic integration (main session does it) |
| A4/A5/A6 | Perf+a11y audit | after Phases 4, 5, 6 | `docs/audits/phase{4,5,6}-audit.md` | source code (report-only) |
| CR-n | Code review | every phase boundary | review comments only | source code |

**Not delegated, single owner (main session):** Phase 0 wipe; `src/content.config.ts` and all
schema changes; `wrangler.jsonc` and both workflows; anything near secrets. Full briefs are in
the **Subagent briefs** appendix at the bottom — each brief is self-contained because the agent
cannot see this plan or the conversation.

---

# Phase 0 — Wipe (NOT delegated)

### Task 0.1: Archive tag

**Intent:** Make the 2019 site permanently recoverable before destroying anything.
**Files:** none (git ref only)
**Depends on:** CP-1 (plan approved)

- [ ] `git checkout source && git pull origin source`
- [ ] `git tag archive/gatsby-2018 HEAD`
- [ ] `git push origin archive/gatsby-2018`

**Acceptance:** Tag visible on GitHub pointing at `ae0360d`.
**Verify:** `git ls-remote origin refs/tags/archive/gatsby-2018` → prints
`ae0360d26374ee45fa651585fdf3f220313bfe1c`.

### Task 0.2: Remove all tracked files, one clean commit

**Intent:** Empty the tree in a single commit on `source` before any scaffolding.
**Files:** Delete: every tracked file (18 files incl. `package.json`, `src/`, `static/CNAME`,
`package-lock.json`, `.vscode/`, `LICENSE`, `README.md`, `.gitignore`, `.prettierrc`).
**Depends on:** 0.1

- [ ] `git rm -rf .`
- [ ] `git commit -m "chore: remove gatsby site (archived at tag archive/gatsby-2018)"`

**Procedure (exact):** first merge the approved plan branch (`git merge plan/initial` — brings
`docs/SPEC.md` + `docs/PLAN.md` onto `source`), then `git rm -rf . && git checkout HEAD -- docs/`
so the wipe commit removes everything *except* `docs/`, then commit.
**Acceptance:** After the commit, `git ls-files` lists only `docs/SPEC.md` and `docs/PLAN.md`;
one wipe commit, no stray working-tree files.
**Verify:** `git ls-files` → exactly the two docs paths; `git status` → clean.

### Task 0.3: Rename branch `source` → `main`, flip default

**Intent:** Modern default branch; GitHub default updated so CP-2 review happens on `main`.
**Files:** none
**Depends on:** 0.2

- [ ] `git branch -m source main`
- [ ] `git push -u origin main`
- [ ] `gh repo edit vcsawant/vcsawant.github.io --default-branch main`
- [ ] `git push origin --delete source`
- [ ] Do **not** delete `master` (old Pages output) — that's Open Question 2, Viren's call.

**Acceptance:** GitHub default branch is `main`; `source` gone from remote; `master` and the
archive tag untouched.
**Verify:** `gh repo view --json defaultBranchRef -q .defaultBranchRef.name` → `main`;
`git ls-remote --heads origin` shows `main`, `master`, no `source`.

> **CP-2 — HARD STOP.** Viren inspects GitHub: empty tree on `main`, tag present, default
> flipped. Nothing proceeds until he approves.

---

# Phase 1 — Scaffold

### Task 1.1: Astro + strict TypeScript + React island support

**Intent:** Minimal Astro 5 project, static output, React islands enabled.
**Files:** Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `src/pages/index.astro`
(placeholder), `.gitignore`, `public/favicon.svg`
**Depends on:** CP-2

- [ ] `npm create astro@latest . -- --template minimal --no-install --no-git --yes`
- [ ] Set `tsconfig.json` to `{ "extends": "astro/tsconfigs/strict", "include": [".astro/types.d.ts", "src/**/*", "tests/**/*", "scripts/**/*"] }`
- [ ] `npm install && npx astro add react --yes`
- [ ] `astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
export default defineConfig({
  site: 'https://vcsawant.com',
  output: 'static',
  integrations: [react()],
});
```

- [ ] Commit: `feat: scaffold astro 5 with react islands`

**Acceptance:** Dev server serves a page; build emits `dist/index.html`.
**Verify:** `npm run build` → exits 0, `dist/index.html` exists.

### Task 1.2: Prettier + ESLint (flat config)

**Intent:** Formatting and linting that CI can enforce, covering `.astro`, `.ts`, `.tsx`.
**Files:** Create: `.prettierrc`, `.prettierignore`, `eslint.config.js`
**Depends on:** 1.1

- [ ] `npm i -D prettier prettier-plugin-astro eslint @eslint/js typescript-eslint eslint-plugin-astro eslint-plugin-jsx-a11y`
- [ ] `.prettierrc`: `{ "plugins": ["prettier-plugin-astro"], "singleQuote": true, "printWidth": 100 }`
- [ ] `eslint.config.js`: `js.configs.recommended` + `typescript-eslint` recommended +
      `eslint-plugin-astro` flat/recommended + `jsx-a11y` recommended scoped to `**/*.tsx`;
      ignore `dist/`, `.astro/`.
- [ ] Add scripts: `"lint": "eslint .", "format": "prettier --write .", "format:check": "prettier --check ."`
- [ ] Commit: `chore: add prettier and eslint`

**Acceptance:** Both tools run clean on the scaffold.
**Verify:** `npm run lint && npm run format:check` → both exit 0.

### Task 1.3: Content collections schema (NOT delegated)

**Intent:** Typed content layer for skills and projects — the data model everything else keys
off (graph, cards, chips, filtering).
**Files:** Create: `src/content.config.ts`, `src/data/skills.json`,
`src/content/projects/bughouse.md`, `src/content/projects/marketing-site.md`,
`src/content/projects/engagement-tracker.md`
**Depends on:** 1.1

- [ ] `src/content.config.ts`:

```ts
import { defineCollection, reference, z } from 'astro:content';
import { file, glob } from 'astro/loaders';

const skills = defineCollection({
  loader: file('src/data/skills.json'),
  schema: z.object({
    id: z.string(),
    label: z.string(),
    category: z.enum(['language', 'framework', 'platform', 'practice']),
    weight: z.number().min(1).max(5).default(3),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    summary: z.string().max(280),
    role: z.string(),
    stack: z.array(reference('skills')).min(1),
    links: z
      .object({ live: z.string().url().optional(), repo: z.string().url().optional() })
      .default({}),
    featured: z.boolean().default(false),
    order: z.number().int().default(99),
    placeholder: z.boolean().default(true), // flips to false when real copy lands
  }),
});

export const collections = { skills, projects };
```

- [ ] `skills.json`: entries for at least `elixir`, `phoenix-liveview`, `typescript`, `react`,
      `nextjs`, `astro`, `nodejs`, `postgres`, `flyio`, `vercel`, `cloudflare`, `webgl`,
      `threejs`, `graphql`, `tailwind`, `cicd` — labels/categories/weights; Viren will prune.
- [ ] Three project files, frontmatter real (title, stack, links), body copy
      `{{TODO: real copy from Viren — see CONTENT-TODO.md}}`, `placeholder: true`.
- [ ] Commit: `feat: content collections for skills and projects`

**Acceptance:** `getCollection('projects')` type-checks; invalid frontmatter fails the build;
every `stack` reference resolves to a real skill id.
**Verify:** `npx astro check && npm run build` → 0 errors.
**Execution note (2026-08-30):** the broken-reference negative test does NOT fail the build at
this task — reference integrity is only enforced when a page resolves `stack` via
`getEntries()`, which first happens in Task 2.4. The negative test moved there (see Task 2.4
verify).

### Task 1.4: Shared event contract + CI check workflow

**Intent:** Lock the island↔page event names before anything consumes them; get `astro check`
red/green in CI from day one.
**Files:** Create: `src/lib/events.ts` (exact content from **Interfaces** section above),
`.github/workflows/ci.yml`
**Depends on:** 1.2, 1.3

- [ ] `ci.yml`: on `push` + `pull_request` → checkout, `actions/setup-node@v4` (node 22, npm
      cache), `npm ci`, `npx astro check`, `npm run lint`, `npm run format:check`,
      `npm run build`. (Vitest/Playwright/budgets appended by later tasks.)
- [ ] Commit + push a branch and open a throwaway PR to see CI run: `chore: ci check workflow`

**Acceptance:** CI green on GitHub for the PR.
**Verify:** `gh run watch` on the triggered run → conclusion `success`.

---

# Phase 2 — Static site, complete and shippable (ends live)

> Dispatch subagents **R1, R2, R3** now, in parallel (briefs in appendix). They work in
> isolated routes/docs and don't block or touch anything in this phase. Review their reports
> when they land; they gate Phases 4–5, not Phase 2.

### Task 2.1: Design tokens + global CSS (vanilla CSS — recommendation and why)

**Intent:** Establish the visual system as custom properties; no Tailwind.
**Recommendation: vanilla CSS with custom properties.** Justification: this is a solo,
art-directed, essentially single-page site — Tailwind's wins (team consistency, not naming
things, design-system guardrails) don't apply, and its costs do: utility soup inside `.astro`
templates that GSAP/scroll-driven keyframes can't reach. Custom properties are the shared
currency between CSS, GSAP tweens (`gsap.to(el, {'--glow': 1})`), and the WebGL islands
(read via `getComputedStyle` so canvas colors match the page theme exactly). Scroll-driven
animations and view transitions need real stylesheets and `@keyframes` anyway. Zero build
dependency. If this later grows into a many-page site, revisit.
**Files:** Create: `src/styles/tokens.css` (color scale incl. canvas-shared accent colors,
type scale via `clamp()`, spacing scale, radii, `--motion-ok: 1` flipped by
reduced-motion media query), `src/styles/global.css` (reset, base typography, focus-visible
styles, selection, `::target-text`), font files under `public/fonts/` (one variable display
face, WOFF2, subset ≤ 60 KB, preloaded; system stack for body).
**Depends on:** 1.1
**Acceptance:** Tokens imported in a base layout; `:focus-visible` produces a visible ring on
every interactive element; fonts self-hosted, no external requests.
**Verify:** `npm run build && npx astro preview` → view page, tab through, ring visible;
network panel shows zero third-party requests.

### Task 2.2: Base layout + navigation + footer

**Intent:** HTML skeleton every page shares: meta, fonts preload, skip-link, nav, footer.
**Files:** Create: `src/layouts/Base.astro`, `src/components/SiteNav.astro`,
`src/components/SiteFooter.astro`
**Depends on:** 2.1
**Acceptance:** Skip-link is first focusable element and jumps to `#main`; `lang="en"`;
title/description props; nav links are plain anchors (`/#work`, `/#skills`, `/resume.pdf`).
**Verify:** `npm run build` exits 0; Playwright later (2.9) asserts skip-link; manual tab check.

### Task 2.3: Hero section (static version)

**Intent:** The 20-second pitch: name, one-line positioning, two CTAs (view work / resume) —
pure HTML/CSS. The WebGL hero mounts *behind* this later; this text **is the LCP** forever.
**Files:** Create: `src/components/Hero.astro`; Modify: `src/pages/index.astro`
**Depends on:** 2.2
**Acceptance:** Copy uses `{{TODO}}` markers for positioning line; headline renders in < 1 s on
throttled mobile (it's server-rendered text with a preloaded font — verify no render-blocking
resources); hero has a reserved `<div data-hero-canvas>` slot with `aria-hidden="true"` sized
via aspect-ratio so later canvas mount causes zero CLS.
**Verify:** `npm run build`; Lighthouse (Task 2.9) reports LCP element is the `<h1>`.

### Task 2.4: Selected-work section + project cards

**Intent:** Project list rendered from the collection — the thing the skill graph will filter.
**Files:** Create: `src/components/ProjectCard.astro`; Modify: `src/pages/index.astro`
**Depends on:** 1.3, 2.2
**Acceptance:** Cards sorted by `order`; each card root carries
`data-project data-skills="elixir,phoenix-liveview,flyio"` (comma-joined stack ids — the
filtering contract with `filter-projects.ts`); card links work; placeholder copy visibly
marked; `placeholder: true` projects render a subtle "copy pending" badge in dev builds only
(`import.meta.env.DEV`).
**Verify:** `npm run build`; `grep -c 'data-project' dist/index.html` → `3`. Also run the
negative test deferred from Task 1.3: temporarily change one project's `stack` entry to
`not-a-real-skill` → `npm run build` must FAIL (cards resolve references via `getEntries`) →
revert.

### Task 2.5: Skills section — server-rendered chips + graph fallback slot

**Intent:** The non-pointer, no-JS path to the skill-graph information, shipped before any
WebGL exists.
**Files:** Create: `src/components/SkillChips.astro`, `src/components/GraphFallback.astro`;
Modify: `src/pages/index.astro`
**Depends on:** 1.3, 1.4, 2.4
**Acceptance:** Chips are real `<button>` elements (one per skill used by ≥1 project) with
`aria-pressed="false"`, rendered server-side; a small inline page script (`<script>` in the
component — vanilla TS, no framework) dispatches `EV.skillSelect` on click and toggles
`aria-pressed`; with JS disabled the chips are inert but the full project list is visible, so
no information is lost. `GraphFallback.astro` reserves the graph's box
(`aspect-ratio`, `data-graph-slot`) and for now shows the skills as a static styled list —
replaced by SVG in Task 4.2 and canvas in Phase 4.
**Verify:** `npm run build`; in browser with JS disabled (`--headless
--blink-settings=scriptEnabled=false` via Playwright in 2.9): all three project cards and all
chips visible.

### Task 2.6: Page-side filter script

**Intent:** The listener that makes chips (and later the graph) filter the project list.
**Files:** Create: `src/scripts/filter-projects.ts`; Modify: `src/pages/index.astro` (load via
`<script src>`; Astro bundles it)
**Depends on:** 2.4, 2.5
**Acceptance:** On `EV.skillSelect {skillId}`: non-matching cards are never removed or
`hidden` (that would trigger layout); they animate out with opacity/transform (CSS class
`.is-filtered { opacity:.15; transform:scale(.98); pointer-events:none }`, transition on
transform/opacity only) and get `aria-hidden="true"` + `inert`; `skillId: null` restores all.
Chips reflect state (`aria-pressed`). A live region (`aria-live="polite"`) announces
"Showing N projects for {skill}".
**Verify:** `npx vitest run tests/unit/filter.test.ts` — jsdom test: dispatch event, assert
class/aria changes; plus 2.9 e2e.

### Task 2.7: Project detail pages

**Intent:** One page per project with room for real copy (see Open Question 3).
**Files:** Create: `src/pages/projects/[slug].astro`
**Depends on:** 1.3, 2.2
**Acceptance:** `getStaticPaths` from the collection; renders title, role, stack (linking back
to `/#skills`), body, links; builds 3 pages.
**Verify:** `npm run build` → `dist/projects/bughouse/index.html` exists (×3).

### Task 2.8: 404 page + CONTENT-TODO.md

**Intent:** Never a dead end; single tracked list of every placeholder.
**Files:** Create: `src/pages/404.astro`, `CONTENT-TODO.md`
**Depends on:** 2.2
**Acceptance:** 404 links home; `CONTENT-TODO.md` enumerates every `{{TODO}}` with file:line
and what's needed (positioning line, 3 project bodies, about blurb, resume PDF, headshot/OG
decision, final skill list pruning).
**Verify:** `grep -rn '{{TODO' src/ | wc -l` matches the count of items in `CONTENT-TODO.md`.

### Task 2.9: E2E + accessibility baseline (Playwright)

**Intent:** Encode Phase 2's quality bars as tests that run in CI forever.
**Files:** Create: `playwright.config.ts`, `tests/e2e/content.spec.ts`,
`tests/e2e/nojs.spec.ts`, `tests/e2e/a11y.spec.ts`; Modify: `.github/workflows/ci.yml` (add
`npx playwright install --with-deps chromium` + `npx playwright test`), `package.json`
**Depends on:** 2.3–2.8

- [ ] `nojs.spec.ts`: context with `javaScriptEnabled: false` → h1, 3 project cards, chips,
      nav, footer all visible; every nav anchor resolves.
- [ ] `content.spec.ts`: chips filter cards (aria-hidden toggles); skip-link focuses `#main`;
      keyboard: tab reaches every chip/card link, `:focus-visible` computed outline ≠ none.
- [ ] `a11y.spec.ts`: `@axe-core/playwright` scan on `/` and one project page → zero serious/
      critical violations.
- [ ] Add Lighthouse locally (not CI yet): `npm i -D @lhci/cli`; `lighthouserc.json` asserting
      `categories:performance >= 0.9` (mobile emulation, `astro preview` server). Script:
      `"lh": "lhci autorun"`.

**Acceptance:** All specs pass locally and in CI; `npm run lh` ≥ 90 mobile perf.
**Verify:** `npx playwright test` → all pass; `npm run lh` → assertions pass.

### Task 2.10: Minimal Wrangler config (NOT delegated)

**Intent:** Just enough config to serve `dist/` as a Worker with static assets.
**Files:** Create: `wrangler.jsonc`; Modify: `.gitignore` (add `.wrangler/`)
**Depends on:** 2.9

```jsonc
{
  "name": "vcsawant-site",
  "compatibility_date": "2026-08-01",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "404-page",
    "html_handling": "auto-trailing-slash"
  },
  "workers_dev": true
}
```

**Acceptance:** `npx wrangler deploy --dry-run` validates (no auth needed for dry-run).
**Verify:** `npm run build && npx wrangler deploy --dry-run` → exits 0.

> **CP-3 — HARD STOP.** Viren runs `wrangler login` himself (or `! npx wrangler login` in this
> session), and approves the first production deploy.

### Task 2.11: First live deploy (manual, from Viren's machine)

**Intent:** Working site on the internet before a single shader exists.
**Files:** none
**Depends on:** 2.10, CP-3
**Acceptance:** Site live at `https://vcsawant-site.<account>.workers.dev`; 404 route works;
assets load.
**Verify:** `npm run build && npx wrangler deploy` then
`curl -s -o /dev/null -w '%{http_code}' https://vcsawant-site.<account>.workers.dev/` → `200`,
and `/nope` → `404` with the custom page body.

**Phase 2 boundary:** dispatch **CR-2** code-review subagent (brief in appendix) on
`git diff archive/gatsby-2018..HEAD` scoped to Phase 1–2 acceptance criteria. Address findings
before Phase 3.

---

# Phase 3 — Deploy pipeline (NOT delegated)

### Task 3.1: Deploy workflow — production on `main`

**Intent:** Every merge to `main` ships automatically.
**Files:** Create: `.github/workflows/deploy.yml`
**Depends on:** 2.11

```yaml
name: Deploy
on:
  push: { branches: [main] }
  pull_request:
concurrency: deploy-${{ github.ref }}
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions: { contents: read, pull-requests: write }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run build
      - name: Deploy (production)
        if: github.ref == 'refs/heads/main'
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: deploy
      - name: Upload preview version (PR)
        if: github.event_name == 'pull_request'
        id: preview
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: versions upload
      - name: Comment preview URL
        if: github.event_name == 'pull_request'
        uses: marocchino/sticky-pull-request-comment@v2
        with:
          message: "Preview: ${{ steps.preview.outputs.deployment-url }}"
```

**Acceptance:** Push to `main` deploys; PRs get a version preview URL commented.
**Depends on:** CP-4 (secrets exist).
**Verify:** `gh run watch` green on a `main` push; open a trivial PR → sticky comment contains
a `*.workers.dev` preview URL that serves the site.

### Task 3.2: Token provisioning instructions (CP-4)

**Intent:** Tell Viren exactly what to create; never touch the values.
**Depends on:** 3.1 written
**Instructions to Viren (HARD STOP until done):**
1. Cloudflare dashboard → My Profile → API Tokens → Create Token → start from **"Edit
   Cloudflare Workers"** template. Permissions needed: **Account → Workers Scripts → Edit**.
   (When the custom domain lands in 3.5, edit the token to add **Zone → Workers Routes → Edit**
   and **Zone → DNS → Edit** scoped to the `vcsawant.com` zone only.)
2. `gh secret set CLOUDFLARE_API_TOKEN` and `gh secret set CLOUDFLARE_ACCOUNT_ID` (account ID
   is on the Workers overview page; it's an identifier, not a secret, but a secret slot keeps
   the workflow uniform).
**Verify:** `gh secret list` shows both names (values never displayed).

### Task 3.3: Cache headers for hashed assets

**Intent:** Immutable caching for Astro's content-hashed `/_astro/*` files; sane defaults
elsewhere.
**Files:** Create: `public/_headers`
**Depends on:** 3.1

```
/_astro/*
  Cache-Control: public, max-age=31536000, immutable
/fonts/*
  Cache-Control: public, max-age=31536000, immutable
/fallback/*
  Cache-Control: public, max-age=604800
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
```

**Acceptance:** Headers served by the Worker (Workers static assets honors `_headers` in the
asset directory; Astro copies `public/` → `dist/`).
**Verify:** after deploy, `curl -sI https://<url>/_astro/<any-built-file> | grep -i
cache-control` → `immutable`; `curl -sI https://<url>/ | grep -i x-content-type` → `nosniff`.

### Task 3.4: Branch protection + PR flow

**Intent:** `main` only moves via green PRs from here on.
**Depends on:** 3.1
**Verify:** `gh api repos/vcsawant/vcsawant.github.io/branches/main/protection` shows required
status checks `CI` (and later `budgets`); a direct push to `main` is rejected.

### Task 3.5: Custom domain (after CP-5)

**Intent:** `vcsawant.com` + `www` on the Worker.
**Files:** Modify: `wrangler.jsonc` — add
`"routes": [{ "pattern": "vcsawant.com", "custom_domain": true }, { "pattern": "www.vcsawant.com", "custom_domain": true }]`;
Modify: `astro.config.mjs` `site` if TLD changed.
**Depends on:** CP-5 (zone active), 3.2 (token has zone scopes)
**Acceptance:** Both hostnames serve the site over HTTPS; `www` and apex both resolve (pick
apex as canonical; add a `www`→apex redirect via a Bulk Redirect rule Viren clicks, or accept
both).
**Verify:** `curl -s -o /dev/null -w '%{http_code}' https://vcsawant.com/` → `200`; cert valid
(`curl -v` shows no TLS errors).

### Task 3.6 (optional — Open Question 2): GitHub Pages fallback mirror

**Intent:** Keep `vcsawant.github.io` serving the *current* site as the free fallback.
**Files:** Modify: `.github/workflows/deploy.yml` — add a step on `main`:
`peaceiris/actions-gh-pages@v4` publishing `dist/` to branch `gh-pages`; then Viren flips
Pages source to `gh-pages` and removes the old custom-domain setting; delete stale `master`
afterward.
**Verify:** `curl -s https://vcsawant.github.io/ | grep -o '<h1[^>]*>'` matches production.

---

# Phase 4 — Skill graph island

> Prerequisite: read `docs/rnd/layout/report.md` (R2 deliverable). The tasks below assume its
> default recommendation — **build-time precomputed base layout + `d3-force-3d` warm ticks in
> a Web Worker for reorganization** — and name the seams where a different recommendation would
> slot in. The graph is small (~20 skills + 3 projects ≈ 25 nodes, ~40 edges), so the worker
> exists to keep reorganization jank-free on low-end phones, not because the math is heavy.

### Task 4.1: Graph derivation (pure, tested)

**Intent:** One function from collections → `GraphData`; used by island, SVG fallback, chips.
**Files:** Create: `src/lib/graph.ts`, `tests/unit/graph.test.ts`
**Depends on:** 1.3, 1.4
**Interfaces:** Produces `buildGraph(skills, projects): GraphData` exactly as declared in the
header interfaces section.

- [ ] Failing test first: nodes = skills-used-by-≥1-project + projects; edge per
      (project, stack-entry); project nodes get `category:'project'`,
      `weight = 2 + stack.length/4`; orphan skills excluded; ids stable and unique.
- [ ] `npx vitest run tests/unit/graph.test.ts` → FAIL, implement, → PASS.
- [ ] Commit: `feat: graph derivation from content collections`

**Verify:** `npx vitest run` green; `npx astro check` green.

### Task 4.2: Build-time layout + server-rendered SVG fallback

**Intent:** Compute a 3D force layout at build; project to 2D for a static SVG that ships in
HTML — this is simultaneously the no-JS visual, the reduced-motion "static render of the
graph", and the WebGL island's starting positions (no layout pop on hydrate).
**Files:** Create: `scripts/compute-layout.mjs` (runs `d3-force-3d` to convergence, writes
`src/data/layout.json` — run via `"prebuild"` npm script and committed so dev doesn't need it),
Modify: `src/components/GraphFallback.astro` (inline SVG: circles + lines from layout.json,
labels for weight ≥ 4 nodes, colors from tokens)
**Depends on:** 4.1, R2 report
**Acceptance:** SVG renders in `dist/index.html` (view-source shows `<svg`); deterministic
(seeded RNG) so rebuilds don't churn git; nodes non-overlapping at default weights.
**Verify:** `npm run build && grep -c '<svg' dist/index.html` → ≥ 1; run build twice,
`git diff --exit-code src/data/layout.json` → clean.

### Task 4.3: Island shell — mount, render gate, lifecycle

**Intent:** The R3F canvas mounts over the SVG only when it's safe and worth it; all pause
behavior lives here.
**Files:** Create: `src/islands/skill-graph/SkillGraph.tsx`,
`src/islands/skill-graph/use-render-gate.ts`, `src/lib/webgl.ts`; Modify:
`src/pages/index.astro` — mount as `<SkillGraph client:visible />` where the component's SSR
output is `null` (it renders nothing until hydrated *and* the gate passes), so the
server-rendered SVG fallback beneath it is always the initial paint
**Depends on:** 4.2
**Interfaces:** Consumes `GraphData` + `layout.json` positions as props (serialized by Astro);
`src/lib/webgl.ts` produces `detectTier(): 'full' | 'lite' | 'none'` — `none` = no WebGL2
context or known-bad UA (LinkedIn Android webview: UA contains `LinkedInApp` + Android),
`lite` = mobile / `navigator.hardwareConcurrency <= 4`.

- [ ] Canvas config: `dpr={[1, 1.5]}`, `frameloop="demand"`, `gl={{ antialias: false,
      powerPreference: 'low-power' }}`, transparent clear color.
- [ ] `use-render-gate.ts`: starts an `invalidate()` RAF loop only while (IntersectionObserver
      says visible) && (`document.visibilityState === 'visible'`) && (!reduced-motion) &&
      (tier ≠ none); exposes `kick()` for interaction-driven invalidation.
- [ ] On mount success: dispatch `EV.graphReady {mode:'webgl'}` → CSS fades SVG out
      (opacity only, stays in DOM for a11y, `aria-hidden` canvas).
- [ ] Tier `none`: render nothing, dispatch `{mode:'fallback'}`; SVG stays. Reduced motion:
      same, `{mode:'static'}`.
- [ ] Commit.

**Acceptance:** With WebGL2: canvas appears when scrolled into view, SVG fades; with
`--use-gl=swiftshader-webgl` disabled context (Playwright launch arg forcing failure): SVG
remains, zero console errors, no black rectangle.
**Verify:** `tests/e2e/graph-fallback.spec.ts` — two Playwright projects, one with WebGL
blocked (`launchOptions: { args: ['--disable-webgl'] }`) asserting SVG visible & no canvas;
one normal asserting canvas visible. `npx playwright test graph-fallback` → pass.

### Task 4.4: Instanced nodes + edges

**Intent:** All nodes in one `InstancedMesh` (sphere geo, per-instance color/scale from
category/weight), all edges in one `LineSegments` buffer.
**Files:** Create: `src/islands/skill-graph/nodes.tsx`, `src/islands/skill-graph/edges.tsx`
**Depends on:** 4.3
**Acceptance:** 1 draw call for nodes + 1 for edges (verify via `gl.info.render.calls` logged
in dev); positions from `layout.json`; colors read from CSS custom properties at mount.
**Verify:** dev-mode console assert `calls <= 4` after first frame; visual check on `/`.

### Task 4.5: Idle drift + drag-to-spin with inertia

**Intent:** The graph feels alive and tactile.
**Files:** Create: `src/islands/skill-graph/drag.ts`; Modify: `SkillGraph.tsx`
**Depends on:** 4.4
**Acceptance:** Slow autonomous rotation (≈ 0.03 rad/s) when idle; pointer/touch drag rotates
the group directly (1:1 feel); release continues with velocity, exponential damping (~0.95/
frame) back to drift; drift pauses during drag; all under the render gate (no RAF when
offscreen); touch drag does not hijack vertical page scroll (`touch-action: pan-y` on canvas,
horizontal-intent detection before capturing).
**Verify:** `tests/e2e/graph-drag.spec.ts`: `page.mouse` drag → group rotation delta > drag
frames only (read via exposed `window.__graphDebug.rotationY` in dev builds); page still
scrolls vertically over the canvas on touch (Playwright touch scroll assertion).

### Task 4.6: Selection — raycast, reorganize, filter

**Intent:** The centerpiece behavior: tap a node → graph reorganizes around it, project list
filters.
**Files:** Create: `src/islands/skill-graph/layout.worker.ts`; Modify: `SkillGraph.tsx`,
`nodes.tsx`
**Depends on:** 4.5, 2.6
**Interfaces:** Worker protocol —
`postMessage({type:'reorganize', focusId, graph, positions})` →
`onmessage({type:'positions', positions: Float32Array})` streamed per tick batch; island lerps
instance matrices toward incoming targets (spring, ~600 ms settle).

- [ ] Raycast on pointer-up (not move) against the InstancedMesh; instanceId → node id.
- [ ] Selecting a skill node: worker re-runs force sim with focus node pinned near center,
      link strength boosted for its edges, others relaxed; island animates positions;
      selected node scales 1.4×, connected nodes full opacity, rest dimmed (instance color
      lerp).
- [ ] Dispatch `EV.skillSelect {skillId}` (project list filters via 2.6 — already built).
      Background tap or re-tap → `{skillId: null}`, layout returns to base `layout.json`.
- [ ] Also **listen** for `EV.skillSelect` (chips dispatch it) and run the same focus
      animation — chips and canvas stay in sync both directions. Guard against echo loops
      (ignore events whose `skillId` already matches current selection).
- [ ] Commit.

**Acceptance:** Tap Elixir node → bughouse card full, other cards dimmed+inert, chip
`aria-pressed=true`, graph re-centers on Elixir within ~1 s; Escape or background tap
restores.
**Verify:** `tests/e2e/graph-select.spec.ts`: click a chip → assert card filtering AND
`window.__graphDebug.focusId === 'elixir'`; click canvas center-node path via debug hook →
chip pressed. Run: `npx playwright test graph-select` → pass.

### Task 4.7: Keyboard & screen-reader path

**Intent:** Non-pointer access to identical information (Global Constraint).
**Files:** Modify: `SkillChips.astro` (roving focus, `Escape` clears), `SkillGraph.tsx`
(canvas `aria-hidden="true"`, `tabIndex={-1}`)
**Depends on:** 4.6
**Acceptance:** Every graph capability reachable via chips: select (Enter/Space), clear
(Escape), state announced via the 2.6 live region; axe scan still zero serious/critical; the
canvas is invisible to AT.
**Verify:** `npx playwright test a11y` (extended with chip keyboard spec) → pass.

### Task 4.8: Postprocessing pass (conditional)

**Intent:** Subtle bloom on nodes — desktop `full` tier only.
**Files:** Create: `src/islands/skill-graph/effects.tsx` (lazy `import()` of
`@react-three/postprocessing` only when tier === 'full')
**Depends on:** 4.6
**Acceptance:** Bloom visible on desktop; `lite` tier never downloads the postprocessing
chunk (network panel); frame time on 6× CPU-throttled desktop profile stays < 8 ms during
drift.
**Verify:** `npm run build && node scripts/check-bundle.mjs` (postprocessing in separate
chunk); Chrome performance trace during drift → no frame > 16 ms at 6× throttle. If it fails
the budget, cut the effect — it's the first thing sacrificed, by design.

**Phase 4 boundary:** dispatch **A4 perf audit** + **CR-4 code review** subagents (briefs in
appendix). Fix confirmed findings before Phase 5.

---

# Phase 5 — Hero effects

> Prerequisite: R1 + R3 reports and working spike routes exist under `/rnd/*`. Phase 5 is
> integration, not invention. The two effects share one canvas/island
> (`src/islands/hero/HeroScene.tsx`) mounted behind the hero text: particles render in the
> scene; the fluid field distorts them (and only them — text is DOM, never in canvas).

### Task 5.1: Hero island shell

**Intent:** Same lifecycle discipline as the graph island, mounted `client:idle` (hero is
above the fold — but the canvas must not compete with LCP; `client:idle` + gate ensures text
paints first).
**Files:** Create: `src/islands/hero/HeroScene.tsx`; Modify: `src/components/Hero.astro`
**Depends on:** 4.3 (`use-render-gate` + `webgl.ts` reused)
**Acceptance:** LCP is still the `<h1>` (canvas paints after); tier `none` → poster image
(placeholder until R4 delivers final assets) via `<picture>` swap; reduced motion → poster.
**Verify:** `npm run lh` → LCP element unchanged from Phase 2 baseline; Playwright
WebGL-blocked project → poster visible.

### Task 5.2: Particle morph integration

**Intent:** Port R3's spike into the island: knight → "VS" initials → graph wireframe, cycling
with dwell, eased with per-particle noise.
**Files:** Create: `src/islands/hero/particles.tsx`, `src/islands/hero/morph-targets.ts`
(loads packed target positions from R3's generated `public/morph-targets.bin` — Float32Array,
3 targets × N points), plus R3's generation script committed under `scripts/`.
**Depends on:** 5.1, R3 report
**Acceptance:** Counts: ≥ 20 k desktop / ≤ 8 k `lite` tier; morph runs in vertex shader (CPU
per-frame work is uniforms only); `frameloop` stays `demand` with the gate's RAF driving
morphs only while visible; measured cost within R3's reported budget (< 4 ms/frame at 6× CPU
throttle, dpr 1).
**Verify:** trace during morph on throttled profile → frame < 16 ms; blur tab → RAF stops
(assert via `window.__heroDebug.frames` counter not advancing).

### Task 5.3: Fluid cursor distortion integration

**Intent:** Port R1's spike: pointer/touch smear advects a low-res velocity/dye field; field
displaces hero particles (uniform sampler in the particle material) — one composed effect.
**Files:** Create: `src/islands/hero/fluid.ts` (sim ping-pong FBOs ≤ 256², sim steps only
while pointer active or field energy above epsilon, then sleeps)
**Depends on:** 5.2, R1 report
**Acceptance:** Desktop pointer trails distort particles; mobile touch smears without
blocking scroll (`touch-action: pan-y`, passive listeners); sim fully idle (zero RAF) after
~1.5 s without input; combined hero cost within budget above.
**Verify:** trace: idle hero after input decay → 0 long tasks, RAF counter static; interaction
→ smooth on throttled profile.

**Phase 5 boundary:** dispatch **A5 perf audit** + **CR-5 code review**. The audit explicitly
re-checks LCP and total blocking time on `/` with both islands live.

---

# Phase 6 — Motion choreography

### Task 6.1: Motion foundation — `gsap.matchMedia` + lazy load

**Intent:** GSAP loads only when needed and never for reduced-motion users.
**Files:** Create: `src/scripts/motion.ts`; Modify: `src/pages/index.astro` (dynamic
`import('./motion')` behind `matchMedia('(prefers-reduced-motion: no-preference)')` +
`requestIdleCallback`)
**Depends on:** Phase 5
**Acceptance:** With reduced motion: GSAP chunk never downloaded (network assert); without:
loads after idle, all tweens registered inside `gsap.matchMedia()` blocks so OS-level toggle
mid-session kills them; only `transform`/`opacity`/custom-property tweens anywhere
(`grep -rE 'gsap\.(to|from|fromTo)' src/scripts | grep -vE 'x:|y:|scale|rotate|opacity|--'` →
empty).
**Verify:** Playwright `reducedMotion: 'reduce'` context → no request matching `motion`;
default context → chunk loads.

### Task 6.2: ScrollTrigger sequence — selected-work pin

**Intent:** The one designed multi-step sequence: work section pins briefly while cards stagger
in and the section heading counter advances (1/3 → 3/3).
**Files:** Modify: `src/scripts/motion.ts`, `src/components/ProjectCard.astro` (data hooks)
**Depends on:** 6.1
**Acceptance:** Pin uses `pinSpacing` correctly (no CLS — Lighthouse CLS < 0.1 stands);
transforms/opacity only; scrubbed, not timed, so it never traps slow scrollers; sequence
absent under reduced motion (cards simply visible).
**Verify:** `npm run lh` → CLS assertion passes; manual scroll check; reduced-motion Playwright
→ cards visible with no inline transform styles.

### Task 6.3: CSS scroll-driven reveals

**Intent:** Compositor-only reveals for headings/cards/footer + a scroll progress bar.
**Files:** Modify: `src/styles/global.css`
**Depends on:** 2.x sections
**Acceptance:** Every rule wrapped in `@supports (animation-timeline: view())` **and**
`@media (prefers-reduced-motion: no-preference)`; elements are fully visible when unsupported
(animate *from* visible base state using `animation-fill-mode` correctly — i.e., base styles =
final state); progress bar is `transform: scaleX` on a fixed element.
**Verify:** Toggle `animation-timeline` off in DevTools / run Safari 17 via Playwright WebKit →
all content visible; axe scan unchanged.

### Task 6.4: Lenis evaluation (spike, default NO)

**Intent:** Decide with evidence, on real iOS, whether smooth scroll earns its risk.
**Files:** spike branch `spike/lenis` only — not merged unless it wins
**Depends on:** 6.2
**Acceptance:** A written verdict in `docs/rnd/lenis-verdict.md`: test on Viren's actual
iPhone (deployed preview URL) — momentum feel, rubber-banding, ScrollTrigger sync, `view()`
timeline compatibility, keyboard/AT scrolling. **Default is NO** — merged only if every check
passes on device and Viren likes the feel. ScrollTrigger works fine on native scroll.
**Verify:** verdict doc exists with per-check results; branch merged or deleted accordingly.

### Task 6.5: View transitions between pages

**Intent:** Index ↔ project pages morph (card → hero of detail page).
**Files:** Modify: `src/layouts/Base.astro` (Astro `<ClientRouter />`),
`ProjectCard.astro` + `[slug].astro` (`transition:name={slug}` on card/title pairs)
**Depends on:** 2.7
**Acceptance:** Navigation animates in supporting browsers, is instant-but-functional
elsewhere; islands' lifecycle survives navigation (graph re-gates on return — test it);
reduced motion → no transition animation (Astro respects it by default; verify).
**Verify:** Playwright: navigate index → project → back; canvas re-mounts, no console errors;
reduced-motion context shows no transition pseudo-elements.

**Phase 6 boundary:** dispatch **A6 perf audit** + **CR-6 code review**.

---

# Phase 7 — Performance & fallback hardening

### Task 7.1: Bundle budgets in CI

**Intent:** Regressions fail PRs, not production.
**Files:** Create: `scripts/check-bundle.mjs`; Modify: `.github/workflows/ci.yml`,
`package.json` (`"budgets": "node scripts/check-bundle.mjs"`)
**Depends on:** Phases 4–6 merged
**Budgets (gzip):** non-island page JS ≤ 25 KB; GSAP chunk ≤ 50 KB; hero island total ≤ 90 KB;
skill-graph island total (three+R3F+graph code, excl. lazy postprocessing) ≤ 260 KB;
postprocessing lazy chunk ≤ 60 KB; layout.json + morph-targets.bin ≤ 200 KB raw. Script maps
`dist/_astro/*` chunks to entry points via the build manifest, gzips, compares, prints a
table, exits 1 on breach.
**Verify:** `npm run build && npm run budgets` → table + exit 0; add 300 KB junk import
temporarily → exit 1 → revert.

### Task 7.2: Fallback assets (delegate R4) + wiring

**Intent:** Final WebM loops + posters for hero and graph, wired into the detection tiers.
**Files:** R4 creates `public/fallback/{hero,graph}.{webm,avif,jpg}` +
`docs/rnd/fallback-report.md`; main session modifies `Hero.astro`, `GraphFallback.astro` to
use them (`<video muted loop playsinline autoplay>` with poster attr, only at tier `none`;
`prefers-reduced-motion` gets the poster, never the video).
**Depends on:** Phases 4–5 (scenes exist to capture)
**Acceptance:** Each WebM ≤ 1.5 MB, ≥ 720 p, seamless loop; posters ≤ 60 KB AVIF with JPEG
fallback; no black rectangle in any tier × motion-preference combination (6 combinations,
all e2e-tested).
**Verify:** `npx playwright test fallbacks` — matrix spec: {webgl on/off} × {reduced-motion
on/off} → asserts exactly one of canvas/video/poster visible per combination;
`ls -la public/fallback` sizes within budget.

### Task 7.3: Real-device test pass

**Intent:** The bars hold on actual hardware, including LinkedIn's in-app browser.
**Files:** Create: `docs/audits/device-matrix.md` (results table)
**Depends on:** 7.2 deployed to a preview URL
**Procedure:** Viren's devices + BrowserStack free tier if needed. Matrix: iOS Safari (recent),
Android Chrome (mid-range), **LinkedIn in-app browser on both platforms** (send the preview
URL in a LinkedIn DM to self, open in-app), each recording: content readable pre-JS, LCP feel,
graph or correct fallback, scroll unbroken, touch drag vs page scroll.
**Acceptance:** No blocker rows; LinkedIn Android shows fallback or working canvas — never
black.
**Verify:** matrix doc complete, every row filled with pass/fail + notes; blockers fixed and
re-tested.

### Task 7.4: Lighthouse CI as a required check

**Intent:** The ≥ 90 mobile bar enforced permanently.
**Files:** Modify: `.github/workflows/ci.yml` (lhci job against `astro preview`),
`lighthouserc.json` (assert performance ≥ 0.9, accessibility ≥ 0.95, CLS ≤ 0.1, LCP element
snapshot audit ≠ canvas)
**Depends on:** 7.1
**Verify:** CI run green with scores printed in job summary; branch protection updated to
require it.

**Phase 7 boundary:** **CR-7 code review** (final full-codebase pass).

---

# Phase 8 — Launch

### Task 8.1: Meta + OG
`src/layouts/Base.astro`: canonical, description, `og:*`/`twitter:*`; `public/og.png`
1200×630 designed from a graph render (R4 can supply the render; composition done in-session).
**Verify:** `npx playwright test meta` asserts tags; paste preview URL into
opengraph.xyz-style checker manually.

### Task 8.2: Sitemap + robots
`npx astro add sitemap`; `public/robots.txt` pointing at `/sitemap-index.xml`.
**Verify:** `npm run build && test -f dist/sitemap-index.xml && cat dist/robots.txt`.

### Task 8.3: Resume PDF
`public/resume.pdf` (current one from Viren — CONTENT-TODO), nav + hero CTA link.
**Verify:** `curl -o /dev/null -sw '%{http_code} %{content_type}' <url>/resume.pdf` →
`200 application/pdf`.

### Task 8.4: Content finalization
Viren supplies copy; replace every `{{TODO}}`, flip `placeholder: false`, empty
`CONTENT-TODO.md` to "done" state.
**Verify:** `grep -rn '{{TODO' src/ | wc -l` → `0`; build green.

### Task 8.5: 404 polish
Already exists (2.8); add a small static graph SVG easter egg + link home.
**Verify:** deployed `/nope` → styled page, `404` status.

### Task 8.6: Analytics
Cloudflare Web Analytics: Viren enables in dashboard, pastes the beacon token (not a secret)
into `Base.astro` snippet, loaded with `defer` — excluded for reduced-data users
(`prefers-reduced-data` check is a nicety, include if trivial).
**Verify:** dashboard shows a pageview from a test visit; Lighthouse unaffected (re-run
`npm run lh`).

### Task 8.7: Final Lighthouse + full test sweep
**Verify:** on production URL: `npx lighthouse https://vcsawant.com --preset=perf
--form-factor=mobile --screenEmulation.mobile --view` → performance ≥ 90; `npx playwright
test` full suite green against production (`BASE_URL=https://vcsawant.com`).

### Task 8.8: README
**Files:** Create: `README.md` — architecture overview (islands diagram, event contract,
tiers/fallback matrix), local dev (`npm i && npm run dev`), content editing guide
(collections, how to add a project/skill), deploy story (CI, previews, manual
`wrangler deploy` escape hatch), budgets table, credits.
**Verify:** A newcomer can go clone → local dev → edit a project → PR preview using only the
README. Proofread against actual scripts in `package.json`.

> **CP-6 — HARD STOP. Final launch approval from Viren.** Then: merge, deploy, confirm
> domain, celebrate.

---

# Appendix — Subagent briefs

Each brief is complete on its own; the agent sees nothing else. All agents: work only in the
listed paths, commit on your own branch, no pushes, no deploys, no dependency additions
outside your sandbox route, and return your report path as your final output.

## Brief R1 — Fluid cursor distortion spike

You are prototyping a WebGL fluid/ink cursor effect for a personal site's hero section. The
site is Astro + one React island using `@react-three/fiber` (already installed). Your work is
isolated: create `src/pages/rnd/fluid.astro` mounting a self-contained R3F component under
`src/islands-rnd/fluid/` (a directory only you touch), plus a report.

**Requirements:** pointer trail on desktop / touch smear on mobile advects a distortion field
rendered over a placeholder image or particle grid. Classic stable-fluids (Pavel Dobryakov
lineage) is acceptable but consider cheaper fakes (advected noise, trail-buffer blur) — the
final consumer distorts a particle field, not full-screen imagery, so a velocity/dye texture
≤ 256² that a particle vertex shader can sample is the real deliverable. Sim must run only
while input is active or field energy > epsilon, then sleep (zero RAF). `dpr` ≤ 1.5. Must not
break vertical touch scrolling (`touch-action: pan-y`, passive listeners).

**Deliverable:** (1) working route `/rnd/fluid`; (2) `docs/rnd/fluid/report.md` containing:
approach chosen and rejected alternatives with reasons; full GLSL listings; sim texture
size/format; measured frame cost — median + p95 ms/frame during interaction, captured via
Chrome DevTools performance trace at **6× CPU throttle**, dpr 1, 390×844 viewport, numbers in
a table; sleep-verification (RAF count static after 2 s idle); integration notes (exact
uniforms/API you'd expose to a consuming particle material).
**Boundaries:** do not touch `src/pages/index.astro`, `src/components/`, `src/islands/`,
configs, or `package.json` (stdlib + already-installed three/R3F only).
**Verification you must run:** `npx astro check && npm run build` green with your route
included.

## Brief R2 — Force-layout research

You are choosing the layout strategy for a small 3D force-directed graph in a personal-site
React island (`@react-three/fiber`): ~25 nodes (technologies + projects), ~40 edges. Two
moments matter: initial layout (can be precomputed at build time) and **reorganization** —
when a user taps a node, it pins near center, its neighbors tighten, everything else relaxes,
animated smoothly on a mid-range phone.

**Evaluate at minimum:** (a) `d3-force-3d` run in a Web Worker at runtime; (b) GPGPU/shader
sim; (c) fully precomputed: build-time base layout + build-time per-focus layouts (25 stored
variants) with runtime interpolation only; (d) hybrid: build-time base + worker warm-ticks for
focus. Judge on: main-thread cost during reorganization at 6× CPU throttle, bundle weight,
implementation complexity, determinism/stability (nodes shouldn't teleport), and quality of
motion during the transition.

**Deliverable:** `docs/rnd/layout/report.md` with a comparison table, a clear recommendation,
and a **working prototype** under `docs/rnd/layout/prototype/` (standalone HTML or a
`src/pages/rnd/layout.astro` route) demonstrating base layout + focus reorganization on
25-node dummy data, with measured worker/main-thread timings. Include the exact worker message
protocol you recommend (the consuming code expects
`{type:'reorganize', focusId, graph, positions}` → streamed `{type:'positions',
positions: Float32Array}` — flag if you recommend different).
**Boundaries:** same as R1 — your route/dirs only; you may `npm i --no-save d3-force-3d` for
the prototype but record the dependency + its gzip cost in the report.

## Brief R3 — Particle morph spike

You are prototyping a morphing particle field for a personal site hero (Astro +
`@react-three/fiber`, installed). The field resolves between three targets, cycling with a
dwell: (1) a chess knight silhouette, (2) the initials "VS", (3) an abstract
graph-wireframe (clustered points + faint connecting lines is fine). Route:
`src/pages/rnd/particles.astro` + `src/islands-rnd/particles/` only.

**Requirements:** all morphing in the vertex shader (attributes: 3 target positions +
per-particle seed; uniforms: progress + time only). Targets generated by a **committed,
re-runnable script** (`scripts/rnd/generate-morph-targets.mjs`) that samples: knight — from an
SVG silhouette you draw or a public-domain mesh (record provenance/license in the report);
initials — from text rendered to canvas and sampled; graph — procedural clusters. Output one
packed `Float32Array` binary (`public/morph-targets.bin`) + loader code. Per-particle noise
offsets so morphs swirl rather than lerp linearly. Two count tiers: ~25 k and ~8 k.

**Deliverable:** working route + `docs/rnd/particles/report.md`: GLSL listings, target
generation methodology + asset provenance, binary format spec (offsets/strides), measured
frame cost during morph and at rest (median + p95, 6× CPU throttle, dpr 1, both count tiers,
table), and integration notes — specifically the uniform contract for accepting an external
distortion texture (a fluid sim will displace these particles later; design the material to
sample a `uDistortion` sampler2D and document it).
**Boundaries:** as R1. Verification: `npx astro check && npm run build` green.

## Brief R4 — Fallback asset generation

The site (Astro, deployed locally via `npm run dev`) has two WebGL scenes that need non-WebGL
fallbacks: the hero particle scene (route `/`, hero section) and the 3D skill graph (same
page, `#skills` section). Produce, for each: a seamless looping WebM (≤ 1.5 MB, ≥ 720 p,
6–10 s, VP9, no audio track) and a poster (AVIF ≤ 60 KB + JPEG fallback ≤ 120 KB, same frame).

**Method:** capture the live scenes — headless Chromium screen-record of the running dev
server (Playwright video or `ffmpeg` over a captured frame sequence via
`canvas.captureStream()`/CCapture-style frame dump — your choice, but the pipeline must be a
committed script `scripts/generate-fallbacks.mjs` so assets regenerate when scenes change).
Make the loop seamless: drive scene time via a query param the scenes already expose
(`?loop=8` — if missing, add ONLY a read-only query-param hook, nothing else) and capture
exactly one period. Output to `public/fallback/{hero,graph}.{webm,avif,jpg}`.

**Deliverable:** the six files + `docs/rnd/fallback-report.md` (pipeline usage, sizes, loop
period, ffmpeg invocations). **Boundaries:** do not modify detection/integration logic or
components — the main session wires assets in. Verification: play each WebM twice through in a
browser — no visible seam; `ls -la` sizes within budget.

## Brief A4/A5/A6 — Performance & accessibility audit (template — instantiate per phase)

You are auditing a deployed/local build of a personal site. You have **no implementation
context by design** — judge only what you observe. Report; do not fix; do not read `docs/PLAN.md`.

**Setup:** `npm ci && npm run build && npx astro preview` (or the preview URL you're given).
**Run every check and record evidence (numbers, screenshots, trace exports):**
1. Lighthouse mobile (`npx lighthouse http://localhost:4321 --form-factor=mobile
   --screenEmulation.mobile --throttling-method=simulate --output=json`): performance ≥ 90?
   What is the LCP element — it must be text or a static image, never a canvas. CLS ≤ 0.1?
2. Chrome trace at 6× CPU throttle while: scrolling the full page; dragging the graph;
   during a hero morph. Any frame > 16 ms? Long tasks > 50 ms?
3. Canvas lifecycle: blur the tab → do RAF callbacks stop (use Performance monitor)? Scroll
   canvases out of view → same check.
4. `prefers-reduced-motion: reduce` (emulate): scroll-linked motion gone? particle field
   gone? static graph render present? GSAP network chunk absent?
5. Disable JavaScript: all content legible and navigable?
6. Block WebGL (`--disable-webgl` launch flag): any black rectangle anywhere? Correct
   video/poster fallbacks?
7. Keyboard-only pass: every interactive element reachable, visible focus ring, skill
   information accessible without a pointer? axe-core scan: serious/critical count.
8. Animation hygiene: in DevTools, do any running animations touch layout properties
   (width/height/top/left/margin)?

**Deliverable:** `docs/audits/phase{N}-audit.md` — a pass/fail table against the eight checks
with evidence links/numbers, then a ranked findings list (severity, observed behavior,
where — URL + element). No code suggestions required; observed-behavior precision is the job.

## Brief CR-n — Phase-boundary code review (template)

You are reviewing a diff you did not write. Inputs you'll be given: the diff range (e.g.
`git diff main...phase-4`), and the acceptance-criteria excerpt for the phase (the reviewer
dispatching you pastes the relevant PLAN.md phase section — you do not read the full plan).
Review against, in order: (1) each task's stated acceptance criteria — met or not, with file:
line evidence; (2) the global constraints pasted in your prompt (no-JS content, transforms/
opacity only, island/page boundary via CustomEvents only, dpr/frameloop/pause rules, a11y);
(3) correctness (leaks: event listeners, RAF loops, workers, observers not cleaned up on
unmount/navigation — view transitions make this load-bearing); (4) simplicity (YAGNI
violations, dead spike code leaking out of `rnd/`). Run `npx astro check && npm run lint &&
npx vitest run && npx playwright test` yourself and report actual results.
**Deliverable:** verdict per acceptance criterion + findings ranked by severity, as your final
message. You do not fix anything.

---

# Verification quick reference

| Command | Used by |
|---|---|
| `npx astro check` | every task |
| `npm run lint && npm run format:check` | every task |
| `npm run build` | every task |
| `npx vitest run` | 2.6, 4.1+ |
| `npx playwright test` | 2.9 onward |
| `npm run lh` (lhci autorun) | 2.9, 6.x, 7.4, 8.7 |
| `npm run budgets` | 7.1 onward |
| `npx wrangler deploy --dry-run` | 2.10 |
| `gh run watch` | CI/deploy tasks |

# Execution notes

- Conventional commits; **no `Co-Authored-By` lines** (user rule).
- One commit per task minimum; a task is done only when its Verify line has actually been run
  and passed (superpowers:verification-before-completion).
- Subagent-driven execution recommended: fresh subagent per task, CR-n reviews at phase
  boundaries (superpowers:subagent-driven-development).
- README update is the explicit final implementation task (8.8) per user rule.
