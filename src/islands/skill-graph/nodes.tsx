import { useLayoutEffect, useRef } from 'react';
import type * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { GraphData } from '../../lib/graph';
import type { GraphAnim } from './anim';

/* All nodes render as ONE InstancedMesh: one draw call regardless of node count.
 * Matrices and colors are written by the anim loop (see anim.ts / SkillGraph.tsx);
 * this component owns the mesh and the tap-to-select raycast. */

const CLICK_SLOP_PX = 6;

export function Nodes({
  graph,
  anim,
  onSelect,
}: {
  graph: GraphData;
  anim: GraphAnim;
  onSelect: (id: string) => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    anim.nodesMesh = ref.current;
    anim.animating = true; // paint initial state
    return () => {
      anim.nodesMesh = null;
    };
  }, [anim]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > CLICK_SLOP_PX) return; // it was a drag, not a tap
    if (e.instanceId === undefined) return;
    const node = graph.nodes[e.instanceId];
    if (!node) return;
    // Skill nodes select and consume the tap. Project hubs deliberately let it
    // fall through — to a skill node behind them, or to the clear-selection
    // catcher plane — so no tap on the canvas is ever a dead tap.
    if (node.kind === 'skill') {
      e.stopPropagation();
      onSelect(node.id);
    }
  };

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, graph.nodes.length]} onClick={onClick}>
      <sphereGeometry args={[1, 24, 16]} />
      <meshStandardMaterial roughness={0.55} metalness={0.15} />
    </instancedMesh>
  );
}
