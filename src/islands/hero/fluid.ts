import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { FULLSCREEN_VERT, SIM_FRAG } from './fluid-shaders';

/*
 * Fluid cursor field for the hero (origin: R1 spike, adapted):
 *  - 128² half-float ping-pong FBO; RG = velocity (canvas-UV/s, [-4,4]),
 *    B = dye. The particle vertex shader samples RG for displacement.
 *  - Pointer input comes from the HERO SECTION (the canvas is
 *    pointer-events:none so text/CTAs stay clickable); passive listeners,
 *    so touch smears never block native vertical scroll.
 *  - The sim pass runs inside useFrame ONLY while input is fresh or field
 *    energy is above epsilon — idle cost is zero on top of the morph loop,
 *    and the frozen near-zero texture stays valid to sample forever.
 */
const SIM_SIZE = 128;
const LAMBDA_VEL = 3.0;
const LAMBDA_DYE = 2.5;
const ENERGY_EPS = 0.015;
const INPUT_HOLD_MS = 80;

declare global {
  interface Window {
    __fluidDebug?: { frames: number; active: boolean };
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

/** Runs the fluid sim; calls `apply` with the current field texture each frame. */
export function useFluidField(apply: (tex: THREE.Texture) => void): void {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);

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
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return { material, scene, camera, read: makeTarget(), write: makeTarget() };
  }, []);

  const st = useRef({
    pointer: new THREE.Vector2(-1, -1),
    pointerVel: new THREE.Vector2(0, 0),
    prevUv: new THREE.Vector2(),
    hasPrev: false,
    lastInputTime: -Infinity,
    lastEventTime: 0,
    velEnergy: 0,
    dyeEnergy: 0,
  });

  useEffect(() => {
    sim.material.uniforms.uAspect!.value = size.width / Math.max(size.height, 1);
  }, [size, sim]);

  useEffect(() => {
    const canvas = gl.domElement;
    // input surface: the hero section (canvas itself is pointer-events:none)
    const surface: HTMLElement | Window = canvas.closest('section') ?? window;
    const s = st.current;
    window.__fluidDebug = { frames: 0, active: false };

    const onPointerMove = (ev: Event) => {
      const e = ev as PointerEvent;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const uv = new THREE.Vector2(
        (e.clientX - rect.left) / rect.width,
        1 - (e.clientY - rect.top) / rect.height,
      );
      const now = performance.now();
      if (s.hasPrev) {
        const dtEv = Math.max((now - s.lastEventTime) / 1000, 1 / 240);
        const v = uv.clone().sub(s.prevUv).divideScalar(dtEv);
        const len = v.length();
        if (len > 4) v.multiplyScalar(4 / len);
        s.pointerVel.lerp(v, 0.6);
        s.velEnergy = Math.max(s.velEnergy, s.pointerVel.length());
        s.dyeEnergy = Math.max(s.dyeEnergy, 0.5);
      }
      s.prevUv.copy(uv);
      s.pointer.copy(uv);
      s.hasPrev = true;
      s.lastEventTime = now;
      s.lastInputTime = now;
    };
    const onPointerEnd = () => {
      s.hasPrev = false;
      s.pointerVel.set(0, 0);
    };

    surface.addEventListener('pointermove', onPointerMove, { passive: true });
    surface.addEventListener('pointerdown', onPointerMove, { passive: true });
    surface.addEventListener('pointerleave', onPointerEnd, { passive: true });
    surface.addEventListener('pointercancel', onPointerEnd, { passive: true });
    return () => {
      surface.removeEventListener('pointermove', onPointerMove);
      surface.removeEventListener('pointerdown', onPointerMove);
      surface.removeEventListener('pointerleave', onPointerEnd);
      surface.removeEventListener('pointercancel', onPointerEnd);
      sim.read.dispose();
      sim.write.dispose();
      sim.material.dispose();
      delete window.__fluidDebug;
    };
  }, [gl, sim]);

  useFrame((_, delta) => {
    const s = st.current;
    const dt = Math.min(Math.max(delta, 1 / 240), 1 / 20);

    s.velEnergy *= Math.exp(-LAMBDA_VEL * dt);
    s.dyeEnergy *= Math.exp(-LAMBDA_DYE * dt);

    const inputFresh = performance.now() - s.lastInputTime < INPUT_HOLD_MS;
    const active = inputFresh || s.velEnergy > ENERGY_EPS || s.dyeEnergy > ENERGY_EPS;
    if (window.__fluidDebug) window.__fluidDebug.active = active;

    if (active) {
      const u = sim.material.uniforms;
      u.uField!.value = sim.read.texture;
      u.uDt!.value = dt;
      u.uVelDecay!.value = Math.exp(-LAMBDA_VEL * dt);
      u.uDyeDecay!.value = Math.exp(-LAMBDA_DYE * dt);
      (u.uPointer!.value as THREE.Vector2).copy(s.pointer);
      (u.uPointerVel!.value as THREE.Vector2).copy(
        inputFresh ? s.pointerVel : s.pointerVel.set(0, 0),
      );
      u.uSplat!.value = inputFresh ? 1 : 0;

      gl.setRenderTarget(sim.write);
      gl.render(sim.scene, sim.camera);
      gl.setRenderTarget(null);
      const tmp = sim.read;
      sim.read = sim.write;
      sim.write = tmp;
      if (window.__fluidDebug) window.__fluidDebug.frames++;
    }

    apply(sim.read.texture);
  });
}
