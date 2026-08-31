# Real-device test matrix (Task 7.3)

**URL to test:** https://vcsawant-site.vcsawant-github-io.workers.dev
**How:** open on each device/browser below. For the LinkedIn rows: DM yourself the URL in
the LinkedIn app and open it from the chat (uses the in-app browser).

Fill each cell with ✅ / ❌ + a note. Anything ❌ becomes a fix before launch (CP-6).

| Check | iOS Safari | Android Chrome | LinkedIn in-app iOS | LinkedIn in-app Android |
|---|---|---|---|---|
| Page loads fast; headline readable immediately | | | | |
| Hero: particles animate (or a clean knight image/video — never a black box) | | | | |
| Touch smear over the hero distorts particles | | | | n/a if fallback |
| Vertical scrolling is smooth everywhere, incl. over the hero and graph | | | | |
| Graph section: 3D graph appears (or the SVG constellation — never blank) | | | | |
| Graph: horizontal drag spins it; vertical swipe on it still scrolls the page | | | | |
| Tap a skill node → graph reorganizes, project list filters | | | | |
| Chips filter; tapping an active chip clears | | | | |
| Card → project page transition feels instant; back works | | | | |
| No layout jumps while scrolling (reveals/progress bar behave) | | | | |
| Battery/heat feels normal after ~a minute on the page | | | | |

Also worth one pass if convenient:
- iOS Settings → Accessibility → Motion → Reduce Motion ON → site shows static knight
  poster + SVG graph, no particle/canvas motion.
- Rotate to landscape: nothing breaks.

**Notes / device models used:**

-
