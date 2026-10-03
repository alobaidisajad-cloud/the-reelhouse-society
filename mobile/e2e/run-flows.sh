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
# Kept for the keyboard's room (below), which turns one back on for a tap.
imes_all="$(adb shell ime list -a -s | tr -d '\r')"
answers=""
for pkg in $(echo "$imes_all" | sed 's#/.*##' | sort -u); do
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
trap 'kill $sampler $streamer 2>/dev/null' EXIT

# One flow at a time: Maestro's records keep no screen for a failed step, so the
# screen is read the moment a flow fails, before the next one relaunches the app.
# The flows share a budget well inside the job's (a job that runs out is killed
# with nothing explained), and each has at most ten minutes of it.
MINUTES=${E2E_FLOWS_MINUTES:-42}
DEADLINE=$(( $(date +%s) + MINUTES * 60 ))
mkdir -p "$OUT/flow-reports" "$OUT/flow-hierarchy"
: > "$OUT/maestro.log"
rc=0
gone=0
# ── THE KEYBOARD'S ROOM ───────────────────────────────────────────────────────
# The flows type with no keyboard on the device, so none of them can see
# whether a screen makes room for one. Each probe reaches its screen the same
# way, then a keyboard is turned on for one tap, and Android's own window list
# says where the keyboard's top edge is. keyboard-room.mjs compares it with the
# thing the member needs, and fails when it is under the keyboard — or when no
# keyboard showed, since then nothing was measured. They run before the flows,
# so the flows' shared budget can never leave them unmeasured.
keys_on() {
  for pkg in $(echo "$imes_all" | sed 's#/.*##' | sort -u); do timeout 20 adb shell pm enable "$pkg" > /dev/null 2>&1; done
  for ime in $imes_all; do timeout 20 adb shell ime enable "$ime" > /dev/null 2>&1; done
  timeout 20 adb shell ime set "$(echo "$imes_all" | grep -m 1 latin || echo "$imes_all" | head -n 1)" > /dev/null 2>&1
}
keys_off() {
  for pkg in $(echo "$imes_all" | sed 's#/.*##' | sort -u); do timeout 20 adb shell pm disable "$pkg" > /dev/null 2>&1; done
  timeout 20 adb shell settings delete secure enabled_input_methods > /dev/null 2>&1
  timeout 20 adb shell settings delete secure default_input_method > /dev/null 2>&1
}
mkdir -p "$OUT/keyboard-room"
: > "$OUT/keyboard-room.txt"
room_rc=0
for probe in 'stack|"FILE THE STACK"' 'log|#review-input'; do
  name=${probe%%|*}; target=${probe#*|}
  if [ $gone -eq 1 ]; then echo "$name: skipped (the emulator was gone)" >> "$OUT/keyboard-room.txt"; room_rc=1; continue; fi
  left=$(( DEADLINE - $(date +%s) ))
  if [ $left -le 120 ]; then echo "$name: skipped (the flows' ${MINUTES} minutes ran out)" >> "$OUT/keyboard-room.txt"; room_rc=1; continue; fi
  keys_off
  # A flow's own time: signing in types about fifty keys, and on a run where
  # each key waits ten seconds (see the flows below) that alone is 500.
  began=$(date +%s)
  since=$(timeout 20 adb shell "date +'%m-%d %H:%M:%S.000'" 2>/dev/null | tr -d '\r')
  timeout --signal=INT --kill-after=30 "$(( left < 600 ? left : 600 ))s" "$MAESTRO" test "$FLOWS/keyboard/$name.yaml" \
      -e E2E_MEMBER_EMAIL="$E2E_MEMBER_EMAIL" -e E2E_MEMBER_PASSWORD="$E2E_MEMBER_PASSWORD" \
      -e E2E_MEMBER_USERNAME="$E2E_MEMBER_USERNAME" \
      --debug-output "$OUT/maestro-debug/keyboard-$name" > "$OUT/keyboard-room/$name.log" 2>&1
  prc=$?
  if [ $prc -ne 0 ]; then
    # Where it stopped: the steps it last reported (never a typed value: one is
    # the password), how long it ran, and what was on the screen then. A probe
    # cut off by its time prints no failure line of its own.
    { echo "$name: the screen was not reached after $(( $(date +%s) - began ))s$([ $prc -eq 124 ] && echo ', when its time ran out'); its last steps:"
      grep -viE 'input ?text' "$OUT/keyboard-room/$name.log" | grep -E '[A-Za-z]' | tail -n 6 | sed 's/^/  /'; } >> "$OUT/keyboard-room.txt"
    timeout 60 "$MAESTRO" hierarchy > "$OUT/keyboard-room/$name.json" 2>/dev/null
    node mobile/e2e/screen.mjs "$OUT/keyboard-room/$name.json" | head -n 14 | sed "s/^/  $name screen · /" >> "$OUT/keyboard-room.txt"
    # And the record a failed flow leaves (flow-screens.mjs reports it): the
    # screen, the windows Android had, and the device's log for this probe —
    # what the driver was kept waiting on while it typed.
    cp "$OUT/keyboard-room/$name.json" "$OUT/flow-hierarchy/$name.json" 2>/dev/null
    timeout 20 adb shell dumpsys window windows 2>/dev/null | tr -d '\r' \
      | grep -E 'Window #[0-9]+|mDrawState=|nimat' > "$OUT/flow-hierarchy/$name.wm" || true
    sleep 2   # the copy is a moment behind the device
    [ -n "$since" ] && awk -v s="$since" '($1 " " $2) >= s' "$OUT/logcat-stream.txt" > "$OUT/flow-hierarchy/$name.log"
    timeout 20 adb get-state > /dev/null 2>&1 || gone=1
    room_rc=1; continue
  fi
  keys_on
  timeout 120 "$MAESTRO" test "$FLOWS/keyboard/$name.tap.yaml" >> "$OUT/keyboard-room/$name.log" 2>&1
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    timeout 20 adb shell dumpsys input_method 2>/dev/null | grep -q 'mInputShown=true' && break
    sleep 1
  done
  sleep 1   # the keyboard's own entrance, so its frame is where it stops
  timeout 20 adb shell dumpsys window windows 2>/dev/null | tr -d '\r' > "$OUT/keyboard-room/$name.windows.txt"
  timeout 60 "$MAESTRO" hierarchy > "$OUT/keyboard-room/$name.json" 2>/dev/null
  # Android's own dump of the app's window, measured first (keyboard-room.mjs).
  timeout 30 adb shell uiautomator dump /sdcard/keyboard-room.xml > /dev/null 2>&1
  timeout 20 adb exec-out cat /sdcard/keyboard-room.xml > "$OUT/keyboard-room/$name.xml" 2>/dev/null
  if ! node mobile/e2e/keyboard-room.mjs "$name" "$target" "$OUT/keyboard-room/$name.json" "$OUT/keyboard-room/$name.windows.txt" \
      "$OUT/keyboard-room/$name.xml" >> "$OUT/keyboard-room.txt"; then
    room_rc=1
    # What was on the screen, so a target that was not found says where it looked.
    node mobile/e2e/screen.mjs "$OUT/keyboard-room/$name.json" | head -n 14 | sed "s/^/  $name screen · /" >> "$OUT/keyboard-room.txt"
  fi
  # The keyboard window's own lines, so the measure can be checked by eye.
  awk '/Window #[0-9]+ Window\{[0-9a-f]+ u[0-9]+ InputMethod\}/ {p=1; print; next} /Window #[0-9]+/ {p=0} p' \
    "$OUT/keyboard-room/$name.windows.txt" | grep -E 'rame|Insets|isOnScreen|Visibility' | head -n 8 | sed "s/^ */  $name · /" >> "$OUT/keyboard-room.txt"
done
keys_off
if [ $room_rc -ne 0 ]; then
  rc=1
  node mobile/e2e/annotate.mjs "The keyboard covers what a member needs" "$OUT/keyboard-room.txt"
else
  node mobile/e2e/annotate.mjs "The keyboard's room" "$OUT/keyboard-room.txt" notice
fi

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
  # Every flow begins connected: one that failed with airplane mode on (it is
  # turned off again only at its own end) took the next flow down with it.
  timeout 20 adb shell cmd connectivity airplane-mode disable > /dev/null 2>&1 || true
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
    echo "Emulator processes still running:"
    pgrep -af 'qemu-system|emulator' | cut -c1-160 | head -n 4 || true
    # It ends with no kernel line and nothing of its own: its crash goes to the
    # system's handler. Run 36708544965 found it there — qemu-system-x86_64-headless,
    # SIGSEGV, its core kept by systemd-coredump (the ~1.5 GB the runner's page
    # cache grew by as it died). The renderer it died in is set in e2e.yml.
    echo "Where this runner sends a crashed process's core: $(cat /proc/sys/kernel/core_pattern 2>/dev/null)"
    echo "The system's crash reports (apport, systemd-coredump), newest first:"
    sudo -n ls -lt /var/crash /var/lib/systemd/coredump 2>/dev/null | head -n 8 || true
    sudo -n tail -n 8 /var/log/apport.log 2>/dev/null || true
    sudo -n coredumpctl --no-pager list 2>/dev/null | tail -n 4 || true
    sudo -n coredumpctl --no-pager info 2>/dev/null | grep -E 'Signal|Command Line|Executable|#[0-9]+ ' | head -n 24 || true
    echo "The out-of-memory daemon (it kills by memory pressure, and says so only in its journal):"
    sudo -n journalctl --no-pager -u systemd-oomd -n 6 2>/dev/null || true
    echo "The device's last words (its log as copied to the runner; errors, then the final lines):"
    grep -E ' [EF] |FATAL|ANR in|not responding|crash' "$OUT/logcat-stream.txt" | tail -n 12
    echo "…"
    tail -n 8 "$OUT/logcat-stream.txt"
  } > "$OUT/device-gone.txt" 2>&1
  node mobile/e2e/annotate.mjs "The emulator went away during the flows" "$OUT/device-gone.txt"
fi
# How long each screen took to show what it was opened for (useScreenReady),
# read from the device's log. With a ceilings file it is a gate; --complete
# only when every flow ran, so a cut-short run never blames a screen it skipped.
slow=0
times_args=()
[ -f mobile/e2e/screen-ceilings.json ] && times_args+=(--ceilings mobile/e2e/screen-ceilings.json)
[ $rc -eq 0 ] && [ $gone -eq 0 ] && times_args+=(--complete)
if node mobile/e2e/screen-times.mjs "$OUT/logcat-stream.txt" ${times_args[@]+"${times_args[@]}"} > "$OUT/screen-times.txt"; then
  node mobile/e2e/annotate.mjs "How long each screen took" "$OUT/screen-times.txt" notice
else
  slow=1
  node mobile/e2e/annotate.mjs "A screen is slower than its ceiling" "$OUT/screen-times.txt"
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
# A slow screen fails the run, after the flows' own report (which it is not part of).
[ $slow -eq 0 ] || rc=1
exit $rc
