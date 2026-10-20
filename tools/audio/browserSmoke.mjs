#!/usr/bin/env node
/**
 * Real-browser smoke test of the audio engine (headless Chromium, real Web Audio).
 *
 *   WAHALA_CHROMIUM=/opt/pw-browsers/chromium node tools/audio/browserSmoke.mjs <outDir> [seconds] [seed] [audioOff|ambience] [intensity]
 *
 * Bundles src/audio (+ sim + ai) with esbuild, serves it with a throwaway static server, plays a
 * bot-vs-bot match in real time and writes `mix.wav` (the engine's actual mixed output) and
 * `result.json` (events seen, sounds played, handleEvents cost, long main-thread tasks, sample-slot
 * loading) to <outDir>. A synthetic WAV is served as a recorded slot (`ui_click`) to exercise the
 * real fetch + decodeAudioData path.
 */
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

const outDir = process.argv[2];
const seconds = Number(process.argv[3] ?? 40);
const seed = Number(process.argv[4] ?? 3);
const audioOff = process.argv[5] === 'audioOff';
const ambienceOnly = process.argv[5] === 'ambience';
const intensity = process.argv[6] === undefined ? undefined : Number(process.argv[6]);
if (!outDir) {
  console.error('usage: browserSmoke.mjs <outDir> [seconds] [seed] [audioOff|ambience] [intensity]');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const bundle = await build({
  entryPoints: ['tools/audio/browserEntry.ts'],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
  logLevel: 'error',
  define: { 'import.meta.env': '{"BASE_URL":"/"}' },
});

/** A 0.3 s 880 Hz tone WAV (stand-in for a licensed recording). */
function toneWav() {
  const rate = 44100;
  const n = Math.floor(rate * 0.3);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    buf.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * 880 * i) / rate) * 8000 * Math.exp(-i / 4000)),
      44 + i * 2,
    );
  return buf;
}

const routes = {
  '/': [
    'text/html',
    '<!doctype html><meta charset=utf-8><title>audio smoke</title><body>audio smoke</body><script src="/bundle.js"></script>',
  ],
  '/bundle.js': ['text/javascript', bundle.outputFiles[0].text],
  '/audio/slots.json': [
    'application/json',
    JSON.stringify({
      slots: { ui_click: { file: 'ui_click.wav', license: 'synthetic test tone, no rights' } },
    }),
  ],
  '/audio/ui_click.wav': ['audio/wav', toneWav()],
};
const server = createServer((req, res) => {
  const r = routes[req.url?.split('?')[0] ?? ''];
  if (!r) return void res.writeHead(404).end();
  res.writeHead(200, { 'content-type': r[0] }).end(r[1]);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: process.env.WAHALA_CHROMIUM || undefined,
  args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror', e));
page.on('console', (m) => m.type() === 'error' && console.error('console.error', m.text()));
await page.goto(`http://localhost:${port}/`);
const result = await page.evaluate((o) => window.runSmoke(o), {
  seconds,
  seed,
  slotBase: '/audio/',
  audioOff,
  ambienceOnly,
  intensity,
});
await browser.close();
server.close();

const pcm = Buffer.from(result.pcm, 'base64');
const wav = Buffer.alloc(44 + pcm.length);
wav.write('RIFF', 0);
wav.writeUInt32LE(36 + pcm.length, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(result.sampleRate, 24);
wav.writeUInt32LE(result.sampleRate * 4, 28);
wav.writeUInt16LE(4, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(pcm.length, 40);
pcm.copy(wav, 44);
writeFileSync(join(outDir, 'mix.wav'), wav);
delete result.pcm;
writeFileSync(join(outDir, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
