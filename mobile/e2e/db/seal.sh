#!/usr/bin/env bash
# seal.sh <title> — production's host goes nowhere, from the runner or any container.
#
# Run on a CI runner after `supabase start`, before bootstrap.mjs (e2e.yml,
# load.yml, db-integration.yml). Two locks, so no container has to be trusted:
#   · the firewall rejects every address production's host resolves to, for ALL
#     container traffic (DOCKER-USER) — including containers with no shell, and
#     ones that start later (the functions runtime)
#   · production's name points at 0.0.0.0 on the runner, and inside every
#     container that has a shell to write it with
# Containers only: production sits behind Cloudflare, whose addresses are shared
# with other sites, and the runner keeps them for its own tools.
# Proved here from the runner by name; bootstrap.mjs proves it from inside the
# database, by name and by every address (E2E_PROD_IPS, written below).
set -euo pipefail
title="${1:?usage: seal.sh <title for the error annotation>}"
root="$(cd "$(dirname "$0")/../.." && pwd)"

HOST=$(node -e "console.log(new URL(require(process.argv[1]).build.production.env.EXPO_PUBLIC_SUPABASE_URL).hostname)" "$root/eas.json")
echo "E2E_PROD_HOST=$HOST" >> "$GITHUB_ENV"
V4=$(getent ahostsv4 "$HOST" | awk '{print $1}' | sort -u || true)
V6=$(getent ahostsv6 "$HOST" | awk '{print $1}' | grep ':' | sort -u || true)
[ -n "$V4" ] || { echo "::error title=$title::could not resolve $HOST to seal it"; exit 1; }

for ip in $V4; do sudo iptables -I DOCKER-USER -d "$ip" -j REJECT; done
for ip in $V6; do sudo ip6tables -I DOCKER-USER -d "$ip" -j REJECT 2>/dev/null || true; done
echo "E2E_PROD_IPS=$(echo $V4 | tr ' ' ',')" >> "$GITHUB_ENV"
echo "firewalled $(echo $V4 $V6 | wc -w) address(es) of $HOST for every container"

echo "0.0.0.0 $HOST" | sudo tee -a /etc/hosts > /dev/null
for c in $(docker ps --format '{{.Names}}' | grep reelhouse-e2e || true); do
  docker exec -u root "$c" sh -c "echo '0.0.0.0 $HOST' >> /etc/hosts" 2>/dev/null \
    && echo "named away in $c" || echo "no shell in $c — the firewall covers it"
done

if curl -sS -m 5 -o /dev/null "https://$HOST"; then
  echo "::error title=$title::the runner can still reach $HOST by name"; exit 1
fi
echo "The runner cannot reach $HOST by name; bootstrap.mjs proves no container can reach any of its addresses."
