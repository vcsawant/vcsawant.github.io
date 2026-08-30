# R&D spike — morphing particle field

Prototype of a hero particle field that resolves between three targets —
chess knight silhouette → "VS" initials → abstract graph wireframe — cycling
with a dwell period, with all morphing done in the vertex shader.

- Test route: `/rnd/particles` (`src/pages/rnd/particles.astro`)
- Component: `src/islands-rnd/particles/` (`ParticleField.tsx`, `shaders.ts`, `loadMorphTargets.ts`)
- Generator: `scripts/rnd/generate-morph-targets.mjs` (Node stdlib only, deterministic; re-run with `node scripts/rnd/generate-morph-targets.mjs`)
- Data: `public/morph-targets.bin` (900,016 bytes)

## URL / props API

Route accepts `?tier=high|low` (25,000 / 8,000 particles), `?dwell=ms`,
`?morph=ms`, `?dpr=n` (default 1 for the spike). Component props:
`<ParticleField dwellMs={2600} morphMs={2400} />`.

**Dwell/cycle timing contract:** the field holds each target for `dwellMs`,
then morphs to the next over `morphMs`, looping target 0 → 1 → 2 → 0. The CPU
maps wall-clock time to a single float `uMorph ∈ [0,3)` each frame:
`uMorph = segment + clamp((tInPeriod − dwellMs)/morphMs, 0, 1)` where
`segment = floor(elapsed/(dwellMs+morphMs)) % 3`. Integer values = at rest on
target `uMorph`; fractional part = transition progress. A future timeline
(e.g. scroll-driven) can drive `uMorph` directly with any easing.

`window.__particlesDebug = { frames, phase, tier, count, dwellMs, morphMs }`
is updated every RAF tick; `frames` is a monotonically increasing counter for
verifying RAF activity, `phase` is `'dwell' | 'morph'`.

## Binary format spec — `public/morph-targets.bin`

Little-endian. Written by the generator, parsed by `loadMorphTargets.ts`.

| offset (bytes) | type | value |
| --- | --- | --- |
| 0 | uint32 | magic `0x4D525048` |
| 4 | uint32 | version = 1 |
| 8 | uint32 | `count` = particles per target (25,000) |
| 12 | uint32 | `targets` = 3 |
| 16 | float32 × count×3 | target 0: knight — xyz interleaved, stride 12 bytes/particle |
| 16 + count×12 | float32 × count×3 | target 1: "VS" initials |
| 16 + count×24 | float32 × count×3 | target 2: graph wireframe |

Total size = 16 + 3 × 25,000 × 12 = 900,016 bytes. All targets are centered
at the origin, longest axis normalized to ≈2 world units, with a thin z slab
(±~0.1) for parallax; the graph target is fully 3D. Particle order within
each target is shuffled (seeded Fisher–Yates) so morph correspondence is
chaotic — particles fly across the shape instead of translating blob-to-blob.

**Count tiers:** the file always holds the 25k tier; the component's
`strideSample()` decimates to 8,000 by taking every `count/8000`-th particle
(valid because order is shuffled, so any stride is an unbiased subsample).

## Generation methodology + provenance

Pure Node stdlib (no canvas, no deps), seeded mulberry32 PRNG so output is
byte-reproducible.

- **Knight (target 0):** an original 36-vertex polygon authored by hand
  directly in the script (`KNIGHT_POLY`, 0–100 y-up space: plinth, neck,
  two ears, muzzle, jaw notch, chest). **Provenance: self-authored for this
  repo, not traced from any third-party asset; no external license applies.**
  Filled by rejection sampling with even-odd point-in-polygon tests.
- **"VS" (target 1):** node-canvas text rendering is not available without
  deps, so the glyphs are original geometry: "V" is a 7-vertex polygon
  (rejection-sampled); "S" is a centerline of two circular arcs (top CCW
  245°, bottom CW 245°) sampled uniformly by arc length and offset along the
  segment normal by a uniform ±7.5-unit stroke width. Particle budget split
  between glyphs proportionally to area (shoelace area for V, length×width
  for S).
- **Graph (target 2):** 9 procedural node positions on a flattened annulus
  with z scatter; each node connected to its 2 nearest neighbours (deduped).
  72% of particles are Gaussian cluster blobs around nodes (varied spread),
  28% are jittered points along edges — reading as faint connecting lines.

## GLSL

