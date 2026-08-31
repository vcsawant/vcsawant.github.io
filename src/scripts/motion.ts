import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/*
 * GSAP choreography. Loaded dynamically (see motion-loader.ts) ONLY when
 * prefers-reduced-motion is 'no-preference' at page load — reduced-motion
 * users never download this chunk.
 *
 * Division of labour with CSS (global.css): CSS scroll-driven `view()`
 * animations own the reveals (they leave no inline styles, so the filter
 * system's class-based opacity always wins); GSAP owns the hero parallax
 * hand-off. Transforms and opacity only.
 *
 * Deliberately NOT using gsap.matchMedia: it attaches a MediaQueryList
 * listener per add() that GSAP never detaches, which leaks across view
 * transitions (CR-6 finding). One module-owned listener + tween.revert()
 * gives the same semantics without the leak.
 */
gsap.registerPlugin(ScrollTrigger);

const motionOk = matchMedia('(prefers-reduced-motion: no-preference)');
let tweens: gsap.core.Tween[] = [];

function setup(): void {
  if (!motionOk.matches) return;
  if (tweens.length > 0) return;
  // never build against a document that's mid view-transition swap (the idle
  // import can resolve inside that window; astro:page-load re-runs us after)
  if (document.documentElement.hasAttribute('data-astro-transition')) return;

  const heroCopy = document.querySelector('.hero-copy');
  if (heroCopy) {
    // hero recedes as the work section arrives
    tweens.push(
      gsap.to(heroCopy, {
        yPercent: -12,
        opacity: 0.3,
        ease: 'none',
        scrollTrigger: {
          trigger: '.hero',
          start: 'top top',
          end: 'bottom 25%',
          scrub: 0.4,
        },
      }),
    );
  }
}

function teardown(): void {
  // revert() kills the tween AND restores inline styles (and its ScrollTrigger)
  tweens.forEach((t) => t.revert());
  tweens = [];
}

setup();
motionOk.addEventListener('change', () => (motionOk.matches ? setup() : teardown()));
document.addEventListener('astro:before-swap', teardown);
document.addEventListener('astro:page-load', () => {
  teardown();
  setup();
});
