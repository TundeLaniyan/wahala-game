#!/usr/bin/env bash
# Fails if anything that is (or would be) committed looks like a secret. Run before every commit/push of ops work and in CI.
# Looks at tracked + untracked-but-not-ignored files, so a forgotten `git add` of a filled env file is caught.
# This is a tripwire for the obvious, not a scanner: see docs/ops/SECRETS.md for the rules and for gitleaks/GitHub secret scanning.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
bad=0
files=$(git ls-files -co --exclude-standard | grep -vE '^(reference/|public/|src/assets/|package-lock\.json$|server/package-lock\.json$)' || true)
hit() { echo "SECRET? $1"; bad=1; }
while IFS= read -r f; do
  [ -f "$f" ] || continue
  case "$f" in *.png|*.jpg|*.jpeg|*.webp|*.glb|*.mp3|*.mp4|*.woff2|*.ico|*.gz) continue;; esac
  grep -InE -- '-----BEGIN [A-Z ]*PRIVATE KEY-----' "$f" >/dev/null && hit "$f: private key block"
  grep -InE -- '(ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}' "$f" >/dev/null && hit "$f: GitHub token"
  grep -InE -- 'AKIA[0-9A-Z]{16}' "$f" >/dev/null && hit "$f: AWS access key id"
  grep -InE -- 'xox[abprs]-[A-Za-z0-9-]{10,}' "$f" >/dev/null && hit "$f: Slack token"
  grep -InE -- 'https://hooks\.slack\.com/services/[A-Za-z0-9/]+' "$f" >/dev/null && hit "$f: Slack webhook URL"
  grep -InE -- 'discord(app)?\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+' "$f" >/dev/null && hit "$f: Discord webhook URL"
  case "$f" in *.example|*.md|*.test.*|*.mjs|*.sh) ;; *)
    grep -InE -- '^(RUMBLE_METRICS_TOKEN|[A-Z_]*(SECRET|TOKEN|PASSWORD|API_KEY))=.+' "$f" >/dev/null && hit "$f: filled secret variable";;
  esac
done <<< "$files"
# filled env files must be ignored, not merely absent
for f in ops/env/server.local.env ops/env/prod.env ops/edge/certs/privkey.pem; do
  if [ -e "$f" ] && ! git check-ignore -q "$f"; then hit "$f exists and is NOT git-ignored"; fi
done
[ $bad -eq 0 ] && echo "check-secrets: nothing suspicious in $(echo "$files" | wc -l) files" 
exit $bad