All morphing runs in the vertex shader. Per-frame CPU work = writing two
floats (`uMorph`, `uTime`) into the uniform map plus the debug counter;
nothing else is touched per frame (bounding sphere is pre-set, frustum
culling off, geometry/attributes immutable).

Attributes: `position` (doubles as target 0), `aTarget1`, `aTarget2` (vec3),
`aSeed` (float, deterministic per-index hash in [0,1)).

### Vertex shader

```glsl
attribute vec3 aTarget1;
attribute vec3 aTarget2;
attribute float aSeed;

uniform float uMorph;       // [0,3): floor = source target, fract = progress
uniform float uTime;        // seconds
uniform float uPointScale;  // set once at init
uniform sampler2D uDistortion; // set once; fluid sim will own this later

varying float vFade;

const float PI = 3.14159265359;
const float DISTORTION_SCALE = 0.25; // NDC units at full displacement

// position attribute doubles as target 0
vec3 targetAt(float i) {
  return mix(mix(position, aTarget1, step(0.5, i)), aTarget2, step(1.5, i));
}

void main() {
  float seg = floor(uMorph);
  vec3 from = targetAt(mod(seg, 3.0));
  vec3 to   = targetAt(mod(seg + 1.0, 3.0));

  // per-particle stagger so the swarm peels off in waves, then smoothstep ease
  float p = fract(uMorph);
  float stagger = fract(aSeed * 0.61803398875);
  float local = clamp((p - stagger * 0.28) / 0.72, 0.0, 1.0);
  float ease = local * local * (3.0 - 2.0 * local);

  vec3 pos = mix(from, to, ease);

  // organic swirl: seed-keyed rotating offset, amplitude peaks mid-flight
  float a1 = aSeed * 6.2831853 + uTime * 0.55;
  float a2 = aSeed * 12.9898 + uTime * 0.31;
  vec3 swirl = vec3(cos(a1) * sin(a2), sin(a1) * sin(a2) * 0.85, cos(a2) * 0.5);
  float swirlAmp = sin(ease * PI) * (0.18 + 0.34 * fract(aSeed * 7.13));
  pos += swirl * swirlAmp;

  // gentle idle drift so the dwell state still breathes
  pos += 0.014 * vec3(
    sin(uTime * (0.55 + 0.5 * fract(aSeed * 3.7)) + aSeed * 61.0),
    cos(uTime * (0.45 + 0.5 * fract(aSeed * 5.1)) + aSeed * 47.0),
    sin(uTime * 0.7 + aSeed * 83.0)
  );

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vec4 clip = projectionMatrix * mv;

  // forward-design hook: screen-space displacement from the fluid sim.
  // uDistortion RG in [0,1]; 0.5/0.5 decodes to zero displacement.
  vec2 duv = clip.xy / clip.w * 0.5 + 0.5;
  vec2 disp = texture2D(uDistortion, duv).rg * 2.0 - 1.0;
  clip.xy += disp * DISTORTION_SCALE * clip.w;

  gl_Position = clip;
  gl_PointSize = uPointScale / max(-mv.z, 0.1);

  vFade = 0.45 + 0.55 * fract(aSeed * 9.73);
}
```

### Fragment shader

```glsl
precision mediump float;

varying float vFade;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float alpha = smoothstep(0.5, 0.12, d) * vFade * 0.85;
  if (alpha < 0.01) discard;
  // cool cyan-white, brighter core
  vec3 color = mix(vec3(0.45, 0.75, 0.95), vec3(0.95, 0.98, 1.0), smoothstep(0.4, 0.0, d));
  gl_FragColor = vec4(color, alpha);
}
```

Material state: `AdditiveBlending`, `transparent`, `depthWrite: false`,
antialias off (points do not benefit), `dpr` from `?dpr` (default 1).

## Measurements

Environment: Chromium via Playwright MCP, isolated browser context per run,
viewport 390×844, deviceScaleFactor/dpr = 1, CPU throttled **6×** via CDP
`Emulation.setCPUThrottlingRate` (1× control runs included to prove the
throttle took effect). Host: Apple-silicon Mac, 120 Hz display. Astro dev
server. `dwellMs=2600, morphMs=2400`, ~12.5 s sample per run (~2.5 full
cycles), 2 frames dropped at each phase boundary.

Two metrics per frame:

- **RAF interval** — timestamp delta between consecutive RAF ticks
  (vsync-quantized; 8.33 ms = perfect 120 Hz, no dropped frames).
