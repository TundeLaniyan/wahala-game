#!/usr/bin/env bash
# Creates a SELF-SIGNED certificate for local TLS tests of the proxy (never for players: browsers will not trust it).
#   ops/proxy/make-selfsigned.sh [hostname] [outdir]
set -euo pipefail
host="${1:-localhost}"
out="${2:-$(dirname "$0")/certs}"
mkdir -p "$out"
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -keyout "$out/privkey.pem" -out "$out/fullchain.pem" \
  -subj "/CN=$host" -addext "subjectAltName=DNS:$host,DNS:localhost,IP:127.0.0.1" 2>/dev/null
chmod 600 "$out/privkey.pem"
echo "wrote $out/fullchain.pem and $out/privkey.pem (valid 30 days, CN=$host)"
