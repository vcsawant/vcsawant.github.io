// Worker message contract. Matches the protocol the consuming code expects:
//   postMessage({type:'reorganize', focusId, graph, positions})
//     -> streamed onmessage({type:'positions', positions: Float32Array}) in tick batches
// plus one additive extension: a terminal {type:'done'} frame carrying timings.

import type { GraphData } from './graph';

export interface ReorganizeMsg {
  type: 'reorganize';
  /** node id to pin near center, or null to return to the base layout */
  focusId: string | null;
  graph: GraphData;
  /**
   * Canonical warm-start positions (xyz-interleaved, graph.nodes order).
   * Pass the build-time BASE layout every time — not the currently
   * displayed positions — so each focus state is path-independent.
   */
  positions: Float32Array;
}

export interface PositionsMsg {
  type: 'positions';
  /** xyz-interleaved, graph.nodes order; transferred, not copied */
  positions: Float32Array;
}

export interface DoneMsg {
  type: 'done';
  focusId: string | null;
  ticks: number;
  batches: number;
  /** ms actually spent computing (tick + serialize), excludes pacing waits */
  workerComputeMs: number;
  /** wall-clock ms from message receipt to done */
  workerWallMs: number;
}

export type WorkerInMsg = ReorganizeMsg;
export type WorkerOutMsg = PositionsMsg | DoneMsg;
