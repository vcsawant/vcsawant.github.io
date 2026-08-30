# R&D spike: WebGL fluid/ink cursor

Route: `/rnd/fluid` · Code: `src/islands-rnd/fluid/` (`FluidCursor.tsx`, `shaders.ts`)

## 1. Approach chosen

**Single-pass self-advected velocity+dye field** ("stable-fluids-lite"): one
128×128 RGBA half-float texture holds velocity (RG) and dye (B). Each frame,
one fragment pass does semi-Lagrangian self-advection, exponential decay, and
a Gaussian splat of pointer velocity + ink. A second tiny pass renders the
placeholder (a dot grid displaced by velocity, brightened by dye). There is
**no pressure projection** — the field is not divergence-free.

Why this wins for our consumer (a particle vertex shader that *samples* the
field to displace particles):

- 2 draw calls per frame, both trivially cheap (one is 128² fragments, the
  other is a 390×844 dot-grid shader). JS tick cost measured at ~0.1 ms.
- Divergence-free flow matters for full-screen dye imagery (swirls, curls);
  particles displaced by a decaying velocity field look great without it, and
  the semi-Lagrangian step + linear filtering already give organic smearing.
- Decay is exponential with CPU-precomputed factors, so a matching CPU-side
  energy proxy can decide when to sleep with **zero GPU readback**.

### Rejected alternatives

