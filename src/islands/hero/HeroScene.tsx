import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { cssVar, detectTier, prefersReducedMotion } from '../../lib/webgl';
import { useRenderGate } from '../use-render-gate';
import { loadMorphTargets, strideSample, type MorphTargetData } from './load-morph-targets';
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders';

/*
 * Hero particle field: morphs knight -> "VS" -> skill-graph wireframe.
 * Origin: R3 spike, hardened for production:
 *  - mounts client:idle so the text LCP always wins; canvas is decorative
 *    (aria-hidden, pointer-events none via Hero.astro CSS)
 *  - render gate pauses everything off-screen / on tab blur
 *  - tier 'lite' stride-samples to 8k particles; tier 'none' or reduced
 *    motion renders nothing (the hero keeps its static gradient; WebM/poster
 *    fallbacks arrive in Phase 7)
 */
const TIER_COUNTS = { full: 25000, lite: 8000 } as const;
const DWELL_MS = 2600;
const MORPH_MS = 2400;

declare global {
  interface Window {
    __heroDebug?: { frames: number; count: number };
  }
}

function makeNeutralDistortion(): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array([128, 128, 0, 255]), 1, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

function Particles({ data }: { data: MorphTargetData }) {
  useRenderGate();
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const viewport = useThree((s) => s.viewport);
  // fit content (~±1.3 world units incl. swirl) into the frustum height
  const fitScale = Math.min(1.0, (Math.min(viewport.width, viewport.height) / 2 / 1.3) * 0.95);
  // on wide screens drift the field right-of-center, behind the negative space
  const xOffset = viewport.width > 6 ? viewport.width * 0.24 : 0;

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const [t0, t1, t2] = data.targets;
    if (!t0 || !t1 || !t2) throw new Error('expected 3 morph targets');
    const seeds = new Float32Array(data.count);
    for (let i = 0; i < data.count; i++) {
      seeds[i] = ((i * 2654435761) % 4294967296) / 4294967296;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(t0, 3));
    geo.setAttribute('aTarget1', new THREE.BufferAttribute(t1, 3));
    geo.setAttribute('aTarget2', new THREE.BufferAttribute(t2, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3);
    return geo;
  }, [data]);

  const uniforms = useMemo(
    () => ({
      uMorph: { value: 0 },
      uTime: { value: 0 },
      uPointScale: { value: 0 },
      uColorCore: { value: new THREE.Color(cssVar('--color-text') || '#e9e4d6') },
      uColorEdge: { value: new THREE.Color(cssVar('--color-accent') || '#c9a45c') },
      uDistortion: { value: makeNeutralDistortion() },
    }),
    [],
  );

  useEffect(() => {
    window.__heroDebug = { frames: 0, count: data.count };
  }, [data.count]);

  useFrame(({ clock, gl, size }) => {
    const mat = materialRef.current;
    if (!mat) return;
    const elapsedMs = clock.elapsedTime * 1000;
    const period = DWELL_MS + MORPH_MS;
    const local = elapsedMs % period;
    const seg = Math.floor(elapsedMs / period) % 3;
    const progress = Math.min(Math.max((local - DWELL_MS) / MORPH_MS, 0), 1);
    mat.uniforms.uMorph!.value = seg + progress;
    mat.uniforms.uTime!.value = clock.elapsedTime;
    mat.uniforms.uPointScale!.value = 3.4 * gl.getPixelRatio() * (size.height / 400);
    if (window.__heroDebug) window.__heroDebug.frames++;
  });

  return (
    <points geometry={geometry} frustumCulled={false} scale={fitScale} position={[xOffset, 0, 0]}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export default function HeroScene() {
  const [data, setData] = useState<MorphTargetData | null>(null);

  useEffect(() => {
    const tier = detectTier();
    if (tier === 'none' || prefersReducedMotion()) return; // static hero, no fetch
    let cancelled = false;
    loadMorphTargets()
      .then((full) => {
        if (!cancelled) setData(strideSample(full, TIER_COUNTS[tier]));
      })
      .catch(() => {
        /* decorative: on any failure the static hero simply remains */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return null;

  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop="demand"
      camera={{ position: [0, 0, 3.1], fov: 50 }}
      gl={{ antialias: false, alpha: true, powerPreference: 'low-power' }}
    >
      <Particles data={data} />
    </Canvas>
  );
}
