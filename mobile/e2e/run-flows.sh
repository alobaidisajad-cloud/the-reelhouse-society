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
# No on-screen keyboard. Maestro types by injecting key events, and they pass
# through the keyboard app first: on an email field Gboard stalled them mid-
# address ("e2e_member@e", then nothing for minutes, runs 36500199970 and
# 36566533738) and opened its own menus. A member taps keys; a test injects
# them. With no input method the injected keys reach the field itself. (So the
# flows never call hideKeyboard: in Maestro it presses Back.)
# The APPS are disabled, not the input methods: Android keeps one input method
# enabled whatever is disabled (run 36579267804: Gboard stayed, its clipboard
# covered the password field, and the password went into the email field).
# As root (a google_apis image allows it): the shell user may not disable a
# system app (run 36590647413: both stayed). Android's own answer is printed.
rooted="$(adb root 2>&1 | tr -d '\r')"
adb wait-for-device
answers=""
for pkg in $(adb shell ime list -a -s | tr -d '\r' | sed 's#/.*##' | sort -u); do
  answers="${answers} ${pkg}: $(adb shell pm disable "${pkg}" 2>&1 | tr -d '\r' | tr '\n' ' ');"
done
# Which input methods are ENABLED is a setting of its own, and it outlived the
# apps (run 36602917035: both "new state: disabled", both still listed). It is
# cleared, and Android is given a moment to redraw its list from what is left.
adb shell settings delete secure enabled_input_methods > /dev/null 2>&1
adb shell settings delete secure default_input_method > /dev/null 2>&1
for _ in 1 2 3 4 5 6 7 8 9 10; do
  left="$(adb shell ime list -s | tr -d '\r' | tr '\n' ' ')"
  [ -z "${left// /}" ] && break
  sleep 2
done
echo "root: ${rooted} | ${answers} | input methods left: [${left}]"
# Nor an autofill service: the email fields ask for autofill (autoComplete
# "email"), and with the keyboards gone typing still stalled at the same place,
# "e2e_member@e" (run 36628647938), while Android's AutofillManager inspected the
# field. A member's phone offers their saved address; a test types its own.
autofill="$(adb shell settings put secure autofill_service null 2>&1; adb shell settings get secure autofill_service | tr -d '\r')"
echo "autofill service: ${autofill}"
if [ -n "${left// /}" ]; then
  enabled="$(adb shell settings get secure enabled_input_methods | tr -d '\r')"
  echo "::error title=A keyboard app is still on the device::left: ${left} | enabled setting: ${enabled} | root: ${rooted} | Android said:${answers} — every flow that types would fail behind it."
  exit 1
fi
adb logcat -c   # this run's log only, so a crash below is this run's crash

# The runner's memory every 30 seconds, so a device that vanishes mid-run can be
# read against what the machine had left when it did.
( while true; do echo "$(date +%T) $(free -m | awk '/^Mem:/ {print "used " $3 "M, free " $4 "M, available " $7 "M"}')"; sleep 30; done ) > "$OUT/memory.txt" 2>&1 &
sampler=$!
# The device's log, copied to the runner as it is written: when the emulator
# dies, what it said up to that moment is still here, and each flow's own log is
# cut from this copy without asking the device.
adb logcat -v threadtime > "$OUT/logcat-stream.txt" 2>/dev/null &
streamer=$!
# The emulator's own words, which go to the job's log, readable only signed in.
# It has vanished mid-flow with no memory kill, no kernel report and no crash
# dump (run 36678849758, during film_log): what it said last is the one account
# left. The pipe opened through /proc is the same pipe, so a line read here is
# not in the job's log; the copy is printed there when the flows end.
said=""
qemu=$(pgrep -f 'qemu-system' | head -n 1)
if [ -n "$qemu" ]; then
  for fd in 1 2; do cat "/proc/$qemu/fd/$fd" >> "$OUT/emulator-said.txt" 2>/dev/null & said="$said $!"; done
fi
trap 'kill $sampler $streamer $said 2>/dev/null' EXIT

