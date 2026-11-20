#!/usr/bin/env bash
# feel.sh — the speed lab's feel run, on one emulator boot: each busy screen opened, scrolled, tapped
# and left, its feel measured from inside the app and from the screen (feel.mjs judges it).
#
#   LAB_IDS=<ids file> bash mobile/e2e/lab/feel.sh
#
# The feel build ($RUNNER_TEMP/apks/F.apk: FEEL=1, LabFeelProbe and React's profiling renderer), the
# seeded member signed in once (sign-in.yaml), and one cold start measured (cold/, for the speed
# record). Then each screen of scrolls.sh's list, Settings the control among them, in one pass:
#   open    the old process gone and 3 s; the bytes received so far; the link opened cold; the
#           screen read (uiautomator) until its ready mark is there, then again 0.5, 1.5 and 3 s on
#           (<name>-open-<n>.xml); the bytes received by then (<name>.rx)
#   scroll  a Perfetto trace of the JS thread and the frames around five swipes of 60% of the screen
#           (<name>.pftrace), its seconds marked feel.scroll.begin and feel.scroll.end in the log
#   tap     one clickable control in the middle band of the screen (feel.mjs pick), then the screen
#           read 2 and 3.5 s on (<name>-tap-<n>.xml)
#   back    the back key, then the screen read 2 and 3.5 s on (<name>-back-<n>.xml)
# and the device log of the whole screen (<name>.log). Then, with FLOOR_APK set, the framework's
# floor (floor-app.mjs): its empty app installed and started cold five times, each timed by am and
# its memory read once it is ready (floor/start-<n>.am, .mem). Everything lands in
# $RUNNER_TEMP/lab/feel.
set -u
PKG=com.reelhouse.society
OUT="$RUNNER_TEMP/lab/feel"
MAESTRO=${MAESTRO_BIN:-$HOME/.maestro/bin/maestro}
FEEL="$(dirname "$0")/feel.mjs"
mkdir -p "$OUT"
: > "$OUT/anomalies.txt"

adb root > /dev/null 2>&1
sleep 3
adb wait-for-device
adb shell settings put global airplane_mode_on 0
for s in window_animation_scale transition_animation_scale animator_duration_scale; do
  adb shell settings put global "$s" 0
done
. "$(dirname "$0")/../no-error-dialogs.sh"
. "$(dirname "$0")/../no-keyboard.sh"
load1() { adb shell cat /proc/loadavg | cut -d' ' -f1 | tr -d '\r'; }
for i in $(seq 1 96); do awk -v l="$(load1)" 'BEGIN { exit !(l < 1.0) }' && break; sleep 5; done
echo "settled at load $(load1); screen $(adb shell wm size | tr -d '\r')" > "$OUT/device.txt"

adb install -r "$RUNNER_TEMP/apks/F.apk" > "$OUT/install.txt" 2>&1 || { echo "install failed: $(tail -n 2 "$OUT/install.txt")" >> "$OUT/anomalies.txt"; exit 0; }
adb shell cmd package compile -f -m verify "$PKG" > /dev/null 2>&1
"$MAESTRO" test -e E2E_MEMBER_EMAIL="$E2E_MEMBER_EMAIL" -e E2E_MEMBER_PASSWORD="$E2E_MEMBER_PASSWORD" \
  mobile/e2e/lab/sign-in.yaml > "$OUT/sign-in.txt" 2>&1 < /dev/null
signed=$?
node mobile/e2e/scrub.mjs "$OUT/sign-in.txt" > /dev/null
if [ $signed -ne 0 ]; then
  { echo "the member could not be signed in:"; tail -n 20 "$OUT/sign-in.txt"; } >> "$OUT/anomalies.txt"
  exit 0
fi

# One measured cold start, signed in, as cold-start.mjs's readMeasured reads it (the speed record's
# start and memory): the old process gone and 3 s, am's answer, and the memory 8 s on.
mkdir -p "$OUT/cold"
adb shell am force-stop "$PKG"
for i in $(seq 1 20); do [ -z "$(adb shell pidof "$PKG" | tr -d '\r')" ] && break; sleep 0.5; done
sleep 3
adb logcat -c
echo 1 > "$OUT/cold/cold-from.txt"
timeout 90 adb shell am start-activity -W -n "$PKG/.MainActivity" > "$OUT/cold/cold-am.txt" 2>&1 < /dev/null
sleep 8
adb shell dumpsys meminfo "$PKG" > "$OUT/cold/cold-meminfo.txt" 2>&1 < /dev/null

ids() { node -e "process.stdout.write(String(require(process.argv[1])[process.argv[2]]))" "$LAB_IDS" "$1"; }
# name|link|ready mark (useScreenReady's name)
SCREENS="reel|reels|reel stack|stacks/$(ids stack)|stack log|log/$(ids log)|log dispatch|dispatch|dispatch archive|user/$(ids member)?tab=archive|member settings|settings|settings"
read -r W H <<< "$(adb shell wm size | tr -d '\r' | grep -oE '[0-9]+x[0-9]+' | tail -n 1 | tr 'x' ' ')"
X=$((W / 2)); Y1=$((H * 80 / 100)); Y2=$((H * 20 / 100))

