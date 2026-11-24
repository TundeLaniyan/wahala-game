/**
 * The laptop + phones setup (docs/CITY_RUMBLE_ONLINE_LOCAL.md, decision ON9): LAN address discovery, the origin list the
 * dev script computes, and that a real server accepts a LAN-style browser Origin when it is listed and refuses it when
 * it is not. Production keeps "nothing allowed" and never a wildcard.
 */
import { networkInterfaces } from 'node:os';
import type { NetworkInterfaceInfo } from 'node:os';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { WebSocket } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lanAddresses, lanUrls } from '../src/core/lan';
import type { Interfaces } from '../src/core/lan';
import { createOriginPolicy } from '../src/core/origins';
import { startTestServer } from './helpers';
import type { TestServer } from './helpers';

interface DevOnline {
  lanAddresses(i: Interfaces): string[];
  allowedOriginsFor(o: { addresses: string[]; host: string; webPort: number; extra?: string }): string;
  pageUrls(o: { addresses: string[]; webPort: number; base?: string }): { label: string; url: string }[];
  DEV_BASE: string;
}

async function devScript(): Promise<DevOnline> {
  const file = resolve(import.meta.dirname, '../../scripts/dev-online.mjs');
  return (await import(/* @vite-ignore */ pathToFileURL(file).href)) as DevOnline;
}

const nic = (
  address: string,
  over: { internal?: boolean; family?: 'IPv4' | 'IPv6' } = {},
): NetworkInterfaceInfo =>
  ({
    address,
    netmask: '255.255.255.0',
    family: 'IPv4',
    mac: '00:00:00:00:00:00',
    internal: false,
    cidr: `${address}/24`,
    ...over,
  }) as NetworkInterfaceInfo;

const FIXTURE: Interfaces = {
  lo: [nic('127.0.0.1', { internal: true })],
  docker0: [nic('172.17.0.1')],
  eth0: [nic('203.0.113.9'), nic('fe80::1', { family: 'IPv6' })],
  wlan0: [nic('192.168.1.23'), nic('169.254.7.7')],
  vpn: [nic('10.8.0.2'), nic('192.168.1.23')],
};

describe('LAN addresses', () => {
  it('lists non-loopback, non-link-local IPv4 addresses, private ranges first, no duplicates, no IPv6', () => {
    expect(lanAddresses(FIXTURE)).toEqual(['192.168.1.23', '10.8.0.2', '172.17.0.1', '203.0.113.9']);
    expect(lanAddresses({})).toEqual([]);
    expect(lanAddresses({ lo: [nic('127.0.0.1', { internal: true })] })).toEqual([]);
  });

  it('the dev script finds the same addresses as the server', async () => {
    const dev = await devScript();
    expect(dev.lanAddresses(FIXTURE)).toEqual(lanAddresses(FIXTURE));
    expect(dev.lanAddresses(networkInterfaces())).toEqual(lanAddresses(networkInterfaces()));
  });

  it('builds the ws and health URLs the server prints', () => {
    expect(lanUrls(['192.168.1.23'], 2567)).toEqual([
      { address: '192.168.1.23', ws: 'ws://192.168.1.23:2567', health: 'http://192.168.1.23:2567/health' },
    ]);
  });
});

describe('the dev script', () => {
  it("computes exact origins for localhost, every LAN address and this machine's name; never a wildcard", async () => {
    const dev = await devScript();
    const list = dev.allowedOriginsFor({
      addresses: ['192.168.1.23', '10.8.0.2'],
      host: 'my-laptop',
      webPort: 5173,
    });
    expect(list.split(',')).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://192.168.1.23:5173',
      'http://10.8.0.2:5173',
      'http://my-laptop:5173',
      'http://my-laptop.local:5173',
    ]);
    expect(list).not.toContain('*');
    // an odd machine name is not trusted into the list; extra origins already configured are kept
    expect(
      dev.allowedOriginsFor({
        addresses: [],
        host: 'bad host!',
        webPort: 5173,
        extra: 'https://play.example',
      }),
    ).toBe('http://localhost:5173,http://127.0.0.1:5173,https://play.example');
  });

  it('prints the page URLs on the dev server base, with ?online', async () => {
    const dev = await devScript();
    expect(dev.DEV_BASE).toBe('/'); // vite.config.ts: `vite` serves `/`; only build / preview use /wahala-game/
    expect(dev.pageUrls({ addresses: ['192.168.1.23'], webPort: 5173 }).map((u) => u.url)).toEqual([
      'http://localhost:5173/?online',
      'http://192.168.1.23:5173/?online',
    ]);
  });
});

