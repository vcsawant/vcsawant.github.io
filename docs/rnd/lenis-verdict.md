# Lenis smooth-scroll verdict (Task 6.4)

**Decision: NOT adopted.** Native scroll stays.

## Rationale

The plan's default was NO unless Lenis passed every check on a real iPhone, and that
device validation has not happened. Beyond the missing validation, the current
architecture actively argues against it:

1. **ScrollTrigger works on native scroll** — the pin and parallax sequences need nothing
   from Lenis.
2. **CSS scroll-driven animations** (`animation-timeline: view()/scroll()`) drive the card
   reveals and progress bar on the compositor. Lenis hijacks wheel/touch input and moves a
   transform instead of the real scroll position, which breaks native scroll timelines —
   we'd have to abandon the compositor-driven reveals or bridge them through JS.
3. **The hero fluid + graph drag already own pointer gestures** over their regions with
   carefully tuned `touch-action` behavior; a scroll hijacker multiplies the interaction
   edge cases exactly where the site is most sensitive (LinkedIn in-app webviews).
4. The recruiter audience skews mobile, where Lenis's value (wheel smoothing) is nil and
   its risk (broken momentum/rubber-banding) is highest.

## How to revisit

If native scroll ever feels wrong on device: create `spike/lenis`, wrap the page in a
Lenis instance bridged to `ScrollTrigger.scrollerProxy`, replace the CSS scroll timelines
with ScrollTrigger equivalents, and test on a physical iPhone via a PR preview URL
(momentum feel, rubber-banding, keyboard/AT scrolling, the graph's touch-drag give-back).
Every check must pass AND the feel must be preferred before merging.
