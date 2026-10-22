#!/usr/bin/env bash
# lab.sh — the speed lab's device half, on one emulator boot (WORKLIST P0.104).
#
#   LAB_MODE=shots|timed|all LAB_ARMS="N ..." bash mobile/e2e/lab/lab.sh
#
# The builds are $RUNNER_TEMP/apks/<arm>.apk (A is the app as it is; Z is A's own APK again).
# First the device settles: the 1-minute load under 1.0, or 8 minutes. Then:
#   shots  every scene build of arm.mjs (A Ws Dm Ds Hm Hs Gm Gs Pm Ps) shot twice, in two rounds
#          of opposite order, and N once: each a fresh start, the shot 12 s after it (with
#          animations off everything has arrived and holds still); proofs.mjs judges them.
#   timed  A, Z and LAB_ARMS, in two rounds of opposite order: per build one start thrown away,
#          then five fresh starts, each measured by ONE adb shell call (every thread's CPU,
#          memory, frames) so measuring does not load the device; analyze.mjs reads them.
# Each fresh start: force-stop, clear the data, wait until the old process is gone and 3 s more
# (a start before the old task is removed is killed with it: "Destroy timeout of remove-task"),
# empty the log, `am start-activity -W`. Everything lands in $RUNNER_TEMP/lab.
set -u
PKG=com.reelhouse.society
OUT="$RUNNER_TEMP/lab"
APKS="$RUNNER_TEMP/apks"
MODE=${LAB_MODE:-all}
mkdir -p "$OUT/runs" "$OUT/shots" "$OUT/traces"
: > "$OUT/launches.tsv"
: > "$OUT/anomalies.txt"
now() { date +%s; }

adb root > /dev/null 2>&1
sleep 3
adb wait-for-device
adb shell settings put global airplane_mode_on 0
for s in window_animation_scale transition_animation_scale animator_duration_scale; do
  adb shell settings put global "$s" 0
done
{
  echo "fingerprint: $(adb shell getprop ro.build.fingerprint | tr -d '\r')"
  echo "cores: $(adb shell nproc | tr -d '\r')"
  echo "screen: $(adb shell wm size | tr -d '\r') $(adb shell wm density | tr -d '\r')"
} > "$OUT/device.txt"

load1() { adb shell cat /proc/loadavg | cut -d' ' -f1 | tr -d '\r'; }
settle() {
  local i l=''
  for i in $(seq 1 96); do
    l=$(load1)
    awk -v l="$l" 'BEGIN { exit !(l < 1.0) }' && { echo "$l after $((i * 5)) s"; return; }
    sleep 5
  done
  echo "$l (never under 1.0 in 8 min)"
}
echo "settled: $(settle)" >> "$OUT/device.txt"

CURRENT=''
install() {
  [ "$CURRENT" = "$1" ] && return 0
  if ! adb install -r "$APKS/$1.apk" > "$OUT/install-$1.txt" 2>&1; then
    echo "install $1 failed: $(tail -n 2 "$OUT/install-$1.txt")" >> "$OUT/anomalies.txt"
    CURRENT=''
    return 1
  fi
  adb shell cmd package compile -f -m verify "$PKG" > /dev/null 2>&1
  CURRENT=$1
}

fresh_start() {
  adb shell am force-stop "$PKG"
  adb shell pm clear "$PKG" > /dev/null
  local i
  for i in $(seq 1 20); do [ -z "$(adb shell pidof "$PKG" | tr -d '\r')" ] && break; sleep 0.5; done
  sleep 3
  adb logcat -c
  timeout 90 adb shell am start-activity -W -n "$PKG/.MainActivity" > "$1" 2>&1
}

if [ "$MODE" = shots ] || [ "$MODE" = all ]; then
  SCENES="A Ws Dm Ds Hm Hs Gm Gs Pm Ps"
  for round in 1 2; do
    order=$SCENES
    [ $round = 2 ] && order=$(echo "$SCENES" | tr ' ' '\n' | tac | tr '\n' ' ')
    [ $round = 1 ] && order="N $order"
    for arm in $order; do
      install "$arm" || continue
      fresh_start "$OUT/shots/$arm-$round.am"
      sleep 12
      adb exec-out screencap -p > "$OUT/shots/$arm-$round.png"
      adb logcat -d -v threadtime > "$OUT/shots/$arm-$round.log"
    done
  done
  echo "shots done at load $(load1)" >> "$OUT/device.txt"
fi

