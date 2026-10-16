#!/usr/bin/env bash
# seal-vendors.sh <title> — in the functions world, the outside services the
# functions call go nowhere from any container, so a call that misses its
# stand-in fails the run instead of reaching the service.
#
# Run after warm.mjs (the functions' imports are loaded and kept), as seal.sh
# seals production's host: the firewall rejects every address each host
# resolves to for all container traffic (DOCKER-USER), and each name points at
# 0.0.0.0 inside every container that has a shell to write it with. The runner
# itself keeps them (its own tools share the CDNs). Each host is named by the
# function that would call it.
set -euo pipefail
title="${1:?usage: seal-vendors.sh <title for the error annotation>}"

HOSTS=(
  exp.host                # notify-push: Expo's push API
  api.revenuecat.com      # sync-entitlement, revenuecat-webhook: the store's record
  api.themoviedb.org      # tmdb-proxy, sync-films
  www.theguardian.com     # fetch-rss: the one allowed feed host
  theguardian.com
  api.resend.com          # send-email
)

sealed=0
for host in "${HOSTS[@]}"; do
  ips=$( (getent ahostsv4 "$host" || true) | awk '{print $1}' | sort -u)
  [ -n "$ips" ] || { echo "::error title=$title::could not resolve $host to seal it"; exit 1; }
  for ip in $ips; do sudo iptables -I DOCKER-USER -d "$ip" -j REJECT; sealed=$((sealed + 1)); done
  for c in $(docker ps --format '{{.Names}}' | grep reelhouse-e2e || true); do
    docker exec -u root "$c" sh -c "echo '0.0.0.0 $host' >> /etc/hosts" 2>/dev/null || true
  done
done

# Every rule is in place: one per address.
rules=$(sudo iptables -S DOCKER-USER | grep -c -- '-j REJECT' || true)
if [ "$rules" -lt "$sealed" ]; then
  echo "::error title=$title::$sealed addresses sealed, but DOCKER-USER holds $rules REJECT rules"; exit 1
fi
echo "sealed ${#HOSTS[@]} outside hosts ($sealed addresses) from every container"
