#!/usr/bin/env bash
# Starts the local Supabase stack for a sealed workflow, from mobile/e2e.
#
#   bash mobile/e2e/start-stack.sh "<services to leave out, comma-separated>" "<what is starting>"
#
# The stack's ports (every `port = N` in supabase/config.toml) lie inside
# Linux's range for the machine's own outgoing connections (32768-60999): any
# download on the runner can be lent one, and the container that needs it then
# cannot bind it ("address already in use"). So the ports are first reserved,
# which stops the kernel lending them from then on, and the start waits for any
# connection already holding one to let it go.
#
# The runner's Docker can also fail to wire a container's network as the stack
# starts ("failed to set up container networking"), a fault of the machine,
# not of anything this repo holds. Those failures are tried once more, after
# the half-started stack is stopped and the ports are free, and the run is told
# so. Any other failure stops the run at once, its log's last lines shown under
# its own name.
set -u
EXCLUDE="$1"
WHAT="$2"
HERE="$(cd "$(dirname "$0")" && pwd)"
LOG="${RUNNER_TEMP:-/tmp}/start-stack.log"
RUNNER_FAULT='failed to set up container networking|driver failed programming external connectivity|address already in use'
# How long a port held by another connection is waited for, in seconds.
PORT_WAIT="${STACK_PORT_WAIT:-90}"

PORTS="$(grep -E '^[a-z_]*port = [0-9]+' "$HERE/supabase/config.toml" | grep -oE '[0-9]+$' | sort -n | paste -sd, -)"

reserve() {
  local had all
  had="$(sysctl -n net.ipv4.ip_local_reserved_ports 2>/dev/null || true)"
  all="$(printf '%s,%s' "$had" "$PORTS" | sed 's/^,//; s/,$//')"
  if ! sudo -n sysctl -qw "net.ipv4.ip_local_reserved_ports=$all" > /dev/null 2>&1; then
    printf 'could not reserve %s\n' "$PORTS" > "${LOG}.reserve"
    node "$HERE/annotate.mjs" "$WHAT — its ports could not be reserved" "${LOG}.reserve" warning
  fi
}

# The stack's ports another connection holds now, one per line.
held() { ss -Htan 2>/dev/null | awk '{ n = split($4, a, ":"); print a[n] }' | grep -xE "${PORTS//,/|}" | sort -u; }

wait_free() {
  local waited=0
  while [ -n "$(held)" ] && [ "$waited" -lt "$PORT_WAIT" ]; do sleep 1; waited=$((waited + 1)); done
  if [ -n "$(held)" ]; then
    held | sed 's/^/still held: /' > "${LOG}.held"
    node "$HERE/annotate.mjs" "$WHAT — a port it needs was still held after ${PORT_WAIT} s" "${LOG}.held" warning
  fi
}

start() { (cd "$HERE" && supabase start -x "$EXCLUDE") > "$LOG" 2>&1; }

reserve
wait_free
start; rc=$?
cat "$LOG"
if [ $rc -ne 0 ] && grep -qE "$RUNNER_FAULT" "$LOG"; then
  grep -E "$RUNNER_FAULT" "$LOG" | head -n 3 > "${LOG}.fault"
  node "$HERE/annotate.mjs" "$WHAT started once more (the runner's Docker could not wire a container)" "${LOG}.fault" notice
  (cd "$HERE" && supabase stop --no-backup) > /dev/null 2>&1 || true
  wait_free
  start; rc=$?
  cat "$LOG"
fi
if [ $rc -ne 0 ]; then
  tail -n 30 "$LOG" > "${LOG}.tail"
  node "$HERE/annotate.mjs" "$WHAT would not start" "${LOG}.tail"
fi
exit $rc
