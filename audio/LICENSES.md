# Audio licence notes

The audio files shipped are the founder's approved Pixabay music and the founder-approved Gemini text-to-speech
voice clips, both listed below. Every sound effect, warning and ambience bed is synthesised at runtime by
`src/audio/recipes` (pure DSP, no samples). The generated music, Kokoro TTS Pidgin voice clips and generated
ambience beds that the `claude/wahala-lagos-audio` branch put here were rejected and removed.

## Music: the founder's approved Pixabay playlist

Licence for all of them: **Pixabay Content License** (<https://pixabay.com/service/license-summary/>): free to use,
including in a game, attribution not required. It does **not** allow selling or distributing the music **on a
standalone basis**. These files are therefore part of WAHALA! only: they are loaded by the game's music player
(`src/audio/music.ts`) as the in-game soundtrack, are named by game slot (`pixabay_<id>.mp3`), and are not offered as a
download, album, pack or separate collection anywhere in this project. Do not extract them for other use, do not
publish them on their own, and do not add a "soundtrack download". Anyone wanting the tracks should get them from
the source pages below. The licence page could not be opened from the build environment (its egress proxy refuses
pixabay.com), so this summary is from the licence as published by Pixabay; re-check it before any commercial release.

The founder supplied nine of the ten approved tracks on 2026-10-23 (two uploads in the Claude Code session). Their
original file names were Pixabay's download names, `<uploader>-<title>-<id>.mp3`; the uploader and the Pixabay id
below come from those names (the files carry no ID3 tags). All nine are distinct (content hashes differ) and decode
(MPEG-1 layer III, 256 kbps).

### Files present

| File | Title | Uploader (Pixabay) | Source page | Licence | Obtained | Attribution required? | Length / size |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `pixabay_569473.mp3` | Afrobeat (Afro Beat) | arpmedia | https://pixabay.com/music/afrobeat-afrobeat-afro-beat-569473/ | Pixabay Content License | 2026-10-23 (supplied by the founder) | No (credited here anyway) | 145 s, 4.6 MB |
| `pixabay_573648.mp3` | Afrobeat Instrumental Summer Groove | alex-morgan | https://pixabay.com/music/modern-jazz-afrobeat-instrumental-summer-groove-573648/ | Pixabay Content License | 2026-10-23 (supplied by the founder) | No (credited here anyway) | 143 s, 4.6 MB |
| `pixabay_588999.mp3` | Afrobeat (Afro Beat) | solarflex | https://pixabay.com/music/afrobeat-afrobeat-afro-beat-588999/ | Pixabay Content License | 2026-10-23 (supplied by the founder) | No (credited here anyway) | 96 s, 3.1 MB |
| `pixabay_491433.mp3` | Afrobeat (Afro Beat) | apalonbeats | https://pixabay.com/music/afrobeat-afrobeat-afro-beat-491433/ | Pixabay Content License | 2026-10-23 (supplied by the founder) | No (credited here anyway) | 183 s, 5.8 MB |
| `pixabay_439622.mp3` | Afrobeat (Afro Beat) | sigmamusicart | https://pixabay.com/music/afrobeat-afrobeat-afro-beat-439622/ | Pixabay Content License | 2026-10-23 (supplied by the founder) | No (credited here anyway) | 110 s, 3.5 MB |
| `pixabay_491432.mp3` | Afrobeat (Afro Beat) 2 | apalonbeats | https://pixabay.com/music/beats-afrobeat-afro-beat-2-491432/ | Pixabay Content License | 2026-10-23 (supplied by the founder) | No (credited here anyway) | 174 s, 5.6 MB |
| `pixabay_406552.mp3` | Pause | audiolibraryinfinite | https://pixabay.com/music/afrobeat-pause-406552/ | Pixabay Content License | 2026-10-23 (supplied by the founder) | No (credited here anyway) | 240 s, 7.7 MB |
| `pixabay_540950.mp3` | Afro Beat Afrobeat Instrumental | hitslab | https://pixabay.com/music/afrobeat-afro-beat-afrobeat-instrumental-540950/ | Pixabay Content License | 2026-10-23 (supplied by the founder) | No (credited here anyway) | 111 s, 3.6 MB |
| `pixabay_504898.mp3` | Afrobeat (Afro Beat) | freemusicforvideo | https://pixabay.com/music/electronic-afrobeat-afro-beat-504898/ | Pixabay Content License | 2026-10-23 (supplied by the founder) | No (credited here anyway) | 141 s, 4.5 MB |

### Missing

| Expected file | Source page | Status |
| --- | --- | --- |
| `pixabay_496406.mp3` | https://pixabay.com/music/afrobeat-afrobeat-afro-beat-496406/ | Approved track #7; not supplied yet. Its slot is in the manifest (no arena uses it as its signature track); dropping the file in enables it with no code change. |

### Public repository and GitHub Pages

The game is deployed as static files on GitHub Pages from a public repository, so the MP3s can be fetched by anyone
who inspects the page or the repository; they are not technically protected from download and nobody should claim
they are. They are used only as WAHALA!'s in-game soundtrack (one signature track per arena, loaded by the game's own
player), never presented or linked as a separate collection. Keep it that way: no "download the soundtrack" link,
no music page, no ZIP. Whether to keep the files in the public repository long term (versus private storage or a CDN
for a commercial release) is a founder decision; see `docs/AUDIO.md`.

