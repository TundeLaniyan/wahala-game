// Headless-Chromium verification of AudioManager + the encoded assets.
// run:  node audio-pipeline/tests/audio.spec.mjs      (needs the pre-installed playwright + chromium)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".ogg": "audio/ogg", ".m4a": "audio/mp4" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.startsWith("/audio/")) p = "/drafts" + p.slice(6);
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const port = server.address().port;
const results = []; let failed = 0;
const check = (ok, msg, extra = "") => { results.push((ok ? "PASS " : "FAIL ") + msg + (extra ? "  [" + extra + "]" : "")); if (!ok) failed++; };

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on("pageerror", (e) => check(false, "page error: " + e.message));
await page.goto(`http://localhost:${port}/tests/harness.html`);
await page.waitForFunction(() => window.ready);
const mk = (formats) => page.evaluate(async ({ formats }) => {
  window.am = new AudioManager({ baseUrl: "/audio/", manifest, formats });
  window.am.installUnlock();
  return window.am.getDebugState();
}, { formats });

// ---- 1. before unlock: no throw, music request is remembered, sfx are dropped
let s = await mk(null);
check(s.format === "ogg", "format negotiation picks Opus/Ogg in Chromium", s.format);
const pre = await page.evaluate(async () => { await am.playMusic("menu"); const r = am.sfx("ui_confirm"); return { r: r === null, st: am.getDebugState() }; });
check(pre.r && pre.st.pendingMusic === "menu" && !pre.st.unlocked, "pre-unlock: sfx dropped, menu music queued, nothing thrown");

// ---- 2. unlock on first real gesture; queued music starts; boot group preloads
await page.evaluate(() => am.preload("boot"));
await page.evaluate(() => am.preload("menu"));
await page.click("#go");
await page.waitForFunction(() => am.getDebugState().music === "menu", null, { timeout: 8000 });
s = await page.evaluate(() => am.getDebugState());
check(s.unlocked && s.state === "running", "first tap unlocks AudioContext (state=running)", s.state);
check(s.music === "menu" && s.pendingMusic === null, "queued menu music starts after unlock");

// ---- 3. decoded-length fidelity of every shipped format + loop seam (measures codec padding honestly)
const fid = await page.evaluate(async () => {
  const out = {};
  for (const fmt of ["ogg", "m4a"]) {
    const ac = new AudioContext({ sampleRate: 48000 });
    for (const id of Object.keys(manifest.assets)) {
      const m = manifest.assets[id];
      if (!m.loop && m.seconds < 3 && fmt === "m4a" && !["ui_confirm", "gen_place"].includes(id)) continue; // sample a few one-shots for m4a
      const r = await fetch(`/audio/${m.path}.${fmt}`);
      const buf = await ac.decodeAudioData(await r.arrayBuffer());
      out[`${id}.${fmt}`] = { want: m.samples, got: buf.length, sr: buf.sampleRate, loop: m.loop };
    }
    await ac.close();
  }
  return out;
});
let worst = { d: 0, k: "" }; const loopDiffs = {};
for (const [k, v] of Object.entries(fid)) {
  const d = v.got - v.want;
  if (Math.abs(d) > Math.abs(worst.d)) worst = { d, k };
  if (v.loop) loopDiffs[k] = d;
}
check(Object.values(fid).every((v) => v.sr === 48000), "decoded at the authored 48 kHz");
check(Object.entries(loopDiffs).filter(([k]) => k.endsWith(".ogg")).every(([, d]) => Math.abs(d) <= 1), "Ogg/Opus loops decode to the exact authored sample count (gapless)", JSON.stringify(loopDiffs));
const m4aLoop = Object.entries(loopDiffs).filter(([k]) => k.endsWith(".m4a"));
check(true, "INFO m4a loop length deltas (samples; AAC priming/padding) - need real iOS/Safari verification", JSON.stringify(Object.fromEntries(m4aLoop)));

// ---- 4. volumes / mute / persistence
await page.evaluate(() => { am.setVolume("music", 0.25); am.setVolume("sfx", 0.5); am.setMuted(true); });
await page.waitForTimeout(300);
s = await page.evaluate(() => am.getDebugState());
check(s.masterGain < 0.01, "mute drives master gain to 0", String(s.masterGain));
const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("wahala.audio.v1")));
check(persisted.muted === true && persisted.music === 0.25 && persisted.sfx === 0.5, "settings persisted to storage");
await mk(null);
s = await page.evaluate(() => am.getDebugState());
check(s.settings.muted === true && s.settings.music === 0.25, "settings restored by a fresh manager (reload)");
await page.evaluate(() => { am.setMuted(false); });

