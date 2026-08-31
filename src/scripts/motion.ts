import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/*
 * GSAP choreography. This module is loaded dynamically (see index.astro) ONLY
 * when prefers-reduced-motion is 'no-preference' — reduced-motion users never
 * download it. Everything registers inside gsap.matchMedia() so an OS-level
 * toggle mid-session reverts cleanly.
 *
 * Division of labour with CSS (global.css):
 *  - CSS scroll-driven `view()` animations own the simple reveals (cards,
 *    footer) — crucially they leave NO inline styles behind, so the filter
 *    system's class-based opacity always wins after the reveal.
 *  - GSAP owns what CSS can't: the hero parallax hand-off and the pinned
 *    work heading. Transforms and opacity only.
 *
 * View-transitions aware: re-inits on astro:page-load, tears down before swap.
 */
const mm = gsap.matchMedia();

function setup(): void {
  gsap.registerPlugin(ScrollTrigger);

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    // hero recedes as the work section arrives
    if (document.querySelector('.hero-copy')) {
      gsap.to('.hero-copy', {
        yPercent: -12,
        opacity: 0.3,
        ease: 'none',
        scrollTrigger: {
          trigger: '.hero',
          start: 'top top',
          end: 'bottom 25%',
          scrub: 0.4,
        },
      });
    }
  });

  mm.add('(prefers-reduced-motion: no-preference) and (min-width: 900px)', () => {
    // the "middlegame" heading holds position while its cards play out
    if (document.querySelector('.work .section-heading')) {
      ScrollTrigger.create({
        trigger: '.work',
        start: 'top 25%',
        end: 'bottom 70%',
        pin: '.work .section-heading',
        // no spacer: the heading occupies its own grid space; pinning it
        // without spacing avoids any layout insertion (CLS stays 0)
        pinSpacing: false,
      });
    }
  });
}

function teardown(): void {
  mm.revert();
  ScrollTrigger.getAll().forEach((t) => t.kill());
}

setup();
document.addEventListener('astro:before-swap', teardown);
document.addEventListener('astro:page-load', () => {
  // fires after every view-transition navigation (not the initial load twice:
  // teardown() leaves a clean slate, setup() is idempotent per page)
  if (ScrollTrigger.getAll().length === 0) setup();
});
