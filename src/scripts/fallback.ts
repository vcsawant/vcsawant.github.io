import { detectTier, prefersReducedMotion } from '../lib/webgl';

/*
 * Applies the fallback matrix once capability is known (Task 7.2):
 *
 *                    | motion ok             | reduced motion
 *   webgl available  | canvas (poster/video  | hero: poster; graph: SVG
 *                    |   hidden)             |   (no canvas mounts)
 *   webgl 'none'     | WebM loops            | hero: poster; graph: SVG
 *
 * Without JavaScript none of this runs: the hero poster and graph SVG are the
 * server-rendered defaults, so the page is always complete.
 */
function apply(): void {
  const tier = detectTier();
  const reduced = prefersReducedMotion();

  const heroPoster = document.querySelector<HTMLElement>('[data-hero-poster]');
  const heroVideo = document.querySelector<HTMLVideoElement>('[data-hero-video]');
  const graphVideo = document.querySelector<HTMLVideoElement>('[data-graph-video]');

  const showHeroVideo = tier === 'none' && !reduced;
  const showHeroPoster = reduced; // any tier: reduced motion = still image

  if (heroPoster) heroPoster.hidden = !showHeroPoster;
  if (heroVideo) {
    heroVideo.hidden = !showHeroVideo;
    if (showHeroVideo) heroVideo.play().catch(() => (heroVideo.hidden = true));
    else heroVideo.pause();
  }

  const showGraphVideo = tier === 'none' && !reduced;
  if (graphVideo) {
    graphVideo.hidden = !showGraphVideo;
    if (showGraphVideo) graphVideo.play().catch(() => (graphVideo.hidden = true));
    else graphVideo.pause();
  }
}

apply();
document.addEventListener('astro:page-load', apply);