| Alternative | Why rejected |
| --- | --- |
| Full Pavel-Dobryakov stable fluids (advect vel, advect dye, curl/vorticity, divergence, ~20 Jacobi pressure iterations, gradient subtract) | 25+ passes/frame and 5–6 FBOs to get incompressibility we don't need — the consumer samples velocity for displacement, not dye for imagery. Also much harder to reason about sleep (energy lives in pressure/curl too). |
| Pure trail buffer (stamp + decay/blur, no advection) | Cheapest, but the trail only exists where the pointer went — no "ink carried by flow", so smears die in place instead of drifting. The advection term costs one extra texture fetch and is what makes it feel fluid. Kept as the fallback if even this is too hot (it isn't). |
| Advected procedural noise (curl noise domain-warped by a trail) | Great full-screen visuals, but the deliverable is a *velocity texture* for particles; noise-warping produces imagery, not a clean sampled velocity contract. |
| CPU sim (typed array, upload via `texSubImage2D`) | At 128² × 60 fps the upload + JS math is fine unthrottled but is exactly the kind of main-thread work a 6× throttle punishes; the GPU version keeps the JS tick at ~0.1 ms. |

## 2. GLSL listings

All shaders live in `src/islands-rnd/fluid/shaders.ts`.

### Fullscreen vertex (shared)

```glsl
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
```

### Field update (`SIM_FRAG`)

```glsl
precision highp float;

varying vec2 vUv;

uniform sampler2D uField;
uniform float uDt;        // seconds, clamped
uniform float uVelDecay;  // exp(-lambdaVel * dt), computed on CPU
uniform float uDyeDecay;  // exp(-lambdaDye * dt), computed on CPU
uniform vec2  uPointer;     // canvas UV
uniform vec2  uPointerVel;  // canvas UV / second
uniform float uSplat;       // 1 while input is fresh, else 0
uniform float uRadius;      // splat radius in UV units
uniform float uAspect;      // canvas width / height

void main() {
  // Self-advection: trace back along the local velocity.
  vec2 vel = texture2D(uField, vUv).xy;
  vec2 back = vUv - vel * uDt;
  vec4 f = texture2D(uField, back);

  // Exponential decay (frame-rate independent, factors precomputed on CPU).
  f.xy *= uVelDecay;
  f.z  *= uDyeDecay;

  // Gaussian splat around the pointer.
  vec2 d = vUv - uPointer;
  d.x *= uAspect;
  float g = exp(-dot(d, d) / (uRadius * uRadius)) * uSplat;

  // Drive field velocity toward pointer velocity (stable at any dt).
  f.xy += (uPointerVel - f.xy) * g * min(uDt * 12.0, 1.0);
  // Ink deposit scales mildly with speed.
  f.z += g * min(uDt * 10.0, 1.0) * clamp(length(uPointerVel) * 0.4 + 0.25, 0.0, 1.2);

  f.xy = clamp(f.xy, vec2(-4.0), vec2(4.0));
  f.z = clamp(f.z, 0.0, 2.0);

  gl_FragColor = vec4(f.xyz, 1.0);
}
```

### Placeholder display (`DISPLAY_FRAG`)

```glsl
precision highp float;

varying vec2 vUv;

uniform sampler2D uField;
uniform float uAspect; // canvas width / height

void main() {
  vec4 f = texture2D(uField, vUv);

  // Displace the grid lookup by the velocity field (same trick the particle
  // vertex shader will use, just in fragment space).
  vec2 uv = vUv - f.xy * 0.035;

  vec2 g = uv * vec2(uAspect, 1.0) * 26.0;
  vec2 cell = fract(g) - 0.5;
  float dist = length(cell);

  float dye = f.z;
  float radius = 0.07 + 0.18 * clamp(dye, 0.0, 1.2);
  float dotMask = smoothstep(radius, radius - 0.05, dist);

  vec3 base = vec3(0.055, 0.06, 0.08);
  vec3 dotCol = mix(vec3(0.30, 0.32, 0.36), vec3(0.45, 0.78, 1.0), clamp(dye, 0.0, 1.0));
  vec3 col = base + dotMask * dotCol + clamp(dye, 0.0, 1.5) * vec3(0.02, 0.05, 0.09);

  gl_FragColor = vec4(col, 1.0);
}
```

## 3. Sim texture + ping-pong scheme

- **Size:** 128×128 (well under the 256² budget; particles sample with linear
  filtering, so 128² is plenty of spatial resolution for displacement and
  costs 4× less fill than 256²).
- **Format:** `RGBA` / `HalfFloatType` (WebGL2 + `EXT_color_buffer_float`,
  which three requires/handles automatically). Velocity needs signed values,
  so byte textures were out without an encoding step.
- **Filtering/wrap:** `LinearFilter` (free numerical diffusion during
  advection + smooth particle sampling), `ClampToEdgeWrapping`.
- **Ping-pong:** two `WebGLRenderTarget`s, `read` and `write`. Each frame:
  bind `read.texture` as `uField`, render the sim pass into `write`, swap
  the two references. The display/consumer always samples the post-swap
  `read.texture`. No depth/stencil buffers.
- **Frame graph:** `sim pass (128²) → swap → display pass (screen)` — 2 draw
  calls total.

## 4. Measured frame cost

Harness: `playwright-core` driving headless system Chrome; CDP
`Emulation.setCPUThrottlingRate(6)`; viewport 390×844; `deviceScaleFactor: 1`;
8 s of continuous synthetic pointer movement (figure-8 sweeps, ~60 events/s);
482 active frames collected.

| Metric (active interaction, 6× CPU throttle, dpr 1, 390×844) | median | p95 |
| --- | --- | --- |
| rAF-to-rAF interval (ms/frame) | **16.70** | **16.70** |
| JS time inside tick (ms) | 0.10 | 0.90 |

The rAF interval sits exactly at the 60 Hz vsync quantum with zero p95
spread — i.e. **no dropped frames at 6× CPU throttle**; the sim never comes
close to the 16.7 ms budget (JS cost is ~0.1 ms; GPU work is a 128² pass plus
one screen-size pass).

## 5. Sleep verification

The loop is self-scheduled `requestAnimationFrame` — R3F runs with
`frameloop="never"`. It keeps scheduling only while (a) a pointer event
arrived in the last 150 ms, or (b) the CPU-side energy proxy (bumped on
input, decayed with the same `exp(-λ·dt)` rates as the field) is above
`ENERGY_EPS = 0.015`. Otherwise it simply does not schedule the next frame:
**zero rAF while asleep**. Any pointer event re-wakes it.

`window.__fluidDebug` exposes `{ frames, running, velEnergy, dyeEnergy,
rafDeltas, tickMs }`. Observed after interaction stopped (samples 1 s apart,
same throttled run as above):

| t (ms) | frames | running | velEnergy | dyeEnergy |
| --- | --- | --- | --- | --- |
| 12506 | 544 | true  | 0.1160 | 0.0378 |
| 13509 | 585 | false | 0.0149 | 0.0068 |
| 14511 | 585 | false | 0.0149 | 0.0068 |
| 15513 | 585 | false | 0.0149 | 0.0068 |
| 16515 | 585 | false | 0.0149 | 0.0068 |
| 17516 | 585 | false | 0.0149 | 0.0068 |

The counter goes static within ~1–2 s of the last input (decay half-lives are
0.23 s for velocity, 0.28 s for dye) and stays static — the sim is fully
asleep, not idling at low FPS.

Other constraints verified: canvas `dpr={[1, 1.5]}`; all pointer listeners
`{ passive: true }`; canvas has `touch-action: pan-y` so vertical touch
scrolling is untouched (the test page has scrollable filler below the hero);
touch smears reuse the same pointer-event path.

## 6. Integration notes (particle-material contract)

What a consuming particle vertex shader gets:

- **Texture handle:** the sim's current `read` target texture. The component
  swaps two `WebGLRenderTarget`s, so consumers must refresh the handle each
  frame after the sim step — in the spike, `displayMat.uniforms.uField.value`
  is always the fresh post-swap texture, and the same wiring applies to a
  particle material's uniform (or extend the component to copy into a stable
  target if a fixed handle is required).
