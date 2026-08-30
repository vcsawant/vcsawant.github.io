import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';

/*
 * The render gate: with frameloop="demand", nothing draws unless invalidate()
 * is called. This hook runs a RAF loop that invalidates every frame ONLY while
 *   - the canvas is in the viewport (IntersectionObserver), and
 *   - the tab is visible (visibilitychange).
 * Off-screen or blurred, the loop stops entirely — zero RAF, zero GPU.
 * kick() forces a single repaint (e.g. after a resize) without starting the loop.
 */
export function useRenderGate(): { kick: () => void } {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const visible = useRef({ viewport: false, tab: true });
  const raf = useRef(0);

  useEffect(() => {
    const el = gl.domElement;

    const loop = () => {
      invalidate();
      raf.current = requestAnimationFrame(loop);
    };
    const sync = () => {
      const shouldRun = visible.current.viewport && visible.current.tab;
      const running = raf.current !== 0;
      if (shouldRun && !running) raf.current = requestAnimationFrame(loop);
      if (!shouldRun && running) {
        cancelAnimationFrame(raf.current);
        raf.current = 0;
      }
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        visible.current.viewport = entry.isIntersecting;
        sync();
      },
      { threshold: 0.05 },
    );
    io.observe(el);

    const onVisibility = () => {
      visible.current.tab = document.visibilityState === 'visible';
      sync();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      if (raf.current !== 0) cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
  }, [gl, invalidate]);

  return { kick: () => invalidate() };
}
