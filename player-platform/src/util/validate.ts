/**
 * Strict request validation without a dependency. Every request body is first checked for UNKNOWN KEYS (so a client
 * cannot smuggle an `id`, `status`, `kind`, `isAdmin`, a price or an owner into a handler), then read field by field.
 */
import { badRequest } from '../errors';

export type Obj = Record<string, unknown>;

export function obj(raw: unknown, allowed: readonly string[], what = 'body'): Obj {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw badRequest(`${what} must be a JSON object`);
  const o = raw as Obj;
  for (const k of Object.keys(o)) if (!allowed.includes(k)) throw badRequest(`unknown field: ${k}`);
  return o;
}

export function str(o: Obj, key: string, min = 1, max = 256): string {
  const v = o[key];
  if (typeof v !== 'string') throw badRequest(`${key} must be a string`);
  if (v.length < min || v.length > max) throw badRequest(`${key} must be ${min}-${max} characters`);
  return v;
}

export function optStr(o: Obj, key: string, min = 1, max = 256): string | undefined {
  return o[key] === undefined || o[key] === null ? undefined : str(o, key, min, max);
}

export function oneOf<T extends string>(o: Obj, key: string, values: readonly T[]): T {
  const v = o[key];
  if (typeof v !== 'string' || !(values as readonly string[]).includes(v))
    throw badRequest(`${key} must be one of: ${values.join(', ')}`);
  return v as T;
}

export function optOneOf<T extends string>(o: Obj, key: string, values: readonly T[]): T | undefined {
  return o[key] === undefined ? undefined : oneOf(o, key, values);
}

export function bool(o: Obj, key: string): boolean {
  if (typeof o[key] !== 'boolean') throw badRequest(`${key} must be a boolean`);
  return o[key] as boolean;
}

export function int(o: Obj, key: string, min: number, max: number): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max)
    throw badRequest(`${key} must be an integer ${min}..${max}`);
  return v;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

export function uuid(o: Obj, key: string): string {
  const v = o[key];
  if (!isUuid(v)) throw badRequest(`${key} must be an id`);
  return v.toLowerCase();
}

export function paramUuid(v: string | undefined, what = 'id'): string {
  if (!isUuid(v)) throw badRequest(`${what} must be an id`);
  return v.toLowerCase();
}

export function arr(o: Obj, key: string, max: number): unknown[] {
  const v = o[key];
  if (!Array.isArray(v) || v.length > max) throw badRequest(`${key} must be a list of at most ${max}`);
  return v;
}

export function optInt(o: Obj, key: string, min: number, max: number): number | null {
  return o[key] === undefined || o[key] === null ? null : int(o, key, min, max);
}

export function optBool(o: Obj, key: string): boolean | null {
  return o[key] === undefined || o[key] === null ? null : bool(o, key);
}

export function isoDate(o: Obj, key: string): Date {
  const v = str(o, key, 10, 40);
  const d = new Date(v);
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 2024 || d.getUTCFullYear() > 2100)
    throw badRequest(`${key} must be an ISO date`);
  return d;
}
