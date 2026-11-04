# Voice chat: design and what exists today

**NOT production ready. Voice chat does not exist in this game.** The only implementation that ships is `NullVoiceProvider`, which is always `status: 'disabled'` and never touches a microphone, a peer connection or any audio resource. This document is the design a future provider must meet; the interfaces and the permission policy exist (tested), the rest is unbuilt. Not to be confused with `docs/VOICE_INTEGRATION.md` (the founder's recorded Pidgin voice clips, which are unrelated).

## What exists

| Piece | State |
| --- | --- |
| `src/voice/types.ts`: `VoiceProvider`, `VoiceSession`, `VoicePermissions`, errors | interfaces, tested through the mock |
| `src/voice/policy.ts`: `channelFor`, `mayHear`, `permissionsFor`, `audienceOf` | pure, tested |
| `NullVoiceProvider` | the only shipped provider: always disabled |
| `MockVoiceProvider` | in-memory session rules for tests and UI states; moves no audio |
| `src/ui/online/VoiceStatus.tsx` | shown **only** when `flags().voice` is true (build-time `WAHALA_VOICE_ENABLED`, off everywhere): "Voice chat is not available yet" with the planned controls greyed out |
| Real provider, signalling, TURN, moderation back end, device testing | **not built** |

Nothing in the default or mock build may call the microphone API or create a peer connection: `scripts/check-static-build.mjs` fails the build if the strings appear, `tests/platform-static.test.ts` proves none is reachable from `src/main.tsx`, and `tests/voice` runs the null provider with all such globals replaced by throwing stubs.

## Requirements

1. **Default muted.** A session starts with `selfMuted = true`; leaving, disconnecting and the match ending mute again.
2. **Microphone is optional and never auto-prompted.** `requestMicrophone()` runs only after an explicit user action (a button). Unmuting needs both a granted microphone and the server's right to speak. A player who never grants it can still hear.
3. **Permissions are computed on the server** (`permissionsFor` is the shared specification): `channel` (`none` / `team` / `matchWide`), `canSpeak`, the list of participant ids `canHear`. The client only displays them.
4. **Team-only voice in team matches**, before (lobby, countdown) and during the match; never across teams.
5. **Free-for-all: silent by default.** Match-wide voice only if the server flag `matchWideInFreeForAll` is on.
6. **Voice ends when the match ends** (`ended`, `resultsPosted`); never in campaign missions (single player).
7. Controls: join / leave, mute self, **deafen**, **per-participant mute** (local, never reveals who muted whom), **report** (reason capped at 200 characters, goes to moderation), disconnect.
8. Every player can turn voice fully off in Settings; the setting must default to off for minors (age policy is a product decision, not decided here).
9. Accessibility: voice never replaces on-screen information; the game must stay fully playable without it.

## Provider interface

`VoiceProvider.createSession(request)` returns `VoiceResult<VoiceSession>` (no exceptions). A session exposes `status`, `selfMuted`, `deafened`, `permissions`, `micPermission`, `join`, `leave`, `setSelfMuted`, `setDeafened`, `setParticipantMuted`, `report`, `requestMicrophone`, `setPhase` (the match phase changed; ending closes the session) and `disconnect`. The policy input is `{ game, phase, flags: { voiceEnabled, matchWideInFreeForAll } }`.

## Prerequisites before any real implementation

- **Signalling and media**: a service that authenticates a participant against the match (the same token as the online back end), issues short-lived room credentials and routes audio only to the audience `audienceOf` returns. Choose peer-to-peer (needs STUN/TURN and exposes players' network addresses to each other: a privacy risk) or a server-side relay (SFU, recommended). Neither is chosen.
- **Server-side enforcement of team permissions**: the media server must apply the audience computed by the game server per speaker; a modified client must not be able to join another team's channel. The client's own policy copy is for drawing the UI only.
- **Moderation**: report intake, evidence handling (recording is a legal and privacy question: undecided), mute / ban tooling, rate limits, a human review process, a policy for minors.
- **Permissions UX**: an explicit microphone prompt flow, clear "who can hear you" indicators, push-to-talk option.
- **Real-device testing**: iOS Safari, Android Chrome, desktop browsers, Bluetooth headsets, echo cancellation, background tab / interruption behaviour, bad networks, reconnect after a drop. None of this has been done or can be done in this repository's test environment.
- **Legal / privacy review** (consent, retention, data protection) and a security review.
- **Static build rule**: a real provider must live behind a build-time flag like the online adapter (`docs/ONLINE_ARCHITECTURE.md`) so the Pages build stays free of WebRTC code, and `check:static` must keep passing for the default build.

## Tests

`tests/voice/voice.test.ts`: the policy (team-only, free-for-all off / on, ends with the match, off flag, missions, deafen, determinism), the null provider (disabled; no device, peer-connection or network global touched), and the mock session (default muted, explicit microphone grant, denied microphone, no speaking in free-for-all, deafen / mute / report, ends with the match).