// ---- 5. rumble stems start in sync, intensity layers move, ducking engages for danger cues
await page.evaluate(async () => { await am.preload("match"); await am.unlock(); });
await page.click("#go");
await page.evaluate(() => am.unlock());
const r5 = await page.evaluate(async () => {
  await am.playMusic("rumble", { intensity: 0, fadeIn: 0.1 });
  const m = am.music;
  const starts = m.sources.length;
  const g0 = Object.fromEntries(Object.entries(m.stems).map(([k, g]) => [k, g.gain.value]));
  am.setIntensity(2, { fade: 0.3 });
  await new Promise((r) => setTimeout(r, 700));
  const g2 = Object.fromEntries(Object.entries(m.stems).map(([k, g]) => [k, +g.gain.value.toFixed(2)]));
  const before = am.musicDuck.gain.value;
  am.sfx("gen_warn_a");
  await new Promise((r) => setTimeout(r, 120));
  const during = am.musicDuck.gain.value;
  await new Promise((r) => setTimeout(r, 1800));
  const after = am.musicDuck.gain.value;
  return { starts, g0, g2, before, during, after };
});
check(r5.starts === 3 && r5.g0.base === 1 && r5.g0.hype === 0, "rumble: 3 stems start together, level 0 = base only", JSON.stringify(r5.g0));
check(r5.g2.base === 1 && r5.g2.perc === 1 && r5.g2.hype === 1, "rumble: intensity 2 fades all layers in", JSON.stringify(r5.g2));
check(r5.during < 0.75 && r5.before > 0.99 && r5.after > 0.95, "danger cue ducks music then releases", `before ${r5.before.toFixed(2)} during ${r5.during.toFixed(2)} after ${r5.after.toFixed(2)}`);

// ---- 6. voice limiting & cooldown under chain reaction spam
const r6 = await page.evaluate(async () => {
  for (let i = 0; i < 60; i++) am.sfx("expl_gen");                       // same id: cooldown collapses the burst
  const one = am.getDebugState().voices;
  for (const id of manifest.groups.match) if (manifest.assets[id].kind === "sfx" && !manifest.assets[id].loop) am.sfx(id);  // ~28 distinct ids
  const v = am.getDebugState().voices;
  const stats = am.getDebugState().stats;
  return { one, v, stolen: stats.sfxStolen, dropped: stats.sfxDropped };
});
check(r6.one === 1, "chain-reaction burst: per-id cooldown stops 60 identical explosions stacking", JSON.stringify(r6));
check(r6.v <= 24, "28 distinct simultaneous cues never exceed the 24-voice budget", JSON.stringify(r6));

// ---- 7. stopAll silences everything, resets duck, and cancels in-flight starts
const r7 = await page.evaluate(async () => {
  am.startLoop("gen_fuse_loop", { key: "fuse:1" });
  am.startAmbience("amb_lagos");
  am.sfx("elim_comic");
  const busy = am.getDebugState();
  am.stopAll({ fade: 0.02 });
  await new Promise((r) => setTimeout(r, 400));
  const quiet = am.getDebugState();
  return { busy, quiet };
});
check(r7.busy.voices > 0 && r7.busy.loops >= 2, "pre-stop: voices and loops active", `voices ${r7.busy.voices} loops ${r7.busy.loops}`);
check(r7.quiet.voices === 0 && r7.quiet.loops === 0 && r7.quiet.music === null, "stopAll: zero voices, zero loops, no music", JSON.stringify({ v: r7.quiet.voices, l: r7.quiet.loops, m: r7.quiet.music }));
check(r7.quiet.musicDuckGain > 0.95, "stopAll resets music duck so the next screen is not born quiet", String(r7.quiet.musicDuckGain));

const r8 = await page.evaluate(async () => {   // restart race: request music, immediately stop; late decode must not start
  am.buffers.delete("menu_loop");
  const p = am.playMusic("menu", { fadeIn: 0.1 });
  am.stopAll({ fade: 0 });
  const ok = await p;
  await new Promise((r) => setTimeout(r, 600));
  return { ok, music: am.getDebugState().music, voices: am.getDebugState().voices };
});
check(r8.ok === false && r8.music === null, "restart race: music requested then stopped never starts late", JSON.stringify(r8));

// ---- 8. stingers
const r9 = await page.evaluate(async () => {
  await am.preload("result");
  const h = await am.playStinger("victory");
  return { dur: h?.duration ?? null, voices: am.getDebugState().voices };
});
check(r9.dur > 8 && r9.voices === 1, "victory stinger plays on the music bus", JSON.stringify(r9));

await browser.close(); server.close();
console.log(results.join("\n"));
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
