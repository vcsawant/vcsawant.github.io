# R&D: 3D force-layout strategy for the skills graph island

Date: 2026-08-30 · Prototype route: `/rnd/layout` (`src/pages/rnd/layout.astro` + `src/islands-rnd/layout/`)

Problem: ~25 nodes (20 skills + 5 project hubs), ~40 edges, rendered in a
@react-three/fiber island. Two moments matter: the **initial layout** (may be
precomputed at build) and **reorganization** — tap a node, it pins near center,
neighbors tighten, everything else relaxes, smooth on a mid-range phone.

## Recommendation

**(d) Hybrid: build-time base layout + `d3-force-3d` warm-ticks in a Web Worker
on focus.** This is what the prototype implements, and it keeps the expected
worker protocol unchanged (one additive extension, see Contract).

Rationale in one paragraph: at n = 25 the physics is so cheap (~2–5 ms of
compute for a full 90-tick focus relaxation, *measured under 6× CPU throttle*)
that the only real costs are bundle weight and complexity. The worker keeps
even that off the main thread — measured main-thread cost per reorganization is
**≤ 1.2 ms spread across ~100 frames**, with zero dropped frames at 6×
throttle. The base layout is baked at build time (page paints instantly with
the final layout, no layout pop-in), and `d3-force-3d` (8.5 KB gz) lives only
in the worker chunk, so the main bundle pays nothing. Real simulation ticks
give visibly better motion than endpoint interpolation (neighbors swing around
the pinned node instead of moving in straight lines), and warm-starting every
focus from the canonical base layout makes each focus state bit-reproducible.

## Comparison

