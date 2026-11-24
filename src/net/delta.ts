/**
 * Structural delta of plain data (docs/CITY_RUMBLE_ONLINE.md section 4.3).
 *
 * The server keeps a MIRROR of what every client already holds (the last broadcast public state). Each tick it computes
 * `diff(mirror, current)`, sends the patch, and applies the same patch to its mirror with `applyPatch` - the exact
 * function the client runs - so server and clients stay byte-identical by construction (checked by the desync hash).
 * The transport (a WebSocket) is reliable and ordered, so one patch per tick is shared by every client in the room:
 * the server encodes it ONCE, whatever the number of clients.
 *
 * Patch grammar (values are canonical: see pack.ts):
 *   primitive | null              the new value
 *   array                         replace with this array
 *   { $r: v }                     replace with v (an object, or anything that was not an object before)
 *   { $a: [[i, p], ...] }         same-length array: element i gets patch p
 *   { $e: { u: [[id, p], ...], o?: [id, ...] } }
 *                                 entity array (objects with a numeric `id`): element `id` gets p (`{$r}` for a new
 *                                 one); `o` = the new id order when membership or order changed
 *   { $m: [removed, appended] }   sequence: drop the elements at `removed` indices, then append `appended`
 *                                 (fits the sim's "filter the expired, push the new" lists such as flames)
 *   { k: p, ..., $d?: [k, ...] }  object: key k gets p; keys in $d are deleted
 *
 * State keys never start with `$` (asserted by tests), so the markers cannot collide with data.
 */

export type Patch = unknown;

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function isEntityArray(a: readonly unknown[]): boolean {
  if (a.length === 0) return false;
  const seen = new Set<number>();
  for (const el of a) {
    if (!isObj(el) || typeof el.id !== 'number' || seen.has(el.id)) return false;
    seen.add(el.id);
  }
  return true;
}

/** Equality key of an element of an id-less sequence (exact for non-finite numbers too). */
function seqKey(v: unknown): string {
  return typeof v === 'object' && v !== null
    ? JSON.stringify(v, (_k, x) => (typeof x === 'number' && !Number.isFinite(x) ? `#${x}` : x))
    : `${typeof v}:${String(v)}`;
}

/** The patch turning `prev` into `next`, or `undefined` when they are deep-equal. */
export function diff(prev: unknown, next: unknown): Patch | undefined {
  if (Object.is(prev, next)) return undefined;
  // only reachable inside arrays (object keys treat undefined as deletion); canonically an undefined slot is null
  if (next === undefined) return prev === null ? undefined : null;
  if (typeof next !== 'object' || next === null) {
    return typeof prev === 'number' && typeof next === 'number' && Object.is(prev, next) ? undefined : next;
  }
  if (Array.isArray(next)) return diffArray(prev, next);
  if (!isObj(prev)) return { $r: next };
  return diffObject(prev, next as Obj);
}

function diffObject(prev: Obj, next: Obj): Patch | undefined {
  let out: Obj | undefined;
  for (const k in next) {
    const nv = next[k];
    if (nv === undefined) continue;
    const pv = prev[k];
    const d = pv === undefined ? wrap(nv) : diff(pv, nv);
    if (d !== undefined) (out ??= {})[k] = d;
  }
  let deleted: string[] | undefined;
  for (const k in prev) {
    if (prev[k] !== undefined && next[k] === undefined) (deleted ??= []).push(k);
  }
  if (deleted) (out ??= {}).$d = deleted;
  return out;
}

/** A brand-new value as a patch: objects must be marked as replacements, everything else is literal. */
const wrap = (v: unknown): Patch => (isObj(v) ? { $r: v } : v);

function diffArray(prev: unknown, next: unknown[]): Patch | undefined {
  if (!Array.isArray(prev)) return next;
  if (prev.length === 0 && next.length === 0) return undefined;
  if (next.length === 0) return next;
  if (isEntityArray(next) && (prev.length === 0 || isEntityArray(prev)))
    return diffEntities(prev as Obj[], next as Obj[]);
  if (prev.length === next.length) {
    let changes: [number, Patch][] | undefined;
    for (let i = 0; i < next.length; i++) {
      const d = diff(prev[i], next[i]);
      if (d !== undefined) (changes ??= []).push([i, d]);
    }
    if (!changes) return undefined;
    // dense change: the plain array is smaller than index + patch pairs
    return changes.length * 2 > next.length ? next : { $a: changes };
  }
  if (next.some((v) => typeof v === 'object' && v !== null)) return diffSequence(prev, next);
  return next;
}

