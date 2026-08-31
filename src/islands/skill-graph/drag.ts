import { useEffect, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';

/*
 * Idle drift + drag-to-spin with inertia, applied to the graph's parent group.
 *  - Mouse: captures immediately (mouse drags never mean "scroll").
 *  - Touch: captures only once the gesture is clearly horizontal, so vertical
 *    swipes over the canvas keep native page scroll (canvas has touch-action:pan-y).
 *  - Release: velocity carries on with exponential damping, then drift resumes.
 */
const DRIFT_RAD_PER_S = 0.05;
const ROT_PER_PX = 0.005;
const TILT_PER_PX = 0.0028;
const TILT_CLAMP = 0.55;
const DAMPING = 2.6; // 1/s — higher = stops sooner
const CAPTURE_PX = 8;

export function useDragSpin(groupRef: RefObject<THREE.Group | null>): void {
  const gl = useThree((s) => s.gl);
  const st = useRef({
    pointerId: -1,
    captured: false,
    isTouch: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    lastT: 0,
    velY: 0, // rad/s around the y axis
    velX: 0,
  });

  useEffect(() => {
    const el = gl.domElement;
    const s = st.current;

    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return; // left button only
      s.pointerId = e.pointerId;
      s.isTouch = e.pointerType === 'touch';
      s.captured = !s.isTouch; // mouse captures immediately, touch waits for intent
      if (s.captured) capture(el, e.pointerId);
      s.startX = s.lastX = e.clientX;
      s.startY = s.lastY = e.clientY;
      s.lastT = performance.now();
      s.velX = s.velY = 0;
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== s.pointerId) return;
      const g = groupRef.current;
      if (!g) return;

      if (!s.captured) {
        const totalX = Math.abs(e.clientX - s.startX);
        const totalY = Math.abs(e.clientY - s.startY);
        if (totalX > CAPTURE_PX && totalX > totalY) {
          s.captured = true;
          capture(el, e.pointerId);
        } else if (totalY > CAPTURE_PX * 2) {
          s.pointerId = -1; // clearly a scroll — give the gesture back to the page
          return;
        } else {
          return;
        }
      }

      const now = performance.now();
      const dt = Math.max((now - s.lastT) / 1000, 1 / 240);
      const dx = e.clientX - s.lastX;
      const dy = e.clientY - s.lastY;
      g.rotation.y += dx * ROT_PER_PX;
      g.rotation.x = clamp(g.rotation.x + dy * TILT_PER_PX, -TILT_CLAMP, TILT_CLAMP);
      s.velY = (dx * ROT_PER_PX) / dt;
      s.velX = (dy * TILT_PER_PX) / dt;
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      s.lastT = now;
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== s.pointerId) return;
      if (s.captured && el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      // drag fast, hold still, release: the last move's velocity is stale —
      // don't flick off with it
      if (performance.now() - s.lastT > 90) {
        s.velX = 0;
        s.velY = 0;
      }
      s.pointerId = -1;
      s.captured = false;
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [gl, groupRef]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1); // first frame after a gate pause carries the idle gap
    const g = groupRef.current;
    const s = st.current;
    if (!g) return;
    const dragging = s.pointerId !== -1 && s.captured;
    if (dragging) return; // 1:1 under the finger; inertia starts on release

    const damp = Math.exp(-DAMPING * delta);
    s.velY *= damp;
    s.velX *= damp;
    if (Math.abs(s.velY) < 0.02) s.velY = 0;
    if (Math.abs(s.velX) < 0.02) s.velX = 0;

    g.rotation.y += (s.velY + DRIFT_RAD_PER_S) * delta;
    g.rotation.x = clamp(g.rotation.x + s.velX * delta, -TILT_CLAMP, TILT_CLAMP);
  });
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// setPointerCapture can throw (pointer already gone, synthetic events); capture is
// an optimization — losing it degrades gracefully, so never let it break the drag.
function capture(el: Element, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    /* noop */
  }
}
