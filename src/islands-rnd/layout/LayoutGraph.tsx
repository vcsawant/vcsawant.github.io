// R&D prototype: 3D force graph with build-time base layout and
// worker-driven tap-to-focus reorganization (hybrid approach "d").
// Main thread only ever copies Float32Arrays and eases toward them.

import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { buildGraph, nodeIndexMap, type GraphData } from './graph';
import type { DoneMsg, ReorganizeMsg, WorkerOutMsg } from './protocol';

export interface LayoutGraphProps {
  /** xyz-interleaved base layout computed at build time */
  basePositions: number[];
  baseTicks: number;
  buildLayoutMs: number;
}

export interface Metric {
  focusId: string | null;
  workerComputeMs: number;
  workerWallMs: number;
  mainMsgMs: number;
  mainFrameMs: number;
  frames: number;
  maxFrameGapMs: number;
  batches: number;
  ticks: number;
  totalMs: number;
}

declare global {
  interface Window {
    __layoutMetrics: Metric[];
    __focusNode: (id: string | null) => void;
  }
}

interface Transition {
  focusId: string | null;
  startT: number;
  mainMsgMs: number;
  mainFrameMs: number;
  frames: number;
  maxFrameGapMs: number;
  lastFrameT: number | null;
  done: DoneMsg | null;
}

interface Shared {
  displayed: Float32Array;
  target: Float32Array;
  transition: Transition | null;
}

const HUB_COLOR = new THREE.Color('#f59e0b');
const SKILL_COLOR = new THREE.Color('#60a5fa');
const FOCUS_COLOR = new THREE.Color('#ffffff');
const SMOOTHING = 10; // 1/s exponential ease constant
const SETTLE_EPS = 0.005; // world units

function GraphScene({
  graph,
  shared,
  focusId,
  onTapNode,
  onSettled,
}: {
  graph: GraphData;
  shared: Shared;
  focusId: string | null;
  onTapNode: (id: string | null) => void;
  onSettled: (t: Transition) => void;
}): React.ReactElement {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const edgesRef = useRef<THREE.LineSegments>(null);
  const groupRef = useRef<THREE.Group>(null);
  const n = graph.nodes.length;

  // Responsive framing: keep the ~r=17 layout in view on narrow (phone) aspects.
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useEffect(() => {
    const aspect = size.width / size.height;
    camera.position.z = Math.max(42, 42 / Math.min(1, aspect * 1.25));
    camera.updateProjectionMatrix();
  }, [camera, size]);

  const edgeIndices = useMemo(() => {
    const idx = nodeIndexMap(graph);
    return graph.edges.map((e) => [idx.get(e.source) ?? 0, idx.get(e.target) ?? 0] as const);
  }, [graph]);

  const edgePositions = useMemo(() => new Float32Array(graph.edges.length * 6), [graph]);

  // per-instance colors follow focus state
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < n; i++) {
      const node = graph.nodes[i];
      const c =
        node.id === focusId ? FOCUS_COLOR : node.kind === 'project' ? HUB_COLOR : SKILL_COLOR;
      mesh.setColorAt(i, c);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [graph, focusId, n]);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    const edges = edgesRef.current;
    if (!mesh || !edges) return;
    const frameStart = performance.now();

    // ease displayed -> target
    const k = 1 - Math.exp(-SMOOTHING * Math.min(delta, 0.1));
    const { displayed, target } = shared;
    let maxDelta = 0;
    for (let i = 0; i < displayed.length; i++) {
      const d = target[i] - displayed[i];
      const ad = Math.abs(d);
      if (ad > maxDelta) maxDelta = ad;
      displayed[i] += d * k;
    }

    // node instance matrices
    for (let i = 0; i < n; i++) {
      const node = graph.nodes[i];
      dummy.position.set(displayed[i * 3], displayed[i * 3 + 1], displayed[i * 3 + 2]);
      const s =
        (node.kind === 'project' ? 0.34 : 0.26) * node.weight * (node.id === focusId ? 1.35 : 1);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    // edge segment endpoints
    for (let e = 0; e < edgeIndices.length; e++) {
      const [a, b] = edgeIndices[e];
      edgePositions[e * 6 + 0] = displayed[a * 3];
      edgePositions[e * 6 + 1] = displayed[a * 3 + 1];
      edgePositions[e * 6 + 2] = displayed[a * 3 + 2];
      edgePositions[e * 6 + 3] = displayed[b * 3];
      edgePositions[e * 6 + 4] = displayed[b * 3 + 1];
      edgePositions[e * 6 + 5] = displayed[b * 3 + 2];
    }
    const attr = edges.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;
    edges.geometry.computeBoundingSphere();

    // slow scene rotation for depth cue
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.06;

    // transition bookkeeping
    const t = shared.transition;
    if (t) {
      const now = performance.now();
      t.mainFrameMs += now - frameStart;
      t.frames++;
      if (t.lastFrameT !== null) {
        const gap = frameStart - t.lastFrameT;
        if (gap > t.maxFrameGapMs) t.maxFrameGapMs = gap;
      }
      t.lastFrameT = frameStart;
      if (t.done && maxDelta < SETTLE_EPS) {
        shared.transition = null;
        onSettled(t);
      }
    }
  });

  const handleTap = useCallback(
    (ev: ThreeEvent<PointerEvent>) => {
      ev.stopPropagation();
      const id = ev.instanceId;
      if (id === undefined) return;
      const nodeId = graph.nodes[id].id;
      onTapNode(nodeId === focusId ? null : nodeId);
    },
    [graph, focusId, onTapNode],
  );

  return (
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, n]} onPointerDown={handleTap}>
        <sphereGeometry args={[1, 20, 14]} />
        <meshStandardMaterial roughness={0.35} metalness={0.15} />
      </instancedMesh>
      <lineSegments ref={edgesRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[edgePositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#3b4a63" transparent opacity={0.55} />
      </lineSegments>
      <ambientLight intensity={0.7} />
      <directionalLight position={[8, 12, 10]} intensity={1.4} />
    </group>
  );
}

