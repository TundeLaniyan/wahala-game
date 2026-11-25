# Commercial-rights assessment: the approved soundtrack (decision AU5)

**Status: NOT CLEARED for commercial release.** This is an engineering record of what Google's official pages say, not legal advice and not a clearance. The release is mechanically blocked until a human records the clearance (section 7). Date of the review: 2026-11-25. Every page below was fetched on that date; quotations are short and copied from the fetched text; "My reading" marks interpretation. A longer working memo with the same sources exists in the session notes; the facts here are the ones that matter for the decision.

Scope: the *Lagos No Dey Sleep* theme (menu, boss levels, victory and defeat stingers) and the seven district songs with their Sudden Death loops, all made by the founder in the consumer Gemini app's music feature and processed by us (`docs/AUDIO_PROVENANCE.md`).

## 1. What is NOT established (read this first)

1. **No official page says the user owns the generated music, or grants a licence to use it commercially.** Google's Terms say only that Google "won’t claim ownership over that content". That is a statement about Google, not a grant to the studio.
2. **No warranty or IP indemnity for consumer-Gemini output was found.** Google's published indemnity covers listed paid Cloud and Workspace services under an agreement, for *unmodified* output; **Lyria and the consumer Gemini app are not on that list.**
3. **Nothing official was found on editing, mastering, looping, stem separation or mixing** the generated tracks (we did all of these), and nothing on removing or keeping the watermark.
4. **The model that made each file is unknown** (the district pack's README names Lyria; no version is recorded). We do not state one.
5. **Copyright in raw AI output cannot be assumed.** We do not claim exclusive copyright and do not guarantee the tracks are free of third-party claims.

Because of 1 and 2 alone, shipping these files in a commercial game rests on an unconfirmed assumption. That is the outstanding issue.

## 2. Official sources and what they say

| # | Page (fetched 2026-11-25) | Date on the page | Operative text (short quotes) |
| --- | --- | --- | --- |
| 1 | Google Terms of Service, https://policies.google.com/terms | "Effective July 30, 2026" | "Some of our services allow you to generate original content. Google won’t claim ownership over that content." / "Your content remains yours, which means that you retain any intellectual property rights that you have in your content." |
| 2 | Same, previous version, https://policies.google.com/terms/archive/20240522 | "Effective May 22, 2024" | The "won’t claim ownership" sentence is also there. Tracks made before 30 July 2026 fall under this version. |
| 3 | Generative AI Additional Terms of Service, https://policies.google.com/terms/generative-ai | "Last Modified: August 9, 2023" | "As of that date [May 22, 2024], these Generative AI Additional Terms of Service no longer apply, unless you’re a business partner with a signed agreement that references these terms." |
| 4 | Gemini Apps Privacy Hub, https://support.google.com/gemini/answer/13594961 | "Last updated: November 24, 2026" | "The Google Terms of Service and the Generative AI Prohibited Use Policy apply to Gemini Apps." |
| 5 | Generate music with Gemini Apps (help), https://support.google.com/gemini/answer/16901237 | none shown | Requires "18 years of age or older"; "short (about 1 minute) or full (about 2-3 minutes)"; "To create a full track, switch the model to “Pro”"; MP3 or MP4 download; "There are limits for how many tracks you can create with Lyria." Commercial use: not on the page. |
| 6 | Lyria 3 launch post, https://blog.google/innovation-and-ai/products/gemini-app/lyria-3/ | Feb 18, 2026 | "users must adhere to our Terms of Service and Gen AI prohibited use policies, which prohibit violations of others’ intellectual property and privacy rights." / Artist names are "broad creative inspiration"; "filters ... to check outputs against existing content. We recognize that our approach might not be foolproof". Commercial use: not stated. |
| 7 | Lyria 3.5, https://deepmind.google/models/lyria/ | none | Marketing copy ("ready for your projects"); not a licence statement, and it does not say which products or terms it covers. |
| 8 | SynthID, https://deepmind.google/models/synthid/ | none | "SynthID embeds a watermark into any audio generated or published through our AI music generation model Lyria"; "can’t be altered by common modifications like adding noise, MP3 compression, or changing the speed of the track". |
| 9 | Generative AI Prohibited Use Policy, https://policies.google.com/terms/generative-ai/use-policy | "Last Modified: December 17, 2024" | "Misrepresenting the provenance of generated content by claiming it was created solely by a human, in order to deceive." The Terms also bar "misleading others into thinking that generative AI content was created by a human". |
| 10 | Generative AI Indemnified Services, https://cloud.google.com/terms/generative-ai-indemnified-services | "Last modified July 20, 2026" | Lists Gemini for Google Cloud, Gemini Enterprise, Imagen, Veo, Gemini in Workspace and others. **Lyria and the Gemini app do not appear.** |
| 11 | Google Cloud Service Specific Terms, https://cloud.google.com/terms/service-terms | "Last modified November 24, 2026" | The indemnity "also appl[ies] to allegations that an unmodified Generated Output from a Generative AI Indemnified Service ... infringes a third party’s Intellectual Property Rights", with exclusions (output it "knew or should have known was likely infringing", circumventing filters, trademark claims) and only where the service "is not provided to Customer free of charge". A Cloud-customer clause, not a Gemini-app clause. |
| 12 | US Copyright Office, Copyright and Artificial Intelligence, Part 2: Copyrightability, https://www.copyright.gov/ai/ (PDF there) | January 29, 2025 | "Copyright does not extend to purely AI-generated material, or material where there is insufficient human control over the expressive elements." / "prompts do not alone provide sufficient control" / human authors are entitled to copyright in "the creative selection, coordination, or arrangement of material in the outputs, or creative modifications of the outputs" (case by case). The AI page shows nothing newer on music copyrightability. |

Also in the Terms: a "consumer" is "An individual who uses Google services for personal, non-commercial purposes outside of their trade, business, craft, or profession"; a "business user" is "An individual or entity who is not a consumer", and business users indemnify Google for "unlawful use of the services or violation of these terms". **My reading:** a studio shipping a game with this music is probably a business user, so the consumer-app route does not give it consumer protections and may add obligations. A lawyer must say how this applies to a consumer-app account used for work.

## 3. Reading, item by item

| Question | What we can say | Confidence |
| --- | --- | --- |
| Who owns the output | Google does not claim it; no page says the user does. Ownership in the legal sense is left to copyright law (section 2, row 12): raw AI output may have no copyright at all. | Official text quoted; legal effect unverified |
| May it be used commercially | Not stated either way on any page read. Not permitted is not claimed; permitted is not established. | Absence of text |
| Derivatives (mastering, loops, variants, stems, MP3) | Not addressed. Human creative modification can attract copyright for the human part (US report), but that does not create rights in the underlying Google output. | Absence of text |
| Watermark | Present in every Lyria track and robust to MP3, noise and speed change. Expect detectors to flag the shipped files. No page says it may or must be kept. | Official text quoted |
| Disclosure | No page requires labelling music as AI-made. Google bars *misleading* people about human authorship. Store and regional AI-content rules (for example in the EU) are a separate, unchecked question. | Official text quoted; store rules not reviewed |
| Warranty / indemnity | None found for the consumer app; Lyria is not on Google's indemnified list. A paid Cloud or Workspace route might differ, but it is not shown to cover Lyria. | Official list quoted |
| Third-party claims | Google says it filters outputs and "might not be foolproof". We did **no** melody, lyric or title comparison. | Our own gap |
| Vocals / likeness | Some tracks have sung lines; Fadeyi-Somolu was reduced to a stem instrumental that may keep ghost vocals. Whether any prompt named a real artist is not recorded. | Our own gap |
| Public distribution | The files are downloadable from the repository and the deployed site. Do not offer a "download the soundtrack". | Policy decision |
| Terms changing later | Google can update terms; whether new terms reach earlier output is not stated. | Absence of text |

## 4. What was not read (limits of this review)

- The Gemini API additional terms and music page (`ai.google.dev` redirects to a host the environment's proxy refuses), the Gemini "About Lyria" overview page, the Supreme Court docket for the *Thaler* petition, the Gemini Business service-specific terms and the Workspace service terms.
- The music help page's "last updated" date (script-rendered).
- Country-specific terms. Absence in the pages read is not proof that no licence or statement exists elsewhere (for example in a paid plan's own terms).

## 5. Options to reach "cleared" (the founder decides)

| Option | What it needs | Effect |
| --- | --- | --- |
| A. Written confirmation | A lawyer's opinion and/or a written answer from Google (or the terms of a plan that grants commercial use) covering section 6 questions 1-5; the founder's generation records. | Clears the current files if favourable. |
| B. Re-create through a covered route | Re-generate through a paid service whose terms grant commercial use and (ideally) an IP indemnity, if Google lists Lyria there; Lyria is **not** on the indemnified list today. | New files, new approval, new checksums. |
| C. Replace | Commission or license the music from human composers (the Pixabay tracks remain available as fallbacks and are unaffected). | Removes the question; costs money and time. |
| D. Keep it off the public site | Ship the soundtrack only in a private or development build. | What this branch does today. |

## 6. Open questions for Google or a lawyer

1. Which Terms version governs each track (before / after 30 July 2026), and does the studio count as a "business user"?
2. Does Google state anywhere that Gemini-app music may be used commercially, in a paid game, sublicensed to players?
3. Can Google show from account records which Lyria model produced each track?
4. May the tracks be mastered, edited, looped, varied, stem-separated, compressed to MP3 and mixed into a game?
5. Must the SynthID mark stay, and may a game or storefront disclose the music as AI-generated? What counts as "misleading others"?
6. Is there any warranty or indemnity for output made in the consumer app, or does a Cloud / Workspace route cover Lyria?
7. What happens if a rights holder complains after release; can Google invalidate or recall exported tracks?
8. (Lawyer) What copyright can the studio claim in each territory it sells in; how should human contributions be documented and AI content disclaimed (US registration requires disclosing AI-generated content above de minimis)?
9. (Lawyer) Do the vocal tracks raise voice-likeness or publicity-rights risk; did any prompt name a real artist?
10. (Lawyer) Does the Terms' ban on using output "to develop machine learning models" touch any planned tooling?
11. Do Gemini Business or Workspace terms differ for output made under a work account?

## 7. How the block works (so nobody ships it by accident)

- `public/audio/release-clearance.json` records the status (`not-cleared` today). It is a release record; the music player never reads it.
- `.github/workflows/deploy.yml`, step "Decide whether to publish": if the built site's `audio/music/manifest.json` lists any `dist_*` or `lnds_*` track and the status is not `cleared`, the **publishing branch's** deploy fails with "Soundtrack not cleared"; any other branch's dry run only prints a notice. A missing record counts as not cleared.
- `tests/audio/releaseGate.test.ts` checks the record's shape (a `cleared` status needs `clearedOn`, `clearedBy` and `evidence`), that this document and `docs/AUDIO_PROVENANCE.md` agree with it, and that the deploy gate exists. Changing the status to `cleared` is a deliberate commit that someone owns.
- Do **not** set `cleared` because the open questions look unlikely to matter. Set it when the answers are on file.
