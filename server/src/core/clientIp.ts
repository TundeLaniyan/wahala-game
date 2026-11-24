/**
 * Who is really connecting (decision FU2S-C4): the address of the TCP peer, and `X-Forwarded-For` only when that peer is
 * a proxy the operator listed in `RUMBLE_TRUSTED_PROXIES` (exact IPs or CIDR ranges, IPv4 / IPv6). Without a list every
 * forwarding header is ignored: a client cannot choose its own address by sending `X-Forwarded-For: 1.2.3.4`.
 *
 * Colyseus builds `AuthContext.ip` from `x-real-ip`, `x-forwarded-for`, `x-client-ip` WITHOUT asking who sent them, so
 * `normaliseForwardedHeaders` rewrites the incoming request's headers to the one trusted answer before Colyseus reads them.
 * Pure (no sockets): unit-testable.
 */
import { isIP } from 'node:net';

/** `::ffff:1.2.3.4` is the IPv4 address 1.2.3.4. */
export function normaliseIp(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let ip = raw.trim();
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
  const zone = ip.indexOf('%');
  if (zone >= 0) ip = ip.slice(0, zone);
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) ip = mapped[1]!;
  return isIP(ip) === 0 ? null : ip.toLowerCase();
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((a, p) => (a * 256 + Number(p)) >>> 0, 0);
}

function ipv6ToBigInt(ip: string): bigint {
  let head = ip;
  let tail = '';
  const gap = ip.indexOf('::');
  if (gap >= 0) {
    head = ip.slice(0, gap);
    tail = ip.slice(gap + 2);
  }
  const part = (s: string): string[] => (s === '' ? [] : s.split(':'));
  let h = part(head);
  let t = part(tail);
  const fix = (g: string[]): string[] =>
    g.flatMap((x) => {
      if (!x.includes('.')) return [x];
      const n = ipv4ToInt(x);
      return [(n >>> 16).toString(16), (n & 0xffff).toString(16)];
    });
  h = fix(h);
  t = fix(t);
  const zeros = gap >= 0 ? 8 - h.length - t.length : 0;
  const groups = [...h, ...Array<string>(Math.max(0, zeros)).fill('0'), ...t];
  return groups.reduce((a, g) => (a << 16n) | BigInt(parseInt(g || '0', 16)), 0n);
}

export interface TrustedProxies {
  readonly size: number;
  has(ip: string): boolean;
}

/** `10.0.0.5`, `10.0.0.0/8`, `::1`, `fd00::/8` (comma separated, bad entries are ignored). */
export function parseTrustedProxies(list: string | undefined): TrustedProxies {
  const rules: ((ip: string) => boolean)[] = [];
  for (const entry of (list ?? '').split(',')) {
    const [addr, bitsRaw] = entry.trim().split('/');
    const net = normaliseIp(addr);
    if (!net) continue;
    const v6 = isIP(net) === 6;
    const max = v6 ? 128 : 32;
    const bits = bitsRaw === undefined ? max : Number(bitsRaw);
    if (!Number.isInteger(bits) || bits < 0 || bits > max) continue;
    if (v6) {
      const base = ipv6ToBigInt(net);
      const shift = BigInt(128 - bits);
      rules.push((ip) => isIP(ip) === 6 && ipv6ToBigInt(ip) >> shift === base >> shift);
    } else {
      const base = ipv4ToInt(net);
      const shift = 32 - bits;
      rules.push(
        (ip) => isIP(ip) === 4 && (shift === 32 ? true : ipv4ToInt(ip) >>> shift === base >>> shift),
      );
    }
  }
  return { size: rules.length, has: (ip) => rules.some((r) => r(ip)) };
}

/**
 * The client's address. `forwardedFor` is the raw header value (all hops, comma separated). Walking from the nearest hop
 * outward, every address that is itself a trusted proxy is skipped; the first one that is not is the client. A peer that
 * is not a trusted proxy is the client, whatever it claims.
 */
export function resolveClientIp(
  remoteAddress: string | undefined,
  forwardedFor: string | undefined,
  trusted: TrustedProxies,
): string {
  const peer = normaliseIp(remoteAddress) ?? 'unknown';
  if (peer === 'unknown' || !trusted.has(peer) || !forwardedFor) return peer;
  const hops = forwardedFor
    .split(',')
    .map((h) => normaliseIp(h))
    .filter((h): h is string => h !== null);
  for (let i = hops.length - 1; i >= 0; i--) if (!trusted.has(hops[i]!)) return hops[i]!;
  return hops[0] ?? peer;
}

/** The key per-address limits use: an IPv6 address counts as its /64 (a single subscriber owns billions of /128s). */
export function ipKey(ip: string): string {
  if (isIP(ip) !== 6) return ip;
  const full = ipv6ToBigInt(ip) >> 64n;
  return `${full.toString(16)}/64`;
}

interface HeaderBag {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

/**
 * Makes the request's own forwarding headers say only the trusted answer (and drops the other client-address headers),
 * so everything downstream that reads them (Colyseus' `AuthContext.ip`) sees an address a client could not choose.
 * Returns that address.
 */
export function normaliseForwardedHeaders(req: HeaderBag, trusted: TrustedProxies): string {
  const xff = req.headers['x-forwarded-for'];
  const ip = resolveClientIp(req.socket?.remoteAddress, Array.isArray(xff) ? xff.join(',') : xff, trusted);
  delete req.headers['x-real-ip'];
  delete req.headers['x-client-ip'];
  req.headers['x-forwarded-for'] = ip;
  return ip;
}
