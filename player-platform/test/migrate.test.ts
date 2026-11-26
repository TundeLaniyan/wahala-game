import { afterAll, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/types';
import { makeTestDb } from './helpers';
import { loadMigrations, migrate } from '../src/db/migrate';
import { CHECK_VIOLATION, sqlState } from '../src/db/types';

describe('migrations', () => {
  const dbs: Db[] = [];
  const fresh = async () => {
    const db = await makeTestDb();
    dbs.push(db);
    return db;
  };
  afterAll(async () => {
    for (const d of dbs) await d.close();
  });

  it('apply cleanly on an empty database and are idempotent', async () => {
    const db = await fresh();
    const files = await loadMigrations();
    expect(files.length).toBeGreaterThan(0);
    const first = await migrate(db);
    expect(first.applied).toEqual(files.map((f) => f.version));
    const again = await migrate(db);
    expect(again.applied).toEqual([]);
    expect(again.current).toBe(files.length);
  });

  it('refuses to run when an applied migration file was edited', async () => {
    const db = await fresh();
    const files = await loadMigrations();
    await migrate(db, files);
    const tampered = files.map((f, i) => (i === 0 ? { ...f, checksum: 'x'.repeat(64) } : f));
    await expect(migrate(db, tampered)).rejects.toThrow(/changed after it was applied/);
  });

  it('refuses a database that is ahead of the code', async () => {
    const db = await fresh();
    const files = await loadMigrations();
    await migrate(db, files);
    await expect(migrate(db, files.slice(0, files.length - 1))).rejects.toThrow(/does not know/);
  });

  it('enforces identity invariants in the schema itself', async () => {
    const db = await fresh();
    await migrate(db);
    const ins = (kind: string, age: string, upgraded: string | null) =>
      db.query(
        `INSERT INTO players (kind, friend_code, age_group, created_at, last_seen_at, upgraded_at)
         VALUES ($1, $2, $3, now(), now(), $4)`,
        [kind, Math.random().toString(36).slice(2, 10).toUpperCase(), age, upgraded],
      );
    await expect(ins('admin', 'adult', null)).rejects.toSatisfy((e) => sqlState(e) === CHECK_VIOLATION);
    await expect(ins('guest', 'old', null)).rejects.toSatisfy((e) => sqlState(e) === CHECK_VIOLATION);
    // a guest cannot carry an upgrade timestamp
    await expect(ins('guest', 'adult', new Date().toISOString())).rejects.toSatisfy(
      (e) => sqlState(e) === CHECK_VIOLATION,
    );
    await ins('registered', 'adult', new Date().toISOString());
  });
});
