# Story visuals: illustrated panels for the campaign cards

Branch `claude/wahala-lagos-enhancement-v1`, Part D. The campaign cards used to be text only. Every briefing, boss introduction and story scene now has a **story panel**: a short mission intro, a picture of the place, a clearly visible immediate objective, the existing Read more, and the existing Listen (`CAMPAIGN_TEXT_NARRATION.md`). No story text was written or changed; this pass only adds image data, alt text and UI.

## What the player sees

```
[ 16:9 panel: the district / the keeper arriving / the situation ]   <- picture, scrim, optional one-line place caption
Short summary (one or two sentences)                                  <- existing card summary
| OBJECTIVE  Jam the relays, then finish Oga Sunmola |                <- existing objective strip, always on the card
[ Read more ]  [ Listen ]                                             <- existing, unchanged
```

| Screen | Where the panel goes |
| --- | --- |
| Prologue, finale (`StoryScreen`) | full-width card: picture left, text right on wide screens; picture on top below 900 px |
| Briefing (`BriefingScreen`) | top of the briefing card, in the left column |
| Boss introduction (`BossIntroScreen`) | top of the intro card, right of the boss card |
| Ending (`CompleteScreen`) | top of the ending card |
| Map district card (`CampaignMap`) | a wide banner (16:6) above the district name, for unlocked districts (Ojuelegba has one too) |
| Section list (`SectionList`) | a 64 px thumbnail beside each mission that has a panel, plus one per raid door |

Phones are landscape on the campaign screens (a rotate card appears in portrait): below 520 px of height the picture sits **beside** the text (grid 0.95fr / 1fr) so the objective stays on screen. `e2e/story-visuals.spec.ts` checks that the objective is fully inside the visible part of the body, above the footer, at 1280 x 720 and 844 x 390.

## Data and code

| Piece | File |
| --- | --- |
| Image data (pure, no Vite): key -> file, alt, focal point, caption; card id -> key; section keys | `src/campaign/content/storyImages.ts` |
| URL resolver (Vite glob of `src/assets/story/*.webp`; a file that is not bundled has no URL) | `src/ui/campaign/storyImageUrls.ts` |
| The picture element and its load state | `src/ui/campaign/StoryHero.tsx`, `storyHero.css` |
| Card integration (`imageKey` prop, default derived from the card id) | `src/ui/campaign/CardView.tsx` |

Keys: `prologue`, `finale`, `ending`, `district.<id>.briefing`, `boss.<bossId>.intro`, `section.<missionId>`, `raid.<raidId>`. `storyImageKeyForCard('briefing.oshodi')` is `district.oshodi.briefing`, `intro.<district>` is the boss key, `section.<id>` maps to itself; defeat and result cards have no panel (they stay text).

### Failure path: a missing image never blocks anything

- A key with no entry, or an entry whose file is not bundled, renders **nothing** (`resolveStoryImage` returns null): the card is exactly the old text card (`cp-card-text` is `display: contents`, no `has-hero` class).
- While the file loads, the 16:9 box is reserved (`aspect-ratio`, a plain dark panel), so the card does not jump. The image is `loading="lazy"`, `decoding="async"`, never focusable.
- If the file fails (`onError`): the figure is removed (no broken-image icon) and `CardView` drops the `has-hero` layout, so the text goes back to the plain layout. The state never recovers into a half-picture (`heroStateAfter`).
- The picture is decoration. Summary, objective, Read more, Listen, Continue and Start never depend on it; the campaign controller, the save and the rules do not import it (a test greps for that).
- Tests: `tests/ui/storyPanelsNoImages.test.ts` renders every campaign screen with no image bundled at all; `e2e/story-visuals.spec.ts` blocks every `.webp` and checks the objective and main button.

## Accessibility and motion

- Alt text on every image (30+ characters, describes the scene, tested). Captions are optional place labels drawn by the UI.
- Text over a picture sits on a scrim (bottom gradient 0.86 to 0 and a soft vignette); no text is baked into any image. The objective and summary are never over the picture.
- `prefers-reduced-motion: no-preference` only: a slow 26 s scale-and-drift on the full panel (`cp-drift`, at most 6 %). With reduced motion the picture is still.
- Touch targets are unchanged (Read more, Listen, Continue are still at least 44 px); safe areas come from the screen frame.
- Print hides the pictures.

## The panels

19 panels, 960 x 540 WebP, 1.15 MB in all (budget 2 MB; each at most 90 KB, built to about 60 KB). No 480 w variant: the phone panel is shown about 200 to 400 CSS px wide at 2 to 3x density, so a second width would not be used; one file keeps the set under 1.2 MB.

