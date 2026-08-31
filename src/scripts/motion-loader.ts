/*
 * Loads the GSAP choreography only when motion is welcome and the main thread
 * is idle. Reduced-motion users never download the chunk (e2e-enforced).
 */
if (matchMedia('(prefers-reduced-motion: no-preference)').matches) {
  const load = () => void import('./motion');
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => load(), { timeout: 3000 });
  } else {
    setTimeout(load, 400);
  }
}
