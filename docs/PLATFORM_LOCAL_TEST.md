# Private multiplayer test: two phones, one laptop (no cloud, no cost)

For the founder. Everything runs on the laptop; two phones on the same Wi-Fi play together. Nothing is hosted, nothing is public, nothing leaves the room. The public GitHub Pages game is not involved and is not changed.

What you are testing: guest entry, nicknames, friends, a party, ONE private City Rumble room, verified players, quick signals, mute / report, a dropped connection, results, and a second match in Team Deathmatch.

## 1. On the laptop (once)

Needs Node 22. In the repository folder, on the branch `claude/wahala-private-multiplayer-v1`:

```bash
npm ci
cd server && npm ci && cd ..
cd player-platform && npm ci && cd ..
```

## 2. Start everything (every time)

```bash
npm run dev:private
```

Leave that window open. After about a minute it prints something like:

```
READY. Open on a phone (same Wi-Fi) or this laptop:
  this laptop                http://localhost:5173/?online
  phones on the same Wi-Fi   http://192.168.1.23:5173/?online
Server check from a phone:   http://192.168.1.23:2567/health     (shows {"ok":true})
Platform check from a phone: http://192.168.1.23:4567/health     (shows {"ok":true,...})
```

Use the **numeric address** it prints for your laptop (the example is `192.168.1.23`). Stop everything with Ctrl-C.

The platform's database is a throw-away one in memory: if you restart `dev:private`, everybody is a new guest again. That is expected for this test. (A real PostgreSQL can be used instead: `DATABASE_URL=... npm run dev:private`.)

## 3. Phone check before the test (1 minute)

On BOTH phones, connected to the same Wi-Fi as the laptop (not mobile data), open the two "check from a phone" addresses above. Each must show `{"ok":true...}`. If one does not, jump to section 6.

## 4. The test (about 12 minutes, two matches)

Call them **Phone A** (it will lead the party) and **Phone B**. Hold both in landscape. Open `http://<laptop-address>:5173/?online` on each.

| Step | Phone A | Phone B |
| --- | --- | --- |
| 1 | Tap **PLAY ONLINE** (bottom-left of Home). At the bottom you see YOU / FRIENDS / PARTY. Under YOU tap **Change**, type `PhoneA`, **Save**. Note the friend code (8 letters), or tap **Copy**. | Same: **PLAY ONLINE**, **Change**, `PhoneB`, **Save**. |
| 2 | Tap **FRIENDS**. | Tap **FRIENDS**, type A's friend code in the box, tap **Add**. |
| 3 | Within a few seconds a request from PhoneB appears: tap **Accept**. | PhoneA appears in your friends list. |
| 4 | Tap **PARTY**, keep **Free-for-All**, tap **Create party**. Then **FRIENDS** and tap **Invite** next to PhoneB. | Tap **PARTY**. An invitation appears: tap **Accept**, then **Ready**. |
| 5 | Tap **Start private match**. | Within a few seconds you are in the SAME room automatically (if not, tap **Join match**). |
| 6 | You are in one room. **Success:** both of you see `PhoneA` and `PhoneB` each with a green **VERIFIED** tag. The nicknames are the platform nicknames, not whatever is typed in the name box. | |
| 7 | Choose **3 MIN**, tap **Ready**. | Tap **Ready**. |
| 8 | Tap **Start** (it lights up when everyone is ready). The match loads: 2 people + 30 bots. | Same loading screen. |
| 9 | In the match tap **Signal** (top-right, under the connection chip) and tap **Nice one!**. | **Success:** a line "PhoneA: Nice one!" appears in the side rail. Now send one back. |
| 10 | Keep playing. | **Reconnection test:** switch Airplane mode ON for about 15 seconds, then OFF. A "reconnecting" banner appears, then goes away and you are **the same fighter in the same match** (a bot played for you meanwhile). |
| 11 | When the clock ends both phones show the **same results table** (32 rows: 2 HUMAN, 30 BOT). | |
| 12 | Tap **Rematch** (back in the room lobby). Choose **Team Deathmatch**, Ready on both, Start. | Ready. |
| 13 | Play a minute: tap **Signal** and look for the team ping choices ("Danger!"). Let the match end. | Results again. |

