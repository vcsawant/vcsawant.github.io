import { Bloom, EffectComposer } from '@react-three/postprocessing';

/*
 * Postprocessing pass — 'full' tier only, loaded via dynamic import so the
 * chunk never downloads on lite/none tiers. Deliberately subtle: the graph
 * should glow like brass in lamplight, not bloom like a synthwave album cover.
 * This is the first thing sacrificed if the frame budget tightens (by design).
 */
export default function GraphEffects() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom intensity={0.45} luminanceThreshold={0.32} luminanceSmoothing={0.25} mipmapBlur />
    </EffectComposer>
  );
}