# One flow at a time: Maestro's records keep no screen for a failed step, so the
# screen is read the moment a flow fails, before the next one relaunches the app.
# The flows share a budget well inside the job's (a job that runs out is killed
# with nothing explained), and each has at most ten minutes of it.
MINUTES=${E2E_FLOWS_MINUTES:-35}
DEADLINE=$(( $(date +%s) + MINUTES * 60 ))
mkdir -p "$OUT/flow-reports" "$OUT/flow-hierarchy"
: > "$OUT/maestro.log"
rc=0
gone=0
for flow in $(ls "$FLOWS"/*.yaml | grep -v '/config\.yaml$' | sort); do
  name=$(basename "$flow" .yaml)
  if [ $gone -eq 1 ]; then
    echo "[Skipped] $name (the emulator was gone)" >> "$OUT/maestro.log"; continue
  fi
  left=$(( DEADLINE - $(date +%s) ))
  if [ $left -le 60 ]; then
    echo "[Skipped] $name (the flows' ${MINUTES} minutes ran out)" >> "$OUT/maestro.log"; rc=1; continue
  fi
  echo "── $name" >> "$OUT/maestro.log"
  # The device's clock as the flow starts, so its log can be read on its own.
  # (Quoted twice: adb hands the device's shell one line, which splits it again.)
  since=$(timeout 20 adb shell "date +'%m-%d %H:%M:%S.000'" 2>/dev/null | tr -d '\r')
  timeout --signal=INT --kill-after=30 "$(( left < 600 ? left : 600 ))s" "$MAESTRO" test "$flow" \
    -e E2E_MEMBER_EMAIL="$E2E_MEMBER_EMAIL" \
    -e E2E_MEMBER_PASSWORD="$E2E_MEMBER_PASSWORD" \
    -e E2E_MEMBER_USERNAME="$E2E_MEMBER_USERNAME" \
    --format junit --output "$OUT/flow-reports/$name.xml" \
    --debug-output "$OUT/maestro-debug/$name" \
    >> "$OUT/maestro.log" 2>&1
  frc=$?
  if [ $frc -ne 0 ]; then
    rc=1
    [ $frc -eq 124 ] && echo "[Failed] $name (ran out of its time)" >> "$OUT/maestro.log"
    timeout 60 "$MAESTRO" hierarchy > "$OUT/flow-hierarchy/$name.json" 2>/dev/null || true
    # The windows Android had then, and what it still called drawing or
    # animating: the driver waits on every one of them after each key it types.
    timeout 20 adb shell dumpsys window windows 2>/dev/null | tr -d '\r' \
      | grep -E 'Window #[0-9]+|mDrawState=|nimat' > "$OUT/flow-hierarchy/$name.wm" || true
    # The device's log for this flow alone: what the driver skipped as invisible,
    # and what Android and the app said (flow-screens.mjs reads both). Its lines
    # begin "MM-DD HH:MM:SS.mmm", which compare as text within the run.
    sleep 2   # the copy is a moment behind the device
    [ -n "$since" ] && awk -v s="$since" '($1 " " $2) >= s' "$OUT/logcat-stream.txt" > "$OUT/flow-hierarchy/$name.log"
    timeout 20 adb get-state > /dev/null 2>&1 || { gone=1; echo "[Gone] the emulator went away during $name" >> "$OUT/maestro.log"; }
  fi
done
cat "$OUT/maestro.log"
if [ -s "$OUT/emulator-said.txt" ]; then echo "── what the emulator said"; cat "$OUT/emulator-said.txt"; fi
grep -E '^\[(Passed|Failed|Skipped|Gone)\]' "$OUT/maestro.log" > "$OUT/maestro-summary.txt" || true
# Everything below that asks the device waits for it forever if it is gone, so
# each such call has a limit, and a vanished device is reported as what it is.
alive=1
timeout 20 adb get-state > /dev/null 2>&1 || alive=0
if [ $alive -eq 0 ]; then
  { echo "adb no longer sees the emulator. The runner's memory, every 30s up to now:"
    tail -n 12 "$OUT/memory.txt"
    echo "The kernel on memory it had to reclaim by killing:"
    sudo -n dmesg 2>/dev/null | grep -iE 'out of memory|killed process|oom-kill' | tail -n 8 || true
    # How the emulator's own process ended, when it was not for memory: a
    # segfault or a trap the kernel logged, and any crash dump it left.
    echo "The kernel on the emulator's process (a segfault or trap):"
    sudo -n dmesg 2>/dev/null | grep -iE 'qemu|emulator|segfault|general protection|traps:' | tail -n 8 || true
    echo "Crash dumps the emulator left:"
    find /tmp/android-* "$HOME/.android" -name '*.dmp' -mmin -60 2>/dev/null | head -n 4 || true
    echo "Emulator processes still running:"
    pgrep -af 'qemu-system|emulator' | cut -c1-160 | head -n 4 || true
    echo "The emulator's own last words:"
    if [ -s "$OUT/emulator-said.txt" ]; then tail -n 12 "$OUT/emulator-said.txt" | cut -c1-200
    elif [ -z "$qemu" ]; then echo "(its process was not found when the flows began)"
    else echo "(it said nothing)"; fi
    echo "The device's last words (its log as copied to the runner; errors, then the final lines):"
    grep -E ' [EF] |FATAL|ANR in|not responding|crash' "$OUT/logcat-stream.txt" | tail -n 12
    echo "…"
    tail -n 8 "$OUT/logcat-stream.txt"
  } > "$OUT/device-gone.txt" 2>&1
  node mobile/e2e/annotate.mjs "The emulator went away during the flows" "$OUT/device-gone.txt"
fi
if [ $rc -ne 0 ]; then
  node mobile/e2e/annotate.mjs "E2E flows failed" "$OUT/maestro-summary.txt"
  # Each failed flow's step, why, and its OWN screen at that moment. (A step
  # carries at most ten notices; the rest are on the run's summary.)
  n=0
  for f in $(node mobile/e2e/flow-screens.mjs "$OUT/maestro-debug" "$OUT/flow-screens" "$OUT/flow-hierarchy"); do
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
