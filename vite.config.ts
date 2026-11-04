import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// GitHub Pages project sites are served from /<repo-name>/.
export default defineConfig(({ command, isPreview, mode }) => {
  // The server online adapter is compiled in ONLY when the build asks for it (WAHALA_ONLINE_ENABLED + WAHALA_ONLINE_URL,
  // the same rule as the app's flags). Tests never include it. docs/ONLINE_ARCHITECTURE.md.
  // Same rule as `resolveFlags` in src/platform/flags.ts (kept inline: the config must not import app code);
  // tests/online/create-online.test.ts runs both on the same inputs.
  const env = loadEnv(mode, process.cwd(), 'WAHALA_');
  const serverOnline =
    mode !== 'test' &&
    /^(1|true|on|yes)$/i.test((env.WAHALA_ONLINE_ENABLED ?? '').trim()) &&
    !!env.WAHALA_ONLINE_URL;
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
