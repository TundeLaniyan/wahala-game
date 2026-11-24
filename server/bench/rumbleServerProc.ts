/**
 * Entry of the server process the load harness spawns: exactly `server/src/main.ts` (same code path, same env), under
 * a command line of its own so that cleanup commands aimed at other servers on a shared machine (`pkill -f main.ts`)
 * cannot kill a measurement in progress.
 */
await import('../src/main');
export {};
