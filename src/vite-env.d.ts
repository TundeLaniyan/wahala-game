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

/**
 * Build-time constant (vite.config.ts `define`): true only in a PLATFORM build (above) made with WAHALA_PRIVATE_BETA=1. The online
 * screen then asks for an invite code and hides quick play and join-by-code (docs/ops/BETA_FRONTEND.md). False everywhere else.
 */
declare const __WAHALA_PRIVATE_BETA__: boolean;