| File (`src/assets/story/`) | Key | Shows | KB |
| --- | --- | --- | --- |
| `prologue.webp` | `prologue` | Ojuelegba underbridge at dusk, piers, danfo, sachet stacks | 60.6 |
| `finale.webp` | `finale` | three fighters on the Lekki promenade at blue hour, the Link Bridge cables | 62.0 |
| `ending.webp` | `ending` | three fighters walking back to the Ojuelegba underbridge, road-sign gantry | 61.7 |
| `district-ojuelegba-briefing.webp` | `district.ojuelegba.briefing` | a place shot of the underbridge: banded piers, crates and bagged water, shopfronts, a danfo (no character; the Ojuelegba boss and figure are developed separately) | 61.5 |
| `district-oshodi-briefing.webp` | `district.oshodi.briefing` | the interchange terminal and a row of danfo | 61.3 |
| `district-mushin-briefing.webp` | `district.mushin.briefing` | a parts-market lane above the umbrellas | 61.0 |
| `district-fadeyiSomolu-briefing.webp` | `district.fadeyiSomolu.briefing` | the BRT lane and shelter | 61.1 |
| `district-ebuteMetta-briefing.webp` | `district.ebuteMetta.briefing` | the station sign, tracks across the road | 60.2 |
| `district-lagosIsland-briefing.webp` | `district.lagosIsland.briefing` | old cathedral and civic hall, trees in the square | 60.3 |
| `district-lekki-briefing.webp` | `district.lekki.briefing` | the Link Bridge promenade and palms | 57.3 |
| `boss-ogaSunmola-intro.webp` | `boss.ogaSunmola.intro` | arrival: the park master and his entourage before the interchange canopy and a danfo | 59.4 |
| `boss-madamRonke-intro.webp` | `boss.madamRonke.intro` | arrival in the Mushin parts yard | 61.8 |
| `boss-marshalKobo-intro.webp` | `boss.marshalKobo.intro` | arrival at the Fadeyi BRT shelter | 61.9 |
| `boss-ikennaWayside-intro.webp` | `boss.ikennaWayside.intro` | arrival under the Ebute-Metta station sign | 59.3 |
| `boss-barristerQuill-intro.webp` | `boss.barristerQuill.intro` | arrival before the Lagos Island cathedral facade | 60.4 |
| `boss-stewardHalcyon-intro.webp` | `boss.stewardHalcyon.intro` | arrival on the Lekki bridge plaza | 61.6 |
| `section-oshodi-approach.webp` | `section.oshodi.approach` | the Oshodi bus park from above, a fighter among the danfo (field section) | 60.7 |
| `raid-warehouseDispatchDepot.webp` | `raid.warehouseDispatchDepot` | the dispatch depot crate maze (raid, shown as a second thumbnail on the approach row) | 59.4 |
| `section-ebuteMetta-railYard.webp` | `section.ebuteMetta.railYard` | the rail-yard goods bay (standalone raid section) | 55.5 |

The boss panels are **arrival compositions** only (the identity shot of each keeper with his or her entourage at the district landmark): no fight, no defeat, no violence. The Oshodi (Oga Sunmola, "Oga Mic") and Fadeyi (Marshal Kobo, "Oga Footbridge") panels are **provisional** (`provisional: true` in `storyImages.ts`, alt text kept generic: the identities are not canon while the campaign is redesigned) and follow the concepts in `visualDirection` / `entourage` / `entrance` / `figure` of `src/campaign/content/{oshodi,fadeyiSomolu}.ts` as they stand in commit c4a1ba5: entourage in a line or V around the keeper, the district setting behind, no crown or regalia, no text added to the art. They are produced from a parameterised capture config, so they regenerate when that content changes (see below).

## Pipeline

Everything is original and produced by the game itself; nothing is photographed, drawn from a third-party image or generated by a model.

1. **Capture** (`scripts/story-shots.mjs`, Playwright, software GL, `WAHALA_CHROMIUM=/opt/pw-browsers/chromium`; needs `npm run dev -- --port 5199 --strictPort`). It loads the real scene (a district boss mission, a field section, a raid, or a City Rumble stage), hides every DOM overlay and every sprite / ring (HUD, labels, markers), puts the sim in a frozen state, moves some competitors and sets a **free camera** (tile x, y and a height in metres) with an optional light / fog tweak (`look`), then screenshots the canvas. The sky is painted the pure key colour `#ff00ff`. The plan of every shot is `tools/story/shots.config.mjs` (parameterised: `BOSS`, `FIGURE`, `FAN`, the cameras). `--only id,id` re-shoots some; `--survey <district>` dumps a board; `--serve "<scene>|<tod>" --dir <d>` keeps one scene loaded and takes a shot for every `cmd*.json` written to `<d>` (a scene load takes minutes on software GL, a shot seconds). Raw 1280 x 720 JPEGs (quality 72) go to `tools/story/masters/` (2.5 MB, kept in git; the rule is 3 MB).
2. **Grade** (`tools/story/build_story_art.py`, numpy + scipy + Pillow only, deterministic: the grain is seeded from the panel name). Per panel in `tools/story/panels.py` (master, crop, mood, sky, sun glow, boss tint): crop to 16:9 and resize to 960 x 540; replace the key-colour sky with a graded gradient (dusk, day or night, soft streaky clouds, an optional low-sun glow) after unmixing the key colour from soft edges and removing magenta spill near the sky; a light graphic-novel pass (soft posterised luminance, thin ink on strong edges); split-toned grade (cool shadows, warm highlights), saturation and S-curve; a highlight bloom; a vignette; film grain; WebP at the highest quality that stays under 62 KB. A boss tint is the keeper's palette (`visualDirection.palette.primary`) laid softly over the picture. `python3 tools/story/build_story_art.py` rebuilds everything and removes panels that are no longer in the table; `STORY_MASTERS` and `STORY_OUT` point it at other folders.
3. **Register** the panel in `src/campaign/content/storyImages.ts` (file, alt text, focal point, caption).

