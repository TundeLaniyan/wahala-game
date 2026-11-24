# Seven district songs: mastering, loops, arena map and Sudden Death (branch `audio/wahala-production-soundtrack-v1`, decision AU3)

Not merged, not deployed, nothing under `public/audio/`, no shipped track replaced or removed. The Pixabay tracks stay the fallback everywhere; every candidate is reachable only with `?audiodraft`. Continues the branch of `docs/AUDIO_PRODUCTION.md` (Lagos No Dey Sleep): its menu instrumental, boss theme, victory/defeat cues and the existing sound effects are untouched.

Listening and comparison page (private link; originals as received beside the game versions, A/B at the same moment, Data Saver, Sudden Death hand-over demos): https://claude.ai/artifact/KxF593Rq6jBDEnUfMri3si

## 1. The pack, verified

`WAHALA_Seven_District_Soundtracks_VERIFIED_2026-11-24.zip`: seven MP3s, `MANIFEST.csv`/`.json`, README. All seven files match the manifest on SHA-256, byte size and duration (MP3, 44.1 kHz stereo, about 192 kb/s); the seven hashes are distinct. The Lagos Island file is `06_Lagos-Island_Lagos-Market-Swagger.mp3` (151.9 s); the earlier alternates (`ebute_rail_perimeter`, `no_gree_for_anybody`) are not in the pack and were not used. The recordings are not committed (rights, see section 8).

## 2. What the recordings are (measured)

| District / song | Arena | BPM | Key | Length | Source LUFS / dBTP / clipped samples | Vocal-like content | Dynamic spread |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Ojuelegba: Asphalt Throne | `rumbleOjuelegba` | 110 | C# major | 152 s | -12.3 / +0.3 / 78 | 2 bursts | 11.3 dB |
| Oshodi: Oshodi Transit | `rumbleOshodi` | 124 | F# minor | 181 s | -13.2 / +0.5 / 92 | 2 bursts | 5.4 dB |
| Mushin: Mushin Heat | `rumbleMushin` | 110 | C# major | 149 s | -12.7 / +0.3 / 286 | 1 burst | 13.0 dB |
| Fadeyi-Somolu: We Still Dey Move | `rumbleFadeyi` | 110 | C# major | 175 s | -13.0 / +0.4 / 45 | **51 bursts, 48% of the time, only 10 dB below the rest** | 9.0 dB |
| Ebute-Metta: Steel and Skin | `rumbleEbuteMetta` | 105 | C# major | 150 s | -13.7 / +0.1 / 8 | none detected | 11.0 dB |
| Lagos Island: Lagos Market Swagger | `rumbleLagosIsland` | 110 | F# major | 152 s | -12.2 / +0.3 / 147 | 5 bursts | 11.9 dB |
| Lekki: Lekki Power Move | `rumbleLekki` | 110 | G# minor | 169 s | -12.7 / +0.5 / 201 | 4 bursts | 18.4 dB |

How these were measured (`tools/audio/production/district_analyse.py`, numbers in `source_analysis.json`): tempo from the onset envelope and checked in 15 s windows (constant across each song; **three songs are not at 110: Oshodi is 124 BPM, Ebute-Metta 105**, and the beat tracker first said 123); key from chroma; vocal presence from a separation model used only to measure, never to produce the loops; dynamics from per-bar levels. **Every source is hard-limited above full scale** (true peaks of +0.1 to +0.5 dB and 8 to 286 clipped samples): they were backed off 3 dB before any processing and the clipping was not repaired.

