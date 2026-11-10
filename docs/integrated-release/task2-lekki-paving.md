# Task 2 - Lekki Phase 1 road correction: Admiralty Way only

Branch `claude/wahala-rel-task2-lekki` (from `e5f4269`). Render-only: the sim layout, collisions, routes, traffic lanes
and road-tile count (524) are unchanged (tested). No other arena changes (`PAVED_ARENAS` still has only `rumbleLekki`).

## Paved coverage (exact)

The existing interlocking block material (LI1-LI3 shader, texture and block size unchanged) now covers ONLY:

- **Admiralty Way: x 20-23, y 10-29 (80 road tiles)**, both carriageways from Admiralty Plaza to the expressway edge,
  INCLUDING its intersection box with Freedom Way (x 20-23, y 18-20, 12 tiles).

Back to asphalt (the generic road surface, with its usual wear and cracks):

- Freedom Way, rows 18-20, x 0-19 and x 24-56 (outside the crossing box);
- the Lekki-Epe Expressway, rows 30-34, every column, every traffic lane;
- every other road tile of the map (there are none besides these three bands).

Not paved (back to their pre-LI4 surface):

- the Freedom Way Estates streets (the open floor of the `estates` district, x 24-36 y 10-17 and x 24-54 y 21-29, minus
  walls and roads): these are not road tiles in the sim (they are walkable open floor, no traffic). They return to the
  estate ground they had before LI4 rather than to dark asphalt, because dark asphalt marks traffic lanes on this map.
  **Founder check**: if the estate streets should look like dark asphalt roads, that is a new surface (not a
  restoration) and a one-line class switch plus a new floor tint; not done in this release.

Edges: a cast-concrete edge restraint (the existing style, same colour as the expressway restraint) now runs down the
west and east sides of the crossing box where Freedom Way's asphalt meets the paved crossing; the restraint across
Admiralty Way at the expressway, the median, lane dashes, stop lines, kerbs, Freedom Way's lane markings, landmarks and
lighting are unchanged.

## Decisions

| # | Decision | Where |
| --- | --- | --- |
| LI7 | **Founder revision: only Admiralty Way is interlocking paving, through its own crossing with Freedom Way.** Surface classes from the map: `admiraltyWay` (road tiles in `ADMIRALTY_WAY`, x 20-23 y 10-29: paved), `freedomWay` (other road tiles outside the expressway rows: asphalt), `estateStreet` (estate open floor: not paved), `expressway` (rows 30-34: asphalt); `LEKKI_PAVED = {admiraltyWay}`. Supersedes LI4's coverage; LI1-LI3 (shader, block, size) and LI6 (only Lekki) unchanged. | `render/arenas/lekkiRoads.ts`, `tests/render/lekki-interlock-roads.test.ts` |
| LI8 | **Paving meets asphalt with an edge restraint on both sides of the crossing box** (rows 18-20 at x 20 west and x 23 east), in the existing restraint style; paint only, no geometry. | `render/arenas/lekkiAdmiralty.ts` |
| LI9 | **Estate streets are un-paved, not turned into asphalt**: they are walkable open floor in the sim, and dark asphalt reads as a traffic lane on this map. Flagged for founder review. | `render/arenas/lekkiRoads.ts` |

## Verification

- `tests/render/lekki-interlock-roads.test.ts` (15 tests): all 80 Admiralty Way tiles paved incl. the crossing box and
  nothing else (paved count = 80); Freedom Way outside the box, every expressway tile and every estate street not
  paved; 57 x 39 board and 524 road tiles unchanged; only Lekki in `PAVED_ARENAS`; shader patch unchanged.
- `tests/render` + `tests/rumble-researched.test.ts` + `tests/arenas.test.ts`: 30 files, 511 tests passed.
- Screenshots (real game, `scripts/lekki-paving-shots.mjs`, software GL): `docs/screenshots/lekki-admiralty-only/`,
  desktop 1280x720 day and night (`gameplay`, `junction`, `freedom`, `estates`, `edge`, `overview`) and phone 844x390
  day and night (`gameplay`, `junction`, `edge`).
