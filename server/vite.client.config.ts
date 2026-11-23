/**
 * Dev-only Vite config for the City Rumble online browser client (`server/client`).
 * Not used by the shipped game: the root `vite build` never sees this page. `npm run client` serves it on :5180.
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = fileURLToPath(new URL('.', import.meta.url));
const repo = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  root: `${here}client`,
  base: '/',
  // the real game's audio samples / previews live in the root public folder
  publicDir: `${repo}public`,
  envPrefix: ['VITE_', 'WAHALA_'],
  // compile-time constant the shared game modules expect (the root config sets it from WAHALA_ONLINE_*; here: off)
  define: { __WAHALA_SERVER_ONLINE__: JSON.stringify(false) },
  server: {
    port: 5180,
    strictPort: true,
    host: '127.0.0.1',
    fs: { allow: [repo] },
  },
  build: { target: 'es2022' },
});
