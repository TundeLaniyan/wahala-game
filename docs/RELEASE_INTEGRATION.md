# Release integration: Classic raid AI + night lighting with the 18-character roster

Founder-authorised development release (2026-11-21): a playable build for evaluation, **not** final artistic approval of
the character models. Decisions RI1-RI5 (docs/DECISIONS.md). Previous release for rollback: `514be88`.

## Sources

| Branch | Head | What |
| --- | --- | --- |
| `claude/wahala-stitch-uiux-v1` (production) | `514be88` | base |
| `claude/wahala-classic-ai-lighting-v1` | `50666d2` | raid AI (RA1-RA7), raid art fix and night raid (NL1-NL15) |
| `ccr-5b343a94-mqq1vh` | `9ae45c6` | 18 rigged characters, enemy clips, lazy loading, fallbacks |

Both branches were based on `514be88`; both were merged unchanged (histories kept) into `claude/wahala-release-integration`.
One conflict: `scripts/campaign-perf.mjs` (each branch added a URL-flag variable to the same line; both kept).

## Integration fixes (render / loading only; no rule, timing or AI change)

- **RI2** The roster branch's failing CI gate (restart textures +10, limit 3) was a real leak: a seat re-dressed when its
  on-demand model arrived kept its old skeleton's bone texture; and re-dressed seats off camera were never drawn until
  they walked on screen. Fixed at the cause; thresholds unchanged. Six starts A A B A B A: textures 140 140 159 161 159 161.
- **RI1** The loading screen waits (at most 6 s) for the on-demand models the match's first frames asked for: no swap from
  the fallback look to the new model in front of the player.
- **RI5** A figure created for a seat that is already down starts hidden: unspawned raid waves no longer replay a death
  tumble at match start (in the night raid that showed where hidden waves wait).
- **RI4** Raid enemies drive the new models' Walk / Run / Alert clips through the raid AI's territory minds (pinned by a test).
- **RI3** Temporary founder QA entry `?qaraid=` (docs/QA_ENTRY.md, removal steps).

## Measurements (software WebGL in a shared container: never a phone measurement)

Phone 844 x 390, Low, after 900 live ticks (`scripts/release-shots.mjs`, screenshots in `docs/screenshots/release-integration/`):

| Scenario | Draw calls | Triangles | Textures | Models loaded | Errors / failed loads |
| --- | --- | --- | --- | --- | --- |
| Dispatch Depot raid | 192 | 290,567 | 149 | 7 | 0 / 0 |
| Records Vault, night | 194 | 246,749 | 151 | 7 | 0 / 0 |
| Oshodi approach (field) | 163 | 491,050 | 164 | 7 | 0 / 0 |
| Oshodi boss | 301 | 865,357 | 188 | 5 | 0 / 0 |
| City Rumble Survival (16) | 414 | 1,740,489 | 295 | 4 | 0 / 0 |

Downloads (`scripts/campaign-perf.mjs`, Low): initial load 20,607 KB (14,552 KB gzip) against 19,938 KB before (+0.7 MB:
larger hero models). On-demand models per start: Oshodi approach 3.9 MB, Records Vault 3.8 MB (0.56 MB before), Oshodi
boss 2.0 MB. JavaScript gzip 868,682 -> 877,671 B. `dist` 85.4 -> 103.8 MB (character GLBs 3.9 -> 22.3 MB, mostly lazy).

GPU memory: each new model carries one or two 1024 px textures (about 5.6-11 MB on the GPU with mipmaps); a mission
holds 5-7 models (about 30-40 MB). Loaded models stay cached for the session (by design of the roster's lazy loading), so a
session that visits every district can reach about 108 MB of character textures. Not changed in this release (no texture
reduction across the roster, per the founder); a per-match GPU eviction of unused on-demand models is the measured next
step if phones show memory pressure. Frame times on this machine are dominated by software rendering and are not
comparable; physical-phone performance is subject to founder acceptance.

## Verification before the release CI

- Typecheck, ESLint (src, tests, scripts, e2e), production build: pass.
- Vitest, the whole suite: 302 files, 4701 passed, 7 skipped (before RI5; RI5 adds one file).
- Playwright (targeted, built preview, desktop + phone): `qa-entry`, `night-raid`, `raid-render`, `campaign-camera`
  (including the GPU restart gate), `mobile-hud-fit`, `campaign-expansion-smoke`, `checkpoint-clarity`: all pass; two
  field-to-raid tests needed the CI timeout (300 s) under this container's load and pass alone with it.
