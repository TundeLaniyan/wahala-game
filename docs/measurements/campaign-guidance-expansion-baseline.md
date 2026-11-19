# Campaign guidance + world expansion: performance baseline

Measured on production `claude/wahala-stitch-uiux-v1` @ `0b89d09` (its `vite build` served by `vite preview`) with `scripts/campaign-perf.mjs` (branch `claude/wahala-cg-camera`), 2026-11-19. The world worker and the integrator rerun the same command on their builds to compare:

```
SHOT_URL=http://localhost:<port>/wahala-game/ WAHALA_CHROMIUM=/opt/pw-browsers/chromium \
  node scripts/campaign-perf.mjs default low,high --dist=<the dist being served>
node scripts/campaign-perf.mjs field:oshodi.approach,boss:oshodi low --restarts=3     # GPU counts across restarts
```

**This is software rendering.** Chromium 740 x 360 (device scale 1) with SwiftShader (software WebGL) on four shared container cores, a fresh page per row, `?q=low` / `?q=high`. Frame times are seconds per frame here and only 1 to 4 frames fit in the 4 s sample, so the frame columns are a rough order of magnitude for comparing builds on this machine, not phone timings; build times vary by several seconds between identical runs. Draw calls, triangles, geometries and textures are deterministic for a given camera and are the columns to compare.

## Columns

