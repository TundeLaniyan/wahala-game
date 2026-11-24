/**
 * The addresses a phone on the same Wi-Fi can reach this machine on (docs/CITY_RUMBLE_ONLINE_LOCAL.md).
 * Pure: takes the `os.networkInterfaces()` result, so it is testable with fixtures.
 */
import type { NetworkInterfaceInfo } from 'node:os';

export type Interfaces = Record<string, readonly NetworkInterfaceInfo[] | undefined>;

/** Private (RFC 1918) IPv4 ranges first: the ones a home / office Wi-Fi hands out. */
const rank = (ip: string): number => {
  if (/^192\.168\./.test(ip)) return 0;
  if (/^10\./.test(ip)) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
  return 3;
};

/**
 * Non-loopback IPv4 addresses (no link-local 169.254.x.x, which means "no DHCP answer"), best first. Duplicates removed.
 */
export function lanAddresses(interfaces: Interfaces): string[] {
  const found: string[] = [];
  for (const infos of Object.values(interfaces)) {
    for (const i of infos ?? []) {
      const v4 = i.family === 'IPv4' || (i.family as unknown) === 4;
      if (!v4 || i.internal || i.address.startsWith('169.254.')) continue;
      if (!found.includes(i.address)) found.push(i.address);
    }
  }
  return found.sort((a, b) => rank(a) - rank(b));
}

/** `ws://192.168.1.23:2567`-style endpoints and the health URL for each LAN address. */
export function lanUrls(
  addresses: readonly string[],
  port: number,
): { ws: string; health: string; address: string }[] {
  return addresses.map((address) => ({
    address,
    ws: `ws://${address}:${port}`,
    health: `http://${address}:${port}/health`,
  }));
}
