// Layout worker: receives 'reorganize', streams 'positions' batches, ends with 'done'.
// Ticks are paced with setTimeout so ~3 sim ticks land per display frame,
// which spreads the FOCUS_TICKS-tick relaxation over roughly half a second.

import { buildFocusSim, readPositions, FOCUS_TICKS } from './simCore';
import type { WorkerInMsg, WorkerOutMsg } from './protocol';

const TICKS_PER_BATCH = 3;
const BATCH_INTERVAL_MS = 16;

// Typed facade over the worker global (avoids needing lib.webworker in tsconfig).
const ctx = self as unknown as {
  postMessage(msg: WorkerOutMsg, transfer?: Transferable[]): void;
  addEventListener(type: 'message', cb: (ev: MessageEvent<WorkerInMsg>) => void): void;
};

let jobToken = 0;

ctx.addEventListener('message', (ev) => {
  const msg = ev.data;
  if (!msg || msg.type !== 'reorganize') return;
  const token = ++jobToken; // supersede any in-flight job
  const t0 = performance.now();

  if (msg.focusId === null) {
    // Un-focus: the target IS the canonical base layout that was passed in.
    // Echo it back in one batch; the main thread's smoothing animates the return.
    const out = new Float32Array(msg.positions);
    ctx.postMessage({ type: 'positions', positions: out }, [out.buffer]);
    ctx.postMessage({
      type: 'done',
      focusId: null,
      ticks: 0,
      batches: 1,
      workerComputeMs: performance.now() - t0,
      workerWallMs: performance.now() - t0,
    });
    return;
  }

  const sim = buildFocusSim(msg.graph, msg.positions, msg.focusId);
  let ticks = 0;
  let batches = 0;
  let computeMs = 0;

  const step = (): void => {
    if (token !== jobToken) return; // superseded by a newer reorganize
    const b0 = performance.now();
    for (
      let i = 0;
      i < TICKS_PER_BATCH && sim.alpha() > sim.alphaMin() && ticks < FOCUS_TICKS * 2;
      i++
    ) {
      sim.tick();
      ticks++;
    }
    const positions = readPositions(sim.nodes());
    computeMs += performance.now() - b0;
    batches++;
    ctx.postMessage({ type: 'positions', positions }, [positions.buffer]);

    if (sim.alpha() > sim.alphaMin() && ticks < FOCUS_TICKS * 2) {
      setTimeout(step, BATCH_INTERVAL_MS);
    } else {
      ctx.postMessage({
        type: 'done',
        focusId: msg.focusId,
        ticks,
        batches,
        workerComputeMs: computeMs,
        workerWallMs: performance.now() - t0,
      });
    }
  };
  step();
});
