/**
 * Fluid cursor spike (R&D).
 *
 * A pointer trail advects a 128^2 half-float velocity+dye field
 * (semi-Lagrangian self-advection, no pressure projection) rendered over a
 * placeholder dot grid. The sim runs only while input is active or field
 * energy is above epsilon, then sleeps completely (zero rAF).
 *
 * Debug/verification: `window.__fluidDebug` (frames, running, energies,
 * rafDeltas, tickMs).
 *
 * Consumer contract: see `getFluidField()` docs at the bottom and
 * docs/rnd/fluid/report.md.
 */
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DISPLAY_FRAG, FULLSCREEN_VERT, SIM_FRAG } from './shaders';

const SIM_SIZE = 128;
/** Velocity decay rate (1/s). Half-life ~0.23s. */
const LAMBDA_VEL = 3.0;
/** Dye decay rate (1/s). Half-life ~0.28s. */
const LAMBDA_DYE = 2.5;
/** Field energy below this (with no fresh input) puts the sim to sleep. */
const ENERGY_EPS = 0.015;
/** Keep splatting for this long after the last pointer event (ms). */
const INPUT_HOLD_MS = 80;
/** Keep the loop alive for this long after the last pointer event (ms). */
const WAKE_HOLD_MS = 150;
const METRICS_CAP = 2400;

interface FluidDebug {
  frames: number;
  running: boolean;
  velEnergy: number;
  dyeEnergy: number;
  /** rAF-to-rAF deltas (ms) while the loop is running (wake frames skipped). */
  rafDeltas: number[];
  /** JS time spent inside each tick (ms). */
  tickMs: number[];
}

declare global {
  interface Window {
    __fluidDebug?: FluidDebug;
  }
}

function makeTarget(): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

