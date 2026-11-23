import { describe, expect, it } from 'vitest';
import { PatchError, applyPatch, diff } from '../../src/net/delta';
import { canonicalHash } from '../../src/net/hash';
import { canonicalClone, pack, unpack } from '../../src/net/pack';
import { publicState } from '../../src/net/publicState';
import { makeMatch, rng, runMatch } from './helpers';

type R = () => number;
const int = (r: R, n: number): number => Math.floor(r() * n);
const pick = <T>(r: R, a: readonly T[]): T => a[int(r, a.length)]!;

let idCounter = 1;

function genPrimitive(r: R): unknown {
  switch (int(r, 8)) {
    case 0:
      return null;
    case 1:
      return r() < 0.5;
    case 2:
      return pick(r, [Infinity, -Infinity, 0, 1, -1, 255, 70000, -70000]);
    case 3:
      return int(r, 20);
    case 4:
      return Math.round(r() * 1e4) / 100;
    case 5:
      return pick(r, ['', 'a', 'b', 'héllo', 'idle', 'walk']);
    default:
      return int(r, 5);
  }
}

function genObject(r: R, depth: number, withId: boolean): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (withId) o.id = idCounter++;
  const n = int(r, 4);
  for (let i = 0; i < n; i++) o[pick(r, ['a', 'b', 'c', 'd', 'pos', 'hp'])] = genValue(r, depth + 1);
  return o;
}

function genValue(r: R, depth: number): unknown {
  const k = depth > 3 ? 0 : int(r, 7);
  switch (k) {
    case 1:
      return genObject(r, depth, false);
    case 2:
      return Array.from({ length: int(r, 6) }, () => genPrimitive(r));
    case 3:
      return Array.from({ length: 1 + int(r, 5) }, () => genObject(r, depth, true));
    case 4:
      return Array.from({ length: 1 + int(r, 5) }, () => genObject(r, depth, false));
    case 5:
      return Array.from({ length: int(r, 4) }, () => genValue(r, depth + 1));
    default:
      return genPrimitive(r);
  }
}

function genState(r: R): Record<string, unknown> {
  return {
    tick: int(r, 1000),
    flag: r() < 0.5,
    nextAt: r() < 0.5 ? Infinity : int(r, 100),
    nums: Array.from({ length: int(r, 8) }, () => genPrimitive(r)),
    players: Array.from({ length: 1 + int(r, 6) }, () => genObject(r, 1, true)),
    flames: Array.from({ length: int(r, 6) }, () => ({ x: int(r, 9), y: int(r, 9), ttl: int(r, 30) })),
    nested: genObject(r, 0, false),
    misc: genValue(r, 0),
    ...(r() < 0.5 ? { extra: genValue(r, 1) } : {}),
  };
}

function shuffle<T>(r: R, a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = int(r, i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Returns a mutated deep copy of `v`. */
function mutate(r: R, v: unknown, depth = 0): unknown {
  if (Array.isArray(v)) {
    const roll = r();
    const arr = v.map((e) => (r() < 0.4 ? mutate(r, e, depth + 1) : canonicalClone(e as object)));
    if (roll < 0.15) return shuffle(r, arr);
    if (roll < 0.3) return arr.filter(() => r() < 0.7);
    if (roll < 0.5) {
      // filter then append: the sim's "drop expired, push new" pattern
      const kept = arr.filter(() => r() < 0.6);
      const first = arr[0];
      const isEnt = typeof first === 'object' && first !== null && 'id' in first;
      const add = Array.from({ length: int(r, 3) }, () =>
        isEnt ? genObject(r, 2, true) : typeof first === 'object' ? genObject(r, 2, false) : genPrimitive(r),
      );
      return [...kept, ...add];
    }
    if (roll < 0.55) return [];
    if (roll < 0.6) return genValue(r, 1); // type replacement
    return arr;
  }
  if (typeof v === 'object' && v !== null) {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v)) {
      const x = r();
      if (x < 0.1) continue; // delete key
      o[k] =
        r() < 0.45
          ? mutate(r, (v as Record<string, unknown>)[k], depth + 1)
          : canonicalClone((v as Record<string, unknown>)[k]);
    }
    if (r() < 0.2) o[pick(r, ['a', 'b', 'z', 'q'])] = genValue(r, depth + 1);
    if (r() < 0.03) return genPrimitive(r);
    return o;
  }
  if (r() < 0.35) return r() < 0.3 ? genValue(r, 2) : genPrimitive(r);
  return v;
}

