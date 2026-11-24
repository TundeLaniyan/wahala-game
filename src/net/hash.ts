/**
 * Desync detection: a 32-bit FNV-1a hash of the canonical (sorted-key MessagePack) bytes of a value. Two deep-equal
 * values hash the same whatever their key order, so the server's public state and a client's replica can be compared
 * cheaply (the server sends the hash every N ticks; a mismatch makes the client ask for a keyframe).
 */
import { pack } from './pack';

export function fnv1aBytes(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function canonicalHash(value: unknown): number {
  return fnv1aBytes(pack(value, { sortKeys: true }));
}
