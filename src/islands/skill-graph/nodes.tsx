import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { GraphData } from '../../lib/graph';
import { cssVar } from '../../lib/webgl';

/* All nodes render as ONE InstancedMesh: one draw call regardless of node count.
 * Radii and colors intentionally match the SVG fallback (see GraphFallback.astro)
 * so the WebGL takeover reads as the same object coming to life. */

export const nodeRadius = (weight: number): number => 0.7 + weight * 0.42;

export function Nodes({ graph, positions }: { graph: GraphData; positions: number[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);

  const colors = useMemo(() => {
    const read = (v: string) => new THREE.Color(cssVar(v) || '#a3afa3');
    return {
      language: read('--node-language'),
      framework: read('--node-framework'),
      platform: read('--node-platform'),
      practice: read('--node-practice'),
      project: read('--node-project'),
    } as const;
  }, []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    graph.nodes.forEach((n, i) => {
      pos.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      const r = nodeRadius(n.weight);
      scale.set(r, r, r);
      mesh.setMatrixAt(i, m.compose(pos, q, scale));
      mesh.setColorAt(i, colors[n.category]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [graph, positions, colors]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, graph.nodes.length]}>
      <sphereGeometry args={[1, 24, 16]} />
      <meshStandardMaterial roughness={0.55} metalness={0.15} />
    </instancedMesh>
  );
}