function diffEntities(prev: Obj[], next: Obj[]): Patch | undefined {
  const before = new Map<number, Obj>();
  for (const el of prev) before.set(el.id as number, el);
  const u: [number, Patch][] = [];
  for (const el of next) {
    const id = el.id as number;
    const old = before.get(id);
    const d = old === undefined ? { $r: el } : diff(old, el);
    if (d !== undefined) u.push([id, d]);
  }
  let reordered = prev.length !== next.length;
  for (let i = 0; !reordered && i < next.length; i++) reordered = prev[i]!.id !== next[i]!.id;
  if (!reordered && u.length === 0) return undefined;
  return { $e: reordered ? { u, o: next.map((el) => el.id as number) } : { u } };
}

function diffSequence(prev: unknown[], next: unknown[]): Patch {
  // greedy keep-in-order match: exact for "filter some, append new"; still correct (just larger) otherwise
  const removed: number[] = [];
  let j = 0;
  for (let i = 0; i < prev.length; i++) {
    if (j < next.length && seqKey(prev[i]) === seqKey(next[j])) j++;
    else removed.push(i);
  }
  const appended = next.slice(j);
  // nothing in common: the plain array is smaller
  if (removed.length === prev.length) return next;
  return { $m: [removed, appended] };
}

// ---------------------------------------------------------------- applying

/** Deep copy of canonical data (patches must never alias the value they were computed from). */
function clone<T>(v: T): T {
  if (typeof v !== 'object' || v === null) return v;
  if (Array.isArray(v)) return v.map(clone) as T;
  const out: Obj = {};
  for (const k in v as Obj) {
    const x = (v as Obj)[k];
    if (x !== undefined) out[k] = clone(x);
  }
  return out as T;
}

export class PatchError extends Error {}

/**
 * Applies `patch` to `target` and returns the new value. Objects and arrays are updated IN PLACE (an entity keeps its
 * object identity), so the result is `target` itself unless the patch replaced it. Throws `PatchError` on a patch that
 * does not fit the target (a desync: the caller must ask for a keyframe).
 */
export function applyPatch(target: unknown, patch: Patch): unknown {
  if (typeof patch !== 'object' || patch === null) return patch;
  if (Array.isArray(patch)) return clone(patch);
  const p = patch as Obj;
  if ('$r' in p) return clone(p.$r);
  if ('$a' in p) {
    if (!Array.isArray(target)) throw new PatchError('$a on a non-array');
    for (const [i, sub] of p.$a as [number, Patch][]) {
      if (!(i >= 0 && i < target.length)) throw new PatchError('$a index out of range');
      target[i] = applyPatch(target[i], sub);
    }
    return target;
  }
  if ('$e' in p) {
    if (!Array.isArray(target)) throw new PatchError('$e on a non-array');
    const { u, o } = p.$e as { u: [number, Patch][]; o?: number[] };
    const byId = new Map<number, unknown>();
    for (const el of target as Obj[]) byId.set(el.id as number, el);
    for (const [id, sub] of u) byId.set(id, applyPatch(byId.get(id), sub));
    if (o) {
      const next = o.map((id) => {
        if (!byId.has(id)) throw new PatchError(`$e order names unknown id ${id}`);
        return byId.get(id);
      });
      target.length = 0;
      for (const el of next) target.push(el);
    } else {
      for (let i = 0; i < target.length; i++) target[i] = byId.get((target[i] as Obj).id as number);
    }
    return target;
  }
  if ('$m' in p) {
    if (!Array.isArray(target)) throw new PatchError('$m on a non-array');
    const [removed, appended] = p.$m as [number[], unknown[]];
    const drop = new Set(removed);
    const kept = target.filter((_v, i) => !drop.has(i));
    target.length = 0;
    for (const el of kept) target.push(el);
    for (const el of appended) target.push(clone(el));
    return target;
  }
  if (!isObj(target)) throw new PatchError('object patch on a non-object');
  for (const k in p) {
    if (k === '$d') continue;
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') throw new PatchError('forbidden key');
    target[k] = applyPatch(target[k], p[k]);
  }
  for (const k of (p.$d as string[] | undefined) ?? []) delete target[k];
  return target;
}