function FluidSim() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  const displayMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: FULLSCREEN_VERT,
        fragmentShader: DISPLAY_FRAG,
        uniforms: {
          uField: { value: null },
          uAspect: { value: 1 },
        },
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );

  const sim = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: SIM_FRAG,
      uniforms: {
        uField: { value: null },
        uDt: { value: 0 },
        uVelDecay: { value: 1 },
        uDyeDecay: { value: 1 },
        uPointer: { value: new THREE.Vector2(-1, -1) },
        uPointerVel: { value: new THREE.Vector2(0, 0) },
        uSplat: { value: 0 },
        uRadius: { value: 0.09 },
        uAspect: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
    });
    const simScene = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    mesh.frustumCulled = false;
    simScene.add(mesh);
    return { material, simScene, read: makeTarget(), write: makeTarget() };
  }, []);

  useEffect(() => {
    displayMat.uniforms.uAspect.value = size.width / Math.max(size.height, 1);
    sim.material.uniforms.uAspect.value = size.width / Math.max(size.height, 1);
  }, [size, displayMat, sim]);

  useEffect(() => {
    const canvas = gl.domElement;

    const debug: FluidDebug = {
      frames: 0,
      running: false,
      velEnergy: 0,
      dyeEnergy: 0,
      rafDeltas: [],
      tickMs: [],
    };
    window.__fluidDebug = debug;

    // Pointer state (canvas UV space, y up).
    const pointer = new THREE.Vector2(-1, -1);
    const pointerVel = new THREE.Vector2(0, 0);
    let lastInputTime = -Infinity;
    let lastEventTime = 0;
    let hasPrev = false;
    const prevUv = new THREE.Vector2();

    // CPU-side conservative energy proxy: bumped on input, decayed with the
    // same rates as the field, so we never sleep while the field is visible.
    let velEnergy = 0;
    let dyeEnergy = 0;

    let rafId = 0;
    let running = false;
    let lastT = 0;
    let justWoke = true;

    const tick = (now: number) => {
      const tickStart = performance.now();
      const dt = justWoke ? 1 / 60 : Math.min((now - lastT) / 1000, 1 / 20);
      if (!justWoke) {
        debug.rafDeltas.push(now - lastT);
        if (debug.rafDeltas.length > METRICS_CAP) debug.rafDeltas.shift();
      }
      lastT = now;
      justWoke = false;

      const inputFresh = performance.now() - lastInputTime < INPUT_HOLD_MS;

      velEnergy *= Math.exp(-LAMBDA_VEL * dt);
      dyeEnergy *= Math.exp(-LAMBDA_DYE * dt);
      debug.velEnergy = velEnergy;
      debug.dyeEnergy = dyeEnergy;

      const u = sim.material.uniforms;
      u.uField.value = sim.read.texture;
      u.uDt.value = dt;
      u.uVelDecay.value = Math.exp(-LAMBDA_VEL * dt);
      u.uDyeDecay.value = Math.exp(-LAMBDA_DYE * dt);
      (u.uPointer.value as THREE.Vector2).copy(pointer);
      (u.uPointerVel.value as THREE.Vector2).copy(inputFresh ? pointerVel : pointerVel.set(0, 0));
      u.uSplat.value = inputFresh ? 1 : 0;

      gl.setRenderTarget(sim.write);
      gl.render(sim.simScene, camera);
      gl.setRenderTarget(null);
      const tmp = sim.read;
      sim.read = sim.write;
      sim.write = tmp;

      displayMat.uniforms.uField.value = sim.read.texture;
      gl.render(scene, camera);

      debug.frames += 1;
      debug.tickMs.push(performance.now() - tickStart);
      if (debug.tickMs.length > METRICS_CAP) debug.tickMs.shift();

      const holdAwake = performance.now() - lastInputTime < WAKE_HOLD_MS;
      if (holdAwake || velEnergy > ENERGY_EPS || dyeEnergy > ENERGY_EPS) {
        rafId = requestAnimationFrame(tick);
      } else {
        running = false;
        debug.running = false;
      }
    };

    const wake = () => {
      if (running) return;
      running = true;
      debug.running = true;
      justWoke = true;
      rafId = requestAnimationFrame(tick);
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const uv = new THREE.Vector2(
        (e.clientX - rect.left) / rect.width,
        1 - (e.clientY - rect.top) / rect.height,
      );
      const now = performance.now();
      if (hasPrev) {
        const dtEv = Math.max((now - lastEventTime) / 1000, 1 / 240);
        // UV/sec, smoothed a little, clamped to keep splats sane.
        const v = uv.clone().sub(prevUv).divideScalar(dtEv);
        const len = v.length();
        if (len > 4) v.multiplyScalar(4 / len);
        pointerVel.lerp(v, 0.6);
        velEnergy = Math.max(velEnergy, pointerVel.length());
        dyeEnergy = Math.max(dyeEnergy, 0.5);
      }
      prevUv.copy(uv);
      pointer.copy(uv);
      hasPrev = true;
      lastEventTime = now;
      lastInputTime = now;
      wake();
    };

    const onPointerEnd = () => {
      hasPrev = false;
      pointerVel.set(0, 0);
    };

    // Passive listeners; CSS touch-action: pan-y preserves vertical scroll.
    canvas.addEventListener('pointermove', onPointerMove, { passive: true });
    canvas.addEventListener('pointerdown', onPointerMove, { passive: true });
    canvas.addEventListener('pointerleave', onPointerEnd, { passive: true });
    canvas.addEventListener('pointercancel', onPointerEnd, { passive: true });

    // One initial frame so the placeholder is visible before any input.
    wake();

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerEnd);
      canvas.removeEventListener('pointercancel', onPointerEnd);
      sim.read.dispose();
      sim.write.dispose();
      sim.material.dispose();
      displayMat.dispose();
      delete window.__fluidDebug;
    };
  }, [gl, scene, camera, sim, displayMat]);

  return (
    <mesh frustumCulled={false} material={displayMat}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

/**
 * Hero-sized fluid cursor canvas.
 *
 * Integration contract for a consuming particle material (see report):
 * - texture: the current read target's `.texture` (RGBA half-float, 128^2,
 *   linear-filtered, clamp-to-edge)
 * - RG = velocity in canvas-UV/second, range [-4, 4]
 * - B  = dye density, range [0, 2]
 * - sample with the particle's canvas-UV position; when the sim sleeps the
 *   texture freezes at (near-)zero, so sampling stays valid at zero cost.
 */
export default function FluidCursor() {
  const wrapRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0 }}>
      <Canvas
        dpr={[1, 1.5]}
        frameloop="never"
        flat
        gl={{ antialias: false, alpha: false, powerPreference: 'low-power' }}
        style={{ touchAction: 'pan-y' }}
      >
        <FluidSim />
      </Canvas>
    </div>
  );
}
