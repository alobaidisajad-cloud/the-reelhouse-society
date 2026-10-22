#!/usr/bin/env bash
# scrolls.sh — the speed lab's signed-in half, on one emulator boot (WORKLIST P0.104).
#
#   LAB_IDS=<ids file> bash mobile/e2e/lab/scrolls.sh
#
# The app as it is ($RUNNER_TEMP/apks/A.apk), the seeded member signed in once (sign-in.yaml), on
# the house e2e/db/lab-seed.mjs filled. Then each busy screen, twice, in two rounds of opposite
# order: opened cold by its deep link (the old process gone and 3 s), shot 8 s later, its frame
# counters reset, then ten swipes of 60% of the screen in ONE adb shell call, a hash of the screen
# after each, then its frame counters read. scrolls.mjs judges them: a list that stopped moving
# before three screen heights fails by name. Everything lands in $RUNNER_TEMP/lab/scrolls.
set -u
PKG=com.reelhouse.society
OUT="$RUNNER_TEMP/lab/scrolls"
MAESTRO=${MAESTRO_BIN:-$HOME/.maestro/bin/maestro}
mkdir -p "$OUT"
: > "$OUT/anomalies.txt"

adb root > /dev/null 2>&1
sleep 3
adb wait-for-device
adb shell settings put global airplane_mode_on 0
for s in window_animation_scale transition_animation_scale animator_duration_scale; do
  adb shell settings put global "$s" 0
done
# No keyboard and no autofill, as the flows type (the sign-in's fields lay under a keyboard).
. "$(dirname "$0")/../no-keyboard.sh"
load1() { adb shell cat /proc/loadavg | cut -d' ' -f1 | tr -d '\r'; }
for i in $(seq 1 96); do awk -v l="$(load1)" 'BEGIN { exit !(l < 1.0) }' && break; sleep 5; done
echo "settled at load $(load1); screen $(adb shell wm size | tr -d '\r')" > "$OUT/device.txt"

adb install -r "$RUNNER_TEMP/apks/A.apk" > "$OUT/install.txt" 2>&1 || { echo "install failed: $(tail -n 2 "$OUT/install.txt")" >> "$OUT/anomalies.txt"; exit 0; }
adb shell cmd package compile -f -m verify "$PKG" > /dev/null 2>&1
if ! "$MAESTRO" test -e E2E_MEMBER_EMAIL="$E2E_MEMBER_EMAIL" -e E2E_MEMBER_PASSWORD="$E2E_MEMBER_PASSWORD" \
    mobile/e2e/lab/sign-in.yaml > "$OUT/sign-in.txt" 2>&1 < /dev/null; then
  { echo "the member could not be signed in:"; tail -n 20 "$OUT/sign-in.txt"; } >> "$OUT/anomalies.txt"
  exit 0
fi

ids() { node -e "process.stdout.write(String(require(process.argv[1])[process.argv[2]]))" "$LAB_IDS" "$1"; }
# Each screen: its name, its link, and the way its list reads on (a salon is read upward, to its older words).
SCREENS="reel|reels|down salon|lounge/$(ids salon)|up stack|stacks/$(ids stack)|down log|log/$(ids log)|down dispatch|dispatch|down archive|user/$(ids member)?tab=archive|down"
read -r W H <<< "$(adb shell wm size | tr -d '\r' | grep -oE '[0-9]+x[0-9]+' | tail -n 1 | tr 'x' ' ')"
X=$((W / 2)); Y1=$((H * 80 / 100)); Y2=$((H * 20 / 100))

for round in 1 2; do
  order=$SCREENS
  [ $round = 2 ] && order=$(echo "$SCREENS" | tr ' ' '\n' | tac | tr '\n' ' ')
  for entry in $order; do
    name=${entry%%|*}; rest=${entry#*|}; link=${rest%|*}; way=${rest##*|}; f="$OUT/$name-$round"
    if [ "$way" = up ]; then from=$Y2; to=$Y1; else from=$Y1; to=$Y2; fi
    adb shell am force-stop "$PKG"
    for i in $(seq 1 20); do [ -z "$(adb shell pidof "$PKG" | tr -d '\r')" ] && break; sleep 0.5; done
    sleep 3
    adb logcat -c
    timeout 90 adb shell am start -W -a android.intent.action.VIEW -d "reelhouse://$link" "$PKG" > "$f.am" 2>&1
    sleep 8
    adb exec-out screencap -p > "$f.png"
    adb shell dumpsys gfxinfo "$PKG" reset > /dev/null 2>&1
    adb shell "screencap | md5sum; for i in 1 2 3 4 5 6 7 8 9 10; do input swipe $X $from $X $to 350; sleep 1; screencap | md5sum; done" > "$f.moves" 2>&1
    adb shell dumpsys gfxinfo "$PKG" > "$f.gfx" 2>&1
    adb logcat -d -v threadtime > "$f.log"
  done
done
echo "done at load $(load1)" >> "$OUT/device.txt"
exit 0
