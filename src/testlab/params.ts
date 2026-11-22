/**
 * TEMPORARY founder Test Lab (docs/TEST_LAB.md, decisions TL1-TL7). `?testlab=1` swaps the main menu for the Test Lab
 * and isolates every persisted thing for the page session. Without the query nothing here does anything. This file is a
 * leaf (no imports) so the boot module, the session and the UI can all read the flag.
 */

/** Parses the query (pure): present and not an explicit off value (`0`, `false`, `off`, `no`). */
export function parseTestLab(search: string): boolean {
  const v = new URLSearchParams(search).get('testlab');
  if (v === null) return false;
  return !['0', 'false', 'off', 'no'].includes(v.trim().toLowerCase());
}

let cached: boolean | undefined;

/** Is this page load the Test Lab? (Resolved once from the URL.) */
export function testLabActive(): boolean {
  if (cached === undefined) cached = typeof location !== 'undefined' ? parseTestLab(location.search) : false;
  return cached;
}

/** The normal game's URL: this page's address without `testlab` (other flags such as `debug` stay as typed). */
export function normalGameUrl(href: string): string {
  const url = new URL(href);
  const kept = url.search
    .replace(/^\?/, '')
    .split('&')
    .filter((part) => part !== '' && decodeURIComponent(part.split('=')[0]!) !== 'testlab');
  url.search = kept.length > 0 ? `?${kept.join('&')}` : '';
  return url.toString();
}
