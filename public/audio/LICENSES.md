# Audio licence notes

**No recorded audio is shipped yet**: the approved music files below have not been added. Every sound effect, warning and ambience bed is synthesised at runtime by `src/audio/recipes` (pure DSP, no
samples). The generated music, synthetic Pidgin voice clips and generated ambience beds that the
`claude/wahala-lagos-audio` branch put here were rejected and removed. This file records where every recording
that is added came from.

## Music: the founder's approved Pixabay playlist

Licence for all ten: **Pixabay Content License** (<https://pixabay.com/service/license-summary/>). Listed in
`music/manifest.json`. A file is only shipped once it is actually in `music/`; add its row to the "Files present"
table below when you add it.

| Id / expected file | Source page | Status |
| --- | --- | --- |
| `pixabay_569473.mp3` | https://pixabay.com/music/afrobeat-afrobeat-afro-beat-569473/ | not obtained |
| `pixabay_573648.mp3` | https://pixabay.com/music/modern-jazz-afrobeat-instrumental-summer-groove-573648/ | not obtained |
| `pixabay_588999.mp3` | https://pixabay.com/music/afrobeat-afrobeat-afro-beat-588999/ | not obtained |
| `pixabay_491433.mp3` | https://pixabay.com/music/afrobeat-afrobeat-afro-beat-491433/ | not obtained |
| `pixabay_439622.mp3` | https://pixabay.com/music/afrobeat-afrobeat-afro-beat-439622/ | not obtained |
| `pixabay_491432.mp3` | https://pixabay.com/music/beats-afrobeat-afro-beat-2-491432/ | not obtained |
| `pixabay_496406.mp3` | https://pixabay.com/music/afrobeat-afrobeat-afro-beat-496406/ | not obtained |
| `pixabay_406552.mp3` | https://pixabay.com/music/afrobeat-pause-406552/ | not obtained |
| `pixabay_540950.mp3` | https://pixabay.com/music/afrobeat-afro-beat-afrobeat-instrumental-540950/ | not obtained |
| `pixabay_504898.mp3` | https://pixabay.com/music/electronic-afrobeat-afro-beat-504898/ | not obtained |

Download attempt, 2026-10-23, from the build environment with plain `curl`: every source page (and
`cdn.pixabay.com`) was refused by the environment's egress proxy (HTTP 403 on CONNECT, policy denial). No page and
no file was received; nothing else was tried. The founder adds the files by hand (see `docs/AUDIO.md`).

### Files present

| File | Title | Artist | Source URL | Licence | Date obtained | Attribution required? |
| --- | --- | --- | --- | --- | --- | --- |
| _none yet_ | | | | | | |

## Other recordings (sample slots, voices)

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
