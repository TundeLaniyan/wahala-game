// Fixture for tests/platform-static.test.ts: an UNGUARDED dynamic import of the online controller (guarded only by a
// runtime flag, which cannot keep code out of a public bundle). The static test must report it.
import { flags } from '../../../src/platform';

export async function load(): Promise<unknown> {
  if (!flags().rumbleOnline) return null;
  return import('../../../src/app/rumbleOnline');
}