Never hand-edit the `.webp` files or the masters.

### Adding a panel

1. Add a shot to `tools/story/shots.config.mjs` (id = the master's file name), run the dev server and `node scripts/story-shots.mjs --only <id>`; look at `tools/story/masters/<id>.jpg` and iterate (a free camera inside a building shows black; near objects fade in a dither pattern, so frame past them or crop them off).
2. Add `"<file stem>": Panel(master="<id>", ...)` to `tools/story/panels.py`, run `python3 tools/story/build_story_art.py <file stem>`, look at `src/assets/story/<file stem>.webp`.
3. Add the entry to `STORY_IMAGES` (alt text that describes the scene; `position` is the CSS focal point). A card id that should show it must map to its key in `storyImageKeyForCard`.
4. `npx vitest run tests/campaign-story-images.test.ts tests/ui/storyPanels.test.ts` (file exists, 960 x 540, size, alt, no orphans, required keys).

### Regenerating after the content changes

The Oshodi and Fadeyi presentations are provisional. Change `BOSS.oshodi` or `BOSS.fadeyi` (position, entourage slots, camera) in `tools/story/shots.config.mjs`, re-shoot with `--only boss-oshodi,boss-fadeyi`, run the grade and commit the masters and webps. (`FIGURE` in that file is the retired Ojuelegba figure shot; nothing uses it.) To retire or replace any panel, edit its row in `storyImages.ts`; a key without a file simply shows no picture.

## Ethics (docs/CAMPAIGN_STORY.md, section 5)

- The Chairman is never shown: no panel contains a face, silhouette, portrait or model of him; a test rejects "Chairman" in alt text and captions.
- Murals and signs are the game's own fictional or generic scene art (direction boards, shop names, "INTERCHANGE", "BRT"). The panels add no text. No real brand, person, slogan or uniform is depicted; faction palettes are fictional.
- No violence against, or defeat of, a keeper or the local figure: boss panels are arrival shots.

## Honest limitations

- These are **cinematic in-engine renders with a stylised grade**, not hand-illustrated art. The geometry is the game's low-poly look; the grade adds mood (dusk sky, grain, ink edges) but not new drawing. A future commissioned illustration set can replace the files through `storyImages.ts` without touching the UI.
- The game ships **no boss costume art**. The renderer draws every fighter from the three playable rigs (plus the shipped `char_areaBoss` for slot 3) and an outfit hue / headwear per competitor slot, so a boss panel shows the keeper as the figure at the front of the group in a stock outfit, not in the kaftan, vest, wrapper or suit of `visualDirection`. Props such as the handheld mic, whistle, umbrella and speaker trolley are not drawn. The panels are composed around the entourage, the landmark and a light tinted with the keeper's palette; no costume detail is faked. Boss costume art stays on the list in `CAMPAIGN_UI.md`.
- Signs readable in the render (for example "INTERCHANGE", "BRT • FADEYI", "ADMIRALTY") are the game's own generic or fictional boards; they are legible at full size only.
- The renderer fades near occluders with a dither pattern; where one could not be framed out it shows as a faint stipple under flyovers and shelters.
- The finale is a blue-hour grade of the day scene, not a true night render: the engine's `?tod=night` look did not light up for these stages in the capture setup, so night panels were not used.
- Software GL makes a scene load take about two minutes and a shot about half a minute; the capture is not part of CI. The built `.webp` files and the masters are committed, so the game build needs neither.

## Tests

`tests/campaign-story-images.test.ts` (files exist, 960 x 540 WebP, sizes, alt text, focal points, unique files, no orphans, required keys, card ids map to keys, no broker), `tests/ui/storyPanels.test.ts` (resolver, figure markup, state machine, screens show their panel before the summary and objective), `tests/ui/storyPanelsNoImages.test.ts` (no image bundled: every campaign screen keeps its text, objective and button; progression code does not import the pictures), `e2e/story-visuals.spec.ts` (prologue, briefing, boss intro: picture loaded with alt text, objective inside the visible area at 1280 x 720 and 844 x 390; every `.webp` blocked: no broken image, objective and main button present). Reviewed screenshots: `docs/screenshots/story-visuals/` (`desktop-*` at 1280 x 720, `mobile-*` at 844 x 390).
