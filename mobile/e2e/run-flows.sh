#!/usr/bin/env bash
# run-flows.sh — install the E2E app on the emulator and run the Maestro flows.
#
# Run by e2e.yml inside the emulator step, and by `npm run test:e2e`, from
# anywhere: it works from the repository root. A failed flow explains itself
# on the run page: Maestro's own report as an error annotation, and what was on
# the screen at that moment as a notice.
#
# It tells a hiccup in the test machinery from an answer about the app, and
# never hides the second (e2e/attempt.mjs holds the rule, and why):
#   - a flow or probe in which Maestro never began a step is run once more;
#   - a probe in which Maestro lost its connection to the phone is run once more;
#   - nothing else is: not a failed step, not a timeout, not a crash, not a flow
#     that had begun; at most three a run, and every one is a warning, "Run twice".
# And whatever the flows said, the app crashing or freezing at any moment of the
# run fails it (e2e/app-crashes.mjs): a flow can pass over a crash.
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
# cut from this copy without asking the device. It is the run's ONLY whole log:
# Maestro clears the device's own log as every flow starts (AndroidDriver's
# startDeviceLogCapture runs `logcat -c`), so `adb logcat -d` holds only the last.
adb logcat -v threadtime > "$OUT/logcat-stream.txt" 2>/dev/null &
streamer=$!
trap 'kill $sampler $streamer 2>/dev/null' EXIT

# One flow at a time: Maestro's records keep no screen for a failed step, so the
# screen is read the moment a flow fails, before the next one relaunches the app.
# The flows share a budget well inside the job's (a job that runs out is killed
# with nothing explained), and each has at most ten minutes of it.
MINUTES=${E2E_FLOWS_MINUTES:-42}
DEADLINE=$(( $(date +%s) + MINUTES * 60 ))
FLOW_LIST="$(ls "$FLOWS"/*.yaml | grep -v '/config\.yaml$' | sort)"
FLOW_COUNT=$(echo "$FLOW_LIST" | grep -c .)
# The flows' own time, kept from the warm-up and the probes (and their second
# attempts): two minutes a flow, measured at about one and a half (runs
# 37155828199, 37165878763: 14 flows in about 20 minutes of Maestro's own time).
# Counted from the flows, so a new flow raises it by itself.
PER_FLOW=${E2E_SECONDS_PER_FLOW:-120}
RESERVE=$(( FLOW_COUNT * PER_FLOW ))
RETRIES_MAX=3
mkdir -p "$OUT/flow-reports" "$OUT/flow-hierarchy" "$OUT/first-attempts" "$OUT/warmup"
: > "$OUT/maestro.log"
: > "$OUT/flow-times.txt"
: > "$OUT/retries.txt"
: > "$OUT/phone-fixes.txt"
rc=0
flows_failed=0   # a flow failed or never ran (rc also counts the probes, crashes, slow screens)
gone=0
retries=0

# GitHub keeps ten notices a step; the rest go to the run's summary, not nowhere.
notices=0
note() {
  if [ $notices -lt 10 ]; then
    node mobile/e2e/annotate.mjs "$1" "$2" notice; notices=$((notices + 1))
  else
    node mobile/e2e/annotate.mjs "$1" "$2" summary
  fi
}

