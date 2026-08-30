/*
 * WebGL capability tiering. Client-side only.
 *   'none' — no usable WebGL2, or a webview known to lie about it (LinkedIn on
 *            Android): render the static fallback, never a black rectangle.
 *   'lite' — WebGL2 but constrained hardware: lower particle counts, no
 *            postprocessing.
 *   'full' — everything on.
 */
export type GpuTier = 'full' | 'lite' | 'none';

export function detectTier(): GpuTier {
  if (typeof window === 'undefined') return 'none';

  const ua = navigator.userAgent;
  // LinkedIn's Android in-app webview reports WebGL2 but renders black.
  if (/LinkedInApp/i.test(ua) && /Android/i.test(ua)) return 'none';

  let gl: WebGL2RenderingContext | null = null;
  try {
    const canvas = document.createElement('canvas');
    gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
  } catch {
    return 'none';
  }
  if (!gl) return 'none';
  gl.getExtension('WEBGL_lose_context')?.loseContext();

  const smallScreen = matchMedia('(max-width: 768px)').matches;
  const fewCores = (navigator.hardwareConcurrency ?? 8) <= 4;
  return smallScreen || fewCores ? 'lite' : 'full';
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Read a CSS custom property off :root (canvas colors always match the page theme). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
