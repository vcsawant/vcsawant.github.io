/**
 * GLSL for the morphing particle field.
 *
 * Contract (see docs/rnd/particles/report.md):
 * - ALL morphing happens in the vertex shader. Per-particle data rides in
 *   attributes; per-frame CPU work is limited to setting two uniforms.
 * - Attributes: `position` (target 0), `aTarget1`, `aTarget2`, `aSeed`.
 * - Per-frame uniforms: `uMorph` (continuous cycle position in [0,3)),
 *   `uTime` (seconds).
 * - Init-only uniforms: `uPointScale` (px scale, dpr baked in),
 *   `uDistortion` (sampler2D, screen-space UV, RG = displacement, 0.5 =
 *   neutral — forward-design hook for the fluid sim).
 */

export const VERTEX_SHADER = /* glsl */ `
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
`;

export const FRAGMENT_SHADER = /* glsl */ `
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
`;
