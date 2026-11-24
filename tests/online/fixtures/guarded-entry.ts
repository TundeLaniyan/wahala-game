// Fixture for tests/platform-static.test.ts: a correctly guarded entry (early return on the build constant).
export async function load(): Promise<unknown> {
  if (!__WAHALA_SERVER_ONLINE__) return null;
  return import('../../../src/app/rumbleOnline');
}
