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

"$MAESTRO" test "$FLOWS" \
  -e E2E_MEMBER_EMAIL="$E2E_MEMBER_EMAIL" \
  -e E2E_MEMBER_PASSWORD="$E2E_MEMBER_PASSWORD" \
  -e E2E_MEMBER_USERNAME="$E2E_MEMBER_USERNAME" \
  --format junit --output "$OUT/maestro-report.xml" \
  --debug-output "$OUT/maestro-debug" \
  > "$OUT/maestro.log" 2>&1
rc=$?
cat "$OUT/maestro.log"

if [ $rc -ne 0 ]; then
  node mobile/e2e/annotate.mjs "E2E flows failed" "$OUT/maestro.log"
  "$MAESTRO" hierarchy > "$OUT/screen.json" 2>/dev/null || true
  node mobile/e2e/screen.mjs "$OUT/screen.json" > "$OUT/screen.txt"
  node mobile/e2e/annotate.mjs "What was on the screen when it failed" "$OUT/screen.txt" notice
  # What the APP said — not the whole emulator, whose own noise buried it:
  # Android's crash buffer (a native or Java crash of any process), the
  # JavaScript side's console, and every line from the app's process if it is
  # still alive.
  adb logcat -d > "$OUT/logcat.txt" 2>/dev/null || true
  adb logcat -d -b crash 2>/dev/null | grep -v "^--------- beginning of" > "$OUT/crashbuf.txt"
  {
    # A crash's NAME and message are at the top of its stack, and what caused
    # it in its "Caused by" lines; the bottom is just the draw loop it ran in.
    grep -E -m 2 -A 14 "FATAL EXCEPTION" "$OUT/crashbuf.txt"
    grep -E "Caused by" "$OUT/crashbuf.txt" | head -n 10
    adb logcat -d -s ReactNativeJS:V ReactNative:V 2>/dev/null | grep -v "^--------- beginning of" | tail -n 20
    pid=$(adb shell pidof com.reelhouse.society 2>/dev/null | tr -d '\r')
    [ -n "$pid" ] && adb logcat -d --pid="$pid" 2>/dev/null | grep -E " [EWF] " | tail -n 20
  } > "$OUT/crash.txt"
  [ -s "$OUT/crash.txt" ] || echo "(the app wrote nothing to the crash buffer or its own log)" > "$OUT/crash.txt"
  node mobile/e2e/annotate.mjs "What the app said before it failed (logcat)" "$OUT/crash.txt"
fi
exit $rc
