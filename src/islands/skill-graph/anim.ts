import * as THREE from 'three';
import { neighborsOf, nodeIndexMap, type GraphData } from '../../lib/graph';
import { cssVar } from '../../lib/webgl';

/*
 * Shared mutable animation state for the graph scene. One useFrame loop in
 * SkillGraph.tsx advances it; Nodes/Edges register their GPU objects into it.
 * Everything is preallocated typed arrays — zero per-frame allocation.
 */
export const nodeRadius = (weight: number): number => 0.7 + weight * 0.42;

export interface GraphAnim {
  n: number;
  cur: Float32Array;
  tgt: Float32Array;
  scaleCur: Float32Array;
  scaleTgt: Float32Array;
  baseScale: Float32Array;
  colorCur: Float32Array;
  colorTgt: Float32Array;
  baseColor: Float32Array;
  pairs: Uint16Array;
  nodesMesh: THREE.InstancedMesh | null;
  edgeAttr: THREE.BufferAttribute | null;
  animating: boolean;
}

export function categoryColors(): Record<string, THREE.Color> {
  const read = (v: string) => new THREE.Color(cssVar(v) || '#a3afa3');
  return {
    language: read('--node-language'),
    framework: read('--node-framework'),
    platform: read('--node-platform'),
    practice: read('--node-practice'),
    project: read('--node-project'),
  };
}

export function createAnim(graph: GraphData, base: number[]): GraphAnim {
  const n = graph.nodes.length;
  const colors = categoryColors();
  const anim: GraphAnim = {
    n,
    cur: Float32Array.from(base),
    tgt: Float32Array.from(base),
    scaleCur: new Float32Array(n),
    scaleTgt: new Float32Array(n),
    baseScale: new Float32Array(n),
    colorCur: new Float32Array(n * 3),
    colorTgt: new Float32Array(n * 3),
    baseColor: new Float32Array(n * 3),
    pairs: new Uint16Array(graph.edges.length * 2),
    nodesMesh: null,
    edgeAttr: null,
    animating: true, // first frame paints initial matrices/colors
  };
  graph.nodes.forEach((node, i) => {
    const r = nodeRadius(node.weight);
    anim.baseScale[i] = anim.scaleCur[i] = anim.scaleTgt[i] = r;
    const c = colors[node.category];
    anim.baseColor.set([c.r, c.g, c.b], i * 3);
  });
  anim.colorCur.set(anim.baseColor);
  anim.colorTgt.set(anim.baseColor);
  const idx = nodeIndexMap(graph);
  graph.edges.forEach((e, i) => {
    anim.pairs[i * 2] = idx.get(e.source) ?? 0;
    anim.pairs[i * 2 + 1] = idx.get(e.target) ?? 0;
  });
  return anim;
}

const DIM = 0.24; // how much base color survives on de-emphasized nodes

/** Set scale/color targets for a focus change (positions come from the worker). */
export function setFocusTargets(anim: GraphAnim, graph: GraphData, focusId: string | null): void {
  const neighbors = focusId ? neighborsOf(graph, focusId) : null;
  const bg = new THREE.Color(cssVar('--color-bg-deep') || '#0a0f0c');
  graph.nodes.forEach((node, i) => {
    const focused = node.id === focusId;
    const near = neighbors?.has(node.id) ?? false;
    const emphasized = focusId === null || focused || near;
    anim.scaleTgt[i] = anim.baseScale[i] * (focused ? 1.35 : emphasized ? 1 : 0.82);
    for (let k = 0; k < 3; k++) {
      const b = anim.baseColor[i * 3 + k];
      const dimTo = k === 0 ? bg.r : k === 1 ? bg.g : bg.b;
      anim.colorTgt[i * 3 + k] = emphasized ? b : dimTo + (b - dimTo) * DIM;
    }
  });
  anim.animating = true;
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const v3 = new THREE.Vector3();
const s3 = new THREE.Vector3();
const c3 = new THREE.Color();

/** Advance one frame; returns true while still animating. */
export function stepAnim(anim: GraphAnim, delta: number): boolean {
  if (!anim.animating || !anim.nodesMesh) return false;
  const f = 1 - Math.exp(-10 * delta);
  let maxd = 0;

  for (let i = 0; i < anim.n; i++) {
    for (let k = 0; k < 3; k++) {
      const p = i * 3 + k;
      const dp = anim.tgt[p] - anim.cur[p];
      anim.cur[p] += dp * f;
      const dc = anim.colorTgt[p] - anim.colorCur[p];
      anim.colorCur[p] += dc * f;
      maxd = Math.max(maxd, Math.abs(dp), Math.abs(dc));
    }
    const ds = anim.scaleTgt[i] - anim.scaleCur[i];
    anim.scaleCur[i] += ds * f;
    maxd = Math.max(maxd, Math.abs(ds));

    v3.set(anim.cur[i * 3], anim.cur[i * 3 + 1], anim.cur[i * 3 + 2]);
    s3.setScalar(anim.scaleCur[i]);
    anim.nodesMesh.setMatrixAt(i, m4.compose(v3, q, s3));
    c3.setRGB(anim.colorCur[i * 3], anim.colorCur[i * 3 + 1], anim.colorCur[i * 3 + 2]);
    anim.nodesMesh.setColorAt(i, c3);
  }
  anim.nodesMesh.instanceMatrix.needsUpdate = true;
  if (anim.nodesMesh.instanceColor) anim.nodesMesh.instanceColor.needsUpdate = true;

  if (anim.edgeAttr) {
    const arr = anim.edgeAttr.array as Float32Array;
    for (let e = 0; e < anim.pairs.length / 2; e++) {
      const a = anim.pairs[e * 2] * 3;
      const b = anim.pairs[e * 2 + 1] * 3;
      arr[e * 6] = anim.cur[a];
      arr[e * 6 + 1] = anim.cur[a + 1];
      arr[e * 6 + 2] = anim.cur[a + 2];
      arr[e * 6 + 3] = anim.cur[b];
      arr[e * 6 + 4] = anim.cur[b + 1];
      arr[e * 6 + 5] = anim.cur[b + 2];
    }
    anim.edgeAttr.needsUpdate = true;
  }

  if (maxd < 0.002) anim.animating = false;
  return true;
}