describe('origin policy with LAN origins', () => {
  const LAN = 'http://192.168.1.23:5173';

  it('development: localhost stays allowed and the listed LAN origin is added; others are refused', () => {
    const p = createOriginPolicy(LAN, true);
    expect(p.allows(LAN)).toBe(true);
    expect(p.allows('http://localhost:5173')).toBe(true);
    expect(p.allows('http://127.0.0.1:3000')).toBe(true);
    expect(p.allows('http://192.168.1.24:5173')).toBe(false); // a neighbour on the Wi-Fi
    expect(p.allows('http://192.168.1.23:5174')).toBe(false); // another port
    expect(p.allows('https://192.168.1.23:5173')).toBe(false); // another scheme
    expect(p.allows('http://192.168.1.23:5173.evil.io')).toBe(false);
    expect(p.allows('https://evil.example')).toBe(false);
    expect(p.allows(null)).toBe(true); // not a browser
  });

  it('a LAN origin is refused when it is not listed (development default is localhost only)', () => {
    expect(createOriginPolicy(undefined, true).allows(LAN)).toBe(false);
    expect(createOriginPolicy('http://localhost:*', true).allows(LAN)).toBe(false);
  });

  it('production: nothing by default, only the explicit list when given, never implicit localhost or a LAN range', () => {
    const none = createOriginPolicy(undefined, false);
    expect(none.patterns).toEqual([]);
    expect(none.allows(LAN)).toBe(false);
    expect(none.allows('http://localhost:5173')).toBe(false);
    const listed = createOriginPolicy('https://play.example.com', false);
    expect(listed.patterns).toEqual(['https://play.example.com']);
    expect(listed.allows(LAN)).toBe(false);
    expect(listed.allows('http://localhost:5173')).toBe(false);
    expect(listed.allows('https://play.example.com')).toBe(true);
  });
});

describe('a real server and a LAN-style Origin', () => {
  const LAN = 'http://192.168.1.23:5173';
  let server: TestServer;
  beforeAll(async () => {
    const dev = await devScript();
    server = await startTestServer(
      {},
      {
        development: true,
        allowedOrigins: dev.allowedOriginsFor({
          addresses: ['192.168.1.23'],
          host: 'my-laptop',
          webPort: 5173,
        }),
      },
    );
  });
  afterAll(async () => {
    await server.close();
  });

  const cors = async (origin: string): Promise<string | null> =>
    (await fetch(`${server.http}/health`, { headers: { Origin: origin } })).headers.get(
      'access-control-allow-origin',
    );

  const upgrade = (origin: string): Promise<number> =>
    new Promise((done) => {
      const ws = new WebSocket(`${server.url}/anything`, { headers: { Origin: origin } });
      ws.on('unexpected-response', (_req, r) => done(r.statusCode ?? 0));
      ws.on('open', () => done(101));
      ws.on('error', () => undefined);
    });

  it('answers CORS for the listed LAN origin and for localhost, not for others', async () => {
    expect(await cors(LAN)).toBe(LAN);
    expect(await cors('http://my-laptop.local:5173')).toBe('http://my-laptop.local:5173');
    expect(await cors('http://localhost:5173')).toBe('http://localhost:5173');
    expect(await cors('http://192.168.1.99:5173')).toBeNull();
    expect(await cors('https://evil.example')).toBeNull();
  });

  it('the WebSocket upgrade is refused (403) for an unlisted origin and not refused for the listed LAN origin', async () => {
    expect(await upgrade('http://192.168.1.99:5173')).toBe(403);
    expect(await upgrade('https://evil.example')).toBe(403);
    expect(await upgrade(LAN)).not.toBe(403);
  });

  it('a matchmaking preflight from the LAN origin is answered, from another origin is not', async () => {
    const pre = (origin: string): Promise<string | null> =>
      fetch(`${server.http}/matchmake/joinOrCreate/rumble`, {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
      }).then((r) => r.headers.get('access-control-allow-origin'));
    expect(await pre(LAN)).toBe(LAN);
    expect(await pre('http://192.168.1.99:5173')).toBeNull();
  });

  it('/health stays the plain consistency check phones can open', async () => {
    const r = await fetch(`${server.http}/health`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });
});
