/**
 * A minimal MessagePack codec for City Rumble replication (docs/CITY_RUMBLE_ONLINE.md section 4.2).
 *
 * Why not JSON: the simulation's state holds `Infinity` (e.g. `stage.nextAt`: "never"), which JSON silently turns into
 * `null`, and JSON spends ~2x the bytes on small integers. This codec is exact for every value the sim produces:
 * integers, floats (incl. +-Infinity, NaN, -0), strings, booleans, null, arrays and plain objects.
 *
 * Canonical form: an object key whose value is `undefined` is omitted (as JSON does); `undefined` inside an array is
 * `null`. With `sortKeys` the bytes of two deep-equal values are identical whatever their key order (used for the
 * desync hash). Pure: runs in the browser and in Node, no dependency.
 *
 * The decoder is defensive (it is fed bytes from the network): bounded depth and container sizes, and it throws a
 * `PackError` on malformed input, never returns a partial value.
 */

export class PackError extends Error {}

export interface PackOptions {
  /** Emit object keys in sorted order (canonical bytes for hashing). Default false (insertion order, faster). */
  sortKeys?: boolean;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

class Writer {
  buf: Uint8Array;
  view: DataView;
  pos = 0;
  constructor(size = 1024) {
    this.buf = new Uint8Array(size);
    this.view = new DataView(this.buf.buffer);
  }
  ensure(n: number): void {
    if (this.pos + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.pos + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.pos));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }
  u8(v: number): void {
    this.ensure(1);
    this.buf[this.pos++] = v;
  }
  u16(v: number): void {
    this.ensure(2);
    this.view.setUint16(this.pos, v);
    this.pos += 2;
  }
  u32(v: number): void {
    this.ensure(4);
    this.view.setUint32(this.pos, v);
    this.pos += 4;
  }
  bytes(b: Uint8Array): void {
    this.ensure(b.length);
    this.buf.set(b, this.pos);
    this.pos += b.length;
  }
}

function writeNumber(w: Writer, n: number): void {
  if (Number.isInteger(n) && !Object.is(n, -0) && n >= -0x80000000 && n <= 0xffffffff) {
    if (n >= 0) {
      if (n < 0x80) w.u8(n);
      else if (n < 0x100) {
        w.u8(0xcc);
        w.u8(n);
      } else if (n < 0x10000) {
        w.u8(0xcd);
        w.u16(n);
      } else {
        w.u8(0xce);
        w.u32(n);
      }
    } else if (n >= -32) w.u8(n & 0xff);
    else if (n >= -0x80) {
      w.u8(0xd0);
      w.ensure(1);
      w.view.setInt8(w.pos++, n);
    } else if (n >= -0x8000) {
      w.u8(0xd1);
      w.ensure(2);
      w.view.setInt16(w.pos, n);
      w.pos += 2;
    } else {
      w.u8(0xd2);
      w.ensure(4);
      w.view.setInt32(w.pos, n);
      w.pos += 4;
    }
    return;
  }
  w.u8(0xcb);
  w.ensure(8);
  w.view.setFloat64(w.pos, n);
  w.pos += 8;
}

function writeString(w: Writer, s: string): void {
  const b = textEncoder.encode(s);
  const n = b.length;
  if (n < 32) w.u8(0xa0 | n);
  else if (n < 0x100) {
    w.u8(0xd9);
    w.u8(n);
  } else if (n < 0x10000) {
    w.u8(0xda);
    w.u16(n);
  } else {
    w.u8(0xdb);
    w.u32(n);
  }
  w.bytes(b);
}

function writeValue(w: Writer, v: unknown, sort: boolean, depth: number): void {
  if (depth > 64) throw new PackError('value nested too deeply');
  if (v === null || v === undefined) return w.u8(0xc0);
  switch (typeof v) {
    case 'boolean':
      return w.u8(v ? 0xc3 : 0xc2);
    case 'number':
      return writeNumber(w, v);
    case 'string':
      return writeString(w, v);
    case 'object': {
      if (Array.isArray(v)) {
        const n = v.length;
        if (n < 16) w.u8(0x90 | n);
        else if (n < 0x10000) {
          w.u8(0xdc);
          w.u16(n);
        } else {
          w.u8(0xdd);
          w.u32(n);
        }
        for (let i = 0; i < n; i++) writeValue(w, v[i], sort, depth + 1);
        return;
      }
      const obj = v as Record<string, unknown>;
      let keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
      if (sort) keys = keys.sort();
      const n = keys.length;
      if (n < 16) w.u8(0x80 | n);
      else if (n < 0x10000) {
        w.u8(0xde);
        w.u16(n);
      } else {
        w.u8(0xdf);
        w.u32(n);
      }
      for (const k of keys) {
        writeString(w, k);
        writeValue(w, obj[k], sort, depth + 1);
      }
      return;
    }
    default:
      throw new PackError(`cannot pack a ${typeof v}`);
  }
}

export function pack(value: unknown, options: PackOptions = {}): Uint8Array {
  const w = new Writer();
  writeValue(w, value, options.sortKeys ?? false, 0);
  return w.buf.slice(0, w.pos);
}

