# What the approved soundtrack costs on the wire (decision AU5, measured 2026-11-25)

`scripts/audio-load-measure.mjs`: real headless Chromium (software WebGL), the real menu journey, bytes from the DevTools
protocol (`encodedDataLength`: what crossed the network, after compression), served like GitHub Pages
(`scripts/perf/pages-server.mjs`: max-age 600, gzip for text, none for MP3), service worker blocked so every visit is a
first visit, desktop viewport, no throttling. **Before** = production `a919f04` (what is live); **after** = the integration
branch (production + the approved audio, `claude/wahala-audio-integration`). Arena `rumbleOjuelegba`, City Rumble
Deathmatch, Music Data Saver off and on. Raw data: `before-off.json`, `before-on.json`, `after-off.json`, `after-on.json`.

Stages: **boot** = page load to the title screen plus 8 s idle (no user gesture yet); **gesture** = the first click plus
6 s; **match** = menu journey to a started match, until the HUD is up and the loading screen is gone, plus 10 s of play.

| Stage | Before, Data Saver off | After, off | Before, on | After, on |
| --- | --- | --- | --- | --- |
| boot: all bytes / audio bytes | 2.26 MB / 0 | 2.26 MB / **0** | 2.26 MB / 0 | 2.26 MB / **0** |
| gesture: audio bytes | 0.01 MB | **0.73 MB** | 0.01 MB | **0.45 MB** |
| gesture: audio HEAD probes (headers only) | 15 | 33 | 15 | 33 |
| match: all bytes / audio bytes | 10.72 / 2.98 MB | 11.88 / 3.96 MB | 10.03 / 2.11 MB | 10.30 / 2.39 MB |
| the arena's song | `pixabay_515507` 2.16 MB | `dist_ojuelegba` 3.14 MB | `lite/pixabay_515507` 1.30 MB | `lite/dist_ojuelegba` 1.57 MB |
| **whole journey: all bytes** | 12.99 MB | **14.87 MB** (+1.88) | 12.30 MB | **13.02 MB** (+0.72) |
| **whole journey: audio bytes** | 2.99 MB | **4.69 MB** (+1.70) | 2.12 MB | **2.84 MB** (+0.72) |
| requests | 333 | 358 | 262 | 284 |
| menu journey to HUD (software GL, noisy) | 24.7 s | 19.7 s | 19.2 s | 19.9 s |
| page errors | 0 | 0 | 0 | 0 |

## Reading

- **The 45.7 MB of files is not downloaded.** Before the first gesture the page fetches **no audio at all**, as before. After
  the first gesture the new build fetches the menu theme (0.56 MB, or 0.28 MB with Data Saver) and the two result stingers
  (0.16 MB), 0.73 MB (0.45 MB) in all. A first City Rumble match then fetches **only its own arena's song** (3.14 MB, or 1.57 MB
  with Data Saver); no other arena's song, no Sudden Death loop and no boss music is requested until needed.
- Music Data Saver selects the smaller files for every new track (menu 0.56 -> 0.28 MB, Ojuelegba 3.14 -> 1.57 MB): the
  whole journey costs +1.70 MB of audio with it off and +0.72 MB with it on, against today's build.
- The cost of the soundtrack over today's build for a player's first match: **+1.88 MB (off) / +0.72 MB (on)**, on a 13 MB journey.
- **Startup probes:** the player HEAD-probes every listed music file once to learn what exists: 33 distinct files now,
  15 before. HEAD requests carry headers only (no body; they are inside the totals above) but each costs a round trip;
  they run in parallel after the first gesture, not at page load. Making them lazy per arena would change the established
  player and is not done here.
- **Stingers are fetched at the first gesture** (0.16 MB) although they are only needed at a match result. Small, kept.
- Time to a playable first frame is **not changed by the audio** within the noise of this machine (the software renderer
  dominates: 19-25 s here, with another job running); do not read the differences as a speed-up.

Not measured here: a second visit with the service worker on (the worker never touches audio, so music is not cached offline,
as before), Sudden Death and boss music downloads (covered by `e2e/audio-release.spec.ts`), and real phones on real networks.