| Criterion | (a) d3-force-3d worker, all-runtime | (b) GPGPU / shader sim | (c) fully precomputed (base + 25 focus variants), runtime lerp only | (d) hybrid: build base + worker warm-ticks (recommended) |
|---|---|---|---|---|
| Main-thread cost during reorg @6× | ~0 (same worker path as d) but initial layout also at runtime: 65–80 ms in worker + hydration wait before first paint of settled layout | Sim is on GPU but *readback or texture-fetch each frame*; per-node raycasting needs CPU positions → readback stalls; JS driver still runs on main | ~0.1 ms/frame lerp of 75 floats — lowest possible | **≤ 0.1 ms onmessage total; 0.2–1.2 ms total frame-update across ~100 frames; max frame gap 10.3 ms (no drops), measured @6×** |
| Bundle weight (gzip) | d3-force-3d 8.5 KB (worker chunk) | 0 deps, but ~2–4 KB of bespoke shader/FBO code; ping-pong render targets | **0 dep**; +~2 KB JSON for 26 stored layouts (26 × 25 × 3 floats); build script still needs d3-force-3d as devDep | d3-force-3d 8.5 KB gz, **worker chunk only** (measured whole worker chunk: 8.97 KB gz); main bundle unchanged |
| Implementation complexity | Low-medium (worker + protocol) | **High**: position/velocity FBO ping-pong, force kernels in GLSL, pin/neighbor sets via uniforms/textures, CPU readback for picking, mobile float-texture quirks | Medium: build pipeline emitting 26 variants, variant loading, easing code; edge cases when graph data changes (all variants rebuild) | Low-medium: ~120-line worker + ~80-line shared sim config; base bake is 10 lines in the Astro frontmatter |
| Determinism / stability | Good (seeded init + d3's seeded lcg) but initial layout recomputed per visit — engine-dependent float drift possible across browsers | Poor: GPU float math varies per device/driver; effectively non-reproducible across devices | **Perfect**: everything frozen at build | **Bit-identical layouts verified** (base and focus runs compared element-wise, `identical: true`); focus states path-independent via canonical warm start; see Determinism |
| Motion quality | Same as (d) once warmed | Potentially great, but overkill at n=25 and hard to tune | Straight-line endpoint easing; no interaction between nodes mid-flight; crossings/pass-throughs visible | **Best practical**: real tick trajectories streamed at ~3 ticks/16 ms, client exponential smoothing (k = 10/s) on top; neighbors arc around the pin |

Verdicts on the non-recommended options:

- **(a)** is strictly dominated by (d): identical runtime behavior plus a
  runtime cost and cross-engine nondeterminism for the initial layout that (d)
  eliminates for free at build.
- **(b)** is rejected. GPGPU pays off around 10^3–10^5 nodes; at 25 nodes a
  whole tick costs ~30 µs on the CPU (90 ticks ≈ 2–3 ms even at 6× throttle).
  The shader path adds FBO plumbing, GPU→CPU readback for raycast picking, and
  device-dependent float behavior for zero measurable gain.
- **(c)** is a respectable runner-up: smallest possible runtime and zero
  runtime dependency. It loses on motion quality (pure endpoint easing) and on
  flexibility (every graph edit rebuilds 26 variants), and it abandons the
  expected worker protocol (its replacement contract is specified below in
  case bundle size ever becomes critical).

## Measured timings

Environment: Chromium (Playwright) on an Apple-silicon Mac, Astro dev server,
390×844 viewport, dpr 2. CPU throttling automated via CDP
`Emulation.setCPUThrottlingRate: 6` (applies to the renderer process,
worker included). Numbers are per reorganization over a 7-focus sequence
(hubs + skills + unfocus); dev-mode modules, so production would be slightly
faster.

### Reorganization (tap-to-focus), 6× CPU throttle

| Metric | Range (6×) | Range (unthrottled) |
|---|---|---|
| Worker compute (90 ticks + serialize) | 1.3 – 3.1 ms | 1.8 – 5.2 ms¹ |
| Worker wall (paced, 30 batches × 16 ms) | 497 – 562 ms | 528 – 542 ms |
| Main thread: onmessage total | 0 – 0.1 ms | 0 – 0.1 ms |
| Main thread: frame-update total (~100 frames) | 0.2 – 1.2 ms | 0.7 – 7 ms¹ |
| Max frame gap during transition | 9.6 – 10.3 ms | 9.8 – 10.1 ms¹ |
| Settle (tap → visually at rest) | 809 – 879 ms | 768 – 892 ms |

¹ First-ever reorganization pays JIT warm-up (5.2 ms worker, 7 ms frames, one
28 ms gap on the very first batch of the session — the unthrottled pass ran
first). At these magnitudes run-to-run noise exceeds the throttle factor; the
honest reading is "per-reorganization compute is single-digit ms even at 6×".

### Other measurements

| What | Value |
|---|---|
| Base layout, 300 ticks to convergence, build machine (Node) | 7 – 15 ms |
| Cold 300-tick base layout in-browser @6× throttle (= option (a)'s startup cost) | 65 – 80 ms (JIT-warmed; first run higher) |
| Un-focus (return to base, no sim — echo + client easing) | 0 ms worker, ~770 – 910 ms settle |
| `d3-force-3d@3.0.6` used subset (simulation, link, manyBody, center, radial), esbuild minify | 8,492 B gzip |
| `d3-force-3d@3.0.6` full export set | 9,115 B gzip (27.3 KB min) |
| Built worker chunk (d3-force-3d + sim config + worker glue) | 8,972 B gzip |
| Main island chunk | contains **zero** d3 code (verified by grep of the built chunk); three/r3f dominate it and are paid regardless of layout strategy |

## Recommended message/API contract

The expected protocol is kept as-is, with **one additive extension** (a
terminal `done` frame) and **two semantic clarifications**. Types live in
`src/islands-rnd/layout/protocol.ts`.

```ts
// main -> worker
{ type: 'reorganize',
  focusId: string | null,        // null = return to base layout
  graph: GraphData,              // { nodes: {id, kind, weight}[], edges: {source, target}[] }
  positions: Float32Array }      // CANONICAL warm start = the build-time BASE layout,
                                 // xyz-interleaved in graph.nodes order (transfer the buffer)

// worker -> main, streamed per tick-batch (3 ticks / ~16 ms; ~30 batches)
{ type: 'positions', positions: Float32Array }   // xyz-interleaved, transferred

// worker -> main, terminal (ADDITIVE EXTENSION — consumers may ignore it)
{ type: 'done', focusId, ticks, batches, workerComputeMs, workerWallMs }
```

Semantics:

1. **`positions` is the canonical base layout, not the currently displayed
   positions.** The client bridges the visual gap with per-frame exponential
   smoothing (`displayed += (target − displayed) · (1 − e^(−10·dt))`). This is
   what makes focus states path-independent (see Determinism).
2. **`focusId: null`** short-circuits: the worker echoes the passed base
   positions in a single `positions` batch and sends `done`; client smoothing
   animates the return. No simulation runs.
3. A new `reorganize` supersedes any in-flight one (the worker holds a job
   token and stops streaming the stale job).
4. `Float32Array` buffers are transferred, not copied, in both directions.

Fallback contract if (c) is ever adopted instead (**flagged: this would replace
the worker protocol entirely**): no worker; a static asset
`layouts.json` = `{ base: number[], byFocus: Record<nodeId, number[]> }` baked
at build, and the island lerps `displayed → byFocus[focusId] ?? base` with the
same smoothing constant. Everything else (island rendering, events) is
unchanged.

## Determinism notes (seeding strategy)

Verified in-browser with the final parameters: two base-layout runs and two
focus-layout runs compared element-wise — **bit-identical** (`baseOk: true`,
`focusOk: true`).

- **Seed positions are RNG-free**: golden-angle spiral on two spheres (hubs
  r = 6, skills r = 13), indexed by node order (`seedPositions` in
  `simCore.ts`). Node order comes from `buildGraph()`, which is a pure
  literal — stable across builds.
- **d3-force-3d's internal `randomSource` is a seeded LCG** (fixed seed), and
  it is only consulted to un-stick exactly coincident nodes, which the spiral
  seed prevents. So every simulation pass is deterministic for a given engine.
- **Focus states are path-independent**: every `reorganize` warm-starts from
  the canonical build-time base layout, so "focus B" is the same layout whether
  reached from base, from A, or revisited — nodes can never accumulate drift or
  teleport between focus states. Max node travel base→focus measured at 9.1
  world units (layout radius ~15), traversed continuously over 30 streamed
  batches.
- **Cross-engine caveat** (why the base layout is baked at build rather than
  recomputed on the client): IEEE basic ops are exact, but `Math.pow/sqrt`
  may differ in the last ulp across JS engines. Baking the base at build makes
  the initial layout byte-stable for all visitors; focus relaxations run ~90
  ticks from that identical start, so any engine divergence stays visually nil.
- Rebuild stability: the bake is deterministic, so `npm run build` produces the
  same `basePositions` every time as long as the graph data and force
  parameters are unchanged. A graph-data edit changes only the affected
  region's equilibrium.

## Prototype notes

- Route `/rnd/layout` (noindex). Tap a node to focus, tap again (or Clear) to
  release; "Focus next" cycles. An overlay shows live per-reorganization
  metrics; they also accumulate in `window.__layoutMetrics`, and
  `window.__focusNode(id | null)` is exposed for automation.
- Build-time bake happens in the `.astro` frontmatter (`computeBaseLayout`),
  shipped as island props — 300 ticks, 7–15 ms on the build machine.
- Files: `graph.ts` (dummy data: 20 skills + 5 hubs, 40 edges),
  `simCore.ts` (shared force model — imported only by the frontmatter and the
  worker, never by the main-thread bundle), `layout.worker.ts`,
  `protocol.ts`, `LayoutGraph.tsx`, `d3-force-3d.d.ts` (local typings; the
  package ships none).
- `d3-force-3d` was installed with `npm i --no-save` per sandbox rules; for
  adoption it belongs in `dependencies` (worker chunk) — 8.5 KB gz.
- Transition pacing is a policy knob: 90 ticks at 3 ticks/16 ms ≈ 0.5 s of
  streaming + ~0.3 s smoothing tail. Fewer ticks per focus (e.g. 60) or more
  ticks per batch shortens it; compute cost is not the constraint.