# Before every Maestro run:
#  - no session left by an earlier Maestro. Maestro reuses a session whose
#    heartbeat is under 21 s old and then does NOT start its driver on the
#    phone (MaestroSessionManager, SessionStore); a Maestro this script killed
#    for its time leaves one. One Maestro runs at a time here, so none is live.
#  - the network on: a flow that failed with airplane mode on (it is turned off
#    again only at its own end) took the next flow down with it.
#  - Android's three animation scales at 0. e2e.yml's emulator sets them once
#    at boot; they are read and set again, and a change is reported, because a
#    window animation that runs holds every injected key (animation-waits.mjs).
settle_phone() {
  rm -rf "$HOME/.maestro/sessions"
  timeout 20 adb shell cmd connectivity airplane-mode disable > /dev/null 2>&1 || true
  local fixed="" s v
  for s in window_animation_scale transition_animation_scale animator_duration_scale; do
    v="$(timeout 20 adb shell settings get global "$s" 2>/dev/null | tr -d '\r')"
    case "$v" in
      0|0.0) ;;
      *) timeout 20 adb shell settings put global "$s" 0 > /dev/null 2>&1; fixed="${fixed} ${s} was '${v}';" ;;
    esac
  done
  [ -n "$fixed" ] && echo "before $1:${fixed} set to 0" >> "$OUT/phone-fixes.txt"
  return 0
}
# The device's clock, as its log lines begin. (Quoted twice: adb hands the
# device's shell one line, which splits it again.)
device_clock() { timeout 20 adb shell "date +'%m-%d %H:%M:%S.000'" 2>/dev/null | tr -d '\r'; }
# The device's log for one attempt alone, from its start. Its lines begin
# "MM-DD HH:MM:SS.mmm", which compare as text within the run.
cut_log() {
  sleep 2   # the copy is a moment behind the device
  if [ -n "$1" ]; then awk -v s="$1" '($1 " " $2) >= s' "$OUT/logcat-stream.txt" > "$2"; else : > "$2"; fi
}
device_state() { timeout 20 adb get-state > /dev/null 2>&1 && echo alive || echo gone; }
# A first attempt's records, set aside: the reports describe the attempt that
# counts, and the first is kept whole for the "Run twice" warning and the logs.
set_aside() {
  local name=$1 dest="$OUT/first-attempts/$1" f
  mkdir -p "$dest"
  shift
  for f in "$@"; do [ -e "$f" ] && mv "$f" "$dest/"; done
  return 0
}

# ── THE FIRST LAUNCH ──────────────────────────────────────────────────────────
# The app's first launch on the fresh phone, measured and never judged:
# animation-waits.mjs names any animation Android held its taps on, and a
# warm-up that does not finish is a warning (a crash in it still fails the run).
# It does not prevent the ten-second keys: in run 37201431874 the warm-up had
# no wait at all, and the next launch — the stack probe's — held every key on
# MainActivity's splash reveal (animationType starting_reveal) until the probe
# was run again.
settle_phone "the warm-up"
since=$(device_clock)
printf 'warm-up\t1\t%s\n' "$since" >> "$OUT/flow-times.txt"
began=$(date +%s)
timeout --signal=INT --kill-after=30 180s "$MAESTRO" test "$FLOWS/warmup/first_launch.yaml" \
    --format junit --output "$OUT/warmup/report.xml" \
    --debug-output "$OUT/warmup/maestro-debug" > "$OUT/warmup/maestro.out" 2>&1
wrc=$?
if [ $wrc -ne 0 ]; then
  cut_log "$since" "$OUT/warmup/device.log"
  { echo "The app's first launch, before the probes, did not finish (exit ${wrc}, $(( $(date +%s) - began ))s). It decides nothing; the probes and flows run as ever."
    node mobile/e2e/attempt.mjs --kind flow --exit "$wrc" --junit "$OUT/warmup/report.xml" --debug "$OUT/warmup/maestro-debug" \
      --log "$OUT/warmup/device.log" --left 0 --need 1 --retries 0 --max 0 --device "$(device_state)" | tail -n +3; } > "$OUT/warmup.txt"
  node mobile/e2e/annotate.mjs "The first-launch warm-up did not finish" "$OUT/warmup.txt" warning
fi

