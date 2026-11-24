#!/usr/bin/env node
/**
 * Loads the dev client in a real Chromium on a PHONE profile from the LAN address (an insecure `http://<ip>` context,
 * exactly what a phone on the same Wi-Fi sees), creates a private room through the real WebSocket origin check, and
 * waits for the room code. Proves: page served to the network, the SDK reaches the server on the LAN address, the
 * server accepts the browser's real Origin header. It does NOT prove phone GPU speed, touch feel or radio latency.
 *
 *   node ops/local/browser-check.mjs --page http://192.168.1.23:5180/ [--shot out.png]
 * Env: WAHALA_CHROMIUM=/path/to/chromium (optional).
 */
import { chromium, devices } from 'playwright';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : null)).filter(Boolean));
const page = args.page;
if (!page) {
  console.error('usage: browser-check.mjs --page http://<lan-ip>:5180/ [--shot file.png]');
  process.exit(2);
}
const browser = await chromium.launch({ executablePath: process.env.WAHALA_CHROMIUM || undefined, args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist', '--no-proxy-server'] });
const context = await browser.newContext({ ...devices['Pixel 7'] });
const p = await context.newPage();
const problems = [];
p.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
p.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text().slice(0, 160)}`));
let ok = false;
try {
  await p.goto(page, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const secure = await p.evaluate(() => window.isSecureContext);
  console.log(`page loaded; isSecureContext=${secure} (false is expected on http://<lan-ip>)`);
  await p.waitForFunction(() => document.querySelector('#loading')?.hidden !== false || !document.querySelector('#loading')?.textContent?.includes('Loading'), null, { timeout: 90_000 }).catch(() => console.log('(graphics still loading; continuing)'));
  await p.fill('#name', 'Phone Test');
  await p.click('#btn-create');
  await p.waitForSelector('#screen-room:not([hidden])', { timeout: 30_000 });
  const code = (await p.textContent('#room-code'))?.trim() ?? '';
  ok = /^[A-Z2-9]{6}$/.test(code);
  console.log(`${ok ? 'PASS' : 'FAIL'}  created a private room from the LAN page, code ${code ? `${code.slice(0, 2)}****` : '(none)'}`);
  if (args.shot) await p.screenshot({ path: args.shot });
} catch (e) {
  console.log(`FAIL  ${e instanceof Error ? e.message.split('\n')[0] : e}`);
  const err = await p.textContent('#entry-error').catch(() => '');
  if (err) console.log(`      page says: ${err}`);
}
for (const m of problems.slice(0, 5)) console.log(`      ${m}`);
await browser.close();
process.exit(ok ? 0 : 1);
