// Minimal typings for d3-force-3d (no upstream @types package).
// Only the surface used by this prototype is declared.
declare module 'd3-force-3d' {
  export interface SimNodeDatum {
    index?: number;
    x?: number;
    y?: number;
    z?: number;
    vx?: number;
    vy?: number;
    vz?: number;
    fx?: number | null;
    fy?: number | null;
    fz?: number | null;
  }

  export interface Force<N> {
    (alpha: number): void;
    initialize?(nodes: N[], random: () => number, numDimensions: number): void;
  }

  export interface Simulation<N> {
    alpha(): number;
    alpha(alpha: number): this;
    alphaMin(): number;
    alphaMin(min: number): this;
    alphaDecay(): number;
    alphaDecay(decay: number): this;
    alphaTarget(target: number): this;
    velocityDecay(decay: number): this;
    force(name: string): unknown;
    force(name: string, force: unknown | null): this;
    nodes(): N[];
    nodes(nodes: N[]): this;
    numDimensions(n: number): this;
    randomSource(source: () => number): this;
    tick(iterations?: number): this;
    stop(): this;
    restart(): this;
  }

  export interface ForceLink<N, L> {
    (alpha: number): void;
    id(accessor: (node: N) => string): this;
    links(): L[];
    links(links: L[]): this;
    distance(distance: number | ((link: L) => number)): this;
    strength(strength: number | ((link: L) => number)): this;
    iterations(n: number): this;
  }

  export interface ForceManyBody<N> {
    (alpha: number): void;
    strength(strength: number | ((node: N) => number)): this;
    distanceMax(max: number): this;
    theta(theta: number): this;
  }

  export interface ForceCenter {
    (alpha: number): void;
    strength(strength: number): this;
  }

  export interface ForceRadial<N> {
    (alpha: number): void;
    radius(radius: number | ((node: N) => number)): this;
    strength(strength: number | ((node: N) => number)): this;
  }

  export function forceSimulation<N extends SimNodeDatum>(
    nodes?: N[],
    numDimensions?: number,
  ): Simulation<N>;
  export function forceLink<N extends SimNodeDatum, L>(links?: L[]): ForceLink<N, L>;
  export function forceManyBody<N extends SimNodeDatum>(): ForceManyBody<N>;
  export function forceCenter(x?: number, y?: number, z?: number): ForceCenter;
  export function forceRadial<N extends SimNodeDatum>(
    radius: number | ((node: N) => number),
    x?: number,
    y?: number,
    z?: number,
  ): ForceRadial<N>;
}
