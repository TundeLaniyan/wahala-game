# Voice clips (generated folder)

The MP3s here are produced by `tools/audio/voices/import_voices.py` from the founder-approved WAV masters in
`tools/audio/voices/masters/`, and listed in `../recorded.json` (also generated). They are **synthetic Nigerian
Pidgin voices made with Google Gemini text-to-speech**, not recordings of people.

Do not add or edit files here by hand. To add the next batch:

    python3 tools/audio/voices/import_voices.py --add /path/to/new_wavs

(file name = the line's `filename` in the founder manifest, e.g. `okada_saved_01.wav`; rejected takes are never
imported). Full instructions, the event mapping and the licensing notes: `docs/AUDIO.md`, section "Voice lines".

Anything missing or failing to decode is simply skipped at runtime (that line stays silent); it never breaks the
rest of the audio.