- **Main-thread busy** — `performance.now() − rafTimestamp` read in a RAF
  callback that runs after r3f's render callback (steady-state registration
  order), i.e. main-thread time spent producing the frame (JS + WebGL command
  submission; excludes async GPU execution).

### 6× CPU throttle (CDP)

| tier | state | busy median | busy p95 | RAF interval median | RAF interval p95 | n |
| --- | --- | --- | --- | --- | --- | --- |
| 25,000 | morph | 0.50 ms | 1.20 ms | 8.30 ms | 9.20 ms | 679 |
| 25,000 | dwell | 0.50 ms | 1.30 ms | 8.30 ms | 9.20 ms | 794 |
| 8,000 | morph | 0.60 ms | 1.30 ms | 8.30 ms | 9.20 ms | 685 |
| 8,000 | dwell | 0.50 ms | 1.20 ms | 8.30 ms | 9.20 ms | 799 |

### 1× control (unthrottled)

| tier | state | busy median | busy p95 | RAF interval median | RAF interval p95 |
| --- | --- | --- | --- | --- | --- |
| 25,000 | morph | 0.20 ms | 0.30 ms | 8.30 ms | 9.20 ms |
| 25,000 | dwell | 0.10 ms | 0.20 ms | 8.30 ms | 9.20 ms |
| 8,000 | morph | 0.10 ms | 0.20 ms | 8.30 ms | 9.20 ms |
| 8,000 | dwell | 0.10 ms | 0.20 ms | 8.30 ms | 9.20 ms |

Reading: both tiers hold a locked 120 Hz cadence even at 6× CPU throttle —
p95 interval 9.2 ms ≈ one vsync — because per-frame CPU work is two uniform
writes. The ~4–5× busy-time inflation between 1× and 6× confirms the throttle
was active. Morph vs dwell cost is indistinguishable on the CPU side (as
designed: identical GPU path, no CPU branch). Caveats: CDP throttling does not
throttle the GPU (the morph itself is GPU work, and an Apple-silicon GPU
shrugs at 25k points — verify on real mid-tier mobile before shipping);
dev-server module graph, not the production bundle.

## Integration notes

- **Data cost:** 900 KB binary (gzips poorly — random floats). If that
  matters for the real hero, quantize to int16 (×2.4 smaller) or generate at
  runtime from the same seeds.
- **Mount:** `<ParticleField client:only="react" />` inside a
  position-relative/fixed container; the Canvas fills it (`absolute inset-0`).
  Content auto-fits the frustum via a resize-computed group scale.
- **Timing:** pass `dwellMs`/`morphMs` props (see contract above). To
  scroll-drive later, lift the `uMorph` computation out of `useFrame` and set
  it from a scroll observer — the shader contract does not change.
- **Adding a 4th target** means one more vec3 attribute plus extending
  `targetAt`'s mix chain and the `mod(_, 3.0)`s; format version bump.

### `uDistortion` uniform contract (fluid-sim forward design)

The material already samples `uDistortion` every frame; the spike feeds it a
1×1 neutral texture. The fluid sim replaces the texture object once (not
per-frame):

- **Type:** `sampler2D`, any filterable RGBA/RG texture (render target OK).
- **UV space:** screen space — the shader samples at the particle's own
  post-projection NDC mapped to [0,1]² (`clip.xy/clip.w * 0.5 + 0.5`),
  bottom-left origin (standard GL). The sim's render target should cover the
  full canvas so UVs line up 1:1 with the screen.
- **Encoding:** RG channels in [0,1]; decoded as `rg * 2 − 1` → displacement
  vector in NDC units. `(0.5, 0.5)` = neutral/no displacement. B/A ignored.
- **Magnitude:** displacement is applied pre-divide as
  `clip.xy += disp * DISTORTION_SCALE * clip.w` with `DISTORTION_SCALE =
  0.25`, i.e. a fully saturated channel moves a particle 12.5% of the screen
  axis. Tune the constant (or promote it to an init-time uniform) when the
  sim lands.
- **Update pattern:** the sim writes its velocity/displacement field into the
  texture each frame on the GPU; the particle material needs no uniform
  update for it — the sampler binding is persistent.

## Verification

- `npx astro check` — 0 errors, 0 warnings.
- `npm run build` — green, emits `/rnd/particles/index.html` and copies
  `morph-targets.bin`.
- RAF activity verifiable via `window.__particlesDebug.frames`.
