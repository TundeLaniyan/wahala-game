# Secret handling rules

## Inventory: what is secret and what is not

| Item | Secret? | Where it lives | Notes |
| --- | --- | --- | --- |
| `RUMBLE_METRICS_TOKEN` | **Yes** | `ops/env/server.local.env` on the host (git-ignored); the monitor's environment | 32 random bytes: `openssl rand -hex 32`. Rotate on any exposure and at the end of each test. |
| TLS private key (`privkey.pem`) | **Yes** | Host only (`ops/edge/certs/`, git-ignored, mode 600) | Never in an image, repo or chat. Self-signed dev keys are throwaway. |
| Alert webhook URL (Slack/Discord/Telegram) | **Yes** (anyone with it can post) | Monitor's environment / host | `check-secrets.sh` flags Slack and Discord webhook URLs. |
| Cloud/DNS/provider credentials, SSH keys | **Yes** | Operator's machine / password manager | Use a scoped API token; a separate account/project for WAHALA. |
| `WAHALA_ONLINE_URL`, allowed origins, ports, game tuning | **No** | `.env.example`, docs, compiled into the page | The server URL is public by design. |
| Private room codes | **Sensitive** | Server memory and **server logs** (F11) | Their only protection. Short log retention; do not paste logs publicly. |
| Reconnection tokens / session ids | Sensitive, ephemeral | Client memory only | Never logged by nginx (route class only). |

## Rules

1. **No secret in git, ever.** Templates are `*.example` with an empty value; filled copies match `ops/.gitignore` (`env/*.env`, `edge/certs/`, `*.pem`, `*.key`). Run `ops/scripts/check-secrets.sh` before every push (it also fails if a filled env file exists and is *not* ignored). CI should run it plus GitHub secret scanning/push protection.
2. **Secrets are created where they are used.** Generate the metrics token and certificates on the host; do not move them through chat, tickets or screenshots. An AI agent session (including this one) never needs the real values.
3. **The browser never gets a secret.** `WAHALA_*` and `VITE_*` variables are compiled into public JavaScript. No token, key or password may use those prefixes.
4. **Least privilege.** The container runs as uid 1000, read-only filesystem, no capabilities. The monitor gets only the metrics token. The provider token used for deploys can create/destroy the one VM and nothing else.
5. **Containers get secrets from `env_file` at run time, not `ARG`/`ENV` at build time.** The Dockerfile has none; `docker history` shows no token.
6. **Rotate** after any suspected leak, when a team member leaves, and after every private test. Rotation is a restart (`RUMBLE_METRICS_TOKEN` is read at start).
7. **Logs are sensitive** (room codes). Rotate (3 × 10 MB), do not forward to third parties without a decision, redact before sharing.
8. **Leak response:** revoke/rotate first, then clean history (`git filter-repo`), then notify. A token pushed to a public repository is compromised from that moment, even if deleted.
