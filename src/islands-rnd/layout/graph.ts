// Dummy graph data mimicking the real shape: ~20 skill nodes + ~5 project hubs,
// edges mostly hub -> skill, plus a few skill <-> skill affinities.
// Fully deterministic (no RNG) so build-time and runtime agree byte-for-byte.

export type NodeKind = 'skill' | 'project';

export interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  /** 2..5, drives node radius */
  weight: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const SKILLS = [
  'typescript',
  'react',
  'nextjs',
  'astro',
  'nodejs',
  'postgres',
  'flyio',
  'vercel',
  'cloudflare',
  'webgl',
  'threejs',
  'graphql',
  'tailwind',
  'cicd',
  'elixir',
  'phoenix',
  'rust',
  'wasm',
  'redis',
  'docker',
] as const;

const PROJECTS = ['proj-site', 'proj-viz', 'proj-api', 'proj-infra', 'proj-game'] as const;

export function buildGraph(): GraphData {
  const nodes: GraphNode[] = [
    ...SKILLS.map((id, i) => ({
      id,
      label: id,
      kind: 'skill' as const,
      weight: 3 + (i % 3), // 3..5, deterministic
    })),
    ...PROJECTS.map((id, i) => ({
      id,
      label: id,
      kind: 'project' as const,
      weight: 4 + (i % 2), // 4..5
    })),
  ];

  const edges: GraphEdge[] = [];
  // Each hub owns a 4-skill core plus 3 shared skills => 5 * 7 = 35 hub->skill edges.
  for (let h = 0; h < PROJECTS.length; h++) {
    const base = h * 4;
    const picks = [
      base,
      base + 1,
      base + 2,
      base + 3,
      (base + 7) % SKILLS.length,
      (base + 11) % SKILLS.length,
      (base + 14) % SKILLS.length,
    ];
    for (const s of picks) {
      edges.push({ source: PROJECTS[h], target: SKILLS[s] });
    }
  }
  // 5 skill<->skill affinity edges => 40 total.
  const affinities: Array<[number, number]> = [
    [1, 6],
    [3, 12],
    [7, 18],
    [9, 14],
    [2, 11],
  ];
  for (const [a, b] of affinities) {
    edges.push({ source: SKILLS[a], target: SKILLS[b] });
  }

  return { nodes, edges };
}

export function nodeIndexMap(graph: GraphData): Map<string, number> {
  const m = new Map<string, number>();
  graph.nodes.forEach((n, i) => m.set(n.id, i));
  return m;
}

export function neighborsOf(graph: GraphData, id: string): Set<string> {
  const out = new Set<string>();
  for (const e of graph.edges) {
    if (e.source === id) out.add(e.target);
    if (e.target === id) out.add(e.source);
  }
  return out;
}
