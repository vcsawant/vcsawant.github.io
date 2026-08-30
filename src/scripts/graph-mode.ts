import { EV, type GraphReadyDetail } from '../lib/events';

/*
 * Page-side listener for the graph island's lifecycle. When the WebGL canvas is
 * truly live it fades the SVG fallback out (opacity only; the SVG stays in the
 * DOM for assistive tech). Any non-webgl mode restores the SVG.
 */
window.addEventListener(EV.graphReady, (e) => {
  const { mode } = (e as CustomEvent<GraphReadyDetail>).detail;
  document
    .querySelectorAll('[data-graph-slot]')
    .forEach((box) => box.classList.toggle('is-webgl', mode === 'webgl'));
});
