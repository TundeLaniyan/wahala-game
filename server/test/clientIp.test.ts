import { describe, expect, it } from 'vitest';
import {
  ipKey,
  normaliseForwardedHeaders,
  normaliseIp,
  parseTrustedProxies,
  resolveClientIp,
} from '../src/core/clientIp';

describe('client address (decision FU2S-C4: X-Forwarded-For only from configured proxies)', () => {
  it('normalises IPv4-mapped IPv6, zones and brackets, and rejects non-addresses', () => {
    expect(normaliseIp('::ffff:10.1.2.3')).toBe('10.1.2.3');
    expect(normaliseIp('[2001:DB8::1]')).toBe('2001:db8::1');
    expect(normaliseIp('fe80::1%eth0')).toBe('fe80::1');
    for (const bad of ['', 'abc', '999.1.1.1', '1.2.3', undefined, null]) expect(normaliseIp(bad)).toBeNull();
  });

  it('parses exact addresses and CIDR ranges (v4 and v6) and ignores bad entries', () => {
    const t = parseTrustedProxies('10.0.0.5, 192.168.0.0/16, fd00::/8, nonsense, 10.0.0.0/99');
    expect(t.size).toBe(3);
    expect(t.has('10.0.0.5')).toBe(true);
    expect(t.has('10.0.0.6')).toBe(false);
    expect(t.has('192.168.44.2')).toBe(true);
    expect(t.has('192.169.0.1')).toBe(false);
    expect(t.has('fd12:3456::1')).toBe(true);
    expect(t.has('fe80::1')).toBe(false);
    expect(parseTrustedProxies(undefined).size).toBe(0);
  });

  it('with no trusted proxy the peer is the client, whatever the headers claim', () => {
    const none = parseTrustedProxies(undefined);
    expect(resolveClientIp('203.0.113.9', '1.2.3.4', none)).toBe('203.0.113.9');
    expect(resolveClientIp('::ffff:203.0.113.9', '1.2.3.4, 5.6.7.8', none)).toBe('203.0.113.9');
  });

  it('a request from a trusted proxy is believed, but a client cannot prepend itself in front of the proxy chain', () => {
    const t = parseTrustedProxies('10.0.0.0/8');
    // the proxy appended the real peer (198.51.100.7) after whatever the client sent
    expect(resolveClientIp('10.0.0.2', '9.9.9.9, 198.51.100.7', t)).toBe('198.51.100.7');
    // two proxies in a row are both skipped
    expect(resolveClientIp('10.0.0.2', '198.51.100.7, 10.0.0.9', t)).toBe('198.51.100.7');
    // an untrusted peer sending the header itself gets nothing from it
    expect(resolveClientIp('198.51.100.8', '1.1.1.1', t)).toBe('198.51.100.8');
    // a trusted proxy with no header: the proxy itself
    expect(resolveClientIp('10.0.0.2', undefined, t)).toBe('10.0.0.2');
  });

  it('keys an IPv6 address by its /64', () => {
    expect(ipKey('203.0.113.9')).toBe('203.0.113.9');
    expect(ipKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe(ipKey('2001:db8:1:2::1'));
    expect(ipKey('2001:db8:1:3::1')).not.toBe(ipKey('2001:db8:1:2::1'));
  });

  it('rewrites the request headers to the one trusted answer (what Colyseus reads as AuthContext.ip)', () => {
    const req = {
      headers: { 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8', 'x-client-ip': '9.9.9.9' } as Record<
        string,
        string | undefined
      >,
      socket: { remoteAddress: '::ffff:203.0.113.9' },
    };
    expect(normaliseForwardedHeaders(req, parseTrustedProxies(undefined))).toBe('203.0.113.9');
    expect(req.headers).toEqual({ 'x-forwarded-for': '203.0.113.9' });
  });
});
