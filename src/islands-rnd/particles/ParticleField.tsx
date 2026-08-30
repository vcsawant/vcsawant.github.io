/**
 * Morphing particle field spike (R&D).
 *
 * All morphing runs in the vertex shader; the CPU's per-frame job is setting
 * two uniforms (uMorph, uTime) and bumping the debug frame counter.
 *
 * Cycle timing API: <ParticleField dwellMs={...} morphMs={...} /> — the field
 * dwells on each target for dwellMs, then morphs to the next over morphMs,
 * cycling knight -> "VS" -> graph -> knight.
 *
 * URL overrides on the test route: ?tier=low|high &dwell=ms &morph=ms &dpr=n
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { loadMorphTargets, strideSample, type MorphTargetData } from './loadMorphTargets';
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders';

export const TIER_COUNTS = { high: 25000, low: 8000 } as const;
export type Tier = keyof typeof TIER_COUNTS;

interface ParticlesDebug {
  frames: number;
  phase: 'dwell' | 'morph';
  tier: Tier;
  count: number;
  dwellMs: number;
  morphMs: number;
}

declare global {
  interface Window {
    __particlesDebug?: ParticlesDebug;
  }
}

/** 1x1 neutral distortion texture: RG = 0.5 decodes to zero displacement.
 *  The fluid sim will later swap in its own RG displacement render target. */
function makeNeutralDistortion(): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array([128, 128, 0, 255]), 1, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

function Particles({
  data,
  tier,
  dwellMs,
  morphMs,
}: {
  data: MorphTargetData;
  tier: Tier;
  dwellMs: number;
  morphMs: number;
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  // fit content (spans ~±1.15 world units plus swirl margin) into the frustum;
  // recomputed only on resize renders, never per-frame
  const viewport = useThree((s) => s.viewport);
  const fitScale = Math.min(1.15, (Math.min(viewport.width, viewport.height) / 2 / 1.3) * 0.95);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const [t0, t1, t2] = data.targets;
    if (!t0 || !t1 || !t2) throw new Error('expected 3 morph targets');
    const seeds = new Float32Array(data.count);
    for (let i = 0; i < data.count; i++) {
      // deterministic per-particle seed in [0,1)
      seeds[i] = ((i * 2654435761) % 4294967296) / 4294967296;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(t0, 3));
    geo.setAttribute('aTarget1', new THREE.BufferAttribute(t1, 3));
    geo.setAttribute('aTarget2', new THREE.BufferAttribute(t2, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    // swirl offsets never leave this radius; skip per-frame bounds work
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3);
    return geo;
  }, [data]);

  const uniforms = useMemo(
    () => ({
      uMorph: { value: 0 },
      uTime: { value: 0 },
      uPointScale: { value: 0 }, // set on first frame from real dpr/height
      uDistortion: { value: makeNeutralDistortion() },
    }),
    [],
  );

  useEffect(() => {
    window.__particlesDebug = {
      frames: 0,
      phase: 'dwell',
      tier,
      count: data.count,
      dwellMs,
      morphMs,
    };
  }, [tier, data.count, dwellMs, morphMs]);

  useFrame(({ clock, gl, size }) => {
    const mat = materialRef.current;
    if (!mat) return;
    const elapsedMs = clock.elapsedTime * 1000;
    const period = dwellMs + morphMs;
    const local = elapsedMs % period;
    const seg = Math.floor(elapsedMs / period) % 3;
    const progress = Math.min(Math.max((local - dwellMs) / morphMs, 0), 1);
    mat.uniforms.uMorph!.value = seg + progress;
    mat.uniforms.uTime!.value = clock.elapsedTime;
    // init-only in practice (constant after first frame; no GPU upload cost)
    mat.uniforms.uPointScale!.value = 3.4 * gl.getPixelRatio() * (size.height / 400);

    const dbg = window.__particlesDebug;
    if (dbg) {
      dbg.frames++;
      dbg.phase = progress > 0 && progress < 1 ? 'morph' : 'dwell';
    }
  });

  return (
    <points geometry={geometry} frustumCulled={false} scale={fitScale}>
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

export default function ParticleField({
  dwellMs = 2600,
  morphMs = 2400,
}: {
  dwellMs?: number;
  morphMs?: number;
}) {
  const params = useMemo(() => {
    const q = new URLSearchParams(window.location.search);
    const tier: Tier = q.get('tier') === 'low' ? 'low' : 'high';
    return {
      tier,
      dwellMs: Number(q.get('dwell')) || dwellMs,
      morphMs: Number(q.get('morph')) || morphMs,
      dpr: Number(q.get('dpr')) || 1,
    };
  }, [dwellMs, morphMs]);

  const [data, setData] = useState<MorphTargetData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadMorphTargets()
      .then((full) => {
        if (!cancelled) setData(strideSample(full, TIER_COUNTS[params.tier]));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [params.tier]);

  if (error) return <div style={{ color: '#f66', padding: 16 }}>{error}</div>;
  if (!data) return null;

  return (
    <Canvas
      dpr={params.dpr}
      camera={{ position: [0, 0, 3.1], fov: 50 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      style={{ position: 'absolute', inset: 0, background: '#0a0e14' }}
    >
      <Particles data={data} tier={params.tier} dwellMs={params.dwellMs} morphMs={params.morphMs} />
    </Canvas>
  );
}
