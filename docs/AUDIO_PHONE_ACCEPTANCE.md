# Founder phone audio acceptance (about 25 minutes) - the approved soundtrack, decision AU5

What the automated checks cannot judge: how it SOUNDS on a real phone speaker or headphones, and how iOS / Android treat audio (autoplay, the silent switch, locking the screen). The automation already proves which file plays when (see `docs/AUDIO_RELEASE.md`, "Integration audit"). This is a listening check. It does **not** decide the commercial-rights question (`docs/AUDIO_RIGHTS_ASSESSMENT.md`): the soundtrack stays off the public site until that is cleared.

## Get the build on the phone (not the public site)

The public Pages build does not contain the new soundtrack. Use the integration branch on your computer, on the same Wi-Fi as the phone:

```bash
git fetch origin claude/wahala-audio-integration
git checkout claude/wahala-audio-integration
npm ci
npm run build
npx vite preview --host --port 4173
```

Open `http://<your-computer's-IP>:4173/wahala-game/` on the phone (the IP is the one your computer shows for the Wi-Fi). For the Test Lab steps add `?testlab=1` to the address. Nothing is saved to the public site; clear the site data afterwards if you like.

Before you start: phone volume up, the ringer / silent switch on "ring" (iOS can silence web audio with it off), do-not-disturb off, headphones optional (try the phone speaker first). First visit: tap once on the page, music cannot start before a tap (that is the browser's rule and is expected).

## Checklist (write pass / fail and a note for each)

| # | Do this | You should hear / see | Pass |
| --- | --- | --- | --- |
| 1 | Open the game. Wait 5 s. Do **not** tap. Then tap once. | Silence until the tap; then the *Lagos No Dey Sleep* instrumental, looping smoothly. | |
| 2 | Home > Play > City Rumble > Free-for-All. Pick **Ojuelegba** and start. Listen 20 s. Quit from the pause menu. Repeat for each arena below. | Each arena has its own song: Ojuelegba "Asphalt Throne"; Oshodi "Oshodi Transit"; Mushin "Mushin Heat"; Fadeyi-Somolu "We Still Dey Move"; Ebute-Metta "Steel and Skin"; Lagos Island "Lagos Market Swagger"; Lekki "Lekki Power Move". Never silence, never another arena's song. Back at the menu: the menu theme returns. | |
| 3 | Learn to Play > Advanced Training > **Sudden Death test** (one tap; it plays on Ojuelegba). | The Ojuelegba song turns into a more intense loop **on the beat**, with no gap and no silence, when the stage starts closing in. (The other six arenas' switches are checked by automation; if you want one by ear, play a real match to a tie.) | |
| 4 | Open `?testlab=1`, choose **Boss** (the real Oshodi boss mission, unlocked, nothing saved). Fight for a minute. | Boss music starts calm and stalking, then rises (level 2, then 3) as the encounter moves on. No restart or gap at the changes. | |
| 5 | Classic Blast, 2 players, Rookie bot. Win one round, then lose one (stand still). | Victory sting when you win; a different, short defeat sting when you lose. | |
| 6 | Tap through the menus; open the Ready screen; start a match; pause and resume. | Distinct small sounds for the Ready screen, pause and resume (the match music pauses while paused). Confirm / error sounds are in the campaign Workshop (buy and refund an upgrade) if you have progress; optional. | |
| 7 | Home: turn **Music Data Saver** ON (the shortcut, or Settings > Audio). Replay steps 1 and 2 for one arena. Reload the page. | Music still plays everywhere, perhaps slightly lower quality; the setting is still ON after the reload; with Auto it shows "(auto)". | |
| 8 | Mute from Home or Settings during a match; unmute. | Music stops at once and returns when unmuted; no half-volume stuck sound. | |
| 9 | During a match, lock the phone for 30 s, then unlock. Then switch to another app and back. | Music pauses with the page and resumes; the match is not left with stuck or doubled music. | |
| 10 | (Optional) Airplane mode in a match. | The game keeps running; music may stop but there is no error screen. | |

## What to send back

Phone model, OS version, browser, which numbered step failed, what you heard instead, and roughly when. A short screen recording of the failing step helps. Please do not post the Gemini conversation link or generation prompts anywhere public (see `docs/AUDIO_PROVENANCE.md`).
