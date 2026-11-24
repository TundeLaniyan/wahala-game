import { describe, expect, it } from 'vitest';
import { PackError, canonicalClone, pack, packFramesPayload, unpack } from '../../src/net/pack';

const BIG = { maxDepth: 48, maxContainer: 1 << 20, maxString: 1 << 20 };
const rt = (v: unknown): unknown => unpack(pack(v), BIG);
const bytes = (...b: number[]): Uint8Array => Uint8Array.from(b);

describe('pack: round-trips', () => {
  it('is exact for the special numbers', () => {
    for (const n of [Infinity, -Infinity, -0, 0, 0.1, -1.5, Number.MAX_VALUE, Number.MIN_VALUE, 1e300]) {
      expect(Object.is(rt(n), n)).toBe(true);
    }
    expect(Number.isNaN(rt(NaN))).toBe(true);
    expect(Object.is(rt(-0), -0)).toBe(true);
    expect(Object.is(rt(0), 0)).toBe(true);
  });

  it('is exact for integers of every width and sign boundary', () => {
    const ints = [
      0,
      1,
      127,
      128,
      255,
      256,
      65535,
      65536,
      0xffffffff,
      -1,
      -32,
      -33,
      -128,
      -129,
      -32768,
      -32769,
      -0x80000000,
      -0x80000001,
      0x100000000,
      Number.MAX_SAFE_INTEGER,
      Number.MIN_SAFE_INTEGER,
    ];
    for (const n of ints) expect(Object.is(rt(n), n)).toBe(true);
  });

  it('uses compact encodings for small ints', () => {
    expect(pack(5).length).toBe(1);
    expect(pack(-5).length).toBe(1);
    expect(pack(200).length).toBe(2);
    expect(pack(70000).length).toBe(5);
  });

  it('is exact for strings (ascii, unicode, long)', () => {
    const strs = [
      '',
      'a',
      'WAHALA!',
      'héllo wörld',
      '日本語',
      '🔥💣',
      'x'.repeat(31),
      'x'.repeat(32),
      'y'.repeat(300),
      'z'.repeat(70000),
    ];
    for (const s of strs) expect(rt(s)).toBe(s);
  });

  it('round-trips booleans, null, nested arrays and objects', () => {
    const v = {
      a: [1, 2, [3, { b: null, c: true, d: false }]],
      e: { f: 'g', h: [] as unknown[], i: {} },
      big: Array.from({ length: 20 }, (_, i) => i),
      huge: Array.from({ length: 70000 }, (_, i) => i & 0xff),
    };
    expect(rt(v)).toEqual(v);
  });

  it('round-trips maps beyond 15 and 65535 keys', () => {
    const o: Record<string, number> = {};
    for (let i = 0; i < 20; i++) o[`k${i}`] = i;
    expect(rt(o)).toEqual(o);
    const big: Record<string, number> = {};
    for (let i = 0; i < 70000; i++) big[`k${i}`] = i;
    expect(Object.keys(rt(big) as object).length).toBe(70000);
  });

  it('round-trips Infinity inside structures', () => {
    const v = { nextAt: Infinity, list: [-Infinity, 1] };
    expect(rt(v)).toEqual(v);
  });
});

describe('pack: canonical form', () => {
  it('sortKeys yields identical bytes whatever the key order', () => {
    const a = { z: 1, a: { y: [1, { q: 1, b: 2 }], x: 'k' }, m: null };
    const b = { m: null, a: { x: 'k', y: [1, { b: 2, q: 1 }] }, z: 1 };
    expect(pack(a, { sortKeys: true })).toEqual(pack(b, { sortKeys: true }));
    expect(pack(a)).not.toEqual(pack(b));
  });

  it('drops object keys whose value is undefined; undefined in arrays becomes null', () => {
    expect(rt({ a: undefined, b: 1 })).toEqual({ b: 1 });
    expect('a' in (rt({ a: undefined }) as object)).toBe(false);
    expect(rt([1, undefined, 3])).toEqual([1, null, 3]);
    expect(pack({ a: undefined, b: 1 }, { sortKeys: true })).toEqual(pack({ b: 1 }, { sortKeys: true }));
  });

  it('canonicalClone drops undefined keys and deep-copies', () => {
    const src = { a: undefined, b: { c: undefined, d: [1, undefined] }, e: Infinity };
    const c = canonicalClone(src);
    expect(c).toEqual({ b: { d: [1, null] }, e: Infinity });
    expect(Object.keys(c)).toEqual(['b', 'e']);
    expect(c.b).not.toBe(src.b);
  });

  it('refuses unpackable types and absurd nesting', () => {
    expect(() => pack(() => 1)).toThrow(PackError);
    expect(() => pack(Symbol('x'))).toThrow(PackError);
    expect(() => pack(10n)).toThrow(PackError);
    let deep: unknown = 1;
    for (let i = 0; i < 100; i++) deep = [deep];
    expect(() => pack(deep)).toThrow(PackError);
  });
});

