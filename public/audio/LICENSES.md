# Audio licence notes

**No recorded audio is shipped with WAHALA! yet.** Every sound in the game is synthesised by
`src/audio/recipes` (pure DSP, no samples). This file exists so that anyone who adds a recording
records where it came from.

For every file you add to this folder, add a row here (and a matching `license` field in
`slots.json`, which the game requires before it will use a recording):

| Slot | File | What it is | Author / source URL | Licence (name + link) | Date obtained | Attribution text required? |
| --- | --- | --- | --- | --- | --- | --- |
| _none yet_ | | | | | | |

Rules of thumb:

- Only add recordings you are allowed to redistribute inside a public GitHub Pages build
  (CC0, CC-BY with attribution shown, or purchased with a licence that permits redistribution in a
  game). "Free to download" is not a licence.
- Do not label a recording as something it is not (for example, do not describe a stock crowd track
  as "recorded in Lagos" unless that is documented by the source).
- Keep the original licence text or receipt alongside the project records.
