import { useMemo } from 'react';
import * as THREE from 'three';
import { nodeIndexMap, type GraphData } from '../../lib/graph';
import { cssVar } from '../../lib/webgl';

/* All edges in ONE LineSegments buffer: one draw call. */
export function Edges({ graph, positions }: { graph: GraphData; positions: number[] }) {
  const geometry = useMemo(() => {
    const idx = nodeIndexMap(graph);
    const arr = new Float32Array(graph.edges.length * 6);
    graph.edges.forEach((e, i) => {
      const a = (idx.get(e.source) ?? 0) * 3;
      const b = (idx.get(e.target) ?? 0) * 3;
      arr.set(
        [
          positions[a],
          positions[a + 1],
          positions[a + 2],
          positions[b],
          positions[b + 1],
          positions[b + 2],
        ],
        i * 6,
      );
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return g;
  }, [graph, positions]);

  const color = useMemo(() => new THREE.Color(cssVar('--color-text-muted') || '#a3afa3'), []);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={0.28} />
    </lineSegments>
  );
}