export default function LayoutGraph({
  basePositions,
  baseTicks,
  buildLayoutMs,
}: LayoutGraphProps): React.ReactElement {
  const graph = useMemo(() => buildGraph(), []);
  const base = useMemo(() => Float32Array.from(basePositions), [basePositions]);
  const sharedRef = useRef<Shared | null>(null);
  if (sharedRef.current === null) {
    sharedRef.current = {
      displayed: Float32Array.from(base),
      target: Float32Array.from(base),
      transition: null,
    };
  }
  const shared = sharedRef.current;
  const workerRef = useRef<Worker | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [lastMetric, setLastMetric] = useState<Metric | null>(null);

  const onSettled = useCallback((t: Transition) => {
    const d = t.done;
    if (!d) return;
    const metric: Metric = {
      focusId: t.focusId,
      workerComputeMs: round2(d.workerComputeMs),
      workerWallMs: round2(d.workerWallMs),
      mainMsgMs: round2(t.mainMsgMs),
      mainFrameMs: round2(t.mainFrameMs),
      frames: t.frames,
      maxFrameGapMs: round2(t.maxFrameGapMs),
      batches: d.batches,
      ticks: d.ticks,
      totalMs: round2(performance.now() - t.startT),
    };
    window.__layoutMetrics.push(metric);
    setLastMetric(metric);
  }, []);

  useEffect(() => {
    window.__layoutMetrics = window.__layoutMetrics ?? [];
    const worker = new Worker(new URL('./layout.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    worker.onmessage = (ev: MessageEvent<WorkerOutMsg>) => {
      const msg = ev.data;
      const t = shared.transition;
      if (msg.type === 'positions') {
        const t0 = performance.now();
        shared.target.set(msg.positions);
        if (t) t.mainMsgMs += performance.now() - t0;
      } else if (msg.type === 'done') {
        if (t) t.done = msg;
      }
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [shared]);

  const focus = useCallback(
    (id: string | null) => {
      const worker = workerRef.current;
      if (!worker) return;
      setFocusId(id);
      shared.transition = {
        focusId: id,
        startT: performance.now(),
        mainMsgMs: 0,
        mainFrameMs: 0,
        frames: 0,
        maxFrameGapMs: 0,
        lastFrameT: null,
        done: null,
      };
      // Canonical warm start: always send the build-time base layout.
      const positions = Float32Array.from(base);
      const msg: ReorganizeMsg = { type: 'reorganize', focusId: id, graph, positions };
      worker.postMessage(msg, [positions.buffer]);
    },
    [graph, base, shared],
  );

  useEffect(() => {
    window.__focusNode = focus;
  }, [focus]);

  const focusablesRef = useRef(0);
  const cycleFocus = useCallback(() => {
    const id = graph.nodes[focusablesRef.current % graph.nodes.length].id;
    focusablesRef.current++;
    focus(id);
  }, [graph, focus]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0b0f17' }}>
      <Canvas camera={{ position: [0, 0, 34], fov: 45 }} dpr={[1, 2]}>
        <GraphScene
          graph={graph}
          shared={shared}
          focusId={focusId}
          onTapNode={focus}
          onSettled={onSettled}
        />
      </Canvas>
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          color: '#cbd5e1',
          font: '12px/1.5 ui-monospace, monospace',
          background: 'rgba(11,15,23,0.8)',
          padding: '10px 12px',
          borderRadius: 8,
          maxWidth: 340,
          pointerEvents: 'auto',
        }}
      >
        <div>
          base layout: {baseTicks} ticks @ build ({buildLayoutMs.toFixed(1)} ms, build machine)
        </div>
        <div>focus: {focusId ?? '—'} (tap a node, tap again to clear)</div>
        {lastMetric && (
          <div data-testid="metric" style={{ marginTop: 6 }}>
            <div>last reorganize → {lastMetric.focusId ?? 'base'}</div>
            <div>
              worker compute {lastMetric.workerComputeMs} ms / wall {lastMetric.workerWallMs} ms (
              {lastMetric.ticks} ticks, {lastMetric.batches} batches)
            </div>
            <div>
              main onmessage {lastMetric.mainMsgMs} ms · frame-update {lastMetric.mainFrameMs} ms
              over {lastMetric.frames} frames
            </div>
            <div>
              max frame gap {lastMetric.maxFrameGapMs} ms · settled in {lastMetric.totalMs} ms
            </div>
          </div>
        )}
        <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
          <button id="focus-next" onClick={cycleFocus} style={btnStyle}>
            Focus next
          </button>
          <button id="clear-focus" onClick={() => focus(null)} style={btnStyle}>
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: '#1e293b',
  color: '#e2e8f0',
  border: '1px solid #334155',
  borderRadius: 6,
  padding: '4px 10px',
  font: '12px ui-monospace, monospace',
  cursor: 'pointer',
};

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
