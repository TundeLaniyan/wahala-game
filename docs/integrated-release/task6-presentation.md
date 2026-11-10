# Task 6: fighter selection and story-scene presentation (decisions PS1-PS6)

Branch `claude/wahala-rel-task6-presentation`, from `e5f4269` (release `0c200a7` plus the Oshodi combat review).
Presentation only: no rule, gameplay, save or story content changed. Existing approved assets only; no new art.

## Audit (what already existed)

Fighter selection (`src/ui/menu/FighterScreen.tsx`, `fighters.ts`, `art.ts`, `FighterImage.tsx`):

- The roster is the character registry (`CHARACTER_IDS`): exactly the three playable heroes, Street Baller, Lekki Boy
  and Campus Queen, each with its own approved Stitch portrait (`src/assets/ui/fighter-*-{360,720}.webp`, built by
  `tools/ui/build_menu_art.py` from three per-fighter masters; outputs never hand-edited). Name, tagline and melee
  numbers come from the registry and the sim config.
- There is **no ten-character group illustration** in the repository. The only other menu artwork is the key art
  (`keyart-*.webp`): a night street scene used as the Home background, not a roster. Nothing was cropped, and
  nothing should be.
- `src/sim/data/fighters.ts` has six fighter definitions. The three that are not in `CHARACTER_IDS` (conductor, market
  mama, jetty boatman) never appear on the fighter screen.
- District bosses are never selectable. They appear in the campaign briefings and boss introductions (`BossIntroScreen`,
  story art `boss-*-intro.webp`). Those pictures are arrival scenes of a group, several of them marked provisional. No
  gallery screen exists, and none was added.

Story scenes (`src/ui/campaign/CardView.tsx`, `StoryScreen.tsx`, `StoryHero.tsx`, `lines.tsx`, `storyImageUrls.ts`):

- **Skippable**: Continue always works, by tap or Enter / Space / A, and never waits for narration (`useScene`). Read
  more is collapsed by default. Unchanged.
- **District images loaded when needed**: the story-art registry maps a key to a file. Files are resolved by a Vite glob
  to URLs only, and each picture is an `<img loading="lazy">` that is drawn only when its card is shown. A missing or
  failing file removes the picture, never the card. Unchanged.
- **Broker**: a phone / message card, never a face. Unchanged.
- **Radio**: RADIO lines (22 in the campaign) were drawn like any speaker's line. They are now radio cards (PS2).
- **Hero dialogue portraits**: the heroes have no spoken lines in the current story. A hero portrait slot now exists
  for approved lines (PS4).
- **In-match radio and subtitles**: mission callouts, notices and the optional subtitles (setting, default off) live in
  the HUD rail beside the board (`ui/HudRail.tsx`), never over it. `e2e/voices.spec.ts` checks that nothing covers the
  bottom row. These are mobile-safe as they are; no change.
- **Defect found**: on wide screens and phone landscape, the picture sits beside the text. With Read more open the
  whole card scrolled, so the picture scrolled away and left an empty dark column, while the text was hard to follow
  (`before-*-story-readmore-scrolled.png`). Fixed (PS3).

## Decisions

| # | Decision | Where |
| --- | --- | --- |
| PS1 | **The fighter screen says plainly that its roster is the playable heroes**: a "Playable fighters · 3" label (the count is the registry's) and the group label "Playable fighters". The fine print adds that the district bosses appear in the campaign and are not playable. No layout redesign; the three approved portraits stay. | `ui/menu/FighterScreen.tsx`, `ui/menu/flow.css` |
| PS2 | **RADIO lines are short radio-message cards**: a green-edged dispatch card with a three-bar signal mark and "on the radio". It is distinct from the broker's blue phone card and has no portrait. CSS only, no new asset. | `ui/campaign/lines.tsx`, `speakers.ts`, `campaign.css` |
| PS3 | **Read more beside a picture: the text column scrolls by itself.** With Read more open (`reading` class) on a wide screen or in phone landscape, the story card fills the screen and only its text column scrolls. The picture stays in view and the last line can be read. Collapsed cards and the phone-portrait single column are unchanged. | `ui/campaign/CardView.tsx`, `storyHero.css` |
| PS4 | **A playable hero speaks beside their approved menu portrait** (48 px, the existing `fighter-*-360.webp`), recognised by the registry name. No current line uses it; this is the path for approved hero dialogue. | `ui/campaign/speakers.ts`, `lines.tsx` |
| PS5 | **No boss portraits and no cropping.** Boss and other speakers stay named text lines. The boss introduction art is a group arrival scene and is never cropped into a character picture. The Gemini group portrait is concept art and is not in the game. | `speakers.ts` |
| PS6 | **Left for separate approval**: new Gemini / Google Flow art, final character artwork, hero dialogue lines, the revised storyline and a multi-panel comic sequence. Today a scene is one card with one optional picture (`STORY_IMAGES`, one key per card), and the Read-more lines are its panels. A panel sequence would extend the registry to several keys per card; nothing here blocks that. | n/a |

## Tests

- Unit: `tests/ui/storyPresentation.test.ts` (new) covers the speaker styles and line markup: radio card, hero
  portrait, no picture for a boss or Mama Put, broker unchanged, and no shipped line drawn as a hero. Additions in
  `tests/ui/menuScreens.test.ts`: the roster is exactly the registry heroes, labelled, and no boss name appears. In
  `tests/ui/campaignScreens.test.ts`: the `reading` class is set only when Read more is open.
- Browser: `e2e/fighter-story-presentation.spec.ts`, desktop 1280 x 720 and phone 844 x 390 touch.
  - Three roster cards, each at least 44 px, selectable.
  - The radio card shows.
  - Scrolling the text with the wheel reaches its end while the picture stays in view.
  - The last line is in the viewport, and there are no page errors.
  - The two-column check fails on the code before PS3 (the text column did not scroll).
- Screenshots: `docs/screenshots/fighter-select-story/`, before (pre-change build) and after (production build).
  Laptop, phone portrait and phone landscape. The story shots are scrolled to the end of Read more.
