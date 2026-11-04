/// <reference types="vite/client" />

/**
 * Build-time constant (vite.config.ts `define`): true only in a build made with WAHALA_ONLINE_ENABLED=true and a
 * WAHALA_ONLINE_URL. It guards the dynamic import of the server adapter so a default build contains none of it.
 */
declare const __WAHALA_SERVER_ONLINE__: boolean;
