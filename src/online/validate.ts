/**
 * A tiny hand-written validation toolkit (no dependency). A `Schema<T>` parses `unknown` into `T` or records why
 * not. Objects are STRICT: unknown keys are rejected, and keys that would be client-supplied authority (positions,
 * kills, rewards, teams ...) are reported as `forbiddenField`.
 */
import type { ValidationError } from './errors';

export const MAX_DEPTH = 6;
export const MAX_ARRAY = 64;

/** Keys a client may never send: the server owns positions, scores, rewards and team assignment. */
export const AUTHORITY_KEYS: ReadonlySet<string> = new Set([
  'x',
  'y',
  'pos',
  'position',
  'positions',
  'tile',
  'tiles',
  'kills',
  'kill',
  'deaths',
  'assists',
  'score',
  'scores',
  'reward',
  'rewards',
  'xp',
  'rating',
  'rank',
  'points',
  'winner',
  'result',
  'results',
  'team',
  'teams',
  'alive',
  'hp',
  'health',
  'state',
  'snapshot',
  'seed',
  'rng',
  'rngstate',
  'hidden',
  'pickups',
]);

type Out = ValidationError[];
export interface Schema<T> {
  parse(v: unknown, path: string, out: Out, depth: number): { value: T } | null;
}
export type Infer<S> = S extends Schema<infer T> ? T : never;

function bad(out: Out, path: string, message: string, code: ValidationError['code'] = 'invalid'): null {
  out.push({ code, path, message });
  return null;
}

const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
};

export function str(o: { min?: number; max: number; pattern?: RegExp }): Schema<string> {
  return {
    parse(v, path, out) {
      if (typeof v !== 'string') return bad(out, path, 'expected a string');
      if (v.length > o.max) return bad(out, path, `longer than ${o.max}`, 'tooLarge');
      if (v.length < (o.min ?? 0)) return bad(out, path, `shorter than ${o.min}`);
      if (o.pattern && !o.pattern.test(v)) return bad(out, path, 'unexpected characters');
      return { value: v };
    },
  };
}

export function int(min: number, max: number): Schema<number> {
  return {
    parse(v, path, out) {
      if (typeof v !== 'number' || !Number.isFinite(v)) return bad(out, path, 'expected a finite number');
      if (!Number.isInteger(v)) return bad(out, path, 'expected an integer');
      if (v < min || v > max) return bad(out, path, `out of range ${min}..${max}`);
      return { value: v };
    },
  };
}

export function bool(): Schema<boolean> {
  return {
    parse: (v, path, out) => (typeof v === 'boolean' ? { value: v } : bad(out, path, 'expected a boolean')),
  };
}

/** One of a fixed set of strings. */
export function lit<const V extends string>(values: readonly V[]): Schema<V> {
  return {
    parse: (v, path, out) =>
      typeof v === 'string' && (values as readonly string[]).includes(v)
        ? { value: v as V }
        : bad(out, path, `expected one of: ${values.slice(0, 8).join(', ')}${values.length > 8 ? ', ...' : ''}`),
  };
}

export function nullable<T>(s: Schema<T>): Schema<T | null> {
  return { parse: (v, path, out, d) => (v === null ? { value: null } : s.parse(v, path, out, d)) };
}

export function arr<T>(item: Schema<T>, max = MAX_ARRAY): Schema<T[]> {
  return {
    parse(v, path, out, depth) {
      if (!Array.isArray(v)) return bad(out, path, 'expected an array');
      if (v.length > max) return bad(out, path, `more than ${max} items`, 'tooLarge');
      const items: T[] = [];
      for (let i = 0; i < v.length; i++) {
        const r = item.parse(v[i], `${path}[${i}]`, out, depth + 1);
        if (!r) return null;
        items.push(r.value);
      }
      return { value: items };
    },
  };
}

/** Any plain object (used for the shallow server-message checks): bounded key count, no deep validation. */
export function record(maxKeys = 400): Schema<Record<string, unknown>> {
  return {
    parse(v, path, out) {
      if (!isPlain(v)) return bad(out, path, 'expected an object');
      if (Object.keys(v).length > maxKeys) return bad(out, path, 'too many keys', 'tooLarge');
      return { value: v };
    },
  };
}

export interface Optional<T> {
  readonly optional: Schema<T>;
}
export const opt = <T>(s: Schema<T>): Optional<T> => ({ optional: s });

type Field = Schema<unknown> | Optional<unknown>;
type Shape = Record<string, Field>;
const isOptional = (f: Field): f is Optional<unknown> => 'optional' in f;
type Val<F> = F extends Optional<infer T> ? T : F extends Schema<infer T> ? T : never;
type OptKeys<S extends Shape> = { [K in keyof S]: S[K] extends Optional<unknown> ? K : never }[keyof S];
export type ObjOut<S extends Shape> = { [K in Exclude<keyof S, OptKeys<S>>]: Val<S[K]> } & {
  [K in OptKeys<S>]?: Val<S[K]>;
};

/** Strict object: every key must be in `shape`. */
export function obj<S extends Shape>(shape: S): Schema<ObjOut<S>> {
  return {
    parse(v, path, out, depth) {
      if (depth > MAX_DEPTH) return bad(out, path, 'nested too deeply', 'tooLarge');
      if (!isPlain(v)) return bad(out, path, 'expected an object');
      for (const key of Object.keys(v)) {
        if (Object.prototype.hasOwnProperty.call(shape, key)) continue;
        const code = AUTHORITY_KEYS.has(key.toLowerCase()) ? 'forbiddenField' : 'unknownField';
        return bad(
          out,
          path ? `${path}.${key}` : key,
          code === 'forbiddenField' ? 'the server decides this, a client may not send it' : 'unknown field',
          code,
        );
      }
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(shape)) {
        const f = shape[key]!;
        const present = Object.prototype.hasOwnProperty.call(v, key) && v[key] !== undefined;
        if (!present) {
          if (isOptional(f)) continue;
          return bad(out, path ? `${path}.${key}` : key, 'missing');
        }
        const r = (isOptional(f) ? f.optional : f).parse(v[key], path ? `${path}.${key}` : key, out, depth + 1);
        if (!r) return null;
        result[key] = r.value;
      }
      return { value: result as ObjOut<S> };
    },
  };
}

type VariantOut<K extends string, M extends Record<string, Shape>> = {
  [T in keyof M & string]: { [P in K]: T } & ObjOut<M[T]>;
}[keyof M & string];

/** A discriminated union on `key`: `map[type]` is the shape of that variant (the key itself is added). */
export function variant<K extends string, M extends Record<string, Shape>>(
  key: K,
  map: M,
  unknownCode: ValidationError['code'] = 'unknownType',
): Schema<VariantOut<K, M>> {
  const parsers = Object.fromEntries(
    Object.entries(map).map(([name, shape]) => [name, obj({ [key]: lit([name]), ...shape })]),
  ) as Record<string, Schema<unknown>>;
  return {
    parse(v, path, out, depth) {
      if (!isPlain(v)) return bad(out, path, 'expected an object');
      const t = v[key];
      if (typeof t !== 'string') return bad(out, path ? `${path}.${key}` : key, `missing ${key}`);
      if (!Object.prototype.hasOwnProperty.call(parsers, t)) {
        return bad(out, path ? `${path}.${key}` : key, `unknown ${key}`, unknownCode);
      }
      return parsers[t]!.parse(v, path, out, depth) as { value: VariantOut<K, M> } | null;
    },
  };
}
