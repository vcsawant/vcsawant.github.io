/**
 * GLSL for the hero's morphing particle field.
 * Origin: R3 particle-morph spike (docs/rnd/particles/report.md), adapted:
 * colors come from design tokens via uniforms instead of hard-coded cyan.
 *
 * Contract:
 * - ALL morphing happens in the vertex shader. Per-particle data rides in
 *   attributes; per-frame CPU work is limited to setting two uniforms.
 * - Attributes: `position` (target 0), `aTarget1`, `aTarget2`, `aSeed`.
 * - Per-frame uniforms: `uMorph` (continuous cycle position in [0,3)),
 *   `uTime` (seconds).
 * - Per-frame uniform: `uPointScale` (recomputed so resize/dpr changes track).
 * - Init-only uniforms: `uColorCore`, `uColorEdge`, `uDistortion` (sampler2D,
 *   screen-space UV, RG = fluid velocity in canvas-UV/s, 0 = neutral — owned
 *   by the fluid sim whenever WebGL is on).
 */

export const VERTEX_SHADER = /* glsl */ `
attribute vec3 aTarget1;
attribute vec3 aTarget2;
attribute float aSeed;

uniform float uMorph;       // [0,3): floor = source target, fract = progress
uniform float uTime;        // seconds
uniform float uPointScale;  // set once at init
uniform sampler2D uDistortion;

varying float vFade;

const float PI = 3.14159265359;
// uDistortion RG = fluid velocity in canvas-UV/s, range [-4,4], 0 = neutral
// (see fluid.ts); scale converts to NDC displacement.
const float DISTORTION_SCALE = 0.055;

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

  // screen-space displacement from the fluid velocity field (zero when idle)
  vec2 duv = clip.xy / clip.w * 0.5 + 0.5;
  vec2 vel = texture2D(uDistortion, duv).rg;
  clip.xy += vel * DISTORTION_SCALE * clip.w;

  gl_Position = clip;
  gl_PointSize = uPointScale / max(-mv.z, 0.1);

  vFade = 0.45 + 0.55 * fract(aSeed * 9.73);
}
`;

export const FRAGMENT_SHADER = /* glsl */ `
precision mediump float;

uniform vec3 uColorCore;
uniform vec3 uColorEdge;

varying float vFade;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float alpha = smoothstep(0.5, 0.12, d) * vFade * 0.8;
  if (alpha < 0.01) discard;
  vec3 color = mix(uColorEdge, uColorCore, smoothstep(0.4, 0.0, d));
  gl_FragColor = vec4(color, alpha);
}
`;
