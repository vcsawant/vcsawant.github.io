import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { EV, type GraphReadyDetail, type SkillSelectDetail } from '../../lib/events';
import type { GraphData } from '../../lib/graph';
import { detectTier, prefersReducedMotion, type GpuTier } from '../../lib/webgl';
import { useRenderGate } from '../use-render-gate';
import { useDragSpin } from './drag';
import { createAnim, setFocusTargets, stepAnim } from './anim';
import { Nodes } from './nodes';
import { Edges } from './edges';
import type { WorkerOutMsg } from './protocol';

// Bloom is 'full'-tier only and lazy: lite/none tiers never download the chunk.
const GraphEffects = lazy(() => import('./bloom'));

export interface SkillGraphProps {
  graph: GraphData;
  /** xyz-interleaved base layout, graph.nodes order (plain array: island props must serialize) */
  positions: number[];
}

type Mode = 'pending' | 'webgl' | 'fallback' | 'static';

declare global {
  interface Window {
    __graphDebug?: {
      mode: string;
      tier: GpuTier;
      calls: number;
      focusId: string | null;
      rotationY: number;
    };
  }
}

function announce(mode: GraphReadyDetail['mode']): void {
  window.dispatchEvent(new CustomEvent<GraphReadyDetail>(EV.graphReady, { detail: { mode } }));
}

function dispatchSelect(skillId: string | null): void {
  window.dispatchEvent(new CustomEvent<SkillSelectDetail>(EV.skillSelect, { detail: { skillId } }));
}

/* If the WebGL context dies mid-session (or R3F throws during setup), fall back
 * to the SVG rather than leaving a dead canvas. */
class CanvasBoundary extends Component<{ onFail: () => void; children: ReactNode }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function GraphScene({ graph, positions, effects }: SkillGraphProps & { effects: boolean }) {
  useRenderGate();
  const gl = useThree((s) => s.gl);
  const groupRef = useRef<THREE.Group>(null);
  useDragSpin(groupRef);

  const anim = useMemo(() => createAnim(graph, positions), [graph, positions]);
  const focusRef = useRef<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  // The single owner of graph focus inside the island. The window event is the
  // source of truth: chips, Escape, and canvas taps all dispatch it; this
  // listener applies it (and guards echo loops by comparing against current).
  useEffect(() => {
    const worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onerror = (e) => {
      // selection dim/scale still applies; positions just won't reorganize
      console.warn('skill-graph layout worker failed:', e.message);
    };
    worker.onmessage = (ev: MessageEvent<WorkerOutMsg>) => {
      if (ev.data.type === 'positions') {
        anim.tgt.set(ev.data.positions);
        anim.animating = true;
      }
    };

    const onSelect = (e: Event) => {
      const { skillId } = (e as CustomEvent<SkillSelectDetail>).detail;
      if (skillId === focusRef.current) return;
      focusRef.current = skillId;
      if (window.__graphDebug) window.__graphDebug.focusId = skillId;
      worker.postMessage({
        type: 'reorganize',
        focusId: skillId,
        graph,
        positions: Float32Array.from(positions),
      });
      setFocusTargets(anim, graph, skillId);
    };
    window.addEventListener(EV.skillSelect, onSelect);

    // Replay any selection made BEFORE the island hydrated (chips are live
    // immediately; this island loads lazily): sync to the pressed chip.
    const pressed = document.querySelector<HTMLElement>('[data-skill-chip][aria-pressed="true"]');
    if (pressed?.dataset.skillChip) {
      onSelect(
        new CustomEvent<SkillSelectDetail>(EV.skillSelect, {
          detail: { skillId: pressed.dataset.skillChip },
        }),
      );
    }

    return () => {
      window.removeEventListener(EV.skillSelect, onSelect);
      worker.terminate();
      workerRef.current = null;
    };
  }, [anim, graph, positions]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const id = setTimeout(() => {
      const calls = gl.info.render.calls;
      if (window.__graphDebug) window.__graphDebug.calls = calls;
      // <=4 scene draws; the bloom composer adds internal passes on 'full' tier
      console.assert(calls <= 14, `skill-graph draw calls: ${calls} (expected <= 14)`);
    }, 500);
    return () => clearTimeout(id);
  }, [gl]);

  useFrame((_, delta) => {
    stepAnim(anim, Math.min(delta, 0.1));
    if (window.__graphDebug && groupRef.current) {
      window.__graphDebug.rotationY = groupRef.current.rotation.y;
    }
  });

  const requestSelect = (id: string) => {
    dispatchSelect(id === focusRef.current ? null : id);
  };

  return (
    <>
      <group ref={groupRef}>
        <ambientLight intensity={1.1} />
        <directionalLight position={[8, 12, 18]} intensity={1.4} />
        <Nodes graph={graph} anim={anim} onSelect={requestSelect} />
        <Edges anim={anim} />
      </group>
      {effects && (
        <Suspense fallback={null}>
          <GraphEffects />
        </Suspense>
      )}
      {/* invisible raycast catcher: a tap that misses every node clears the
          selection. Node clicks stopPropagation before reaching this. Not
          rendered (visible=false) — raycasting ignores visibility. */}
      <mesh
        visible={false}
        position={[0, 0, -24]}
        onClick={(e) => {
          if (e.delta > 6) return; // drag release, not a tap
          if (focusRef.current !== null) dispatchSelect(null);
        }}
      >
        <planeGeometry args={[400, 400]} />
      </mesh>
    </>
  );
}

export default function SkillGraph({ graph, positions }: SkillGraphProps) {
  const [mode, setMode] = useState<Mode>('pending');
  const [tier, setTier] = useState<GpuTier>('none');

  useEffect(() => {
    const t = detectTier();
    setTier(t);
    const m: Mode = prefersReducedMotion() ? 'static' : t === 'none' ? 'fallback' : 'webgl';
    setMode(m);
    if (m !== 'webgl') announce(m); // webgl is announced only once the context truly exists
    window.__graphDebug = { mode: m, tier: t, calls: 0, focusId: null, rotationY: 0 };
  }, []);

  const fail = () => {
    setMode('fallback');
    if (window.__graphDebug) window.__graphDebug.mode = 'fallback';
    announce('fallback');
  };

  // The wrapper ALWAYS renders (including SSR): client:visible needs the island
  // to occupy space or its IntersectionObserver never fires. It is transparent
  // and pointer-events:none until a canvas actually lives inside it.
  if (mode !== 'webgl') return <div className="skill-graph-canvas" aria-hidden="true" />;

  return (
    <div className="skill-graph-canvas" data-live aria-hidden="true">
      <CanvasBoundary onFail={fail}>
        <Canvas
          dpr={[1, 1.5]}
          frameloop="demand"
          gl={{ antialias: false, alpha: true, powerPreference: 'low-power' }}
          camera={{ fov: 40, position: [0, 0, 46] }}
          onCreated={({ gl }) => {
            announce('webgl');
            gl.domElement.addEventListener('webglcontextlost', (e) => {
              e.preventDefault();
              fail();
            });
          }}
        >
          <GraphScene graph={graph} positions={positions} effects={tier === 'full'} />
        </Canvas>
      </CanvasBoundary>
    </div>
  );
}
