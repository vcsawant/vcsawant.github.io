/**
 * GLSL for the hero fluid field (origin: R1 spike, docs/rnd/fluid/report.md).
 *
 * Coordinate space: everything lives in canvas-UV space — (0,0) bottom-left,
 * (1,1) top-right of the hero canvas. The field texture is square (128^2) but
 * is addressed with canvas UVs; splat distances are aspect-corrected so ink
 * blobs stay round.
 *
 * Field texture layout (RGBA half-float):
 *   R,G = velocity in canvas-UV units per second (clamped to [-4, 4])
 *   B   = dye / ink density (clamped to [0, 2])
 *   A   = 1 (unused)
 */

/** Fullscreen pass-through vertex shader (ignores camera on purpose). */
export const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Single-pass field update: semi-Lagrangian self-advection + exponential
 * decay + Gaussian splat of pointer velocity and dye. No pressure projection.
 */
export const SIM_FRAG = /* glsl */ `
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
`;
