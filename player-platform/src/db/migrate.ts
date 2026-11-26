/**
 * Versioned, forward-only SQL migrations (`migrations/NNNN_name.sql`). Each file runs in ONE transaction and is recorded
 * in `schema_migrations` with a checksum: changing an applied file is refused (write a new migration instead). A second
 * process migrating at the same time waits on an advisory lock. Rollback = restore the backup taken before the deploy
 * (docs/PLATFORM_OPERATIONS.md): migrations are written expand-then-contract so the previous release still runs on the new schema.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './types';

/** The SQL files. `PLATFORM_MIGRATIONS_DIR` points at them in the Docker image (the bundle is a single file elsewhere). */
export const MIGRATIONS_DIR =
  process.env.PLATFORM_MIGRATIONS_DIR ?? fileURLToPath(new URL('../../migrations/', import.meta.url));
const FILE_RE = /^(\d{4})_([a-z0-9_]+)\.sql$/;
const LOCK_KEY = 7_426_001; // arbitrary, unique to this app

export interface MigrationFile {
  version: number;
  name: string;
  sql: string;
  checksum: string;
}

export async function loadMigrations(dir = MIGRATIONS_DIR): Promise<MigrationFile[]> {
  const names = (await readdir(dir)).filter((n) => n.endsWith('.sql')).sort();
  const out: MigrationFile[] = [];
  for (const file of names) {
    const m = FILE_RE.exec(file);
    if (!m) throw new Error(`migration file name must be NNNN_snake_case.sql: ${file}`);
    const sql = await readFile(join(dir, file), 'utf8');
    out.push({
      version: Number(m[1]),
      name: m[2]!,
      sql,
      checksum: createHash('sha256').update(sql).digest('hex'),
    });
  }
  out.forEach((f, i) => {
    if (f.version !== i + 1)
      throw new Error(
        `migrations must be numbered 0001.. without gaps (found ${f.version} at position ${i + 1})`,
      );
  });
  return out;
}

export interface MigrateResult {
  applied: number[];
  current: number;
}

export async function migrate(db: Db, files?: MigrationFile[]): Promise<MigrateResult> {
  const all = files ?? (await loadMigrations());
  await db.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version int PRIMARY KEY, name text NOT NULL, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`,
  );
  const applied: number[] = [];
  await db.tx(async (q) => {
    await q.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
    const done = new Map(
      (
        await q.query<{ version: number; checksum: string }>(
          'SELECT version, checksum FROM schema_migrations',
        )
      ).rows.map((r) => [Number(r.version), r.checksum]),
    );
    for (const f of all) {
      const have = done.get(f.version);
      if (have !== undefined) {
        if (have !== f.checksum)
          throw new Error(
            `migration ${f.version}_${f.name} was changed after it was applied: add a new migration instead`,
          );
        continue;
      }
      await q.exec(f.sql);
      await q.query('INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)', [
        f.version,
        f.name,
        f.checksum,
      ]);
      applied.push(f.version);
    }
    for (const v of done.keys())
      if (!all.some((f) => f.version === v))
        throw new Error(
          `database has migration ${v} that this build does not know (older code than the database?)`,
        );
  });
  return { applied, current: all.length };
}
