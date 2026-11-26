import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // real Postgres engine (PGlite) is started per test file: allow for its WASM start-up
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