## Voice clips (founder-approved Gemini TTS, 2026-10-24)

Synthetic Nigerian Pidgin voices generated by the founder with the **Google Gemini API text-to-speech** models
(prebuilt voices "Puck" and "Kore"), approved by the founder for WAHALA! and supplied as WAV masters
(`tools/audio/voices/masters/`, encoded to MP3 by `tools/audio/voices/import_voices.py`). **They are not recordings
of people**: never describe them as recorded or authentic Lagos voices. Terms: Gemini API Additional Terms of Service
and the Generative AI Prohibited Use Policy (Google does not claim ownership of generated content; the developer is
responsible for its use). Open points before a commercial release (preview-model status, free-tier data use, a
possible SynthID watermark, AI-content disclosure rules): `docs/AUDIO.md`, "Licensing and publication". Not shipped:
the rejected conductor clip `conductor_cms_01` (both versions).

| File | Line | Length |
| --- | --- | --- |
| `voices/recorded/danfo_hit_01.mp3` | `danfo_hit_01` | 1.70 s |
| `voices/recorded/danfo_hit_02.mp3` | `danfo_hit_02` | 1.54 s |
| `voices/recorded/danfo_hit_03.mp3` | `danfo_hit_03` | 3.14 s |
| `voices/recorded/danger_explosion_01.mp3` | `danger_explosion_01` | 0.97 s |
| `voices/recorded/danger_explosion_02.mp3` | `danger_explosion_02` | 1.73 s |
| `voices/recorded/danger_explosion_03.mp3` | `danger_explosion_03` | 2.00 s |
| `voices/recorded/danger_run_01.mp3` | `danger_run_01` | 1.06 s |
| `voices/recorded/danger_run_02.mp3` | `danger_run_02` | 1.23 s |
| `voices/recorded/danger_run_03.mp3` | `danger_run_03` | 1.75 s |
| `voices/recorded/elimination_01.mp3` | `elimination_01` | 4.59 s |
| `voices/recorded/elimination_02.mp3` | `elimination_02` | 2.56 s |
| `voices/recorded/elimination_03.mp3` | `elimination_03` | 1.63 s |
| `voices/recorded/escape_01.mp3` | `escape_01` | 2.58 s |
| `voices/recorded/escape_02.mp3` | `escape_02` | 1.20 s |
| `voices/recorded/escape_03.mp3` | `escape_03` | 2.26 s |
| `voices/recorded/keke_approach_01.mp3` | `keke_approach_01` | 0.57 s |
| `voices/recorded/keke_approach_02.mp3` | `keke_approach_02` | 1.82 s |
| `voices/recorded/keke_approach_03.mp3` | `keke_approach_03` | 2.01 s |
| `voices/recorded/market_come_buy_01.mp3` | `market_come_buy_01` | 2.38 s |

## Other recordings (sample slots)

For every other file you add to this folder, add a row here (and a matching `license` field in `slots.json`, which
the game requires before it will use a recording):

| Slot | File | What it is | Author / source URL | Licence (name + link) | Date obtained | Attribution text required? |
| --- | --- | --- | --- | --- | --- | --- |
| _none yet_ | | | | | | |

Rules of thumb:

- Only add recordings you are allowed to redistribute inside a public GitHub Pages build
  (CC0, CC-BY with attribution shown, the Pixabay Content License, or purchased with a licence that permits
  redistribution in a game). "Free to download" is not a licence.
- Do not label a recording as something it is not (for example, do not describe a stock crowd track
  as "recorded in Lagos" unless that is documented by the source).
- Keep the original licence text or receipt alongside the project records.