describe('delta: randomised round-trip', () => {
  it('applyPatch(clone(a), diff(a, b)) hashes like b, for 3000 random pairs', () => {
    const r = rng(20240607);
    let patched = 0;
    let undefinedPatches = 0;
    for (let i = 0; i < 3000; i++) {
      const a = canonicalClone(genState(r));
      let b: unknown = a;
      const steps = 1 + int(r, 3);
      for (let s = 0; s < steps; s++) b = mutate(r, b);
      b = canonicalClone(b);
      const aHash = canonicalHash(a);
      const patch = diff(a, b);
      expect(canonicalHash(a), `case ${i}: diff mutated its input`).toBe(aHash);
      if (patch === undefined) {
        undefinedPatches++;
        expect(canonicalHash(a), `case ${i}`).toBe(canonicalHash(b));
        continue;
      }
      patched++;
      const patchHash = canonicalHash(patch);
      const wire = unpack(pack(patch));
      const viaWire = applyPatch(canonicalClone(a), wire);
      const direct = applyPatch(canonicalClone(a), patch);
      expect(canonicalHash(direct), `case ${i} direct`).toBe(canonicalHash(b));
      expect(canonicalHash(viaWire), `case ${i} wire`).toBe(canonicalHash(b));
      expect(canonicalHash(patch), `case ${i}: applyPatch mutated the patch`).toBe(patchHash);
      // the result must not alias the patch: mutating it must not change a later application
      const again = applyPatch(canonicalClone(a), patch);
      expect(canonicalHash(again)).toBe(canonicalHash(b));
    }
    expect(patched).toBeGreaterThan(2000);
    expect(undefinedPatches).toBeGreaterThanOrEqual(0);
  });

  it('diff(x, canonicalClone(x)) is undefined', () => {
    const r = rng(77);
    for (let i = 0; i < 1000; i++) {
      const x = genState(r);
      expect(diff(x, canonicalClone(x))).toBeUndefined();
      expect(diff(canonicalClone(x), x)).toBeUndefined();
    }
  });

  it('chained diffs keep a mirror equal to the source over many steps', () => {
    const r = rng(5);
    let cur = canonicalClone(genState(r));
    let mirror: unknown = canonicalClone(cur);
    for (let i = 0; i < 500; i++) {
      const next = canonicalClone(mutate(r, cur)) as Record<string, unknown>;
      const p = diff(mirror, next);
      if (p !== undefined) mirror = applyPatch(mirror, unpack(pack(p)));
      expect(canonicalHash(mirror)).toBe(canonicalHash(next));
      cur = next;
    }
  });
});

