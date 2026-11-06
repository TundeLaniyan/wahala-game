# Lekki Phase 1: Amarite Way interlocking road (Part B): status

**Not implemented in this pass (still blocked after the 2026-11-06 clarification).** The founder's follow-up said the images were attached again, but no file reached this session either time (`/mnt/user-data/uploads`, `/mnt/attach` and `/mnt/user-data/working` are empty; no image anywhere on disk). Clarified scope once the photos arrive: realistic interlocking blocks on Amarite Way only, existing road geometry and local street details preserved, no other Lekki road changed. The brief requires three founder photographs (two of Amarite Way and its surroundings, one close-up of the interlocking block design) and says not to assume them. None was attached to this session (`/mnt/user-data/uploads` and `/mnt/attach` are empty) and nothing in the repository contains them. Matching block shape, bond pattern, joint width, colour and roughness without the photos would be invention, so the material was left alone.

## Inspection of the current Lekki map (`rumbleLekki`, `src/sim/arenas/rumbleLekki.ts`, `src/render/arenas/lekkiArt.ts`)
- The word "Amarite" appears nowhere in the code or docs. The board has three roads: **Admiralty Way** (x 20-23, north-south, plaza to expressway), **Freedom Way** (y 18-20, east-west) and the six-lane **expressway** (y 30-34). A web search found no source for "Amarite Way" either, so it is unconfirmed which of these (or a new street) it should be.
- All roads share one asphalt colour (`road: [66,66,68]`) through `communityFloor`; only the promenade uses a paver tint (`pavers`) and a flat tint over rows y 2-3. There is no per-road material, median or black-and-white kerb today.
- Floors are drawn into one canvas texture per arena (`communityFloor`), so a distinct paving would be a per-tile paint region plus a small tileable pattern, not a new mesh material.

## What is needed from the founder
1. The three photographs (or a link) and which street(s) of the current map they correspond to.
2. Confirmation whether Amarite Way replaces Admiralty Way's surface, becomes a new street, or the road names stay unchanged.

## Plan once the photos exist (not started)
- Add an optional per-tile surface mask to `communityFloor` (road tiles flagged `paved`), draw a tileable interlock block pattern at one pattern repeat per 2x2 tiles (no stretching, mip-mapped, low-contrast joints to avoid shimmer), keeping asphalt on every other road.
- Median strip with black-and-white kerb stripes, drainage grates and lamp posts via the existing prop kit; budgets: no extra draw calls (baked into the floor canvas), verified on the quality ladder with `scripts/map-identity-perf.mjs` and desktop + 844x390 screenshots.