Optional safety check (30 seconds, in the room lobby): on Phone B tap the **...** next to PhoneA: you are offered **Mute**, **Block** and **Report**. Mute, then Unmute. Do not Block PhoneA unless you want to un-friend them for the test.

### What success looks like

1. Both phones were in ONE private room opened by the party, both **VERIFIED**, with the platform nicknames.
2. A quick signal sent on one phone appeared on the other, in the lobby and in the match.
3. After Airplane mode, Phone B came back to the same fighter without restarting.
4. Both results tables were identical, and the second match (Team Deathmatch) also finished.
5. No red error banner stayed on either phone.

To confirm the server recorded your matches as the real match server saw them (not what a phone claims), the laptop window shows lines from `[platform]` and `[server]`; the automated run (section 7) checks it exactly.

## 5. A third phone as the impostor (optional, 2 minutes)

In step 6, a third phone (or a laptop browser) opens the same page, taps **PLAY ONLINE**, types `PhoneA` in "Your name", types the 6-letter room code, taps **Join with code**. It enters the room but shows as `PhoneA 2` with **no** VERIFIED tag: a guest cannot pass for a platform player. Have it leave before step 7.

## 6. If something does not work

| What you see | Most likely cause and fix |
| --- | --- |
| Page does not open on the phone | Phone not on the same Wi-Fi (not mobile data, not a "guest" Wi-Fi), a typo in the numeric address, or the laptop's firewall blocking ports 5173, 2567 and 4567 (allow Node / allow those ports on the private network). Test with the `/health` addresses. |
| Works at `localhost` on the laptop but not on the phone | You used the name `localhost` on the phone. Use the numeric address. |
| "Friends and parties are unavailable right now. You can still play online as a guest." | The phone cannot reach the platform: open `http://<laptop>:4567/health` on the phone. Fix Wi-Fi / firewall, then tap **Retry**. Meanwhile the plain private room still works as guests. |
| Create room / Join says the server is unreachable | Same, for port 2567: open `http://<laptop>:2567/health`. |
| "origin not allowed" / blocked connections | You opened the page with a name or address the launcher did not list. Use the address it printed. If the laptop changed Wi-Fi after you started, press Ctrl-C and run `npm run dev:private` again. |
| "That nickname is taken" | Nicknames are unique across the platform: pick another. A nickname can be changed once a day. |
| "Your sign-in for this match expired. Try again." | A match ticket lives two minutes. Tap Join match again (it fetches a fresh one). |
| Phone B stays in the party but never joins | Tap **Join match** under the PARTY tab. If it says the room is gone, Phone A taps **Start private match** again. |
| After restarting `dev:private` everybody lost their nickname and friends | Expected (in-memory database). Start the test again from step 1. |
| iPhone Safari asks to allow local network access | Allow it. |
| The game is slow or the match stutters on an old phone | Note it down (device, what happened). Performance on real phones is exactly what this test is also for. |

## 7. The automated version of this test (laptop only)

```bash
npm run test:private-e2e      # real PostgreSQL + platform + match server + two real Chromium browsers (about 25 minutes)
node scripts/mp/restart-check.mjs   # the platform and the match server each stop and restart cleanly (about 2 minutes)
```

Both use a real PostgreSQL server (`scripts/mp/pg-local.sh start`, needs the PostgreSQL server packages) or `DATABASE_URL`. The browser run uses desktop and phone-sized Chromium; it is **not** a substitute for the phone test above.

## 8. Reporting back

Please send: the phone models and browsers, which step failed (number from the table) and what the screen said, and the last 30 lines of the `[server]` and `[platform]` log from the laptop window. Do not paste any `.local/private-dev/secrets.json` content (it is git-ignored and only for this laptop).