# ── THE KEYBOARD'S ROOM ───────────────────────────────────────────────────────
# The flows type with no keyboard on the device, so none of them can see
# whether a screen makes room for one. Each probe reaches its screen the same
# way, then a keyboard is turned on for one tap, and Android's own window list
# says where the keyboard's top edge is. keyboard-room.mjs compares it with the
# thing the member needs, and fails when it is under the keyboard — or when no
# keyboard showed, since then nothing was measured. They run before the flows,
# with what the flows' own time leaves (RESERVE), so they can never starve them.
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
  attempt=1
  while :; do
    if [ $gone -eq 1 ]; then echo "$name: skipped (the emulator was gone)" >> "$OUT/keyboard-room.txt"; room_rc=1; break; fi
    left=$(( DEADLINE - $(date +%s) ))
    # A flow's own time: signing in types about fifty keys, and on a run where
    # each key waits ten seconds (see animation-waits.mjs) that alone is 500.
    budget=$(( left - RESERVE ))
    [ $budget -gt 600 ] && budget=600
    if [ $budget -lt 120 ]; then
      echo "$name: skipped (${left}s left of the flows' ${MINUTES} minutes, and the flows keep ${RESERVE}s: raise E2E_FLOWS_MINUTES)" >> "$OUT/keyboard-room.txt"
      room_rc=1; break
    fi
    keys_off
    settle_phone "the $name probe"
    began=$(date +%s)
    since=$(device_clock)
    printf '%s probe\t%s\t%s\n' "$name" "$attempt" "$since" >> "$OUT/flow-times.txt"
    timeout --signal=INT --kill-after=30 "${budget}s" "$MAESTRO" test "$FLOWS/keyboard/$name.yaml" \
        -e E2E_MEMBER_EMAIL="$E2E_MEMBER_EMAIL" -e E2E_MEMBER_PASSWORD="$E2E_MEMBER_PASSWORD" \
        -e E2E_MEMBER_USERNAME="$E2E_MEMBER_USERNAME" \
        --format junit --output "$OUT/flow-reports/keyboard-$name.xml" \
        --debug-output "$OUT/maestro-debug/keyboard-$name" > "$OUT/keyboard-room/$name.log" 2>&1
    prc=$?
    if [ $prc -ne 0 ]; then
      took=$(( $(date +%s) - began ))
      cut_log "$since" "$OUT/flow-hierarchy/$name.log"
      left=$(( DEADLINE - $(date +%s) ))
      verdict="$(node mobile/e2e/attempt.mjs --kind probe --exit "$prc" --junit "$OUT/flow-reports/keyboard-$name.xml" \
        --debug "$OUT/maestro-debug/keyboard-$name" --log "$OUT/flow-hierarchy/$name.log" \
        --left $(( left - RESERVE )) --need 240 --retries "$retries" --max "$RETRIES_MAX" \
        --device "$(device_state)" --attempt "$attempt" 2>&1)"
      vrc=$?
      echo "$verdict" > "$OUT/flow-hierarchy/$name.verdict"
      if [ $vrc -eq 0 ]; then
        { echo "the $name probe — $(echo "$verdict" | sed -n 2p) (first attempt: ${took}s, exit ${prc})"
          echo "$verdict" | tail -n +3; } >> "$OUT/retries.txt"
        set_aside "keyboard-$name" "$OUT/keyboard-room/$name.log" "$OUT/flow-reports/keyboard-$name.xml" \
          "$OUT/maestro-debug/keyboard-$name" "$OUT/flow-hierarchy/$name.log" "$OUT/flow-hierarchy/$name.verdict"
        retries=$((retries + 1)); attempt=2; continue
      fi
      [ $attempt -eq 2 ] && echo "  and the $name probe's second attempt failed: $(echo "$verdict" | sed -n 2p)" >> "$OUT/retries.txt"
      # Where it stopped and why, in Maestro's own words (never a typed value:
      # annotate.mjs hides the password), how long it ran, and what was on the
      # screen then. A probe cut off by its time prints no failure of its own.
      { echo "$name: the screen was not reached after ${took}s$( { [ $prc -eq 124 ] || [ $prc -eq 137 ]; } && echo ', when its time ran out')"
        echo "$verdict" | tail -n +2 | sed 's/^ */  /'; } >> "$OUT/keyboard-room.txt"
      rm -rf "$HOME/.maestro/sessions"
      timeout 60 "$MAESTRO" hierarchy > "$OUT/keyboard-room/$name.json" 2>/dev/null
      node mobile/e2e/screen.mjs "$OUT/keyboard-room/$name.json" | head -n 14 | sed "s/^/  $name screen · /" >> "$OUT/keyboard-room.txt"
      # And the record a failed flow leaves (flow-screens.mjs reports it): the
      # screen, and the windows Android had — what the driver was kept waiting on.
      cp "$OUT/keyboard-room/$name.json" "$OUT/flow-hierarchy/$name.json" 2>/dev/null
      timeout 20 adb shell dumpsys window windows 2>/dev/null | tr -d '\r' \
        | grep -E 'Window #[0-9]+|mDrawState=|nimat' > "$OUT/flow-hierarchy/$name.wm" || true
      [ "$(device_state)" = gone ] && gone=1
      room_rc=1; break
    fi
    keys_on
    rm -rf "$HOME/.maestro/sessions"
    timeout 120 "$MAESTRO" test "$FLOWS/keyboard/$name.tap.yaml" >> "$OUT/keyboard-room/$name.log" 2>&1
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      timeout 20 adb shell dumpsys input_method 2>/dev/null | grep -q 'mInputShown=true' && break
      sleep 1
    done
    sleep 1   # the keyboard's own entrance, so its frame is where it stops
    timeout 20 adb shell dumpsys window windows 2>/dev/null | tr -d '\r' > "$OUT/keyboard-room/$name.windows.txt"
    rm -rf "$HOME/.maestro/sessions"
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
    break
  done
