# Provenance and licensing checks: the founder-approved WAHALA! originals

Machine-readable record: `tools/audio/release/provenance.json` (source file names, sizes, SHA-256, tool versions). Shipped-file hashes: `tools/audio/release/SHA256SUMS` (checked by `npm run audio:release-verify` and by `tests/audio/releaseGate.test.ts`). Rights assessment: `docs/AUDIO_RIGHTS_ASSESSMENT.md`. Nothing here is a legal conclusion.

## Release status (decision AU5)

**Rights decision: founder-authorised on 2026-11-25; not a legal clearance.** The record is `public/audio/release-clearance.json` (status `founder-authorised`, scoped to the 38 approved files by the SHA-256 digest of `tools/audio/release/SHA256SUMS`). `tests/audio/releaseGate.test.ts` keeps it consistent with this document, and the deploy workflow publishes the soundtrack to GitHub Pages only while the record is a complete `cleared` or `founder-authorised` record. In one line: **Google's official pages were read and no explicit prohibition of commercial use of Gemini-app music was found, but no page grants commercial use, ownership, a warranty or an IP indemnity either; the founder authorised the release knowing this** (sources and residual risks: `docs/AUDIO_RIGHTS_ASSESSMENT.md`). No licence, legal opinion or written Google confirmation exists and none is claimed; the earlier reading that the absence of a licence was itself a block was wrong and is corrected in the assessment.

## Generation history (what is known, what is not)

- **Where.** Reported by the founder: the *Lagos No Dey Sleep* recording and all seven district songs were generated in **one conversation in the Google Gemini consumer app's music interface**. The district pack's own README names Lyria. **Which Lyria / Gemini model version produced each file is not recorded and is not stated here.** (The Gemini chat model that converses with the user and the music-generation model that renders the audio are different things.)
- **Conversation reference (private by decision).** The founder supplied the conversation's `gemini.google.com/app/...` address. It is an account-bound address: it opens only for the signed-in owner, so it is unlikely to reveal the conversation to others, but it identifies the account and its history, and this repository is served publicly (GitHub Pages; the audio is downloadable). **The complete address is therefore not committed.** It stays in the founder's private provenance record, together with the account, the generation dates and the prompts. Public reference: `gemini-app-conversation:sha256:109b1671d017e9fec45020e20934cb0e2ee7da17207cea0b48b7a801b803f5d0` (SHA-256 of the exact address string as supplied; the founder can confirm it by hashing the address from the private record, for example `printf '%s' '<address>' | sha256sum`). If the founder wants the full address recorded publicly, that is a one-line change in `provenance.json`; it should not be made without that decision.
- **Not available to the repository:** the generation dates, the prompts, the account, the number of attempts, and the full list of alternative outputs. Keep them with the original recordings.
- **Originals preserved.** The source recordings are not in the repository (rights and size). Their SHA-256 values are in the tables below so that a file kept elsewhere can be matched to this record. Keep the original ZIP and MP3s unmodified, with the conversation export if the founder can make one.

## Approved track mapping (source -> shipped)

*Lagos No Dey Sleep* (source `lagos_no_dey_sleep201.mp3`, SHA-256 `e4b6314d4c27cc2719e51f7cc9f97f4df03dec8920696e744211afc29be3bebc`, 2381307 bytes, 98.9 s, 110 BPM) became:

| Use | Shipped file (SHA-256, first 16) | Data Saver file |
| --- | --- | --- |
| Main menu loop | `lnds_menu.mp3` `d6cedae32673a9a8` | `lite/lnds_menu.mp3` |
| Boss music levels 1 / 2 / 3 | `lnds_boss_1.mp3` `fc140ef070685eaf`, `lnds_boss_2.mp3` `b07c83fff96c84ea`, `lnds_boss_3.mp3` `afe3a6948e93b7db` | `lite/` of each |
| Victory / defeat stingers | `public/audio/lnds_victory.mp3` `26d983df53c4a837`, `public/audio/lnds_defeat.mp3` `abd05a841cbb13a4` | none (small) |

