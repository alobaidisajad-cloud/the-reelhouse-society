#!/usr/bin/env bash
# ab.sh — the cold-start study's device half: five builds of the app (A Z B C D in
# $RUNNER_TEMP/apks), launched in turn on ONE emulator boot, after the device has
# settled. Each build gets the same treatment: installed, compiled the same way
# (verify), one launch thrown away, then 5 fresh starts (data cleared, as
# Maestro's clearState does) and 5 returning starts (data kept). Three rounds,
# each in another order, so neither order nor drift favours a build.
# Then one traced start per build (Perfetto) and one CPU-sampled start (simpleperf).
# Everything lands in $RUNNER_TEMP/study; analyze.mjs and the trace queries read it.
set -u
PKG=com.reelhouse.society
OUT="$RUNNER_TEMP/study"
APKS="$RUNNER_TEMP/apks"
mkdir -p "$OUT/runs" "$OUT/traces"
: > "$OUT/launches.tsv"

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
  echo "cpu: $(adb shell grep -m1 'model name' /proc/cpuinfo | tr -d '\r')"
  echo "refresh: $(adb shell dumpsys SurfaceFlinger | grep -m1 -i 'refresh-rate' | tr -d '\r')"
} > "$OUT/device.txt"
adb shell atrace --list_categories > "$OUT/atrace-categories.txt" 2>&1

load1() { adb shell cat /proc/loadavg | cut -d' ' -f1 | tr -d '\r'; }
# Until the 1-minute load is under 1.0 (two cores), at most 8 minutes.
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

install() {
  if ! adb install -r "$APKS/$1.apk" > "$OUT/install-$1.txt" 2>&1; then
    echo "install $1 failed: $(tail -n 2 "$OUT/install-$1.txt")" >> "$OUT/errors.txt"
    return 1
  fi
  adb shell cmd package compile -f -m verify "$PKG" > /dev/null 2>&1
}

# launch <arm> <fresh|returning|discard> <label>
launch() {
  local arm=$1 mode=$2 n=$3 f="$OUT/runs/$1-$2-$3" l pid
  adb shell am force-stop "$PKG"
  [ "$mode" != returning ] && adb shell pm clear "$PKG" > /dev/null
  l=$(adb shell cat /proc/loadavg | cut -d' ' -f1-3 | tr -d '\r')
  adb logcat -c
  adb shell am start-activity -W -n "$PKG/.MainActivity" > "$f.am" 2>&1
  sleep 8
  pid=$(adb shell pidof "$PKG" | tr -d '\r')
  if [ -n "$pid" ]; then
    # Per thread: tid|name|utime stime (clock ticks), read after the name's ')'.
    adb shell "cd /proc/$pid/task && for t in *; do printf '%s|%s|' \$t \"\$(cat \$t/comm)\"; sed 's/.*) //' \$t/stat | cut -d' ' -f12,13; done" > "$f.threads" 2>&1
    adb shell dumpsys meminfo "$PKG" > "$f.mem" 2>&1
    adb shell dumpsys gfxinfo "$PKG" > "$f.gfx" 2>&1
  fi
  adb logcat -d -v threadtime > "$f.log"
  printf '%s\t%s\t%s\t%s\t%s\n' "$arm" "$mode" "$n" "${pid:-none}" "$l" >> "$OUT/launches.tsv"
}

round() {
  local r=$1 arm n
  shift
  for arm in "$@"; do
    install "$arm" || continue
    launch "$arm" discard "$r"
    for n in 1 2 3 4 5; do launch "$arm" fresh "$r$n"; done
    for n in 1 2 3 4 5; do launch "$arm" returning "$r$n"; done
  done
}
# Z is A's own APK under another name: the A/A pair that shows what noise calls.
round a A Z B C D
round b D C B Z A
round c B D A C Z

# ── One traced start per build ──
# Only the atrace categories this image has; an unknown one can stop atrace.
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
  ftrace_events: "power/cpu_frequency"
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
for arm in A B C D; do
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
  adb shell am start-activity -W -n "$PKG/.MainActivity" > "$OUT/traces/$arm.am" 2>&1
  sleep 15
  adb pull "/data/misc/perfetto-traces/$arm.pftrace" "$OUT/traces/$arm.pftrace" >> "$OUT/traces/$arm.perfetto.txt" 2>&1
done

# ── One CPU-sampled start per build (root: the whole device, 1000 Hz, 9 s) ──
for arm in A B C D; do
  install "$arm" || continue
  adb shell am force-stop "$PKG"
  adb shell pm clear "$PKG" > /dev/null
  adb shell rm -f "/data/local/tmp/$arm.perf"
  adb shell "simpleperf record -a -f 1000 --duration 9 -o /data/local/tmp/$arm.perf > /data/local/tmp/$arm.perf.log 2>&1 &"
  sleep 1
  adb shell am start-activity -W -n "$PKG/.MainActivity" > "$OUT/traces/$arm.perf.am" 2>&1
  pid=$(adb shell pidof "$PKG" | tr -d '\r')
  sleep 10
  adb shell cat "/data/local/tmp/$arm.perf.log" > "$OUT/traces/$arm.perf-record.txt" 2>&1
  adb shell simpleperf report -i "/data/local/tmp/$arm.perf" --sort comm -n --percent-limit 1 \
    > "$OUT/traces/$arm.perf-by-thread.txt" 2>&1
  if [ -n "$pid" ]; then
    adb shell simpleperf report -i "/data/local/tmp/$arm.perf" --pids "$pid" --sort comm,dso,symbol -n --percent-limit 0.4 \
      > "$OUT/traces/$arm.perf-app.txt" 2>&1
  fi
done

echo "done: $(wc -l < "$OUT/launches.tsv") launches" >> "$OUT/device.txt"
exit 0
