#!/usr/bin/env bash
# run-flows.sh — install the E2E app on the emulator and run the Maestro flows.
#
# Run by e2e.yml inside the emulator step, and by `npm run test:e2e`, from
# anywhere: it works from the repository root. A failed flow explains itself
# on the run page: Maestro's own report as an error annotation, and what was on
# the screen at that moment as a notice.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1
# Maestro sends usage analytics unless told not to; nothing leaves the sealed world.
export MAESTRO_CLI_NO_ANALYTICS=1

APK=mobile/android/app/build/outputs/apk/release/app-release.apk
FLOWS=${E2E_FLOWS:-mobile/.maestro}
OUT=${RUNNER_TEMP:-/tmp}
MAESTRO=${MAESTRO_BIN:-$HOME/.maestro/bin/maestro}

adb install -r "$APK" || { echo "::error title=E2E::the app would not install"; exit 1; }
# A freshly booted emulator on a software GPU is slow enough that its own
# launcher misses a deadline, and Android puts "Pixel Launcher isn't
# responding" over everything — the flows then look for the app under a system
# dialog. Such dialogs are hidden (the app's own crash still reaches the log
# below), and any already showing is closed.
adb shell settings put global hide_error_dialogs 1
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS > /dev/null 2>&1 || true
adb logcat -c   # this run's log only, so a crash below is this run's crash

# The runner's memory every 30 seconds, so a device that vanishes mid-run can be
# read against what the machine had left when it did.
( while true; do echo "$(date +%T) $(free -m | awk '/^Mem:/ {print "used " $3 "M, free " $4 "M, available " $7 "M"}')"; sleep 30; done ) > "$OUT/memory.txt" 2>&1 &
sampler=$!
trap 'kill $sampler 2>/dev/null' EXIT

# The flows get a budget of their own, well inside the job's: a hang that ran
# into the job's limit would cancel the job, and everything below that explains
# a failure would never run.
MINUTES=${E2E_FLOWS_MINUTES:-35}
timeout --signal=INT --kill-after=60 "${MINUTES}m" "$MAESTRO" test "$FLOWS" \
  -e E2E_MEMBER_EMAIL="$E2E_MEMBER_EMAIL" \
  -e E2E_MEMBER_PASSWORD="$E2E_MEMBER_PASSWORD" \
  -e E2E_MEMBER_USERNAME="$E2E_MEMBER_USERNAME" \
  --format junit --output "$OUT/maestro-report.xml" \
  --debug-output "$OUT/maestro-debug" \
  > "$OUT/maestro.log" 2>&1
rc=$?
cat "$OUT/maestro.log"

if [ $rc -eq 124 ] || [ $rc -eq 137 ]; then
  # Where it stopped: the log's last lines are the flow and the step it was on.
  tail -n 40 "$OUT/maestro.log" > "$OUT/maestro-tail.txt"
  node mobile/e2e/annotate.mjs "E2E flows ran out of time after ${MINUTES} minutes — where they stopped" "$OUT/maestro-tail.txt"
fi
# Everything below that asks the device waits for it forever if it is gone, so
# each such call has a limit, and a vanished device is reported as what it is.
alive=1
timeout 20 adb get-state > /dev/null 2>&1 || alive=0
if [ $alive -eq 0 ]; then
  { echo "adb no longer sees the emulator. The runner's memory, every 30s up to now:"
    tail -n 12 "$OUT/memory.txt"
    echo "The kernel on memory it had to reclaim by killing:"
    sudo -n dmesg 2>/dev/null | grep -iE 'out of memory|killed process|oom-kill' | tail -n 8 || true
    echo "Emulator processes still running:"
    pgrep -af 'qemu-system|emulator' | cut -c1-160 | head -n 4 || true
  } > "$OUT/device-gone.txt" 2>&1
  node mobile/e2e/annotate.mjs "The emulator went away during the flows" "$OUT/device-gone.txt"
fi
if [ $rc -ne 0 ]; then
  node mobile/e2e/annotate.mjs "E2E flows failed" "$OUT/maestro.log"
  # Each failed flow's OWN screen, at the moment it failed — not the one left
  # on the emulator at the end, which is only ever the last flow's. (A step
  # carries at most ten notices; the rest are on the run's summary.)
  n=0
  for f in $(node mobile/e2e/flow-screens.mjs "$OUT/maestro-debug" "$OUT/flow-screens"); do
    n=$((n + 1))
    [ $n -le 9 ] && node mobile/e2e/annotate.mjs "$(basename "$f" .txt) at the moment it failed" "$f" notice
  done
  # A probe that finds nothing says so, and shows where it looked.
  if [ $n -eq 0 ]; then
    { echo "flow-screens found no flow records under $OUT/maestro-debug. What is there:"
      find "$OUT/maestro-debug" -maxdepth 6 2>/dev/null | head -n 60
      [ -d "$OUT/maestro-debug" ] || echo "(the folder was never made)"
      echo "and under ~/.maestro/tests:"
      find "$HOME/.maestro/tests" -maxdepth 3 2>/dev/null | head -n 30; } > "$OUT/debug-listing.txt"
    node mobile/e2e/annotate.mjs "No per-flow screens: where Maestro put its records" "$OUT/debug-listing.txt" notice
  fi
  if [ $alive -eq 1 ]; then
    timeout 60 "$MAESTRO" hierarchy > "$OUT/screen.json" 2>/dev/null || true
    node mobile/e2e/screen.mjs "$OUT/screen.json" > "$OUT/screen.txt"
    node mobile/e2e/annotate.mjs "What was on the screen after the last flow" "$OUT/screen.txt" notice
    # What the APP said — not the whole emulator, whose own noise buried it:
    # Android's crash buffer (a native or Java crash of any process), the
    # JavaScript side's console, and every line from the app's process if it is
    # still alive.
    timeout 30 adb logcat -d > "$OUT/logcat.txt" 2>/dev/null || true
    timeout 30 adb logcat -d -b crash 2>/dev/null | grep -v "^--------- beginning of" > "$OUT/crashbuf.txt"
    {
      # A crash's NAME and message are at the top of its stack, and what caused
      # it in its "Caused by" lines; the bottom is just the draw loop it ran in.
      grep -E -m 2 -A 14 "FATAL EXCEPTION" "$OUT/crashbuf.txt"
      grep -E "Caused by" "$OUT/crashbuf.txt" | head -n 10
      timeout 30 adb logcat -d -s ReactNativeJS:V ReactNative:V 2>/dev/null | grep -v "^--------- beginning of" | tail -n 20
      pid=$(timeout 20 adb shell pidof com.reelhouse.society 2>/dev/null | tr -d '\r')
      [ -n "$pid" ] && timeout 30 adb logcat -d --pid="$pid" 2>/dev/null | grep -E " [EWF] " | tail -n 20
    } > "$OUT/crash.txt"
    [ -s "$OUT/crash.txt" ] || echo "(the app wrote nothing to the crash buffer or its own log)" > "$OUT/crash.txt"
    node mobile/e2e/annotate.mjs "What the app said before it failed (logcat)" "$OUT/crash.txt"
  fi
fi
exit $rc
