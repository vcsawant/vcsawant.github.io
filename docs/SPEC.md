# vcsawant.com — Site Specification

> Source of truth for requirements. `docs/PLAN.md` implements this spec; if the plan and this
> spec disagree, the spec wins and the plan has a bug.

## Purpose and audience

Personal site for Viren Sawant — technical consultant, co-founder of a small consulting startup,
owner of technical delivery. Audience: technical recruiters arriving from LinkedIn or a resume.
They give the site **20–40 seconds**, frequently on a phone, frequently inside LinkedIn's in-app
browser. The site must (a) communicate skills and experience fast, and (b) demonstrate front-end
capability through its own execution.

## Featured work (real copy supplied by Viren later)

- Multiplayer bughouse chess game — Elixir / Phoenix LiveView, hosted on Fly.io.
- Marketing site — Next.js + TypeScript on Vercel.
- Internal "engagement tracker" web app — Next.js + TypeScript on Vercel.

Copy is **not** to be invented. The content layer carries clearly-marked placeholders, tracked
in `CONTENT-TODO.md`.

## Fixed architectural decisions (constraints, not options)

1. **Astro** shell, static output. Content renders server-side; JavaScript is an enhancement,
   never a requirement for reading the page.
2. **One hydrated React island** running `@react-three/fiber` for WebGL. Not a full React app.
3. **Centerpiece interactive: 3D skill graph.** Nodes are technologies; edges connect them to
   project nodes. Drifts on its own; drag to spin with inertia; tap a node → graph reorganizes
   around it and the project list below filters to matching work. The only element with real
   interaction logic — built to be genuinely good, not a demo.
4. **Two supporting effects:** a WebGL fluid/ink cursor distortion over the hero (pointer on
   desktop, touch smear on mobile), and a morphing particle field resolving between a chess
   knight, the initials, and a wireframe of the skill graph.
5. **Motion layer:** GSAP + ScrollTrigger for pinning and multi-step sequencing; native CSS
   scroll-driven animations (`animation-timeline: view()`) for simple reveals and progress
   indicators. Lenis is optional and must be validated on real iOS before committing.
6. **Hosting:** Cloudflare Workers with static assets (not Pages). Deployed via Wrangler from
   GitHub Actions.
7. **Repo:** stays at `vcsawant.github.io` (permanent free fallback URL). Default branch
   renamed `source` → `main`.
8. **Domain:** Viren registers `vcsawant.com` (or `.dev`) through Cloudflare Registrar himself.
   Never attempt to purchase anything.

## Non-negotiable quality bars (acceptance criteria)

- Full content legible and navigable with JavaScript disabled.
- Lighthouse mobile performance ≥ 90 with the WebGL island present; LCP is text or a static
  poster image, never the canvas.
- `prefers-reduced-motion: reduce` disables scroll-linked motion and the particle field, and
  substitutes a static render of the graph.
- WebGL2 is feature-detected. On failure — including LinkedIn's Android webview — fall back to
  a looping WebM or static poster. A recruiter must never see a black rectangle.
- `dpr` capped at `[1, 1.5]`; particle counts scaled down on mobile; `frameloop="demand"`
  wherever the scene is static; render loop paused on tab blur and when the canvas leaves the
  viewport via IntersectionObserver.
- Animate transforms and opacity only. No layout-triggering properties in any animation.
- Keyboard navigable, with visible focus states. The skill graph needs a non-pointer path to
  the same information.

## Human checkpoints (hard stops)

- After the plan is written, before any implementation.
- After Phase 0 (wipe), before scaffolding.
- Domain registration and DNS — Viren does this himself.
- Cloudflare API token creation and any `wrangler login` — Viren provisions credentials;
  Claude states the exact scopes needed and never handles secrets.
- Before the first production deploy of Phase 2.
- Final launch approval.

## Delegation constraints

Delegate (self-contained, research-heavy, parallelizable): shader R&D (fluid + particle morph,
two agents in parallel, isolated test routes), force-layout research, fallback asset
generation, perf audits after Phases 4/5/6 (report only, no fixes), code review at each phase
boundary (reviewer did not write the code).

Do **not** delegate: the Phase 0 wipe, the deploy pipeline, anything touching secrets or
`wrangler` auth, the content model schema.
