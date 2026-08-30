// Shared force-simulation core. Imported ONLY by:
//   - Astro page frontmatter (build time, Node) for the base layout
//   - layout.worker.ts (runtime, Web Worker) for focus reorganization
// Never import this from the island's main-thread bundle: it pulls in
// d3-force-3d (~8.5 KB gzip) which must stay out of the main chunk.
// Origin: R2 layout research (docs/rnd/layout/report.md), adapted to src/lib/graph types.

import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceRadial,
  type Simulation,
  type SimNodeDatum,
} from 'd3-force-3d';
import { neighborsOf, type GraphData, type GraphEdge } from '../../lib/graph';

type NodeKind = 'skill' | 'project';

export interface SimNode extends SimNodeDatum {
  id: string;
  kind: NodeKind;
  weight: number;
  x: number;
  y: number;
  z: number;
}

interface SimLink {
  source: SimNode | string;
  target: SimNode | string;
  kind: 'hub' | 'affinity';
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Deterministic seed positions: golden-spiral points on two spheres
 * (hubs inner, skills outer). No RNG anywhere; combined with
 * d3-force-3d's built-in seeded lcg() randomSource (only used to
 * un-stick coincident nodes, which never occur here), every layout
 * pass is bit-reproducible for a given engine.
 */
export function seedPositions(graph: GraphData): Float32Array {
  const n = graph.nodes.length;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const node = graph.nodes[i];
    const t = (i + 0.5) / n;
    const y = 1 - 2 * t;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = GOLDEN_ANGLE * i;
    const radius = node.kind === 'project' ? 6 : 13;
    out[i * 3 + 0] = radius * r * Math.cos(theta);
    out[i * 3 + 1] = radius * y;
    out[i * 3 + 2] = radius * r * Math.sin(theta);
  }
  return out;
}

function toSimNodes(graph: GraphData, positions: Float32Array): SimNode[] {
  return graph.nodes.map((n, i) => ({
    id: n.id,
    kind: n.kind,
    weight: n.weight,
    x: positions[i * 3 + 0],
    y: positions[i * 3 + 1],
    z: positions[i * 3 + 2],
    vx: 0,
    vy: 0,
    vz: 0,
  }));
}

function toSimLinks(edges: GraphEdge[], kinds: Map<string, NodeKind>): SimLink[] {
  return edges.map((e) => ({
    source: e.source,
    target: e.target,
    kind:
      kinds.get(e.source) === 'project' || kinds.get(e.target) === 'project' ? 'hub' : 'affinity',
  }));
}

function kindMap(graph: GraphData): Map<string, NodeKind> {
  return new Map(graph.nodes.map((n) => [n.id, n.kind]));
}

export function readPositions(nodes: SimNode[]): Float32Array {
  const out = new Float32Array(nodes.length * 3);
  for (let i = 0; i < nodes.length; i++) {
    out[i * 3 + 0] = nodes[i].x;
    out[i * 3 + 1] = nodes[i].y;
    out[i * 3 + 2] = nodes[i].z;
  }
  return out;
}

/** Base (unfocused) force model. */
function buildBaseSim(graph: GraphData, positions: Float32Array): Simulation<SimNode> {
  const nodes = toSimNodes(graph, positions);
  const links = toSimLinks(graph.edges, kindMap(graph));
  return forceSimulation<SimNode>(nodes, 3)
    .stop()
    .force(
      'link',
      forceLink<SimNode, SimLink>(links)
        .id((d: SimNode) => d.id)
        .distance((l) => (l.kind === 'hub' ? 7 : 5.5))
        .strength(0.9),
    )
    .force(
      'charge',
      forceManyBody<SimNode>()
        .strength((n) => (n.kind === 'project' ? -25 : -10))
        .distanceMax(14),
    )
    .force('center', forceCenter(0, 0, 0))
    .force(
      'radial',
      forceRadial<SimNode>((n) => (n.kind === 'project' ? 4.5 : 11), 0, 0, 0).strength(0.8),
    );
}

export interface BaseLayoutResult {
  positions: Float32Array;
  ticks: number;
}

/** Build-time base layout: run the base model to convergence from the seed. */
export function computeBaseLayout(graph: GraphData): BaseLayoutResult {
  const sim = buildBaseSim(graph, seedPositions(graph));
  let ticks = 0;
  while (sim.alpha() > sim.alphaMin() && ticks < 500) {
    sim.tick();
    ticks++;
  }
  return { positions: readPositions(sim.nodes()), ticks };
}

export const FOCUS_TICKS = 90;

/**
 * Focus force model, warm-started from `positions` (the canonical base
 * layout — NOT the currently displayed positions; see report §determinism).
 * The focused node is pinned near the origin, its neighbors are pulled
 * tight, everything else relaxes outward.
 */
export function buildFocusSim(
  graph: GraphData,
  positions: Float32Array,
  focusId: string,
): Simulation<SimNode> {
  const nodes = toSimNodes(graph, positions);
  const links = toSimLinks(graph.edges, kindMap(graph));
  const neighbors = neighborsOf(graph, focusId);

  for (const n of nodes) {
    if (n.id === focusId) {
      n.fx = 0;
      n.fy = 0;
      n.fz = 0;
    }
  }

  const touches = (l: SimLink, id: string): boolean => {
    const s = typeof l.source === 'string' ? l.source : l.source.id;
    const t = typeof l.target === 'string' ? l.target : l.target.id;
    return s === id || t === id;
  };

  const sim = forceSimulation<SimNode>(nodes, 3)
    .stop()
    .force(
      'link',
      forceLink<SimNode, SimLink>(links)
        .id((d: SimNode) => d.id)
        .distance((l) => (touches(l, focusId) ? 4.5 : l.kind === 'hub' ? 8 : 6.5))
        .strength((l) => (touches(l, focusId) ? 1.0 : 0.15)),
    )
    .force(
      'charge',
      forceManyBody<SimNode>()
        .strength((n) => (n.id === focusId ? -40 : n.kind === 'project' ? -18 : -10))
        .distanceMax(14),
    )
    .force(
      'radial',
      forceRadial<SimNode>(
        (n) => (n.id === focusId ? 0 : neighbors.has(n.id) ? 5 : 12.5),
        0,
        0,
        0,
      ).strength((n) => (neighbors.has(n.id) ? 0.55 : 0.5)),
    );

  // alpha schedule sized so the sim settles in ~FOCUS_TICKS ticks.
  const alpha0 = 0.6;
  const alphaMin = 0.001;
  sim
    .alpha(alpha0)
    .alphaMin(alphaMin)
    .alphaDecay(1 - Math.pow(alphaMin / alpha0, 1 / FOCUS_TICKS));
  return sim;
}