describe('unpack: malformed input', () => {
  it('rejects truncated input at every cut', () => {
    const full = pack({ a: [1, 'héllo', 3.5, -200, 70000], b: { c: 'x'.repeat(40) } });
    for (let n = 0; n < full.length; n++) {
      expect(() => unpack(full.subarray(0, n))).toThrow(PackError);
    }
  });

  it('rejects an empty buffer', () => {
    expect(() => unpack(new Uint8Array(0))).toThrow(PackError);
  });

  it('rejects trailing bytes', () => {
    expect(() => unpack(bytes(0x01, 0x02))).toThrow(PackError);
    expect(() => unpack(Uint8Array.from([...pack({ a: 1 }), 0]))).toThrow(PackError);
  });

  it('rejects unsupported type bytes', () => {
    for (const t of [0xc1, 0xc4, 0xc7, 0xca, 0xcf, 0xd3, 0xd4, 0xd8, 0xc8, 0xc9]) {
      expect(() => unpack(bytes(t, 0, 0, 0, 0, 0, 0, 0, 0))).toThrow(PackError);
    }
  });

  it('rejects invalid utf-8', () => {
    expect(() => unpack(bytes(0xa2, 0xff, 0xfe))).toThrow();
  });

  it('enforces the container and string limits', () => {
    const limits = { maxDepth: 8, maxContainer: 4, maxString: 8 };
    expect(unpack(pack([1, 2, 3, 4]), limits)).toEqual([1, 2, 3, 4]);
    expect(() => unpack(pack([1, 2, 3, 4, 5]), limits)).toThrow(PackError);
    expect(() => unpack(pack({ a: 1, b: 2, c: 3, d: 4, e: 5 }), limits)).toThrow(PackError);
    expect(unpack(pack('12345678'), limits)).toBe('12345678');
    expect(() => unpack(pack('123456789'), limits)).toThrow(PackError);
    // a header claiming a huge container is refused before allocating
    expect(() => unpack(bytes(0xdd, 0xff, 0xff, 0xff, 0xff))).toThrow(PackError);
    expect(() => unpack(bytes(0xdf, 0xff, 0xff, 0xff, 0xff))).toThrow(PackError);
    expect(() => unpack(bytes(0xdb, 0xff, 0xff, 0xff, 0xff))).toThrow(PackError);
  });

  it('enforces the depth limit', () => {
    const limits = { maxDepth: 4, maxContainer: 10, maxString: 10 };
    expect(unpack(pack([[[[1]]]]), limits)).toEqual([[[[1]]]]);
    expect(() => unpack(pack([[[[[[1]]]]]]), limits)).toThrow(PackError);
    // a hostile 10000-deep array is refused without a stack overflow
    const evil = new Uint8Array(10000).fill(0x91);
    expect(() => unpack(Uint8Array.from([...evil, 0x01]))).toThrow(PackError);
  });

  it('rejects non-string map keys', () => {
    expect(() => unpack(bytes(0x81, 0x01, 0x02))).toThrow(PackError);
    expect(() => unpack(bytes(0x81, 0xc0, 0x02))).toThrow(PackError);
  });

  it('rejects the keys __proto__, constructor and prototype', () => {
    for (const k of ['__proto__', 'constructor', 'prototype']) {
      const enc = new TextEncoder().encode(k);
      const buf = Uint8Array.from([0x81, 0xa0 | enc.length, ...enc, 0x01]);
      expect(() => unpack(buf)).toThrow(PackError);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('packFramesPayload', () => {
  const frames: unknown[] = [
    [1, null, null],
    [2, { tick: 2, x: Infinity }, [{ type: 'e' }]],
    [3, { $r: { a: 1 } }, null],
  ];

  it('equals packing { f } directly', () => {
    const parts = frames.map((f) => pack(f));
    expect(packFramesPayload(parts)).toEqual(pack({ f: frames }));
    expect(unpack(packFramesPayload(parts))).toEqual({ f: frames });
  });

  it('equals packing { f, h } directly when a hash is given', () => {
    const parts = frames.map((f) => pack(f));
    const out = packFramesPayload(parts, [3, 123456]);
    expect(out).toEqual(pack({ f: frames, h: [3, 123456] }));
    expect(unpack(out)).toEqual({ f: frames, h: [3, 123456] });
  });

  it('handles empty and large frame lists', () => {
    expect(unpack(packFramesPayload([]))).toEqual({ f: [] });
    const many = Array.from({ length: 40 }, (_, i) => [i, null, null]);
    const out = packFramesPayload(many.map((f) => pack(f)));
    expect(out).toEqual(pack({ f: many }));
  });
});