if [ "$MODE" = timed ] || [ "$MODE" = all ]; then
  [ "$MODE" = all ] && echo "settled again: $(settle)" >> "$OUT/device.txt"
  # One start, then ONE shell call for the numbers; the start's own calls come before it.
  launch() {
    local arm=$1 n=$2 f="$OUT/runs/$1-$2" l t0 t1
    l=$(load1)
    t0=$(now)
    fresh_start "$f.am"
    t1=$(now)
    sleep 8
    adb shell "pid=\$(pidof $PKG); echo PID \$pid; cat /proc/\$pid/task/*/stat; echo MEM; dumpsys meminfo \$pid | grep -E 'Native Heap|Graphics:|TOTAL PSS|TOTAL:'; echo GFX; dumpsys gfxinfo $PKG | grep -E 'Total frames|Janky frames|90th|99th'" > "$f.snap" 2>&1
    adb logcat -d -v threadtime > "$f.log"
    local total
    total=$(grep -o 'TotalTime: [0-9]*' "$f.am" | grep -o '[0-9]*$')
    if [ -z "$total" ] || [ "$total" -gt 15000 ]; then
      { echo "── $arm-$n: TotalTime ${total:-none}"; grep -v '^$' "$f.am" | head -n 8; } >> "$OUT/anomalies.txt"
    fi
    printf '%s\t%s\t%s\t%s\t%s\n' "$arm" "$n" "$(grep '^PID' "$f.snap" | cut -d' ' -f2 | tr -d '\r')" "$l" "$((t1 - t0))" >> "$OUT/launches.tsv"
  }
  TIMED="A Z ${LAB_ARMS:-}"
  for round in a b; do
    order=$TIMED
    [ $round = b ] && order=$(echo "$TIMED" | tr ' ' '\n' | grep -v '^$' | tac | tr '\n' ' ')
    for arm in $order; do
      install "$arm" || continue
      fresh_start "$OUT/runs/$arm-discard-$round.am"
      sleep 6
      for n in 1 2 3 4 5; do launch "$arm" "$round$n"; done
    done
  done
  echo "timed done: $(wc -l < "$OUT/launches.tsv") starts, load $(load1)" >> "$OUT/device.txt"

  # A trace of each timed build's start, for the Perfetto queries (sql/*.pfsql): only the atrace
  # categories this image has.
  adb shell atrace --list_categories > "$OUT/atrace-categories.txt" 2>&1
  {
    cat <<'EOF'
buffers { size_kb: 131072 fill_policy: RING_BUFFER }
buffers { size_kb: 8192 fill_policy: RING_BUFFER }
data_sources { config { name: "linux.process_stats" target_buffer: 1 process_stats_config { scan_all_processes_on_start: true } } }
data_sources { config { name: "android.surfaceflinger.frametimeline" } }
data_sources { config { name: "linux.ftrace" ftrace_config {
  ftrace_events: "sched/sched_switch"
  ftrace_events: "sched/sched_waking"
  ftrace_events: "sched/sched_wakeup_new"
  ftrace_events: "task/task_newtask"
  ftrace_events: "task/task_rename"
EOF
    for c in gfx view am wm dalvik sched freq binder_driver input res ss aidl; do
      grep -qE "^ *$c +- " "$OUT/atrace-categories.txt" && echo "  atrace_categories: \"$c\""
    done
    cat <<'EOF'
  atrace_apps: "com.reelhouse.society"
} } }
duration_ms: 13000
EOF
  } > "$OUT/trace.pbtx"
  for arm in A ${LAB_ARMS:-}; do
    install "$arm" || continue
    adb shell am force-stop "$PKG"
    adb shell pm clear "$PKG" > /dev/null
    for i in $(seq 1 20); do [ -z "$(adb shell pidof "$PKG" | tr -d '\r')" ] && break; sleep 0.5; done
    sleep 3
    adb shell rm -f "/data/misc/perfetto-traces/$arm.pftrace"
    adb shell perfetto --txt -c - -o "/data/misc/perfetto-traces/$arm.pftrace" --background-wait \
      < "$OUT/trace.pbtx" > "$OUT/traces/$arm.perfetto.txt" 2>&1
    timeout 90 adb shell am start-activity -W -n "$PKG/.MainActivity" > "$OUT/traces/$arm.am" 2>&1
    sleep 15
    adb pull "/data/misc/perfetto-traces/$arm.pftrace" "$OUT/traces/$arm.pftrace" >> "$OUT/traces/$arm.perfetto.txt" 2>&1
  done
fi
exit 0
