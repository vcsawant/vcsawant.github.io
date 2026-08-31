// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  site: 'https://vcsawant.com',
  output: 'static',
  integrations: [react()],
  vite: {
    build: {
      // the default CSS minifier merges animation longhands into a shorthand,
      // which cannot legally carry `animation-timeline` — browsers then drop
      // the whole declaration and every scroll-driven animation dies in
      // production (A6 audit finding). esbuild leaves longhands alone.
      cssMinify: 'esbuild',
    },
  },
});
