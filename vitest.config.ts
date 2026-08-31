import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // e2e specs belong to Playwright; vitest must never try to collect them
    include: ['tests/unit/**/*.test.ts'],
  },
});
