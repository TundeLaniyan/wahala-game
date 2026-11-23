import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // integration tests run real 32-fighter matches over real sockets
    testTimeout: 180_000,
    hookTimeout: 30_000,
  },
});
