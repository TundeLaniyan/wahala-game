import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolveFlags } from './src/platform/flags';

// GitHub Pages project sites are served from /<repo-name>/.
export default defineConfig(({ command, isPreview, mode }) => {
  // The server online adapter is compiled in ONLY when the build asks for it (WAHALA_ONLINE_ENABLED + WAHALA_ONLINE_URL,
  // resolved by the same function the app uses for its flags). Tests never include it. docs/ONLINE_ARCHITECTURE.md.
  const env = loadEnv(mode, process.cwd(), 'WAHALA_');
  const serverOnline = mode !== 'test' && resolveFlags(env).onlineMode === 'server';
  return {
    base: command === 'build' || isPreview ? '/wahala-game/' : '/',
    plugins: [react()],
    // WAHALA_* feature flags (src/platform/flags.ts) are public build-time switches, never secrets.
    envPrefix: ['VITE_', 'WAHALA_'],
    define: { __WAHALA_SERVER_ONLINE__: JSON.stringify(serverOnline) },
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
  };
});