**Flags, in order of weight**
1. **Fadeyi-Somolu has real vocals** (sung or chanted lines through about half the song). That is unintended for a gameplay theme under Pidgin voice lines. The mapped version is an instrumental made from Demucs stems (drums + bass + other); an independent model still finds a vocal about **22 dB** below the original's, so ghost vocals are possible. The mastered original with vocals is kept for comparison on the page. Needs listening; the clean fix is a vocal-free regeneration.
2. **Oshodi is the flattest** (5.4 dB spread over 181 s, no real build): the likeliest to feel repetitive. Its loop is the longest (155 s) to give it every variation it has.
3. **Brief vocal-like bursts** under 1 s at -25 to -35 dB in Ojuelegba (126 s, 139 s), Mushin (56 s), Lagos Island (77 s, 137-140 s), Lekki (first 8 s) and Oshodi (first 4 s). The detector cannot tell a vocal chop from a lead synth. The intro bursts of Oshodi, Lekki and Lagos Island fall before the loop start and are cut out; the rest are inside the loops and listed with jump buttons on the page.
4. **Ebute-Metta is nearly mono** (stereo width -17.7 dB) and bass-heavy (phone-speaker loudness -18.9 LUFS): it will sound narrower and darker than the others.
5. **Lekki has the widest dynamics** (18 dB): a quiet intro and a long quiet tail. The loop skips both.
6. Mushin's beat phase is ambiguous by half a beat in the decoded masters (see `qa_report.txt`). This does not affect seams or the Sudden Death hand-over.

**Fit to the districts** is judged here only from tempo, weight, dynamics and the titles (for example Oshodi's brisk, steady 124 BPM transit groove, Ebute-Metta's slow 105 BPM heavy pulse for a rail yard, Lagos Island's market swagger, Lekki's wide-dynamic "power move"). Whether each song feels right for its district is a listening and cultural decision: it is the first item on the page's checklist.

## 3. Mastering