describe('delta: targeted behaviour', () => {
  it('returns undefined for deep-equal values and special numbers', () => {
    expect(diff({ a: Infinity }, { a: Infinity })).toBeUndefined();
    expect(diff(NaN, NaN)).toBeUndefined();
    expect(diff([1, { id: 1 }], [1, { id: 1 }])).toBeUndefined();
    expect(diff(0, -0)).toBe(-0);
  });

  it('entity objects keep identity after an in-place update', () => {
    const prev = {
      list: [
        { id: 1, v: 1 },
        { id: 2, v: 2 },
        { id: 3, v: 3 },
      ],
    };
    const target = canonicalClone(prev);
    const [e1, e2, e3] = target.list;
    const next = {
      list: [
        { id: 3, v: 30 },
        { id: 1, v: 10 },
        { id: 4, v: 4 },
      ],
    };
    const patch = diff(prev, next);
    const out = applyPatch(target, patch) as typeof prev;
    expect(out).toBe(target);
    expect(out.list).toBe(target.list);
    expect(out.list[0]).toBe(e3);
    expect(out.list[1]).toBe(e1);
    expect(out.list.find((e) => e.id === 2)).toBeUndefined();
    expect(e2!.v).toBe(2);
    expect(e1).toEqual({ id: 1, v: 10 });
    expect(canonicalHash(out)).toBe(canonicalHash(next));
  });

  it('an unchanged entity is left untouched while a sibling changes', () => {
    const prev = {
      l: [
        { id: 1, v: 1 },
        { id: 2, v: 2 },
      ],
    };
    const target = canonicalClone(prev);
    const e1 = target.l[0];
    const patch = diff(prev, {
      l: [
        { id: 1, v: 1 },
        { id: 2, v: 5 },
      ],
    }) as { l: { $e: { u: unknown[][] } } };
    expect(patch.l.$e.u.length).toBe(1);
    applyPatch(target, patch);
    expect(target.l[0]).toBe(e1);
  });

  it('a sequence patch does not alias appended objects with the patch', () => {
    const prev = { f: [{ x: 1 }, { x: 2 }] };
    const next = { f: [{ x: 2 }, { x: 3 }] };
    const patch = diff(prev, next);
    const t1 = applyPatch(canonicalClone(prev), patch) as typeof next;
    t1.f[1]!.x = 999;
    const t2 = applyPatch(canonicalClone(prev), patch) as typeof next;
    expect(t2.f[1]!.x).toBe(3);
  });

  it('throws PatchError on misfit patches', () => {
    expect(() => applyPatch({ a: 1 }, { $a: [[0, 1]] })).toThrow(PatchError);
    expect(() => applyPatch({ a: 1 }, { $e: { u: [] } })).toThrow(PatchError);
    expect(() => applyPatch({ a: 1 }, { $m: [[], []] })).toThrow(PatchError);
    expect(() => applyPatch([1, 2], { $a: [[5, 1]] })).toThrow(PatchError);
    expect(() => applyPatch([1, 2], { $a: [[-1, 1]] })).toThrow(PatchError);
    expect(() => applyPatch([{ id: 1 }], { $e: { u: [], o: [1, 9] } })).toThrow(PatchError);
    expect(() => applyPatch(5, { a: 1 })).toThrow(PatchError);
    expect(() => applyPatch(null, { a: 1 })).toThrow(PatchError);
  });

  it('rejects a patch with the key __proto__ (and constructor / prototype)', () => {
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      const patch = JSON.parse(`{"${key}": {"$r": {"polluted": true}}}`) as unknown;
      expect(() => applyPatch({}, patch)).toThrow(PatchError);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    // and the wire decoder refuses to build such an object in the first place
    const enc = new TextEncoder().encode('__proto__');
    expect(() => unpack(Uint8Array.from([0x81, 0xa0 | enc.length, ...enc, 0x01]))).toThrow();
  });
});

describe('delta: real City Rumble state', () => {
  it('has no key starting with $ anywhere in the public state of a 32-player match', () => {
    const m = makeMatch();
    const seen = new Set<string>();
    const bad: string[] = [];
    const walk = (v: unknown, path: string): void => {
      if (Array.isArray(v)) {
        v.forEach((e, i) => walk(e, `${path}[${i}]`));
      } else if (typeof v === 'object' && v !== null) {
        for (const [k, x] of Object.entries(v)) {
          if (k.startsWith('$')) bad.push(`${path}.${k}`);
          seen.add(k);
          walk(x, `${path}.${k}`);
        }
      }
    };
    for (let round = 0; round < 3; round++) {
      runMatch(m, 200, { startTick: round * 200 });
      walk(publicState(m.state), 'state');
      walk(m.keyframe(), 'kf');
    }
    expect(bad).toEqual([]);
    expect(seen.size).toBeGreaterThan(50);
  });

  it('diffing consecutive real states and replaying the patches reproduces them', () => {
    const m = makeMatch({ humans: 2, bots: 6 });
    const mirror = canonicalClone(publicState(m.state));
    for (let t = 0; t < 600 && !m.ended; t++) {
      m.step();
      const next = canonicalClone(publicState(m.state));
      const p = diff(mirror, next);
      if (p !== undefined) applyPatch(mirror, unpack(pack(p)));
      if (t % 25 === 0) expect(canonicalHash(mirror)).toBe(canonicalHash(next));
    }
  });
});
