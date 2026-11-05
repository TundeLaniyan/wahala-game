# Campaign text, narration and the health HUD

Branch `claude/wahala-campaign-online-v1`, worker `story-hud` (plan: `CAMPAIGN_EXPANSION_PLAN.md`, decisions SN1-SN9 in `DECISIONS.md`). Front-end only; online, voice and backend flags stay off. **No audio, voice, music or TTS was added or generated**: the narration catalogue is empty and every Listen button says so.

## 1. Story cards (short text)

Every briefing and story scene (prologue, finale, ending, district briefing, boss introduction, defeat scene, mission result, section briefing / result) is presented as one **card** (`src/campaign/cards.ts`, pure):

| Part | Rule | Shown |
| --- | --- | --- |
| Summary | one or two sentences, at most `CARD_LIMITS.summaryChars` (240) characters | always |
| Objective | at most 12 words, big, with a small label ("Objective", "Next try", "Reward", "Next") | always |
| Read more | everything else, in order, as `sections` (headed lists, or dialogue lines) and flat `readMore: string[]` | collapsed by default (button, `aria-expanded`) |
| Listen | optional narration button (section 2) | always, disabled when there is no clip |
| Continue | story scenes: the primary button in the screen footer (tap, Enter / Space / A); also stops narration | always |

`StoryCard { id, kind, title, kicker?, summary, objective, objectiveLabel, readMore, sections, narrationId, speaker? }`. The default view of any card is the summary plus one objective line; nothing is removed, it is behind Read more (tested: a briefing card plus its Read more contain every sentence of the briefing, every objective, intel and warning; a scene card holds every line).

**Derivation.** `makeCard` builds a card from any content. Precedence for the short copy: an optional field on the content (`DistrictBriefing.cardSummary` / `objectiveCard`, `BossDef.introCard` / `defeatCard` / `defeatOustedCard`, `CampaignContent.prologueCard` / `finaleCard` / `endingCard`) wins, then the hand-written table `src/campaign/content/cardCopy.ts` (keyed by card id), then derivation: the first one or two sentences that fit the limits (an over-long first sentence is cut at a word and its remainder kept in Read more), the objective from the first objective / the boss's first phase / the reward name, trimmed to a clause or twelve words. A card with no objective at all gets `FALLBACK_OBJECTIVE`; the shipped content never does (tested).

**Ids.** `prologue`, `finale`, `ending`, `briefing.<district>`, `intro.<district>`, `defeat.<district>[.ousted]`, `result.<district>.won|lost|timeout`, `section.<id>`, `sectionResult.<id>`.

**Sections (field-sections).** `sectionCard(section)` reads only the fields a section has (`cardSummary` / `summary`, `objectiveCard`, `objectives`, `intel`, `warnings`, `readMore`, `title` / `name`, `location`) and `sectionCards(list)` maps a list; render with `CardView` (`src/ui/campaign/CardView.tsx`). A long `summary` is cut to the first sentences, the rest goes to Read more. For a result use `makeCard({ kind: 'sectionResult', ... })`.

**The broker.** His lines are `StoryLine`s with `fromBroker` inside a card's Read more and are drawn only as UNKNOWN NUMBER message cards (`lines.tsx`): no face, portrait or silhouette art (tested on the data and in the browser). Summaries mention him in the third person only.

**Screens.** `StoryScreen` (prologue / finale), `BossIntroScreen`, `BriefingScreen`, `ResultScreen`, `CompleteScreen` render `CardView`; the boss card shows name, title and signature up front with its personality, crew, system and counterplay behind its own Read more. Phones: portrait and landscape, no horizontal scroll, Read more / Listen / Continue at least 44 px (`e2e/campaign.spec.ts` size sweep, also with Read more open).

## 2. Narration (data model and a provider that fails safely)

`src/campaign/narration/`:

