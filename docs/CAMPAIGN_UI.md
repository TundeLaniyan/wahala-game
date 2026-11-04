# Campaign UI (one-player campaign flow)

Branch `claude/wahala-campaign-online-v1`. Browser-only, offline: nothing here calls a network. Content is `src/campaign/**` (pure data, progress reducers, save/load); the mission match is the sim's mission runtime (`buildMissionGame`, `missionView`); this layer is the app controller and the screens.

## Flow

```
Home --[Campaign]--> Map ("campaign")
  no save:  New campaign -> Prologue ("campaignStory") -> Map
  save:     node (select) -> Open briefing / Continue
Map -> Briefing -> [first time] Boss introduction -> MISSION (screen 'playing')
                  [later]      ----------------------^
MISSION end (sim outcome) -> Result ("campaignResult")
   won : Next district -> Briefing(next)      | Replay with modifier | Back to map
         sixth clear -> Watch the finale -> Finale ("campaignStory") -> Ending ("campaignComplete") -> Map
   lost/timeout: Retry | Briefing | Back to map
Pause in a mission: Resume | Settings | Retry mission | Back to campaign map (save intact)
```

Screens (`src/ui/campaign/`, registered in `ui/menu/MainMenu.tsx`; styles `campaign.css` over `menu.css` / `flow.css`):

| MenuScreen | Component | Shows |
| --- | --- | --- |
| `campaign` | `CampaignMap` | stylised Lagos map from `mapPos`, seven nodes (locked / open / cleared, stars), three landmark names (node tooltip + selected card), progress bar, Continue, Prologue, Ending, New campaign and Delete save (both ask first) |
| `campaignStory` | `StoryScreen` | prologue or finale via `StoryPlayer` (typewriter unless reduced motion, Skip, Enter / Space / A / tap advances). The broker is only a message / call card from UNKNOWN NUMBER: never a face, portrait or silhouette |
| `briefing` | `BriefingScreen` | briefing text, objectives, intel, warnings, broker message, boss card (name, title, personality, crew faction and roles, system controlled, signature ability, counterplay), loadout (fighter, crew level slider, unlocked replay modifier, lives) |
| `bossIntro` | `BossIntroScreen` | boss card plus the introduction lines, then the mission starts |
| `campaignResult` | `ResultScreen` | win: defeat scene (`defeatLines`), stars, time, lives lost, rewards (`newRewards`, `newUnlocks`), consequence, opened districts; loss/timeout: what went wrong, hint from the boss counterplay |
| `campaignComplete` | `CompleteScreen` | ending title / summary / teaser (text), stats, open replay modifiers |

`app/menu.ts` stays a pure stack machine: new screens, `MENU_SCREENS`, `CAMPAIGN_SCREENS`, `replaceScreen`, `briefing -> bossIntro` as the only new `advance` step; `validMenu` accepts them. `app/menuNav.ts` gained `setScreenNavHandler` (a screen-level handler consulted before the menu's focus navigation; the story player uses it for Enter / Space / A). A campaign screen without its data sends the menu home (`campaignScreenReady`).

## Store and commands

`UiState.campaign: CampaignUi | null` (`app/campaignState.ts`): `save`, `started`, `storage` (`ok` / `unavailable`), `notice`, `selected`, `modifier`, `story`, `active` (the running mission), `result` (pending result: outcome + reward summary), `lastReward`. Null when the flag is off.

`app/campaign.ts` `CampaignController` (injected deps: `store`, `host`, `now`, `seed`, `buildMission`, `startingFighter`): `load`, `open`, `startNew`, `deleteSave`, `playStory`, `storyDone`, `selectDistrict`, `beginBriefing`, `continue`, `setModifier`, `setLoadout`, `startFromBriefing`, `bossIntroDone`, `startMission`, **`finishMission(outcome)`** (public; applies the result, persists, leaves the match, opens the result), `retry`, `toMap`, `nextDistrict`, `leave`. `session.ts` creates it in `mount()` only when `flags().campaign` and exposes `commands.campaign*`; the debug handle (`?debug`) has `__WAHALA__.campaign()`.

Mission matches: `MatchController.startMission(options, meta)` is a sibling of `start` (same loop, HUD, audio; bots from each seat's level, the boss at least Standard; stadium follow camera when the arena is a rumble arena). It never reads or writes `settings`, never builds a `MatchSummary` and never shows the normal results: when the sim reports `missionView(state).outcome` (or the match ends without one) it waits 1.6 s and calls `meta.onEnd` once. `skipToResults` and `rematch` are inert in a mission.

## Persistence

`browserStore()` (localStorage, probed) via `loadSave` / `persistSave` / `clearSave`; key `wahala.campaign.v1`. Saved after every change (result, loadout, intro seen, prologue, finale). Nothing is written until New campaign is pressed. Corrupt data or a newer version: a fresh in-memory campaign, a notice ("could not be read"), the old text kept under `<key>.corrupt`. Storage missing or full: the campaign keeps working in memory with a notice. Delete save removes the key.

## Enabling

On by default. `?campaign=0` or `WAHALA_CAMPAIGN_ENABLED=false` hides the Home "Campaign" entry (the menu is then exactly as before; `store.campaign` stays null).

## Tests

`tests/app/menu-campaign.test.ts` (state machine), `tests/app/campaign-flow.test.ts` (whole flow with the real MatchController and fake ports; the mission builder is injected), `tests/app/campaign-persistence.test.ts` (Map store: restart, delete, corrupt, unavailable, full), `tests/ui/campaignScreens.test.ts` (content on screen). `e2e/campaign.spec.ts`: journey (the last step skips itself while `buildMissionGame` is the stub), save across reload, corrupt save, `?campaign=0`, keyboard, and the size sweep (desktop and phone portrait / landscape: no page scroll, main action on screen, taps >= 44 px). Reviewed screenshots: `docs/screenshots/campaign-ui/`.

## Art still needed

Boss costume art and portraits (screens show the base fighter's menu art in the boss's palette, with a note); a drawn Lagos map (the map is an SVG sketch); district postcards for the briefing; story stills for the prologue / finale (text only now; the broker stays a message card); boss defeat illustrations; node and star icons; no audio was added (synthesised UI cues only).
