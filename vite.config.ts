import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// GitHub Pages project sites are served from /<repo-name>/.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/wahala-game/' : '/',
  plugins: [react()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: { manualChunks: (id: string) => (id.includes('node_modules/three') ? 'three' : undefined) },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // full bot matches are CPU-bound; under a parallel run on a shared machine 5 s is too tight
    testTimeout: 30_000,
  },
}));