- `NarrationClip { id, cardId, text, language, voiceId, durationMs?, source: 'none' | 'recorded' | 'tts-future', tier: 'free' | 'premium' }`; `NarrationCatalogue` is a table keyed by card id (`createCatalogue`). `NARRATION_CLIPS` is **empty**: no clip, no file under `public/audio/narration/`. `tts-future` is reserved and never played.
- `NarrationProvider { available(id), play(id): Promise<PlayResult>, stop() }` never throws and never rejects. `PlayResult` is `played | stopped | unavailable (no-clip | no-file | no-audio) | locked | failed`.
- `NullNarrationProvider` (always unavailable) and `FileNarrationProvider`, which plays `<BASE_URL>audio/narration/<clip id>.mp3` through an injected `ClipPort` **only** when the catalogue entry is `recorded`. A missing file, blocked audio, a decode error, a throwing port, a throwing catalogue or entitlement port all become a `PlayResult`; the text is never affected. The browser port (`src/app/narration.ts`, `createElementClipPort`) uses an `HTMLAudioElement` at the audio engine's master volume and the voices / mute preferences; nothing is fetched while the catalogue is empty.
- **Entitlements** (`entitlements.ts`): `EntitlementPort.has('fullNarration' | 'extendedLore' | 'altPerformance')` with `FreeEntitlements` (grants no premium; free-tier clips need none). `clipAllowed` gates premium clips on `fullNarration`. There is no payment code, account, network or receipt reading: it is the documented hook where a future build passes its own port (`setNarrationProvider(createNarrationProvider(myEntitlements))`). The core mission meaning (summary, objective, Read more) is always free; entitlements only ever decide recordings.
- **Settings** (`GameSettings`, in the preference group, restored by "Restore defaults"): `campaignListen` (default on: shows the Listen button, off hides it) and `campaignNarration` (default **off**: auto-play a card's clip when one is available). The Academy's `narration` setting is unrelated and unchanged.
- **Listen button** (`ListenButton`, logic in `ui/campaign/listenModel.ts`): disabled with "Narration not recorded yet" when no clip is available; "Stop" while playing; a failure shows "The narration could not play. The text is all here." Pressing it never errors. Continue / Skip (`createSceneControl`) ends the scene exactly once, stops narration first and never waits for it, even when stopping throws.

### Adding recorded clips later (not done now)

Only through the founder's import process (see `AUDIO.md`; never generate or synthesise speech, never call a TTS service): masters of approved recordings are imported by the voice import tooling into `public/audio/narration/<id>.mp3`; add one `NarrationClip` per card to `NARRATION_CLIPS` with `source: 'recorded'`, the transcript in `text` (the card's `cardNarrationText`), `tier: 'free'` for the core card text, and update `tests/campaign-narration.test.ts` deliberately (it asserts today's catalogue is empty). A recorded clip speaks the card's title, summary and objective line, not the Read more.

## 3. Campaign health HUD

Reads sim state only; no rules in the UI. `HudSnapshot.campaign` (`src/app/campaignHud.ts`, built from combat-core's `playerVitalsView`): `{ hp, maxHp, armour, okada, lives: {left, max} | null, invulnerable, invulnSeconds, lastHit: {source, tick} | null, sinceHit, flash }`, null without `Player.vitals` (every normal match). `HudSnapshot.enemies: {id, name, kind, hp, maxHp, showBar}[]` from `enemyHealthView` (boss and lieutenant always; others only when targeted, recently hurt or near).

`CampaignHealth` (`src/ui/CampaignHealth.tsx`, model `campaignHealthModel.ts`, style `CampaignHealth.css`) sits in the HUD rail beside the board (City Rumble: the right column with the mission panel), never over the play area:

- **Health**: one segment per point (3-4), filled block vs empty outline (shape, not only colour), "3 / 4", a flash on the segment lost in the last 0.6 s, amber when one segment is left.
- **Protection chips**: ARMOUR (one per plate), OKADA, LIVES n/m, SAFE (recovery frames). A used layer stays on the rail, dashed and struck through ("USED"), for the rest of the mission.
- **Cause line**: "HIT BY BOTTLE" for 3.5 s after a hit.
- **Rail notices** (`campaignHitNotice`, from the `campaignHit` event): "HIT BY BOTTLE · 2/4 LEFT", "DAZED BY BRICK", "ARMOUR USED", "OKADA SAVED YOU", "DOWN: PUNCH"; the recovery frames stay quiet (the SAFE chip says it), and an Armour / Okada outcome is not worded twice when the `protectionBroken` notice for the same hit is in the same batch.
- **Boss bar**: name, BOSS / LIEUTENANT, up to ten segments.
- Contrast: `tests/ui/campaignHealthContrast.test.ts` (text AA, shapes 3:1, day and night plate). Screenshots: `docs/screenshots/campaign-text-hud/` (desktop and phone landscape, full health and after a hit; the two toasts over the board are Rumble's existing top-centre rail, not part of this block).

Enemy bars drawn in the world are raid-render's job; this layer only exposes the data.

## 4. Tests

`tests/campaign-cards.test.ts` (limits for all content, Read more holds the rest, objective on every card, broker unchanged, derivation, results, sections), `tests/campaign-narration.test.ts` (empty catalogue, fallbacks, never throws, entitlement gating, Listen state, Continue while "playing"), `tests/ui/campaignScreens.test.ts` (screens' default view and Read more), `tests/ui/campaignHealth.test.ts`, `tests/ui/campaignHealthContrast.test.ts`; `e2e/campaign-text.spec.ts` (briefing / story cards, Read more, Listen disabled, keyboard, the health meter in a real Oshodi mission) and the extended size sweep in `e2e/campaign.spec.ts`.

## 5. Still placeholder

No narration audio exists (every Listen is disabled); the premium gate is only an interface; the card copy for sections and results beyond the six districts is derived, not hand-written; no world-space enemy bars (raid-render); the boss and lieutenant bar segment count caps at ten.