done
keys_off
if [ $room_rc -ne 0 ]; then
  rc=1
  node mobile/e2e/annotate.mjs "The keyboard covers what a member needs" "$OUT/keyboard-room.txt"
else
  note "The keyboard's room" "$OUT/keyboard-room.txt"
fi

# ── THE FLOWS ─────────────────────────────────────────────────────────────────
idx=0
for flow in $FLOW_LIST; do
  idx=$((idx + 1))
  name=$(basename "$flow" .yaml)
  attempt=1
  while :; do
    if [ $gone -eq 1 ]; then
      echo "[Skipped] $name (the emulator was gone)" >> "$OUT/maestro.log"; rc=1; flows_failed=1; break
    fi
    left=$(( DEADLINE - $(date +%s) ))
    if [ $left -le 60 ]; then
      echo "[Skipped] $name (the flows' ${MINUTES} minutes ran out)" >> "$OUT/maestro.log"; rc=1; flows_failed=1; break
    fi
    if [ $attempt -eq 1 ]; then echo "── $name" >> "$OUT/maestro.log"; else echo "── $name (second attempt)" >> "$OUT/maestro.log"; fi
    settle_phone "$name"
    # The device's clock as the flow starts, so its log can be read on its own.
    since=$(device_clock)
    printf '%s\t%s\t%s\n' "$name" "$attempt" "$since" >> "$OUT/flow-times.txt"
    began=$(date +%s)
    timeout --signal=INT --kill-after=30 "$(( left < 600 ? left : 600 ))s" "$MAESTRO" test "$flow" \
      -e E2E_MEMBER_EMAIL="$E2E_MEMBER_EMAIL" \
      -e E2E_MEMBER_PASSWORD="$E2E_MEMBER_PASSWORD" \
      -e E2E_MEMBER_USERNAME="$E2E_MEMBER_USERNAME" \
      --format junit --output "$OUT/flow-reports/$name.xml" \
      --debug-output "$OUT/maestro-debug/$name" \
      > "$OUT/attempt.out" 2>&1
    frc=$?
    if [ $frc -eq 0 ]; then cat "$OUT/attempt.out" >> "$OUT/maestro.log"; break; fi
    took=$(( $(date +%s) - began ))
    # The device's log for this attempt alone: what the driver skipped as
    # invisible, and what Android and the app said (attempt.mjs and
    # flow-screens.mjs read both).
    cut_log "$since" "$OUT/flow-hierarchy/$name.log"
    left=$(( DEADLINE - $(date +%s) ))
    verdict="$(node mobile/e2e/attempt.mjs --kind flow --exit "$frc" --junit "$OUT/flow-reports/$name.xml" \
      --debug "$OUT/maestro-debug/$name" --log "$OUT/flow-hierarchy/$name.log" \
      --left "$left" --need $(( (FLOW_COUNT - idx + 1) * PER_FLOW )) --retries "$retries" --max "$RETRIES_MAX" \
      --device "$(device_state)" --attempt "$attempt" 2>&1)"
    vrc=$?
    if [ $vrc -eq 0 ]; then
      echo "[Retried] $name (its first attempt, ${took}s: $(echo "$verdict" | sed -n 2p | sed 's/^run again: //'))" >> "$OUT/maestro.log"
      { echo "$name — $(echo "$verdict" | sed -n 2p) (first attempt: ${took}s, exit ${frc})"
        echo "$verdict" | tail -n +3; } >> "$OUT/retries.txt"
      echo "$verdict" > "$OUT/flow-hierarchy/$name.verdict"
      set_aside "$name" "$OUT/attempt.out" "$OUT/flow-reports/$name.xml" "$OUT/maestro-debug/$name" \
        "$OUT/flow-hierarchy/$name.log" "$OUT/flow-hierarchy/$name.verdict"
      retries=$((retries + 1)); attempt=2; continue
    fi
    cat "$OUT/attempt.out" >> "$OUT/maestro.log"
    echo "$verdict" > "$OUT/flow-hierarchy/$name.verdict"
    [ $attempt -eq 2 ] && echo "  and ${name}'s second attempt failed: $(echo "$verdict" | sed -n 2p)" >> "$OUT/retries.txt"
    rc=1; flows_failed=1
    { [ $frc -eq 124 ] || [ $frc -eq 137 ]; } && echo "[Failed] $name (ran out of its time)" >> "$OUT/maestro.log"
    rm -rf "$HOME/.maestro/sessions"
    timeout 60 "$MAESTRO" hierarchy > "$OUT/flow-hierarchy/$name.json" 2>/dev/null || true
    # The windows Android had then, and what it still called drawing or
    # animating: the driver waits on every one of them after each key it types.
    timeout 20 adb shell dumpsys window windows 2>/dev/null | tr -d '\r' \
      | grep -E 'Window #[0-9]+|mDrawState=|nimat' > "$OUT/flow-hierarchy/$name.wm" || true
    [ "$(device_state)" = gone ] && { gone=1; echo "[Gone] the emulator went away during $name" >> "$OUT/maestro.log"; }
    break
  done
