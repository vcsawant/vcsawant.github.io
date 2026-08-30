import { Component, useEffect, useState, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { EV, type GraphReadyDetail } from '../../lib/events';
import type { GraphData } from '../../lib/graph';
import { detectTier, prefersReducedMotion, type GpuTier } from '../../lib/webgl';
import { useRenderGate } from './use-render-gate';
import { Nodes } from './nodes';
import { Edges } from './edges';

export interface SkillGraphProps {
  graph: GraphData;
  /** xyz-interleaved base layout, graph.nodes order (plain array: island props must serialize) */
  positions: number[];
}

type Mode = 'pending' | 'webgl' | 'fallback' | 'static';

function announce(mode: GraphReadyDetail['mode']): void {
  window.dispatchEvent(new CustomEvent<GraphReadyDetail>(EV.graphReady, { detail: { mode } }));
}

declare global {
  interface Window {
    __graphDebug?: { mode: string; tier: GpuTier; calls: number };
  }
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

function GraphScene({ graph, positions }: SkillGraphProps) {
  useRenderGate();
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const id = setTimeout(() => {
      const calls = gl.info.render.calls;
      window.__graphDebug = { ...window.__graphDebug!, calls };
      console.assert(calls <= 4, `skill-graph draw calls: ${calls} (expected <= 4)`);
    }, 500);
    return () => clearTimeout(id);
  }, [gl]);

  return (
    <>
      <ambientLight intensity={1.1} />
      <directionalLight position={[8, 12, 18]} intensity={1.4} />
      <Nodes graph={graph} positions={positions} />
      <Edges graph={graph} positions={positions} />
    </>
  );
}

export default function SkillGraph({ graph, positions }: SkillGraphProps) {
  const [mode, setMode] = useState<Mode>('pending');

  useEffect(() => {
    const t = detectTier();
    const m: Mode = prefersReducedMotion() ? 'static' : t === 'none' ? 'fallback' : 'webgl';
    setMode(m);
    if (m !== 'webgl') announce(m); // webgl is announced only once the context truly exists
    if (import.meta.env.DEV) window.__graphDebug = { mode: m, tier: t, calls: 0 };
  }, []);

  const fail = () => {
    setMode('fallback');
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
          <GraphScene graph={graph} positions={positions} />
        </Canvas>
      </CanvasBoundary>
    </div>
  );
}
