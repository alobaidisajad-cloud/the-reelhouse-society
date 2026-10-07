#!/usr/bin/env bash
# ab.sh — the cold-start study's device half. The builds are in $RUNNER_TEMP/apks:
#   A the app · Z A's own APK again · B no start-up prefetch · C B without the
#   welcome's full-screen SVGs · E B with the light as native gradients ·
#   S B with expo-image built from source · P the download-only prefetch patch.
# One emulator boot, after the device settles. First the proofs (screenshots of
# B against E, traces, CPU profiles, P's and S's own logs), so a time limit can
# never take them; then the timed rounds: every build, two rounds in different
# orders, one start thrown away and five fresh starts (data cleared, as
# Maestro's clearState does) each. Everything lands in $RUNNER_TEMP/study.
set -u
PKG=com.reelhouse.society
OUT="$RUNNER_TEMP/study"
APKS="$RUNNER_TEMP/apks"
mkdir -p "$OUT/runs" "$OUT/traces" "$OUT/shots" "$OUT/proofs"
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
adb shell atrace --list_categories > "$OUT/atrace-categories.txt" 2>&1

load1() { adb shell cat /proc/loadavg | cut -d' ' -f1 | tr -d '\r'; }
settle() {  # until the 1-minute load is under 1.0 (two cores), at most 8 minutes
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

fresh_start() {  # force-stop, clear data, empty the log, start; the am output to $1
  adb shell am force-stop "$PKG"
  adb shell pm clear "$PKG" > /dev/null
  # The old task is removed after the process dies; a start before that is
  # killed with it ("Destroy timeout of remove-task" then "failed to attach").
  local i
  for i in $(seq 1 20); do [ -z "$(adb shell pidof "$PKG" | tr -d '\r')" ] && break; sleep 0.5; done
  sleep 3
  adb logcat -c
  timeout 90 adb shell am start-activity -W -n "$PKG/.MainActivity" > "$1" 2>&1
}

# A long start is kept whole: its am output and the log's lines about the app.
note_if_long() {  # <label> <am file> <log file>
  local total
  total=$(grep -o 'TotalTime: [0-9]*' "$2" | grep -o '[0-9]*$')
  if [ -z "$total" ] || [ "$total" -gt 15000 ]; then
    {
      echo "── $1: TotalTime ${total:-none}"
      grep -v '^$' "$2" | head -n 8
      grep -E 'ActivityTaskManager|ActivityManager|AndroidRuntime|ANR|FATAL|reelhouse.*(Error|Exception)|SplashScreen|starting window' "$3" | grep -i -E 'reelhouse|splash|ANR|FATAL' | head -n 25
    } >> "$OUT/anomalies.txt"
  fi
}

# ── 1. Proofs ──

# Screenshots: the welcome with the light drawn as SVG (B) and as native
# gradients (E), twice each, 12 s after the start (everything has arrived and,
# with animations off, holds still). B against B is the noise floor.
for shot in B1 E1 N1 B2 E2 LPs1 LPn1 LFs1 LFn1 LCs1 LCn1 LVs1 LVn1 LHs1 LHn1; do
  arm=${shot%1}; arm=${arm%2}
  install "$arm" || continue
  fresh_start "$OUT/shots/$shot.am"
  sleep 12
  adb exec-out screencap -p > "$OUT/shots/$shot.png"
  adb logcat -d -v threadtime > "$OUT/shots/$shot.log"
done

if [ "${STUDY:-all}" = shots ]; then echo "shots only: done" >> "$OUT/device.txt"; exit 0; fi

# P: the download-only prefetch on a device — its Glide log says File, not a decode.
if install P; then
  fresh_start "$OUT/proofs/P.am"
  sleep 12
  adb logcat -d -v threadtime > "$OUT/proofs/P.log"
fi
# S: expo-image from source logs at Glide's ERROR, as its BuildConfig says.
if install S; then
  fresh_start "$OUT/proofs/S.am"
  sleep 12
  adb logcat -d -v threadtime > "$OUT/proofs/S.log"
fi

# Traces: one per build that answers a question (A as is, C without the SVGs,
# E with native gradients). Only the atrace categories this image has.
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
for arm in A C E; do
  install "$arm" || continue
  adb shell am force-stop "$PKG"
  adb shell pm clear "$PKG" > /dev/null
  adb shell rm -f "/data/misc/perfetto-traces/$arm.pftrace"
  adb shell perfetto --txt -c - -o "/data/misc/perfetto-traces/$arm.pftrace" --background-wait \
    < "$OUT/trace.pbtx" > "$OUT/traces/$arm.perfetto.txt" 2>&1
  if grep -qiE 'unrecognized|invalid option|unknown option' "$OUT/traces/$arm.perfetto.txt"; then
    adb shell perfetto --txt -c - -o "/data/misc/perfetto-traces/$arm.pftrace" --background \
      < "$OUT/trace.pbtx" >> "$OUT/traces/$arm.perfetto.txt" 2>&1
    sleep 2
  fi
  timeout 90 adb shell am start-activity -W -n "$PKG/.MainActivity" > "$OUT/traces/$arm.am" 2>&1
  sleep 15
  adb shell ls -l "/data/misc/perfetto-traces/" >> "$OUT/traces/$arm.perfetto.txt" 2>&1
  adb pull "/data/misc/perfetto-traces/$arm.pftrace" "$OUT/traces/$arm.pftrace" >> "$OUT/traces/$arm.perfetto.txt" 2>&1
done

# CPU profiles (root, whole device, 1000 Hz, 9 s): A and C.
for arm in A C; do
  install "$arm" || continue
  adb shell am force-stop "$PKG"
  adb shell pm clear "$PKG" > /dev/null
  adb shell rm -f "/data/local/tmp/$arm.perf"
  adb shell "simpleperf record -a -f 1000 --duration 9 -o /data/local/tmp/$arm.perf > /data/local/tmp/$arm.perf.log 2>&1 &"
  sleep 1
  timeout 90 adb shell am start-activity -W -n "$PKG/.MainActivity" > "$OUT/traces/$arm.perf.am" 2>&1
  pid=$(adb shell pidof "$PKG" | tr -d '\r')
  sleep 10
  adb shell cat "/data/local/tmp/$arm.perf.log" > "$OUT/traces/$arm.perf-record.txt" 2>&1
  adb shell simpleperf report -i "/data/local/tmp/$arm.perf" --sort comm -n --percent-limit 1 \
    > "$OUT/traces/$arm.perf-by-thread.txt" 2>&1
  [ -n "$pid" ] && adb shell simpleperf report -i "/data/local/tmp/$arm.perf" --pids "$pid" --sort comm,dso,symbol -n --percent-limit 0.4 \
    > "$OUT/traces/$arm.perf-app.txt" 2>&1
done
echo "proofs done at load $(load1)" >> "$OUT/device.txt"

# ── 2. The timed rounds ──

# launch <arm> <label>: one fresh start, then ONE shell call for the numbers
# (every thread's CPU, memory, frames), so measuring does not load the device.
launch() {
  local arm=$1 n=$2 f="$OUT/runs/$1-fresh-$2" l t0 t1 t2
  l=$(adb shell cat /proc/loadavg | cut -d' ' -f1-3 | tr -d '\r')
  t0=$(now)
  fresh_start "$f.am"
  t1=$(now)
  sleep 8
  adb shell "pid=\$(pidof $PKG); echo PID \$pid; cat /proc/\$pid/task/*/stat; echo MEM; dumpsys meminfo \$pid | grep -E 'Native Heap|Graphics:|TOTAL PSS|TOTAL:'; echo GFX; dumpsys gfxinfo $PKG | grep -E 'Total frames|Janky frames|90th|99th'" > "$f.snap" 2>&1
  adb logcat -d -v threadtime > "$f.log"
  t2=$(now)
  note_if_long "$1-$2" "$f.am" "$f.log"
  printf '%s\tfresh\t%s\t%s\t%s\t%s\t%s\n' "$arm" "$n" "$(grep '^PID' "$f.snap" | cut -d' ' -f2 | tr -d '\r')" "$l" "$((t1 - t0))" "$((t2 - t1))" >> "$OUT/launches.tsv"
}

round() {
  local r=$1 arm n
  shift
  for arm in "$@"; do
    install "$arm" || continue
    fresh_start "$OUT/runs/$arm-discard-$r.am"
    sleep 6
    for n in 1 2 3 4 5; do launch "$arm" "$r$n"; done
  done
}
round a A Z B C E S P
round b P S E C B Z A

echo "done: $(wc -l < "$OUT/launches.tsv") starts, load $(load1)" >> "$OUT/device.txt"
exit 0
