#!/usr/bin/env bash
# Starts the local Supabase stack for a sealed workflow, from mobile/e2e.
#
#   bash mobile/e2e/start-stack.sh "<services to leave out, comma-separated>" "<what is starting>"
#
# The runner's Docker can fail to wire a container's network as the stack
# starts ("failed to set up container networking"), a fault of the machine,
# not of anything this repo holds. That one failure is tried once more, after
# the half-started stack is stopped, and the run is told so. Any other failure
# stops the run at once, its log's last lines shown under its own name.
set -u
EXCLUDE="$1"
WHAT="$2"
HERE="$(cd "$(dirname "$0")" && pwd)"
LOG="${RUNNER_TEMP:-/tmp}/start-stack.log"
RUNNER_FAULT='failed to set up container networking|driver failed programming external connectivity'

start() { (cd "$HERE" && supabase start -x "$EXCLUDE") > "$LOG" 2>&1; }

start; rc=$?
cat "$LOG"
if [ $rc -ne 0 ] && grep -qE "$RUNNER_FAULT" "$LOG"; then
  grep -E "$RUNNER_FAULT" "$LOG" | head -n 3 > "${LOG}.fault"
  node "$HERE/annotate.mjs" "$WHAT started once more (the runner's Docker could not wire a container)" "${LOG}.fault" notice
  (cd "$HERE" && supabase stop --no-backup) > /dev/null 2>&1 || true
  start; rc=$?
  cat "$LOG"
fi
if [ $rc -ne 0 ]; then
  tail -n 30 "$LOG" > "${LOG}.tail"
  node "$HERE/annotate.mjs" "$WHAT would not start" "${LOG}.tail"
fi
exit $rc
