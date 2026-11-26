/// <reference types="vite/client" />

/**
 * Build-time constant (vite.config.ts `define`): true only in a build made with WAHALA_ONLINE_ENABLED=true and a
 * WAHALA_ONLINE_URL. It guards the dynamic import of the server adapter so a default build contains none of it.
 */
declare const __WAHALA_SERVER_ONLINE__: boolean;

/**
 * Build-time constant (vite.config.ts `define`): true only in a SERVER build (above) that also sets an http(s)
 * WAHALA_PLATFORM_URL. It gates the player-platform client (docs/PLATFORM_CLIENT.md); false in tests and public builds.
 */
declare const __WAHALA_PLATFORM__: boolean;
