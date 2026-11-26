# Voice chat: technical design (nothing is built; no audio path exists)

Extends `docs/VOICE_CHAT_DESIGN.md` (client interfaces, pure policy `src/voice/policy.ts`, requirements 1-9). This adds the **server** design. In this branch the platform contributes the eligibility layer and a gateway seam (`comms/voice.ts`): `GET /v1/voice/status`, `POST /v1/voice/token` (403 for ineligible, 503 "not available yet" for everyone else), and the relay filter with `kind: 'voice'`.

## 1. Who may speak and hear (two layers, intersected)

| Layer | Owner | Rule |
| --- | --- | --- |
| Account eligibility | **platform** | adult **registered** account; no `voice` restriction; the player turned voice on in their settings (default off); never auto-prompting the microphone; blocks, mutes (both ways), suspended / deleted accounts excluded |
| Match audience | **match server** (or the token issuer) via `permissionsFor` | team games: team-only; free-for-all: silent unless the server flag says match-wide; none after the match ends; never in a mission |

The SFU enforces the **per-speaker audience** the issuer computed; a client's own copy of the policy only draws the UI. A parties-only voice room (lobby) uses layer 1 only.

## 2. Architecture options

| Option | Fit | Cost / risk |
| --- | --- | --- |
| **Peer-to-peer WebRTC mesh** | up to about 4 people | every peer sees every other's IP address (privacy and harassment risk, DoS), N^2 uplinks on phones: **rejected** |
| **Self-hosted SFU: LiveKit (Apache-2.0)** | team of 16 / match of 32; ships TURN, simulcast-free audio rooms, server SDKs (Node), JWT room tokens that map directly to our `grant()`, webhooks for join / leave | we run it: HA, scaling, TURN capacity, monitoring; recommended **first choice** |
| Self-hosted mediasoup / Janus | maximal control | more engineering (signalling, room tokens, scaling) for the same result |
| Managed voice (Agora, Daily, other) | fastest to ship | per-participant-minute fees with the audience size we expect, vendor data processing (cross-border), less control of recording / moderation; price must be quoted, none is assumed here |
| Client-side only (no server) | – | cannot enforce audience: **rejected** |

Signalling = the platform: `POST /v1/voice/token` verifies eligibility and returns a short-lived (about 60 s to join) SFU room token whose grants encode `canHear` / `audience`; the SFU enforces them. Room names are opaque (`party:<id>`, `match:<id>:team:<n>`). A token is single use; leaving the party or ending the match revokes the participant (SFU server API). **TURN is mandatory** in Nigeria: carrier-grade NAT and symmetric NATs on mobile data defeat direct paths; budget TURN relay capacity as a real share of sessions.

## 3. Client behaviour (mirrors requirements 1-9)

Default muted; the first unmute is an explicit tap that triggers the browser / Android / iOS permission prompt; push-to-talk is the default input mode on touch; deafen; per-participant local mute; one-tap report that records the participant list and timestamps (see Moderation); voice never replaces on-screen information; a **Data Saver** player gets voice off by default; echo cancellation, noise suppression and automatic gain on; Opus at 24 kbps with DTX (silence sends almost nothing) and FEC for loss.

## 4. Bandwidth and cost model (assumptions are explicit; replace with measurements)

- Opus voice 24-32 kbps per active speaker; DTX removes silence; assume 15-30 % of a team talks at any time. A listener receives at most the loudest 3 streams (SFU "last-N").
- Per listener download: 3 streams x 32 kbps = **about 100 kbps** worst case while several people talk; average far lower. Per speaker upload: about 32 kbps.
- A 32-fighter match as two teams of 16: worst-case SFU egress 32 listeners x 100 kbps = **about 3.2 Mbps**, or roughly **120 MB over a 5-minute match** if everyone listened to three speakers the whole time; a realistic average is a quarter to a half of that. Compare the game state itself: about 3 MB per player per match (`CITY_RUMBLE_ONLINE.md` section 9), about 100 MB for 32 players: **voice can double egress** for a fully talkative match.
- Cost = (SFU egress + TURN relay egress) x provider rate + the SFU's CPU (audio-only is light: a few thousand concurrent audio streams per core is the usual order for an SFU without transcoding) + operations time. Obtain quotes from at least two hosts for London / Frankfurt egress before a decision; no price is assumed here.
- For the player: voice in a 5-minute match is a few MB of data on a metered Nigerian plan; show it, default it off for Data Saver.

## 5. Moderation, privacy, safety

- **No recording by default.** Recording voice is a legal and privacy question (consent in every participant's jurisdiction, retention, who may listen). Without recordings a voice report cannot carry audio evidence: it carries who was in the room, when, and the reporter's note; a moderator can still act on patterns (many reports, history). **Decision needed**: no recording, or short rolling buffers kept only when a report is filed (needs explicit consent text at the first unmute).
- Minors never get voice (platform eligibility). Parents cannot be asked in-game (no guardian flow exists).
- Mute / block apply immediately both ways (the platform revokes the SFU subscription through the server API).
- A `voice` restriction (moderator or automatic) kicks the participant and refuses new tokens.
- Abuse of the push-to-talk channel (screaming, slurs, hate): reports + restrictions + the same human review queue as text.
- Latency: host the SFU in the same region as the match server (London / Frankfurt for Lagos players per the latency analysis); voice is tolerant (150-250 ms one way) but echo and jitter on mobile data need the jitter buffer defaults.

## 6. Work plan and gates

1. Founder decisions: do we ship voice, recording policy, minors policy (**recommended: no voice for under 18, ever, in the first release**).
2. Spike: LiveKit locally in Docker; a `LiveKitGateway implements VoiceGateway` (token with room + grants); two browsers, one phone on mobile data through TURN.
3. Platform: token endpoint (done as a seam), room revocation on block / leave / restriction, webhook handler for join / leave metrics.
4. Real-device matrix (iOS Safari, Android Chrome, Bluetooth, background / interruption, bad networks) as in `VOICE_CHAT_DESIGN.md`.
5. Legal review, privacy notice section, moderation staffing, then a closed beta behind a flag.