done


cat "$OUT/maestro.log"
grep -E '^\[(Passed|Failed|Skipped|Gone|Retried)\]' "$OUT/maestro.log" > "$OUT/maestro-summary.txt" || true
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

# The app crashing or freezing at ANY moment fails the run, whatever the flows
# said (app-crashes.mjs) — read from the whole run's log, which must be shown
# to reach the end: the copy still running, and its last line recent.
stream_alive=no
kill -0 "$streamer" 2>/dev/null && stream_alive=yes
device_now=""
[ $alive -eq 1 ] && device_now="$(timeout 20 adb shell "date +'%m-%d %H:%M:%S'" 2>/dev/null | tr -d '\r')"
sleep 2   # the copy is a moment behind the device
if node mobile/e2e/app-crashes.mjs "$OUT/logcat-stream.txt" --flow-times "$OUT/flow-times.txt" \
    --maestro "$OUT/maestro-debug" --maestro "$OUT/first-attempts" --maestro "$OUT/warmup" \
    --stream-alive "$stream_alive" --device-now "$device_now" > "$OUT/app-crashes.txt"; then
  node mobile/e2e/annotate.mjs "No crash or freeze" "$OUT/app-crashes.txt" summary
else
  rc=1
  node mobile/e2e/annotate.mjs "The app crashed or froze during the run" "$OUT/app-crashes.txt"
fi
# Every animation Android held the test's keys and taps on, named, in passed
# flows too: slow is not failed, but a stuck animation is never left unseen.
if node mobile/e2e/animation-waits.mjs "$OUT/logcat-stream.txt" --flow-times "$OUT/flow-times.txt" > "$OUT/animation-waits.txt"; then
  node mobile/e2e/annotate.mjs "Animation waits" "$OUT/animation-waits.txt" summary
else
  node mobile/e2e/annotate.mjs "Android held the test on an animation that would not end" "$OUT/animation-waits.txt" warning
fi
[ -s "$OUT/retries.txt" ] && node mobile/e2e/annotate.mjs "Run twice: ${retries} attempt$([ $retries -eq 1 ] || echo s) told nothing about the app" "$OUT/retries.txt" warning
[ -s "$OUT/phone-fixes.txt" ] && node mobile/e2e/annotate.mjs "The phone's animations were not off" "$OUT/phone-fixes.txt" warning