- **Sampler state:** 128², RGBA half-float, linear filtering, clamp-to-edge.
  Sample with plain `texture2D(uField, uv)` — no manual bilinear needed.
- **Coordinate space:** canvas UV of the hero rect — `(0,0)` bottom-left,
  `(1,1)` top-right (GL convention; pointer y is flipped on ingest). A
  particle at NDC position `p` samples at `uv = p * 0.5 + 0.5`.
- **Value ranges:**
  - `RG` = velocity in **canvas-UV units per second**, clamped to `[-4, 4]`;
    typical interactive magnitudes are 0.5–3. To displace, use e.g.
    `pos.xy += field.rg * strength` (the display pass uses `strength = 0.035`
    UV) or integrate it as an acceleration for springy particles.
  - `B` = dye/ink density, clamped to `[0, 2]`; typical peak ~1.2. Good for
    size/brightness/color modulation.
  - `A` = always 1, unused.
  - Note the field is **not divergence-free**; treat velocity as a
    displacement/force field, not a mass-conserving flow.
- **Decay behavior:** exponential, frame-rate independent — velocity
  `exp(-3.0·dt)` (half-life ≈ 0.23 s), dye `exp(-2.5·dt)` (half-life
  ≈ 0.28 s). Everything relaxes to 0; ~1.5–2 s after the last input the field
  is visually zero and the sim sleeps.
- **Sleeping consumers:** when asleep the texture is frozen at near-zero
  values, so a particle shader may keep sampling it unconditionally — or,
  better, share this component's loop (mount the particles inside the same
  `<Canvas>` and render them in the display pass), gated by
  `window.__fluidDebug.running` for debugging.
- **Tunables** (constants in `FluidCursor.tsx` / uniforms): `SIM_SIZE`,
  `LAMBDA_VEL`, `LAMBDA_DYE`, `ENERGY_EPS`, splat `uRadius` (0.09 UV),
  splat gain (`uDt * 12.0` toward pointer velocity).

## Verification run

- `npx astro check` — 0 errors, 0 warnings.
- `npm run build` — green; `/rnd/fluid/index.html` emitted.
