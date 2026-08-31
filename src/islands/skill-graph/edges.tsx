import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { cssVar } from '../../lib/webgl';
import type { GraphAnim } from './anim';

/* All edges in ONE LineSegments buffer: one draw call. The position attribute is
 * rewritten by the anim loop whenever nodes move. */
export function Edges({ anim }: { anim: GraphAnim }) {
  const geometry = useMemo(() => {
    const arr = new Float32Array(anim.pairs.length * 3);
    const g = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(arr, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', attr);
    // edges move during reorganization; a generous static bound avoids re-computes
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40);
    return g;
  }, [anim]);

  useLayoutEffect(() => {
    anim.edgeAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    anim.animating = true;
    return () => {
      anim.edgeAttr = null;
    };
  }, [anim, geometry]);

  const color = useMemo(() => new THREE.Color(cssVar('--color-text-muted') || '#a3afa3'), []);

  return (
    <lineSegments geometry={geometry} raycast={() => null}>
      <lineBasicMaterial color={color} transparent opacity={0.28} />
    </lineSegments>
  );
}
