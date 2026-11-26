import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { offlineCache } from './scripts/vite/offlineCache.ts';
import { optimizeModels } from './scripts/vite/optimizeModels.ts';

// GitHub Pages project sites are served from /<repo-name>/.
export default defineConfig(({ command, isPreview, mode }) => {
  // The server online adapter is compiled in ONLY when the build asks for it (WAHALA_ONLINE_ENABLED + WAHALA_ONLINE_URL,
  // the same rule as the app's flags). Tests never include it. docs/ONLINE_ARCHITECTURE.md.
  // `npm run build:online` builds this with the switch on into dist-online/ (git-ignored, never published): the endpoint
  // there is the TEMPLATE `ws://{host}:2567`, filled in at run time from location.hostname (src/platform/flags.ts).
  // Same rule as `resolveFlags` in src/platform/flags.ts (kept inline: the config must not import app code);
  // tests/online/create-online.test.ts runs both on the same inputs.
  const env = loadEnv(mode, process.cwd(), 'WAHALA_');
  const serverOnline =
    mode !== 'test' &&
    /^(1|true|on|yes)$/i.test((env.WAHALA_ONLINE_ENABLED ?? '').trim()) &&
    !!env.WAHALA_ONLINE_URL;
  // The player-platform client (docs/PLATFORM_CLIENT.md) exists only in a SERVER build that also names an http(s) platform
  // API (`WAHALA_PLATFORM_URL`, `{host}` allowed): the same rule as `platformEndpoint` in src/platform/flags.ts
  // (tests/online/build-guard.test.ts runs both on the same inputs). Never in test mode.
  const platformUrl = (env.WAHALA_PLATFORM_URL ?? '').trim().split('{host}').join('h');
  const platform = serverOnline && /^https?:\/\/[^\s{}]+$/i.test(platformUrl);
  // The hosted PRIVATE BETA client (docs/ops/BETA_FRONTEND.md): a platform build that also sets WAHALA_PRIVATE_BETA=1. It asks for an
  // invite code and offers only the party's private match (the beta match server refuses everyone without a platform ticket).
  const privateBeta = platform && /^(1|true|on|yes)$/i.test((env.WAHALA_PRIVATE_BETA ?? '').trim());
  return {
    base: command === 'build' || isPreview ? '/wahala-game/' : '/',
    plugins: [react(), optimizeModels(), offlineCache()],
    // WAHALA_* feature flags (src/platform/flags.ts) are public build-time switches, never secrets.
    envPrefix: ['VITE_', 'WAHALA_'],
    define: {
      __WAHALA_SERVER_ONLINE__: JSON.stringify(serverOnline),
      __WAHALA_PLATFORM__: JSON.stringify(platform),
      __WAHALA_PRIVATE_BETA__: JSON.stringify(privateBeta),
    },
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
