/**
 * The client address: the TCP peer, or `X-Forwarded-For` ONLY when the peer is a configured trusted proxy (then the
 * right-most address that is not itself a trusted proxy). A client can never choose its own address by sending a header.
 * Addresses are used for rate limiting only: they are never stored or logged.
 */
import { BlockList, isIP } from 'node:net';

export function parseTrusted(entries: readonly string[]): BlockList {
  const list = new BlockList();
  for (const e of entries) {
    const [addr, bits] = e.split('/');
    const fam = isIP(addr ?? '');
    if (!addr || fam === 0) continue;
    const type = fam === 6 ? 'ipv6' : 'ipv4';
    if (bits === undefined) list.addAddress(addr, type);
    else list.addSubnet(addr, Number(bits), type);
  }
  return list;
}

const normalise = (a: string): string => (a.startsWith('::ffff:') ? a.slice(7) : a);

export function clientIp(
  peer: string | undefined,
  forwardedFor: string | string[] | undefined,
  trusted: BlockList,
): string {
  const p = normalise(peer ?? 'unknown');
  const isTrusted = (a: string): boolean => {
    const f = isIP(a);
    return f !== 0 && trusted.check(a, f === 6 ? 'ipv6' : 'ipv4');
  };
  if (!isTrusted(p)) return p;
  const header = Array.isArray(forwardedFor) ? forwardedFor.join(',') : (forwardedFor ?? '');
  const hops = header
    .split(',')
    .map((h) => normalise(h.trim()))
    .filter((h) => isIP(h) !== 0);
  for (let i = hops.length - 1; i >= 0; i--) if (!isTrusted(hops[i]!)) return hops[i]!;
  return p;
}

/** IPv6 clients share a /64; the key is the prefix so one subscriber cannot mint 2^64 buckets. */
export function ipKey(ip: string): string {
  if (isIP(ip) !== 6) return ip;
  return ip.split(':').slice(0, 4).join(':');
}