/**
 * Builds the frames payload `{ f: [frame, ...], h?: [tick, hash] }` from frames that were each packed AT THEIR OWN TICK.
 * Packing a frame immediately is required, not an optimisation: a patch may reference live simulation objects
 * (`{ $r: generator }`), which the next tick mutates. Concatenating pre-packed bytes also avoids re-encoding.
 */
export function packFramesPayload(
  frames: readonly Uint8Array[],
  hash?: readonly [number, number],
): Uint8Array {
  const w = new Writer(frames.reduce((n, f) => n + f.length, 32));
  w.u8(0x80 | (hash ? 2 : 1));
  writeString(w, 'f');
  const n = frames.length;
  if (n < 16) w.u8(0x90 | n);
  else if (n < 0x10000) {
    w.u8(0xdc);
    w.u16(n);
  } else {
    w.u8(0xdd);
    w.u32(n);
  }
  for (const f of frames) w.bytes(f);
  if (hash) {
    writeString(w, 'h');
    writeValue(w, hash, false, 0);
  }
  return w.buf.slice(0, w.pos);
}

// ---------------------------------------------------------------- decoding

export interface UnpackLimits {
  maxDepth: number;
  /** Max elements of one array / entries of one map. */
  maxContainer: number;
  /** Max bytes of one string. */
  maxString: number;
}

/** Server -> client frames: generous (a 75 x 39 board has 2925 tiles). */
export const SERVER_FRAME_LIMITS: UnpackLimits = { maxDepth: 48, maxContainer: 65_536, maxString: 4096 };

class Reader {
  pos = 0;
  readonly view: DataView;
  constructor(
    readonly buf: Uint8Array,
    readonly limits: UnpackLimits,
  ) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  need(n: number): void {
    if (this.pos + n > this.buf.length) throw new PackError('truncated input');
  }
  u8(): number {
    this.need(1);
    return this.buf[this.pos++]!;
  }
  u16(): number {
    this.need(2);
    const v = this.view.getUint16(this.pos);
    this.pos += 2;
    return v;
  }
  u32(): number {
    this.need(4);
    const v = this.view.getUint32(this.pos);
    this.pos += 4;
    return v;
  }
  str(n: number): string {
    if (n > this.limits.maxString) throw new PackError('string too long');
    this.need(n);
    const s = textDecoder.decode(this.buf.subarray(this.pos, this.pos + n));
    this.pos += n;
    return s;
  }
  value(depth: number): unknown {
    if (depth > this.limits.maxDepth) throw new PackError('input nested too deeply');
    const t = this.u8();
    if (t < 0x80) return t;
    if (t >= 0xe0) return t - 0x100;
    if ((t & 0xe0) === 0xa0) return this.str(t & 0x1f);
    if ((t & 0xf0) === 0x90) return this.array(t & 0x0f, depth);
    if ((t & 0xf0) === 0x80) return this.map(t & 0x0f, depth);
    switch (t) {
      case 0xc0:
        return null;
      case 0xc2:
        return false;
      case 0xc3:
        return true;
      case 0xcc:
        return this.u8();
      case 0xcd:
        return this.u16();
      case 0xce:
        return this.u32();
      case 0xd0: {
        this.need(1);
        return this.view.getInt8(this.pos++);
      }
      case 0xd1: {
        this.need(2);
        const v = this.view.getInt16(this.pos);
        this.pos += 2;
        return v;
      }
      case 0xd2: {
        this.need(4);
        const v = this.view.getInt32(this.pos);
        this.pos += 4;
        return v;
      }
      case 0xcb: {
        this.need(8);
        const v = this.view.getFloat64(this.pos);
        this.pos += 8;
        return v;
      }
      case 0xd9:
        return this.str(this.u8());
      case 0xda:
        return this.str(this.u16());
      case 0xdb:
        return this.str(this.u32());
      case 0xdc:
        return this.array(this.u16(), depth);
      case 0xdd:
        return this.array(this.u32(), depth);
      case 0xde:
        return this.map(this.u16(), depth);
      case 0xdf:
        return this.map(this.u32(), depth);
      default:
        throw new PackError(`unsupported type byte 0x${t.toString(16)}`);
    }
  }
  array(n: number, depth: number): unknown[] {
    if (n > this.limits.maxContainer) throw new PackError('array too long');
    const out = new Array<unknown>(n);
    for (let i = 0; i < n; i++) out[i] = this.value(depth + 1);
    return out;
  }
  map(n: number, depth: number): Record<string, unknown> {
    if (n > this.limits.maxContainer) throw new PackError('map too large');
    const out: Record<string, unknown> = {};
    for (let i = 0; i < n; i++) {
      const k = this.value(depth + 1);
      if (typeof k !== 'string') throw new PackError('map key is not a string');
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') throw new PackError('forbidden key');
      out[k] = this.value(depth + 1);
    }
    return out;
  }
}

export function unpack(bytes: Uint8Array, limits: UnpackLimits = SERVER_FRAME_LIMITS): unknown {
  const r = new Reader(bytes, limits);
  const v = r.value(0);
  if (r.pos !== bytes.length) throw new PackError('trailing bytes');
  return v;
}

/** Deep copy through the codec: the canonical form (undefined keys dropped) of any packable value. */
export function canonicalClone<T>(value: T): T {
  return unpack(pack(value)) as T;
}
