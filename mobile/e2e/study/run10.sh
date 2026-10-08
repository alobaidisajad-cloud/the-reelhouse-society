#!/usr/bin/env bash
# run10.sh — two last answers on the Android emulator.
#  1. Animations ON: does the app as it is (A) abort on its first arrival, does
#     the fix (MF) live, and does the Sealed E2E crash gate (e2e/app-crashes.mjs)
#     name the abort from the device log?
#  2. The light in other lamps: the Dispatch's (off-centre) and one hung from a
#     hero's hem, each as SVG and as native gradients, beside N (no light).
set -u
PKG=com.reelhouse.society
OUT="$RUNNER_TEMP/study"
APKS="$RUNNER_TEMP/apks"
mkdir -p "$OUT/motion" "$OUT/shots"

adb root > /dev/null 2>&1
sleep 3
adb wait-for-device
adb shell settings put global airplane_mode_on 0
load1() { adb shell cat /proc/loadavg | cut -d' ' -f1 | tr -d '\r'; }
for i in $(seq 1 96); do awk -v l="$(load1)" 'BEGIN { exit !(l < 1.0) }' && break; sleep 5; done
echo "settled at load $(load1)" > "$OUT/device.txt"

install() {
  adb install -r "$APKS/$1.apk" > "$OUT/install-$1.txt" 2>&1 || { echo "install $1 failed" >> "$OUT/device.txt"; return 1; }
  adb shell cmd package compile -f -m verify "$PKG" > /dev/null 2>&1
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
scales() { for s in window_animation_scale transition_animation_scale animator_duration_scale; do adb shell settings put global "$s" "$1"; done; }

# ── 1. Animations on ──
scales 1
for arm in A MF; do
  install "$arm" || continue
  fresh_start "$OUT/motion/$arm.am"
  sleep 15
  pid=$(adb shell pidof "$PKG" | tr -d '\r')
  adb logcat -d -v threadtime > "$OUT/motion/$arm.log"
  now=$(adb shell date +'%m-%d %H:%M:%S' | tr -d '\r')
  node mobile/e2e/app-crashes.mjs "$OUT/motion/$arm.log" --stream-alive yes --device-now "$now" > "$OUT/motion/$arm.gate.txt" 2>&1
  gate=$?
  {
    echo "── $arm: animations ON, alive after 15 s: ${pid:-NO}; crash gate exit $gate"
    head -n 12 "$OUT/motion/$arm.gate.txt"
    grep -E 'FATAL|JavascriptException|JSError|undefined is not a function|>>> com.reelhouse|signal [0-9]+ \(SIG' "$OUT/motion/$arm.log" | head -n 6
  } >> "$OUT/motion/result.txt"
done
scales 0

# ── 2. Other lamps ──
for shot in N1 RD1 RDn1 RH1 RHn1; do
  arm=${shot%1}
  install "$arm" || continue
  fresh_start "$OUT/shots/$shot.am"
  sleep 12
  adb exec-out screencap -p > "$OUT/shots/$shot.png"
  adb logcat -d -v threadtime > "$OUT/shots/$shot.log"
done
echo "done" >> "$OUT/device.txt"
exit 0
