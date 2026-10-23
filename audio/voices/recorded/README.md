# Recorded Pidgin lines go here

No voice audio is shipped (the synthetic placeholder voices were rejected and removed), so every line in
`../voices.json` is silent until a recording is listed here. To give a line a real recording of a Nigerian speaker:

1. Record the line (script: [`docs/VOICE_RECORDING_SCRIPT.md`](../../../../docs/VOICE_RECORDING_SCRIPT.md)).
   Mono or stereo, 44.1/48 kHz, close-mic or phone-in-a-quiet-room, trimmed with about 50 ms of
   silence either side, peaking around -3 dBFS. One take per file; several different speakers are better
   than one voice (the game rotates lines and avoids repeating the previous speaker).
2. Save it here as `<clip id>.ogg` (or `.mp3` / `.wav`), e.g. `r_escape_0.ogg`. Names: letters, digits,
   `_` and `-` only.
3. List it in `../recorded.json`:

   ```json
   {
     "clips": [
       {
         "id": "r_escape_0",
         "file": "r_escape_0.ogg",
         "license": "Recorded for WAHALA! by Ada Obi, written consent, all rights assigned",
         "speaker": "ada"
       },
       {
         "id": "r_escape_9",
         "category": "escape",
         "text": "Wahala! E no touch am!",
         "file": "r_escape_9.ogg",
         "license": "Recorded for WAHALA! by Tunde A., written consent",
         "speaker": "tunde"
       }
     ]
   }
   ```

   - An `id` that already exists in `voices.json` gives that catalogue line its voice.
   - A new `id` with `category` + `text` **adds** a line to that category (categories are listed in the
     recording script).
   - `license` is required. Entries without a licence/consent statement are ignored by the game.
4. Add the speaker's consent / licence to the project records. Do not use voices you do not have rights to.

Anything missing, unlicensed or failing to decode is simply skipped (that line stays silent); it can never
break the rest of the audio.