- **initial load KB (gzip KB):** bytes on the wire for the page until every bundled model has loaded (the title screen's loading bar is gone), and the gzip -9 size of the same `dist` files (what a gzip-serving host such as GitHub Pages sends; `vite preview` sends them uncompressed).
- **mission fetch KB:** bytes fetched from the mission start until the match is loaded (audio for the scene: music track, voices, ambience; models are already loaded).
- **build ms:** `renderer.loadGame` (the scene build) of the mission.
- **draw calls / triangles:** `renderer.info.render` of one frame after the countdown and 1.5 s of the play camera settling (the human standing at the start).
- **geometries / textures:** live GPU resources (`renderer.info.memory`).
- **frame mean / p95 ms, frames:** real play frames over 4 s (the enemies live, the human still).
- **AI ms / tick:** smoothed cost of one tick's bot decisions (`timings().ai`; 0 for a raid whose enemies are still dormant); **sim ms / frame** the whole simulation step of a frame, bots included.

## The built `dist` (production `0b89d09`)

| Part | Bytes |
| --- | --- |
| Whole `dist` | 81.3 MB (85,264,904 bytes) |
| `assets/` (JS, CSS, models, textures, fonts) | 23.4 MB (24,580,082 bytes) |
| `audio/` (music, voices: fetched on demand) | 57.3 MB (60,039,504 bytes) |
| `previews/` | 0.6 MB (642,849 bytes) |
| Initial load (measured: page + every model) | 19895 KB raw, 14275 KB gzip |

## Per mission (baseline `0b89d09`)

| mission | quality | initial load KB (gzip KB) | mission fetch KB | build ms | draw calls | triangles | geometries | textures | frame mean ms | frame p95 ms | frames | AI ms / tick | sim ms / frame |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `field:oshodi.approach` | low | 19895 (14275) | 307 | 2301.1 | 228 | 867009 | 254 | 175 | 1054.1 | 2599.9 | 4 | 0.31 | 12.7 |
| `field:oshodi.railEdge` | low | 19895 (14275) | 96 | 3965.9 | 317 | 752587 | 300 | 207 | 1184.5 | 2433.3 | 4 | 0.9 | 8.33 |
| `boss:oshodi` | low | 19895 (14275) | 132 | 7395.7 | 179 | 1229833 | 299 | 205 | 2322.3 | 4699.8 | 3 | 1.93 | 7.17 |
| `field:mushin.approach` | low | 19895 (14275) | 136 | 5850.6 | 216 | 684344 | 316 | 202 | 1207 | 2933.3 | 4 | 0.59 | 18.62 |
| `field:ojuelegba.return` | low | 19895 (14275) | 2222 | 10996.3 | 235 | 676391 | 298 | 201 | 1604.5 | 2400 | 3 | 0.37 | 5.74 |
| `raid:warehouseDispatchDepot` | low | 19895 (14275) | 337 | 8204.9 | 336 | 548122 | 270 | 209 | 3023.5 | 3147.2 | 2 | 0 | 3.24 |
| `raid:junctionToolShed` | low | 19895 (14275) | 3531 | 4548.7 | 278 | 454570 | 246 | 199 | 2319.1 | 2666.6 | 2 | 0 | 1.44 |
| `field:oshodi.approach` | high | 19895 (14275) | 96 | 8733.3 | 513 | 2184929 | 294 | 231 | 3520 | 7099.7 | 2 | 1.17 | 5.71 |
| `field:oshodi.railEdge` | high | 19895 (14275) | 111 | 16535 | 630 | 1824073 | 337 | 268 | 3490 | 9716.3 | 3 | 1.67 | 59.28 |
| `boss:oshodi` | high | 19895 (14275) | 220 | 9170.2 | 476 | 2985180 | 336 | 307 | 4355.8 | 11699.5 | 3 | 2.15 | 6.62 |
| `field:mushin.approach` | high | 19895 (14275) | 43 | 2354.7 | 559 | 2097902 | 353 | 276 | 2359.6 | 4733.1 | 2 | 1.11 | 39.59 |
| `field:ojuelegba.return` | high | 19895 (14275) | 2222 | 8502.1 | 517 | 1668071 | 321 | 257 | 3826 | 10749.6 | 3 | 0.86 | 8.29 |
| `raid:warehouseDispatchDepot` | high | 19895 (14275) | 558 | 6213 | 596 | 1462653 | 280 | 252 | 5103.4 | 5103.4 | 1 | 0 | 3.28 |
| `raid:junctionToolShed` | high | 19895 (14275) | 558 | 3406.8 | 522 | 1310040 | 250 | 242 | 4921.4 | 4921.4 | 1 | 0.01 | 5.63 |

## GPU resources across restarts (baseline `0b89d09`, low)

One page; the same mission three times, then another mission and back (`--restarts=3`).

```
start 1 field:oshodi.approach: geometries 254 textures 175 loadMs 8619.2
start 2 field:oshodi.approach: geometries 258 textures 217 loadMs 7231.9
start 3 field:oshodi.approach: geometries 262 textures 259 loadMs 13435.3
start 4 boss:oshodi: geometries 316 textures 330 loadMs 7954.6
start 5 field:oshodi.approach: geometries 282 textures 376 loadMs 11047.4
after stop: geometries 282 textures 376
start 1 raid:warehouseDispatchDepot: geometries 270 textures 209 loadMs 1770.1
start 2 raid:warehouseDispatchDepot: geometries 292 textures 260 loadMs 5965.4
start 3 raid:warehouseDispatchDepot: geometries 314 textures 311 loadMs 16911.8
start 4 field:oshodi.approach: geometries 339 textures 353 loadMs 6290
start 5 raid:warehouseDispatchDepot: geometries 347 textures 410 loadMs 11858.6
after stop: geometries 347 textures 410
```

Every start of the same mission left about 42 textures and 4 geometries behind (a field mission) and 51 textures and 22 geometries (the warehouse raid). Traced and fixed on `claude/wahala-cg-camera` (docs/CAMPAIGN_CAMERA.md, "Asset lifecycle", decision CF6).

## The same missions on branch `claude/wahala-cg-camera` (campaign camera, asset lifecycle fixes)

Same command and machine, run alone. Compare with the baseline above; part of the baseline run shared the machine with a screenshot run, so its build and frame times are the noisier.

| mission | quality | initial load KB (gzip KB) | mission fetch KB | build ms | draw calls | triangles | geometries | textures | frame mean ms | frame p95 ms | frames | AI ms / tick | sim ms / frame |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `field:oshodi.approach` | low | 19897 (14277) | 262 | 4269.6 | 231 | 867173 | 214 | 139 | 1112.2 | 3083.2 | 4 | 0.44 | 17.19 |
| `field:oshodi.railEdge` | low | 19897 (14277) | 359 | 4172.5 | 286 | 717589 | 234 | 164 | 1047.8 | 2633.3 | 5 | 0.91 | 12.06 |
| `boss:oshodi` | low | 19897 (14277) | 171 | 5156.8 | 182 | 1234675 | 221 | 155 | 1551.4 | 2383.2 | 3 | 1.27 | 37.76 |
| `field:mushin.approach` | low | 19897 (14277) | 136 | 3816 | 220 | 686978 | 212 | 148 | 981 | 1333.2 | 5 | 0.59 | 5.1 |
| `field:ojuelegba.return` | low | 19897 (14277) | 2495 | 2137 | 238 | 676412 | 230 | 173 | 589.8 | 1349.9 | 8 | 0.2 | 10.08 |
| `raid:warehouseDispatchDepot` | low | 19897 (14277) | 558 | 2022.9 | 321 | 536916 | 265 | 204 | 704.1 | 1033.3 | 6 | 0 | 2.36 |
| `raid:junctionToolShed` | low | 19897 (14277) | 558 | 1785.6 | 289 | 454581 | 244 | 199 | 997.2 | 1383.2 | 5 | 0 | 5.39 |
| `field:oshodi.approach` | high | 19897 (14277) | 162 | 3669.4 | 515 | 2185105 | 269 | 196 | 2638 | 7266.4 | 4 | 0.31 | 5.46 |
| `field:oshodi.railEdge` | high | 19897 (14277) | 262 | 3969.9 | 589 | 1771469 | 308 | 235 | 2298.3 | 6083.1 | 4 | 1.48 | 45.24 |
| `boss:oshodi` | high | 19897 (14277) | 317 | 4233.1 | 477 | 2979636 | 303 | 267 | 2501.6 | 5016.5 | 2 | 1.37 | 43.73 |
| `field:mushin.approach` | high | 19897 (14277) | 220 | 3736.8 | 563 | 2100532 | 303 | 242 | 2330 | 6016.5 | 4 | 0.88 | 8.51 |
| `field:ojuelegba.return` | high | 19897 (14277) | 2248 | 3979.2 | 523 | 1668141 | 275 | 238 | 1752 | 2916.6 | 3 | 0.42 | 5.28 |
| `raid:warehouseDispatchDepot` | high | 19897 (14277) | 3562 | 2085.7 | 578 | 1457918 | 278 | 248 | 2703.6 | 4566.5 | 3 | 0 | 0.95 |
| `raid:junctionToolShed` | high | 19897 (14277) | 558 | 2412.1 | 521 | 1310016 | 248 | 242 | 4818 | 4818 | 1 | 0 | 3.15 |

Restarts on the branch (low; the first run predates the crowd-zone fix, which took the oshodi.approach start after the boss from 226 to 220 geometries, flat over three boss / approach cycles):

```
start 1 field:oshodi.approach: geometries 214 textures 139 loadMs 4287.6
start 2 field:oshodi.approach: geometries 214 textures 139 loadMs 6128.6
start 3 field:oshodi.approach: geometries 214 textures 139 loadMs 5368.4
start 4 boss:oshodi: geometries 227 textures 156 loadMs 6687.7
start 5 field:oshodi.approach: geometries 226 textures 145 loadMs 5402
after stop: geometries 226 textures 145
start 1 raid:warehouseDispatchDepot: geometries 265 textures 204 loadMs 2295.7
start 2 raid:warehouseDispatchDepot: geometries 265 textures 204 loadMs 3415.3
start 3 raid:warehouseDispatchDepot: geometries 265 textures 204 loadMs 8044.9
start 4 field:oshodi.approach: geometries 236 textures 192 loadMs 6973.5
start 5 raid:warehouseDispatchDepot: geometries 270 textures 205 loadMs 4826.2
after stop: geometries 270 textures 205
```
