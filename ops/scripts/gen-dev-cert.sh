#!/usr/bin/env bash
# LOCAL VALIDATION ONLY: a self-signed certificate for localhost + this machine's names/IPs, into ops/edge/certs (git-ignored).
# Phones will not trust it. For a real deployment use a certificate from a public CA (docs/ops/HOSTING_ARCHITECTURE.md).
set -euo pipefail
cd "$(dirname "$0")/../edge"
mkdir -p certs
extra="${1:-}"   # optional extra IP, e.g. the laptop's LAN address
san="DNS:localhost,IP:127.0.0.1"
[ -n "$extra" ] && san="$san,IP:$extra"
openssl req -x509 -newkey rsa:2048 -nodes -days 14 -subj "/CN=localhost" -addext "subjectAltName=$san" \
  -keyout certs/privkey.pem -out certs/fullchain.pem 2>/dev/null
chmod 600 certs/privkey.pem
echo "wrote ops/edge/certs/{fullchain,privkey}.pem (self-signed, 14 days, SAN: $san)"