dump() { adb shell uiautomator dump /sdcard/feel.xml > /dev/null 2>&1 < /dev/null; adb shell cat /sdcard/feel.xml < /dev/null > "$1" 2>/dev/null; }

cat > "$OUT/trace.pbtx" <<'EOF'
buffers { size_kb: 65536 fill_policy: RING_BUFFER }
data_sources { config { name: "linux.process_stats" process_stats_config { scan_all_processes_on_start: true } } }
data_sources { config { name: "linux.ftrace" ftrace_config {
  ftrace_events: "sched/sched_switch"
  ftrace_events: "sched/sched_waking"
  ftrace_events: "task/task_newtask"
  ftrace_events: "task/task_rename"
  atrace_categories: "gfx"
  atrace_categories: "view"
  atrace_apps: "com.reelhouse.society"
} } }
duration_ms: 12000
EOF

for entry in $SCREENS; do
  name=${entry%%|*}; rest=${entry#*|}; link=${rest%|*}; mark=${rest##*|}
  f="$OUT/$name"
  adb shell am force-stop "$PKG"
  for i in $(seq 1 20); do [ -z "$(adb shell pidof "$PKG" | tr -d '\r')" ] && break; sleep 0.5; done
  sleep 3
  adb logcat -c
  adb shell cat /proc/net/dev > "$f.rx" < /dev/null
  timeout 90 adb shell am start -W -a android.intent.action.VIEW -d "reelhouse://$link" "$PKG" > "$f.am" 2>&1 < /dev/null
  # Read until the ready mark is drawn (20 s at most), then three more reads, nothing touched.
  for i in $(seq 1 40); do dump "$f-open-0.xml"; grep -q "screen-ready-$mark" "$f-open-0.xml" && break; sleep 0.5; done
  grep -q "screen-ready-$mark" "$f-open-0.xml" || echo "$name: its ready mark never came (screen-ready-$mark)" >> "$OUT/anomalies.txt"
  { echo '-----'; adb shell cat /proc/net/dev < /dev/null; } >> "$f.rx"
  sleep 0.5; dump "$f-open-1.xml"
  sleep 1; dump "$f-open-2.xml"
  sleep 1.5; dump "$f-open-3.xml"
  # The scroll, traced.
  adb shell rm -f /data/misc/perfetto-traces/feel.pftrace < /dev/null
  adb shell perfetto --txt -c - -o /data/misc/perfetto-traces/feel.pftrace --background-wait < "$OUT/trace.pbtx" > "$f.perfetto.txt" 2>&1
  adb shell log -t ReelLab feel.scroll.begin < /dev/null
  adb shell "for i in 1 2 3 4 5; do input swipe $X $Y1 $X $Y2 350; sleep 1; done" < /dev/null
  adb shell log -t ReelLab feel.scroll.end < /dev/null
  sleep 6
  adb pull /data/misc/perfetto-traces/feel.pftrace "$f.pftrace" >> "$f.perfetto.txt" 2>&1 < /dev/null
  # A tap on one control, then the screen read twice with nothing touched.
  dump "$f-pick.xml"
  at=$(node "$FEEL" pick "$f-pick.xml")
  if [ -n "$at" ]; then
    adb shell input tap $at < /dev/null
    sleep 2; dump "$f-tap-0.xml"
    sleep 1.5; dump "$f-tap-1.xml"
  else
    echo "$name: no control to tap in the middle of the screen" >> "$OUT/anomalies.txt"
  fi
  adb shell input keyevent KEYCODE_BACK < /dev/null
  sleep 2; dump "$f-back-0.xml"
  sleep 1.5; dump "$f-back-1.xml"
  rm -f "$f-pick.xml"
  adb logcat -d -v threadtime > "$f.log"
done

if [ -n "${FLOOR_APK:-}" ] && [ -f "$FLOOR_APK" ]; then
  mkdir -p "$OUT/floor"
  adb install -r "$FLOOR_APK" > "$OUT/floor/install.txt" 2>&1 || echo "the floor app did not install: $(tail -n 1 "$OUT/floor/install.txt")" >> "$OUT/anomalies.txt"
  adb shell cmd package compile -f -m verify com.reelhouse.floor > /dev/null 2>&1
  for n in 1 2 3 4 5; do
    adb shell am force-stop com.reelhouse.floor
    adb shell pm clear com.reelhouse.floor > /dev/null
    sleep 3
    timeout 90 adb shell am start-activity -W -n com.reelhouse.floor/.MainActivity > "$OUT/floor/start-$n.am" 2>&1 < /dev/null
    sleep 3
    adb shell dumpsys meminfo com.reelhouse.floor > "$OUT/floor/start-$n.mem" 2>&1 < /dev/null
  done
fi
echo "done at load $(load1)" >> "$OUT/device.txt"
exit 0