# How long each screen took to show what it was opened for (useScreenReady),
# read from the device's log. With a ceilings file it is a gate; --complete
# only when every flow ran, so a cut-short run never blames a screen it skipped.
slow=0
times_args=()
[ -f mobile/e2e/screen-ceilings.json ] && times_args+=(--ceilings mobile/e2e/screen-ceilings.json)
[ $flows_failed -eq 0 ] && [ $gone -eq 0 ] && times_args+=(--complete)
if node mobile/e2e/screen-times.mjs "$OUT/logcat-stream.txt" ${times_args[@]+"${times_args[@]}"} > "$OUT/screen-times.txt"; then
  note "How long each screen took" "$OUT/screen-times.txt"
else
  slow=1
  node mobile/e2e/annotate.mjs "A screen is slower than its ceiling" "$OUT/screen-times.txt"
fi
if [ $rc -ne 0 ]; then
  # "Flows failed" only when one did: run 37155828199 raised it over fourteen
  # passed flows, when only a keyboard probe had failed. Otherwise the flows'
  # list is a notice, beside the error that names what did fail.
  if [ $flows_failed -ne 0 ]; then
    node mobile/e2e/annotate.mjs "E2E flows failed" "$OUT/maestro-summary.txt"
  else
    note "Every flow passed — the run failed on what the other errors name" "$OUT/maestro-summary.txt"
  fi
  # Each failed flow's step, why — in Maestro's own words too, from its JUnit
  # report — and its OWN screen at that moment. Past ten notices, the summary.
  n=0
  for f in $(node mobile/e2e/flow-screens.mjs "$OUT/maestro-debug" "$OUT/flow-screens" "$OUT/flow-hierarchy" --junit "$OUT/flow-reports"); do
    n=$((n + 1))
    note "$(basename "$f" .txt) at the moment it failed" "$f"
  done
  # A probe that finds nothing says so, and shows where it looked.
  if [ $n -eq 0 ]; then
    { echo "flow-screens found no flow records under $OUT/maestro-debug. What is there:"
      find "$OUT/maestro-debug" -maxdepth 6 2>/dev/null | head -n 60
      [ -d "$OUT/maestro-debug" ] || echo "(the folder was never made)"
      echo "and under ~/.maestro/tests:"
      find "$HOME/.maestro/tests" -maxdepth 3 2>/dev/null | head -n 30; } > "$OUT/debug-listing.txt"
    note "No per-flow screens: where Maestro put its records" "$OUT/debug-listing.txt"
  fi
  if [ $alive -eq 1 ]; then
    rm -rf "$HOME/.maestro/sessions"
    timeout 60 "$MAESTRO" hierarchy > "$OUT/screen.json" 2>/dev/null || true
    node mobile/e2e/screen.mjs "$OUT/screen.json" > "$OUT/screen.txt"
    note "What was on the screen after the last flow" "$OUT/screen.txt"
  fi
  # What the APP said — not the whole emulator, whose own noise buried it: its
  # crashes (any process's), the JavaScript side's console, and every warning
  # and error from the app's own process. From the run's whole log: the
  # device's own buffer holds only the last flow (Maestro clears it per flow).
  {
    # A crash's NAME and message are at the top of its stack, and what caused
    # it in its "Caused by" lines; the bottom is just the draw loop it ran in.
    grep -E -m 2 -A 14 "FATAL EXCEPTION" "$OUT/logcat-stream.txt"
    grep -E "Caused by" "$OUT/logcat-stream.txt" | head -n 10
    grep -E " (ReactNativeJS|ReactNative)\s*:" "$OUT/logcat-stream.txt" | tail -n 20
    pid=""
    [ $alive -eq 1 ] && pid=$(timeout 20 adb shell pidof com.reelhouse.society 2>/dev/null | tr -d '\r')
    [ -n "$pid" ] && awk -v p="$pid" '$3 == p && $5 ~ /^[EWF]$/' "$OUT/logcat-stream.txt" | tail -n 20
  } > "$OUT/crash.txt"
  [ -s "$OUT/crash.txt" ] || echo "(the app wrote nothing to the crash buffer or its own log)" > "$OUT/crash.txt"
  node mobile/e2e/annotate.mjs "What the app said before it failed (logcat)" "$OUT/crash.txt"
fi
# A slow screen fails the run, after the flows' own report (which it is not part of).
[ $slow -eq 0 ] || rc=1
exit $rc
