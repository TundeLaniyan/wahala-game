import { expect, test } from '@playwright/test';

// TEMPORARY (CI pipeline verification on claude/wahala-ci-parallel-shards): a failing test must fail its shard,
// the merged report and the CI gate, and the deploy must not run. Reverted in the next commit.
test('CI canary: a failing shard blocks the release', () => {
  expect(1 + 1).toBe(3);
});