`tools/audio/production/make_districts.py` (deterministic; no machine learning): 3 dB trim, 30 Hz high-pass, loudness to **-14 LUFS** (the level the game's shipped tracks are trimmed to, so the manifest gain stays 1.0), a true-peak limiter, and a closed-loop check that decodes the MP3 and backs off until the decoded true peak is at most -1.0 dBTP. Results: **-14.2 to -14.3 LUFS and -1.3 to -1.8 dBTP decoded** (sources were -12.2 to -13.7 LUFS and above 0 dBTP). No EQ, compression or stereo processing was applied to the songs: with no way to listen, only measurable corrections were made. On a phone-speaker simulation (150 Hz high-pass) the masters measure -16.4 to -19.0 LUFS against a median of -17.6 for the existing tracks after their gains; Fadeyi (instrumental, bass-heavy) and Ebute-Metta are the quiet ones.

## 4. Seamless loops that keep the song

Each song becomes **one bar-aligned loop of 75-91% of the recording** (113-155 s), not a 30 s section. Method: the beat grid is fitted at 2.9 ms resolution (tempo, first bar, kick-based bar phase); every candidate loop-in and loop-out on 4-bar boundaries is scored by how well the music before the out point matches the music before the in point (chroma, timbre, level), plus a bonus for section boundaries and a strong preference for length; the loop's last 60 ms fades equal-power into the audio that preceded the loop start, so the end flows into the start.

| Song | Loop (song bars) | Length (share) | Join similarity | Seam | Game LUFS / dBTP | Phone view | Standard | Data Saver | Sudden Death loop |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Asphalt Throne | 5-65 | 131 s (86%) | 1.95 | clean | -14.3 / -1.7 | -16.6 | 3,069 KB | 1,534 KB | 16 bars, 819 KB |
| Oshodi Transit | 4-84 | 155 s (85%) | 1.89 | clean | -14.2 / -1.3 | -17.2 | 3,630 KB | 1,815 KB | 16 bars, 727 KB |
| Mushin Heat | 4-56 | 113 s (76%) | 1.81 | clean | -14.2 / -1.4 | -16.9 | 2,660 KB | 1,330 KB | 16 bars, 819 KB |
| We Still Dey Move (instrumental) | 15-75 | 131 s (75%) | 1.98 | clean | -14.3 / -1.6 | -19.0 | 3,069 KB | 1,534 KB | 16 bars, 819 KB |
| Steel and Skin | 1-61 | 137 s (91%) | 1.97 | clean | -14.2 / -1.7 | -18.9 | 3,215 KB | 1,607 KB | 16 bars, 858 KB |
| Lagos Market Swagger | 4-64 | 131 s (86%) | 1.93 | clean | -14.3 / -1.8 | -16.4 | 3,069 KB | 1,534 KB | 16 bars, 819 KB |
| Lekki Power Move | 9-69 | 131 s (78%) | 1.94 | clean | -14.3 / -1.3 | -16.8 | 3,069 KB | 1,534 KB | 16 bars, 819 KB |

(Join similarity is a sum of two cosines, so 2.0 is a perfect match; "seam" is the decoded file's wrap step against its normal sample-to-sample step. Both are measurements, not listening.) Every file decodes to its authored sample count, so the MP3's gapless header is honoured. **Caveat:** the game streams `<audio>` elements and browsers do not guarantee sample-accurate `loop`, so a tiny gap at the loop point is possible in the game even though the file is seamless; the listening page's "Play like the game" button lets you hear that. A standard two-minute match rarely reaches the loop point (113-155 s); a long Rumble can.

**Distinct variants from one file, with no extra download.** The loop is seamless, so playback can start anywhere on a bar line. The manifest gives each song four start points (A at 0, B at half way, C at a quarter, D at three quarters): Rumble arenas alternate A and B between matches, and a standard arena that shares the district takes C. The same MP3 serves all of them.

## 5. Standard and Music Data Saver files

192 kb/s for the standard file (the sources are already 192 kb/s MP3s, so this keeps their rate) and 96 kb/s for Data Saver (the same rate as the shipped `lite/` files). Measured per song (`report.json`): the 96 kb/s file halves the size (22.3 MB standard against 11.2 MB for the seven loops) and loses bandwidth (15 kHz against 17-18 kHz) and about 7 dB of match to the master. Rates tried: 192, 160, 128, 96, 64 kb/s; for Asphalt Throne 3,069 / 2,558 / 2,046 / 1,534 / 1,023 KB, matching the master to 25.0 / 21.7 / 19.8 / 17.7 / 15.3 dB (64 kb/s drops to 11 kHz bandwidth; it was not built as a file). The existing shipped tracks are 256 kb/s MP3s of 1.6-5.8 MB each with 96 kb/s `lite` copies; the district loops are smaller on average at both settings (standard 2.7-3.6 MB against about 4.2 MB; Data Saver 1.3-1.8 MB against about 1.85 MB). Sudden Death loops: 0.7-0.9 MB standard, half that in Data Saver. Totals: seven songs 22.3 MB / 11.2 MB, seven Sudden Death loops 5.8 MB / 2.9 MB.

## 6. Arena map (applied only in `?audiodraft=match`)

All seven City Rumble arenas map one to one, so **no arena needs to share a song**:

| Arena | Song | Plays |
| --- | --- | --- |
| `rumbleOjuelegba` | Asphalt Throne | A, B alternating |
| `rumbleOshodi` | Oshodi Transit | A, B |
| `rumbleMushin` | Mushin Heat | A, B |
| `rumbleFadeyi` | We Still Dey Move (instrumental) | A, B |
| `rumbleLagosIsland` | Lagos Market Swagger | A, B |
| `rumbleLekki` | Lekki Power Move | A, B |
| `rumbleEbuteMetta` | Steel and Skin | A, B |
| `oshodiInterchange` (standard) | Oshodi Transit | C only |
| `lekkiRoadworks` (standard) | Lekki Power Move | C only |
| `balogunMarket` (standard) | Lagos Market Swagger | C only |

**Proposed, not applied** (looser geography; each would reuse a song that already has an arena): `yabaAfterDark` to Fadeyi-Somolu (C), `surulerePowerYard` to Mushin (C), `thirdMainland` to Ebute-Metta (C, weak), `lagoonJetty` to Lagos Island (D). `danfoBusPark` and `ajegunleBackstreets` have no district song and keep Pixabay. The seven songs therefore cover seven Rumble arenas and up to three standard arenas of the nine; the other six standard arenas stay on their founder-assigned Pixabay tracks. Today the shipped manifest has signature tracks for only four Rumble arenas (Oshodi, Lagos Island, Ojuelegba, Lekki); Mushin, Fadeyi and Ebute-Metta fall back to the default pool, so these three gain a theme.

## 7. Sudden Death at any tempo

The Lagos No Dey Sleep transition relied on all its files sharing one 110 BPM grid. These songs do not (124, 105, 110), so each song gets **its own Sudden Death loop**, made from the same recording and therefore the same tempo and key: its loudest 16 bars, 2 dB brighter with a 3 kHz pocket, plus code-made tension layers on the song's own beat (toms tuned to its key, hats, snare rolls, risers, impacts). Its file starts on a bar line and carries a grid in the manifest (`grid: {bpm, first}`).

In the existing music player, `setVariant('suddenDeath')` (still driven by the pure `musicVariantFor(state)`) now picks the Sudden Death loop of the playing track's family (`variants.suddenDeathFor`), opens it, and when it is really playing seeks it to **the same place in the bar the old song has reached** (old position minus its first bar, modulo the bar length, plus 40 ms for the seek), then crossfades over about a second while the old song keeps playing until then. So the hand-over is beat-locked at any tempo, but the new loop enters mid-bar, not on a downbeat, and mid-phrase: it is a beat-matched crossfade, not a phrase-aligned cut. A missing or broken Sudden Death file is skipped. A track without a family (every Pixabay track) never switches. Boss variants and the Lagos No Dey Sleep Sudden Death are unchanged.

Verified: unit tests with fake media (grid maths at 124 BPM, rotation, start points, fallbacks, probe de-duplication); in real Chromium with the files staged, a Rumble match on `rumbleOshodi` opened `dist_oshodi_a` and a forced Sudden Death switched to `dist_oshodi_sd` (tempo 1.09 after the endgame lift). **Not measured:** the alignment error in milliseconds in a real browser, and nothing has been listened to.

## 8. Lazy loading, fallbacks and data

- Without `?audiodraft` nothing candidate is requested, so the public game's start-up and data use are unchanged.
- With it: the manifest (about 40 KB with its licence texts, trimmed on promotion), one availability probe per file (start points of a file share one probe), then only the song for the arena being played (standard 3.1 MB or Data Saver 1.5 MB typical), and the Sudden Death loop (0.8 MB / 0.4 MB) only when Sudden Death starts. Nothing loads on the menu.
- Pixabay tracks stay installed and are the fallback for every arena the map does not list, for any candidate file that is missing or fails to play, and for everything when the flag is off.
- Music Data Saver: every candidate track names its `lite/` file and the player uses it exactly as for shipped tracks.

## 9. Rights and open concerns

1. **Provenance.** Generated by the founder with Gemini (the pack's README names Lyria). Which product and tier made each file, whether its terms allow commercial use in a game, whether the output carries a watermark or disclosure duty, and the generation records are all unverified here (Google's pages could not be opened from this container). Keep the generation history.
2. **Derivatives.** The masters, loops, Sudden Death loops and the Fadeyi instrumental inherit whatever rights the sources have. The Fadeyi stems used Demucs (MIT); a second separation model was used only to measure vocal residue and nothing from it ships. The Sudden Death layers are code-generated percussion and risers.
3. **Similarity** to existing songs was not checked for any of the seven.
4. **Vocals.** Fadeyi's sung lines and the short bursts in the others carry any performer or lyric questions; the Fadeyi instrumental may still contain ghost vocals.
5. **Public repository.** The mastered MP3s are not committed (about 28 MB): only manifests, reports and QA text. Rebuild with `tools/audio/production/build_districts.sh ZIP [fadeyi_instrumental.wav]`. The listening page holds the audio privately.
6. **AI-generated authorship** is unsettled in many countries; ask counsel before registering or licensing the music.

## 10. Remaining work

Founder listening decisions (page checklist); a vocal-free Fadeyi-Somolu (regenerate, or accept the stem instrumental); a call on Oshodi's flatness; real-device checks (iOS/Safari, a low-end Android, `<audio loop>` seam on both); measure the Sudden Death hand-over error in a real browser; the rights decisions above; on approval, promotion by the release owner (copy approved files to `public/audio/music/`, real manifest entries and `LICENSES.md` rows, deliberate update of `tests/audio/assets.test.ts`, then arena playlists and `suddenDeathFor`).

## 11. Audition

`npm run audio:stage-candidates` (merges this pack with the Lagos No Dey Sleep pack; the district MP3s must have been built first), `npm run dev`, then `/?audiodraft=match` (district songs on the mapped arenas, with Sudden Death and boss variants), `?audiodraft=menu`, `?audiodraft=lnds` (the earlier Lagos No Dey Sleep rumble mix on every arena), `?audiodraft=stings`, or a bare `?audiodraft` for all. `npm run audio:unstage-candidates` removes the staged files.