The seven district songs (pack `WAHALA_Seven_District_Soundtracks_VERIFIED_2026-11-24.zip`, each file verified against the pack's own SHA-256 manifest) became one City Rumble arena track and one Sudden Death loop each:

| Arena | Song | Source file | Source SHA-256 | Shipped files (SHA-256, first 16) |
| --- | --- | --- | --- | --- |
| `rumbleOjuelegba` | Asphalt Throne | `01_Ojuelegba_Asphalt-Throne.mp3` | `2a9efe2bad8d14f567c35eeac67b20652611661d6109efeedf3368872492b4e8` | `dist_ojuelegba.mp3` `2c8cbe822502b807` / `dist_ojuelegba_sd.mp3` `fcd30bb3ace9584a` |
| `rumbleOshodi` | Oshodi Transit | `02_Oshodi_Oshodi-Transit.mp3` | `69d7b869bcad923be1af08a377b23a7e99022dfd67f384c2253714771c5196e0` | `dist_oshodi.mp3` `271bef6567e351e3` / `dist_oshodi_sd.mp3` `ed1929ca96c60d10` |
| `rumbleMushin` | Mushin Heat | `03_Mushin_Mushin-Heat.mp3` | `5e681205240c20f47ffd320a886e38c182ae33335f5cebaddd03287fc3e11e2c` | `dist_mushin.mp3` `1475fb68050a65d4` / `dist_mushin_sd.mp3` `0588acae7dca0964` |
| `rumbleFadeyi` | We Still Dey Move | `04_Fadeyi-Somolu_We-Still-Dey-Move.mp3` | `2225031e5500418f734645f7eba40529197aac21a6ca9dce16204031988f3edd` | `dist_fadeyi.mp3` `2d83e0a945a240f1` / `dist_fadeyi_sd.mp3` `e77b90ba51cd6e87` |
| `rumbleEbuteMetta` | Steel and Skin | `05_Ebute-Metta_Steel-and-Skin.mp3` | `a4e16a3ff9aedad0bcba86b162741e27bcfdea9f51d4002aec53f80363f7a9d9` | `dist_ebute.mp3` `58e11a928dc6e5a5` / `dist_ebute_sd.mp3` `040006d8b3e61e86` |
| `rumbleLagosIsland` | Lagos Market Swagger | `06_Lagos-Island_Lagos-Market-Swagger.mp3` | `5f489756d375f90608f5d2b03260180c0373217963044edf8290247b2269c366` | `dist_lagosisland.mp3` `5700a9586c5a3741` / `dist_lagosisland_sd.mp3` `6eb3748ade9b7aca` |
| `rumbleLekki` | Lekki Power Move | `07_Lekki_Lekki-Power-Move.mp3` | `37aa90c591d8dfea1d12889da3390573f1f431bdf36fe5d137d5e88ef53c51a3` | `dist_lekki.mp3` `9545a0466a6c198d` / `dist_lekki_sd.mp3` `e7590a5455e259c3` |

Each shipped file also has a smaller Data Saver version under `public/audio/music/lite/` (hashes in `SHA256SUMS`). The generic *Lagos No Dey Sleep* Rumble arrangement, its Sudden Death, the logo sting and the campaign atmosphere cues are **not shipped** (candidates only).

## Terms review (2026-11-25)

Google's own pages were read on 2026-11-25 (list, dates and quotations in `docs/AUDIO_RIGHTS_ASSESSMENT.md`). Short version: the Terms say Google "won’t claim ownership" of generated content, **no page was found that grants commercial use or says the user owns it**, no warranty or IP indemnity for consumer-app output was found (Lyria is not on Google's indemnified-services list), every Lyria track carries a SynthID watermark that survives MP3 compression, Google bars misleading people about human authorship, and nothing was found on editing, mastering or mixing. US copyright does not extend to purely AI-generated material; human selection and creative modification can be protected. **We do not claim exclusive copyright and do not guarantee freedom from third-party infringement.**

Processing (all in `tools/audio/`): loudness to -14 LUFS with decoded true peak at most -1 dBTP, bar-aligned seamless loops of 75-91% of each song, per-song Sudden Death loops from the same recording plus code-generated percussion / risers, MP3 192 / 96 kb/s. Fadeyi-Somolu: the instrumental is the sum of the Demucs `htdemucs_ft` drums, bass and other stems. The boss levels are the song's own bass and harmony pitched down five semitones over its drums plus synthesised brass stabs, risers and impacts. Tools: audio-separator 0.48.0 with Demucs (MIT), librosa 1.0.1, ffmpeg 6.1.1 + libmp3lame. A second separation model (UVR-MDX-NET-Voc_FT) was used only to **measure** leftover vocals; nothing from it ships.

## Unresolved licensing checks (open until the founder / counsel close them)

1. **Product terms and commercial use.** Reviewed (section above); **not resolved**: nothing official grants commercial use of Gemini-app music, and the model version per file is unknown. The studio is probably a "business user" under Google's Terms, which a lawyer must interpret.
2. **Watermark and disclosure.** The SynthID watermark is present and robust; expect detectors to flag the shipped MP3s. No page requires labelling music as AI-made, but Google bars deceiving people about human authorship. Store and regional AI-content rules (for example in the EU) are **not reviewed**.
3. **Similarity clearance.** No melody, lyric or title comparison against existing works was done for any of the eight songs. Use a musicologist or a clearance service.
4. **Authorship / copyright.** AI-generated music may not be copyrightable (US Copyright Office, January 2025); exclusivity and enforcement are uncertain; Google may generate similar content for others. Ask counsel before registering, licensing or building brand identity on the theme.
5. **Records.** Keep the generation history (account, date, prompt, model) and the original ZIP and MP3s: they are the evidence. They are deliberately not in the repository; neither is the conversation address (above).
6. **Derivatives.** Masters, loops, stem instrumental, pitch-shifted boss material, stingers and Sudden Death loops inherit the source's rights, whatever they are. Google's pages do not address editing or mixing.
7. **Vocals.** Fadeyi-Somolu has sung lines (instrumental from stems, ghost vocals possible); the others have short sung bursts inside the loops. Performer / lyric / likeness questions follow the recordings; whether any prompt named a real artist is not recorded.
8. **Public repository.** The files are downloadable from the repository and the deployed site. The Pixabay Content License forbids standalone distribution of the Pixabay tracks; for the originals, the same discipline applies (`public/audio/LICENSES.md`): no "download the soundtrack".

Not affected: the Pixabay tracks (licence unchanged) and the Gemini TTS voice clips (their own open points are in `docs/AUDIO.md`).
